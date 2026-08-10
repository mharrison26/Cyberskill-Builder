import { NextResponse } from 'next/server';

import {
  extractMemoFromSubmission,
  resolveLessonGradingPhase,
  type LessonGradingStatusPayload,
} from '@/lib/grading/lessonGradingStatus';
import { isLessonGradedStatus } from '@/lib/status';
import { createClient } from '@/lib/supabase/server';

type RouteContext = {
  params: { lessonId: string };
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { lessonId } = params;
  const supabase = await createClient();

  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: progress, error: progressError } = await supabase
    .from('lesson_progress')
    .select(
      'id, status, submission, grading_error, submitted_at, grading_started_at, graded_at'
    )
    .eq('student_id', authUser.id)
    .eq('lesson_id', lessonId)
    .maybeSingle();

  if (progressError) {
    console.error('lesson status progress lookup failed:', progressError);
    return NextResponse.json(
      { error: 'Failed to load submission status' },
      { status: 500 }
    );
  }

  let finding: LessonGradingStatusPayload['finding'] = null;

  if (
    progress &&
    (isLessonGradedStatus(progress.status) || progress.status === 'submitted')
  ) {
    const { data: latestFinding } = await supabase
      .from('oscal_findings')
      .select(
        'id, finding_state, observation, control_id, student_narrative, dcwf_code, created_at, is_public'
      )
      .eq('student_id', authUser.id)
      .eq('lesson_id', lessonId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    finding = latestFinding ?? null;
  }

  const payload: LessonGradingStatusPayload = {
    progressId: progress?.id ?? null,
    status: progress?.status ?? null,
    phase: resolveLessonGradingPhase({
      status: progress?.status,
      gradingError: progress?.grading_error,
      hasFinding: Boolean(finding),
    }),
    submission: progress?.submission ?? null,
    memo: extractMemoFromSubmission(progress?.submission),
    gradingError: progress?.grading_error ?? null,
    submittedAt: progress?.submitted_at ?? null,
    gradingStartedAt: progress?.grading_started_at ?? null,
    gradedAt: progress?.graded_at ?? null,
    finding,
  };

  return NextResponse.json(payload);
}
