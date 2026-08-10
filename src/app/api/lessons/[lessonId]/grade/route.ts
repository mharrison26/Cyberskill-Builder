import { NextResponse } from 'next/server';

import { triggerGrading } from '@/lib/grading/triggerGrading';
import type { CatalogLabSubmission } from '@/lib/lessons/catalogLabValidation';
import type { ConceptualSubmission } from '@/lib/lessons/conceptualValidation';
import type { ToolWalkthroughSubmission } from '@/lib/lessons/toolWalkthroughValidation';
import { createClient } from '@/lib/supabase/server';
import type { CCCERValues } from '@/types';

/** Allow enough time for synchronous AI grading retries. */
export const maxDuration = 60;

type RouteContext = {
  params: { lessonId: string };
};

type GradeRequestBody = {
  studentId?: string;
};

type StoredLessonSubmission =
  | CCCERValues
  | ToolWalkthroughSubmission
  | CatalogLabSubmission
  | ConceptualSubmission;

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

  const grading = await triggerGrading({
    supabase,
    progressId: progress.id,
    studentId: targetStudentId,
    tenantId: targetUser.tenant_id,
    lessonId,
    trackId: lesson.track_id,
    dcwfCode: lesson.dcwf_code,
    submission: progress.submission as StoredLessonSubmission,
  });

  if (grading.status === 'failed') {
    const isMissingKey =
      grading.error?.includes('not configured') ||
      grading.error?.includes('ANTHROPIC_API_KEY');
    return NextResponse.json(
      {
        error:
          grading.error ??
          (isMissingKey
            ? 'Grading service unavailable: ANTHROPIC_API_KEY is not configured'
            : 'Failed to grade submission'),
        grading: {
          status: grading.status,
          error: grading.error ?? null,
        },
      },
      { status: isMissingKey ? 503 : 500 }
    );
  }

  const { data: finding } = await supabase
    .from('oscal_findings')
    .select(
      'id, tenant_id, student_id, track_id, lesson_id, control_id, catalog_source, finding_state, observation, student_narrative, dcwf_code, created_at'
    )
    .eq('id', grading.findingId!)
    .maybeSingle();

  if (!finding) {
    return NextResponse.json(
      {
        findingId: grading.findingId,
        aiFindingState: grading.aiFindingState,
      },
      { status: 201 }
    );
  }

  return NextResponse.json(
    {
      finding,
      aiFindingState: grading.aiFindingState,
    },
    { status: 201 }
  );
}
