import type { SupabaseClient } from '@supabase/supabase-js';

import { buildConceptualMemoGradingPrompt } from '@/lib/grading/buildConceptualMemoGradingPrompt';
import {
  callClaudeGrading,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { getCatalogSourceMetadata } from '@/lib/grading/catalogSource';
import type { GradedFinding } from '@/lib/grading/gradeSubmission';
import {
  mapAiFindingStateToDb,
  type AiFindingState,
} from '@/lib/grading/mapFindingState';
import {
  isConceptualSubmission,
  type ConceptualSubmission,
} from '@/lib/lessons/conceptualValidation';
import type { LessonContentPayload } from '@/types';

export type GradeConceptualLessonInput = {
  supabase: SupabaseClient;
  lessonId: string;
  studentId: string;
  tenantId: string;
};

export type GradeConceptualLessonResult = {
  finding: GradedFinding;
  aiFindingState: AiFindingState;
};

const CONCEPTUAL_FINDING_CONTROL_ID = 'conceptual-synthesis';

/**
 * Grade a conceptual lesson memo against lessons.content.gradingFocus.
 */
export async function gradeConceptualLesson(
  input: GradeConceptualLessonInput
): Promise<GradeConceptualLessonResult> {
  const { supabase, lessonId, studentId, tenantId } = input;

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('id, track_id, dcwf_code, title, lesson_type, control_id, content')
    .eq('id', lessonId)
    .maybeSingle();

  if (lessonError || !lesson) {
    throw new Error('Lesson not found');
  }

  if (lesson.lesson_type !== 'conceptual') {
    throw new Error('Lesson is not conceptual');
  }

  const { data: progress, error: progressError } = await supabase
    .from('lesson_progress')
    .select('id, status, submission')
    .eq('student_id', studentId)
    .eq('lesson_id', lessonId)
    .eq('status', 'submitted')
    .maybeSingle();

  if (progressError || !progress) {
    throw new Error('Submitted lesson progress not found');
  }

  if (!isConceptualSubmission(progress.submission)) {
    throw new Error('Submission payload missing from lesson progress');
  }

  const submission = progress.submission as ConceptualSubmission;
  const content = (lesson.content ?? {}) as LessonContentPayload;
  const scenarioBrief =
    typeof content.scenarioBrief === 'string' ? content.scenarioBrief : undefined;
  const gradingFocus =
    typeof content.gradingFocus === 'string' ? content.gradingFocus : undefined;

  const prompt = buildConceptualMemoGradingPrompt({
    lessonTitle: lesson.title,
    scenarioBrief,
    gradingFocus,
    memo: submission.memo,
  });

  const grading: ClaudeGradingResult = await callClaudeGrading(prompt);
  const catalogSource = getCatalogSourceMetadata();
  const dbFindingState = mapAiFindingStateToDb(grading.finding_state);
  const controlId =
    typeof lesson.control_id === 'string' && lesson.control_id.trim()
      ? lesson.control_id.trim()
      : CONCEPTUAL_FINDING_CONTROL_ID;

  const { data: finding, error: findingError } = await supabase
    .from('oscal_findings')
    .insert({
      tenant_id: tenantId,
      student_id: studentId,
      track_id: lesson.track_id,
      lesson_id: lessonId,
      control_id: controlId,
      catalog_source: JSON.stringify(catalogSource),
      finding_state: dbFindingState,
      observation: {
        feedback: grading.feedback,
        strengths: grading.strengths,
        gaps: grading.gaps,
        ai_finding_state: grading.finding_state,
        grading_mode: 'conceptual_memo',
      },
      student_narrative: submission.memo,
      dcwf_code: lesson.dcwf_code,
    })
    .select(
      'id, tenant_id, student_id, track_id, lesson_id, control_id, catalog_source, finding_state, observation, student_narrative, dcwf_code, created_at'
    )
    .single();

  if (findingError || !finding) {
    console.error('oscal_findings insert failed:', findingError);
    throw new Error('Failed to persist grading finding');
  }

  const { error: progressUpdateError } = await supabase
    .from('lesson_progress')
    .update({ status: 'reviewed' })
    .eq('id', progress.id);

  if (progressUpdateError) {
    console.error('lesson_progress review update failed:', progressUpdateError);
    throw new Error('Finding saved but failed to update lesson progress');
  }

  return {
    finding: finding as GradedFinding,
    aiFindingState: grading.finding_state,
  };
}
