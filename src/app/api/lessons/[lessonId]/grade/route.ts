import { NextResponse } from 'next/server';

import { enqueueGrading } from '@/lib/grading/enqueueGrading';
import { processGradingJobs } from '@/lib/grading/processGradingJobs';
import { scheduleGradingWorker } from '@/lib/grading/scheduleGradingWorker';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * Re-queue AI grading for a submitted lesson. The worker performs the LLM
 * call so this route does not block on model latency.
 */
export const maxDuration = 30;

type RouteContext = {
  params: { lessonId: string };
};

type GradeRequestBody = {
  studentId?: string;
  /** When true (admin only), process the job inline in this request. */
  inline?: boolean;
};

export async function POST(request: Request, { params }: RouteContext) {
  const { lessonId } = params;
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
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const targetStudentId = body.studentId ?? appUser.id;

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

  const { data: progress, error: progressError } = await supabase
    .from('lesson_progress')
    .select('id, status, submission')
    .eq('student_id', targetStudentId)
    .eq('lesson_id', lessonId)
    .eq('status', 'submitted')
    .maybeSingle();

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

  const grading = await enqueueGrading({
    supabase,
    progressId: progress.id,
    studentId: targetStudentId,
    lessonId,
    resetAttempts: true,
  });

  const runInline =
    process.env.GRADING_PROCESS_INLINE === '1' ||
    (body.inline === true && appUser.is_admin === true);

  if (runInline) {
    try {
      const admin = createAdminClient();
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
        const { data: failedProgress } = await supabase
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
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to grade submission';
      return NextResponse.json(
        {
          error: message,
          grading: { status: 'failed' as const, error: message },
        },
        { status: 500 }
      );
    }
  } else {
    await scheduleGradingWorker(progress.id);
  }

  return NextResponse.json(
    {
      success: true,
      progressId: progress.id,
      grading: {
        status: grading.status,
        error: null,
      },
    },
    { status: 202 }
  );
}
