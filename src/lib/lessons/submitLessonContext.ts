import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import type { CatalogLabSubmission } from '@/lib/lessons/catalogLabValidation';
import type { ConceptualSubmission } from '@/lib/lessons/conceptualValidation';
import type { ToolWalkthroughSubmission } from '@/lib/lessons/toolWalkthroughValidation';
import type { CCCERValues } from '@/types';

export type LessonSubmissionPayload =
  | CCCERValues
  | ToolWalkthroughSubmission
  | CatalogLabSubmission
  | ConceptualSubmission;

export type SubmitLessonContext = {
  supabase: SupabaseClient;
  authUserId: string;
  appUser: {
    id: string;
    tenant_id: string;
    email: string;
  };
  lesson: {
    id: string;
    track_id: string;
    dcwf_code: string | null;
  };
};

export async function resolveSubmitLessonContext(
  supabase: SupabaseClient,
  lessonId: string
): Promise<
  | { ok: true; context: SubmitLessonContext }
  | { ok: false; response: NextResponse }
> {
  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { data: appUser, error: userError } = await supabase
    .from('users')
    .select('id, tenant_id, email')
    .eq('id', authUser.id)
    .maybeSingle();

  if (userError || !appUser) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'User profile not found' },
        { status: 403 }
      ),
    };
  }

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('id, track_id, dcwf_code')
    .eq('id', lessonId)
    .maybeSingle();

  if (lessonError || !lesson) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Lesson not found' },
        { status: 404 }
      ),
    };
  }

  const { data: enrollment, error: enrollmentError } = await supabase
    .from('track_enrollments')
    .select('id')
    .eq('student_id', appUser.id)
    .eq('track_id', lesson.track_id)
    .eq('status', 'active')
    .maybeSingle();

  if (enrollmentError || !enrollment) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Active enrollment required for this track' },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    context: {
      supabase,
      authUserId: authUser.id,
      appUser,
      lesson,
    },
  };
}

export async function upsertLessonSubmission(
  context: SubmitLessonContext,
  lessonId: string,
  submission: LessonSubmissionPayload
) {
  const submittedAt = new Date().toISOString();

  // Persist the student's work before any grading attempt. Clear prior
  // grading state so a resubmit starts from a clean queued job.
  return context.supabase
    .from('lesson_progress')
    .upsert(
      {
        student_id: context.appUser.id,
        lesson_id: lessonId,
        status: 'submitted',
        submitted_at: submittedAt,
        submission,
        grading_error: null,
        grading_started_at: null,
        graded_at: null,
        grading_job_status: 'queued',
        grading_attempt_count: 0,
        grading_next_retry_at: null,
        grading_last_alerted_at: null,
      },
      { onConflict: 'student_id,lesson_id' }
    )
    .select('id')
    .single();
}
