import type { SupabaseClient } from '@supabase/supabase-js';

import { getCatalogSourceMetadata } from '@/lib/grading/catalogSource';
import type { GradedFinding } from '@/lib/grading/gradeSubmission';
import {
  mapAiFindingStateToDb,
  type AiFindingState,
} from '@/lib/grading/mapFindingState';
import { scoreCatalogLabSubmission } from '@/lib/grading/scoreCatalogLab';
import {
  isCatalogLabSubmission,
  type CatalogLabSubmission,
} from '@/lib/lessons/catalogLabValidation';

export type GradeCatalogLabLessonInput = {
  supabase: SupabaseClient;
  lessonId: string;
  studentId: string;
  tenantId: string;
};

export type GradeCatalogLabLessonResult = {
  finding: GradedFinding;
  aiFindingState: AiFindingState;
  score: ReturnType<typeof scoreCatalogLabSubmission>;
};

function formatStudentNarrative(submission: CatalogLabSubmission): string {
  const parts = [
    `Control IDs: ${submission.controlIds.join(', ')}`,
    submission.adjacentAcControls.length > 0
      ? `Authentication-adjacent AC controls: ${submission.adjacentAcControls.join(', ')}`
      : null,
    submission.explanation,
  ].filter((part): part is string => Boolean(part));
  return parts.join('\n\n');
}

/**
 * Grade a catalog_lab lesson via deterministic OSCAL family-filter scoring
 * (no LLM). Persists oscal_findings and marks lesson_progress reviewed.
 */
export async function gradeCatalogLabLesson(
  input: GradeCatalogLabLessonInput
): Promise<GradeCatalogLabLessonResult> {
  const { supabase, lessonId, studentId, tenantId } = input;

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('id, track_id, dcwf_code, title, lesson_type, control_id')
    .eq('id', lessonId)
    .maybeSingle();

  if (lessonError || !lesson) {
    throw new Error('Lesson not found');
  }

  if (lesson.lesson_type !== 'catalog_lab') {
    throw new Error('Lesson is not a catalog_lab');
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

  if (!isCatalogLabSubmission(progress.submission)) {
    throw new Error('Submission payload missing from lesson progress');
  }

  const submission = progress.submission;
  const score = scoreCatalogLabSubmission(submission);
  const catalogSource = getCatalogSourceMetadata();
  const dbFindingState = mapAiFindingStateToDb(score.findingState);
  const controlId =
    typeof lesson.control_id === 'string' && lesson.control_id.trim()
      ? lesson.control_id.trim()
      : (submission.controlIds[0] ?? 'ia-5');

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
        feedback: score.feedback,
        strengths: score.strengths,
        gaps: score.gaps,
        ai_finding_state: score.findingState,
        grading_mode: 'oscal_family_filter',
        percentage: score.percentage,
        expected_base_ia: score.expectedBaseIa,
        submitted_control_ids: score.submitted,
        adjacent_ac_controls: score.adjacentAcControls,
      },
      student_narrative: formatStudentNarrative(submission),
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
    aiFindingState: score.findingState,
    score,
  };
}
