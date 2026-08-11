import { waitUntil } from '@vercel/functions';
import { NextResponse } from 'next/server';

import {
  enqueueGrading,
  kickGradingWorker,
} from '@/lib/grading/enqueueGrading';
import { processGradingJobs } from '@/lib/grading/processGradingJobs';
import { scheduleGradingWorker } from '@/lib/grading/scheduleGradingWorker';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * Re-queue AI grading for a submitted lesson.
 * Learner retries enqueue + kick the background worker.
 * Admin re-runs enqueue with the service role, kick the worker on the
 * request origin, and best-effort process inline — always JSON responses.
 */
export const maxDuration = 60;

type RouteContext = {
  params: { lessonId: string };
};

type GradeRequestBody = {
  studentId?: string;
  progressId?: string;
  /** When true (admin only), prefer immediate processing. */
  inline?: boolean;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(
  error: string,
  status: number,
  grading?: { status: 'failed' | 'queued'; error: string | null }
) {
  return NextResponse.json(
    {
      error,
      grading: grading ?? { status: 'failed' as const, error },
    },
    { status }
  );
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { lessonId } = params;
    if (!lessonId || !UUID_RE.test(lessonId)) {
      return jsonError('Invalid lesson id', 400);
    }

    const supabase = await createClient();

    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: appUser, error: userError } = await supabase
      .from('users')
      .select('id, tenant_id, email, is_admin')
      .eq('id', authUser.id)
      .maybeSingle();

    if (userError || !appUser) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 403 }
      );
    }

    let body: GradeRequestBody = {};
    try {
      const rawBody = await request.text();
      if (rawBody.trim()) {
        body = JSON.parse(rawBody) as GradeRequestBody;
      }
    } catch {
      return jsonError('Invalid JSON body', 400);
    }

    const targetStudentId = body.studentId ?? appUser.id;
    if (!UUID_RE.test(targetStudentId)) {
      return jsonError('Invalid student id', 400);
    }

    if (body.progressId && !UUID_RE.test(body.progressId)) {
      return jsonError('Invalid progress id', 400);
    }

    if (targetStudentId !== appUser.id && appUser.is_admin !== true) {
      return NextResponse.json(
        { error: 'Forbidden: only admins may grade other students' },
        { status: 403 }
      );
    }

    const { data: targetUser, error: targetUserError } = await supabase
      .from('users')
      .select('id, tenant_id')
      .eq('id', targetStudentId)
      .maybeSingle();

    if (targetUserError || !targetUser) {
      return NextResponse.json(
        { error: 'Student profile not found' },
        { status: 404 }
      );
    }

    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('id, track_id, dcwf_code')
      .eq('id', lessonId)
      .maybeSingle();

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    const { data: enrollment, error: enrollmentError } = await supabase
      .from('track_enrollments')
      .select('id')
      .eq('student_id', targetStudentId)
      .eq('track_id', lesson.track_id)
      .eq('status', 'active')
      .maybeSingle();

    if (enrollmentError || !enrollment) {
      return NextResponse.json(
        { error: 'Active enrollment required for this track' },
        { status: 403 }
      );
    }

    let progressQuery = supabase
      .from('lesson_progress')
      .select('id, status, submission')
      .eq('student_id', targetStudentId)
      .eq('lesson_id', lessonId)
      .eq('status', 'submitted');

    if (body.progressId) {
      progressQuery = progressQuery.eq('id', body.progressId);
    }

    const { data: progress, error: progressError } =
      await progressQuery.maybeSingle();

    if (progressError || !progress) {
      return NextResponse.json(
        { error: 'Submitted lesson progress not found' },
        { status: 404 }
      );
    }

    if (!progress.submission || typeof progress.submission !== 'object') {
      return NextResponse.json(
        { error: 'Submission payload missing from lesson progress' },
        { status: 404 }
      );
    }

    // Admin re-run: grade via service-role enqueue + worker kick on the real
    // request origin (never localhost baked into NEXT_PUBLIC_APP_URL).
    const isAdminRerun =
      appUser.is_admin === true &&
      (body.inline === true || targetStudentId !== appUser.id);

    const runInline =
      process.env.GRADING_PROCESS_INLINE === '1' || isAdminRerun;

    let enqueueClient = supabase;
    if (isAdminRerun) {
      try {
        enqueueClient = createAdminClient();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Admin grading client is not configured';
        return jsonError(message, 500);
      }
    }

    try {
      await enqueueGrading({
        supabase: enqueueClient,
        progressId: progress.id,
        studentId: targetStudentId,
        lessonId,
        resetAttempts: true,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to enqueue grading job';
      console.error('[grading] Enqueue failed', {
        progressId: progress.id,
        message,
      });
      return jsonError(message, 500);
    }

    if (runInline) {
      let admin = enqueueClient;
      if (!isAdminRerun) {
        try {
          admin = createAdminClient();
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Admin grading client is not configured';
          return jsonError(message, 500);
        }
      }

      // Kick the dedicated worker first (own 60s budget + waitUntil). This
      // survives even if the browser-facing request is killed mid-LLM.
      const kicked = await kickGradingWorker({
        request,
        progressId: progress.id,
      });

      console.info('[grading] Admin/inline re-run starting', {
        progressId: progress.id,
        studentId: targetStudentId,
        lessonId,
        isAdminRerun,
        workerKickOk: kicked.ok,
        workerKickError: kicked.error ?? null,
      });

      try {
        const result = await processGradingJobs(admin, {
          progressId: progress.id,
          limit: 1,
        });
        if (result.succeeded > 0) {
          return NextResponse.json(
            {
              grading: { status: 'completed' as const, error: null },
              worker: result,
            },
            { status: 201 }
          );
        }
        if (result.failed > 0) {
          const { data: failedProgress } = await admin
            .from('lesson_progress')
            .select('grading_error')
            .eq('id', progress.id)
            .maybeSingle();
          return NextResponse.json(
            {
              error:
                failedProgress?.grading_error ?? 'Failed to grade submission',
              grading: {
                status: 'failed' as const,
                error: failedProgress?.grading_error ?? null,
              },
              worker: result,
            },
            { status: 500 }
          );
        }

        // Inline claim missed, but a worker kick may still process the job.
        if (kicked.ok) {
          return NextResponse.json(
            {
              success: true,
              progressId: progress.id,
              grading: {
                status: 'queued' as const,
                error: null,
              },
              message:
                'Grading re-queued and worker kicked. Refresh shortly for results.',
            },
            { status: 202 }
          );
        }

        const message =
          result.skipped > 0
            ? 'Grading worker skipped this job (missing lesson, tenant, or submission).'
            : `Grading worker did not claim this job${
                kicked.error ? ` (kick failed: ${kicked.error})` : ''
              }.`;
        console.error('[grading] Inline re-run produced no result', {
          progressId: progress.id,
          result,
          kicked,
        });
        return jsonError(message, 500);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to grade submission';
        console.error('[grading] Inline re-run crashed', {
          progressId: progress.id,
          message,
        });

        // Keep processing alive on the worker invocation if inline crashed.
        if (kicked.ok) {
          waitUntil(
            processGradingJobs(admin, {
              progressId: progress.id,
              limit: 1,
            }).catch((fallbackError) => {
              console.error(
                '[grading] waitUntil fallback after inline crash failed:',
                fallbackError
              );
            })
          );
          return NextResponse.json(
            {
              success: true,
              progressId: progress.id,
              grading: {
                status: 'queued' as const,
                error: null,
              },
              message:
                'Inline grading crashed; worker kick accepted. Refresh shortly.',
              inlineError: message,
            },
            { status: 202 }
          );
        }

        return jsonError(message, 500);
      }
    }

    await scheduleGradingWorker(progress.id, request);

    return NextResponse.json(
      {
        success: true,
        progressId: progress.id,
        grading: {
          status: 'queued' as const,
          error: null,
        },
      },
      { status: 202 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to grade submission';
    console.error('[grading] Grade route crashed', { message });
    return jsonError(message, 500);
  }
}
