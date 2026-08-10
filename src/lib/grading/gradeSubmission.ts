import type { SupabaseClient } from '@supabase/supabase-js';

import { buildGradingPrompt } from '@/lib/grading/buildGradingPrompt';
import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
} from '@/lib/grading/callClaudeGrading';
import { getCatalogSourceMetadata } from '@/lib/grading/catalogSource';
import { gradeCatalogLabLesson } from '@/lib/grading/gradeCatalogLabLesson';
import { gradeConceptualLesson } from '@/lib/grading/gradeConceptualLesson';
import { gradeToolWalkthroughLesson } from '@/lib/grading/gradeToolWalkthroughLesson';
import {
  mapAiFindingStateToDb,
  type AiFindingState,
} from '@/lib/grading/mapFindingState';
import { isCatalogLabSubmission } from '@/lib/lessons/catalogLabValidation';
import { isConceptualSubmission } from '@/lib/lessons/conceptualValidation';
import { getControlText } from '@/lib/oscal/getControl';
import type { CCCERValues } from '@/types';

export type GradeSubmissionInput = {
  supabase: SupabaseClient;
  lessonId: string;
  studentId: string;
  tenantId: string;
};

export type GradedFinding = {
  id: string;
  tenant_id: string;
  student_id: string;
  track_id: string;
  lesson_id: string;
  control_id: string;
  catalog_source: string;
  finding_state: string;
  observation: {
    feedback: string;
    strengths: string[];
    gaps: string[];
    ai_finding_state: AiFindingState;
  };
  student_narrative: string | null;
  dcwf_code: string | null;
  created_at: string;
};

export type GradeSubmissionResult = {
  finding: GradedFinding;
  aiFindingState: AiFindingState;
};

export { MissingAnthropicApiKeyError };

function formatStudentNarrative(submission: CCCERValues): string {
  return [
    `Condition: ${submission.condition}`,
    `Criteria: ${submission.criteria}`,
    `Cause: ${submission.cause}`,
    `Effect: ${submission.effect}`,
    `Recommendation: ${submission.recommendation}`,
  ].join('\n\n');
}

function resolveLessonControlIds(
  controlId: string | null,
  submission: CCCERValues
): string[] {
  if (controlId?.trim()) {
    return [controlId.trim()];
  }

  const match = submission.criteria.match(/\b([a-z]{2,3}-\d+(?:\.\d+)?)\b/i);
  if (match) {
    return [match[1].toLowerCase()];
  }

  return [];
}

function isToolWalkthroughSubmissionPayload(
  value: unknown
): value is { type: 'tool_walkthrough' } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'tool_walkthrough'
  );
}

export async function gradeSubmission(
  input: GradeSubmissionInput
): Promise<GradeSubmissionResult> {
  const { supabase, lessonId, studentId, tenantId } = input;

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('id, track_id, dcwf_code, control_id, lesson_type')
    .eq('id', lessonId)
    .maybeSingle();

  if (lessonError || !lesson) {
    throw new Error('Lesson not found');
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

  if (
    lesson.lesson_type === 'tool_walkthrough' ||
    isToolWalkthroughSubmissionPayload(progress.submission)
  ) {
    const result = await gradeToolWalkthroughLesson(input);
    return {
      finding: result.finding,
      aiFindingState: result.aiFindingState,
    };
  }

  if (
    lesson.lesson_type === 'catalog_lab' ||
    isCatalogLabSubmission(progress.submission)
  ) {
    const result = await gradeCatalogLabLesson(input);
    return {
      finding: result.finding,
      aiFindingState: result.aiFindingState,
    };
  }

  if (
    lesson.lesson_type === 'conceptual' ||
    isConceptualSubmission(progress.submission)
  ) {
    const result = await gradeConceptualLesson(input);
    return {
      finding: result.finding,
      aiFindingState: result.aiFindingState,
    };
  }

  const submission = progress.submission as CCCERValues | null;
  if (!submission) {
    throw new Error('Submission payload missing from lesson progress');
  }

  const controlIds = resolveLessonControlIds(lesson.control_id, submission);
  if (controlIds.length === 0) {
    throw new Error('No control_id associated with this lesson');
  }

  const controls = controlIds.map((controlId) => {
    try {
      return getControlText(controlId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Control not found: ${controlId}`;
      throw new Error(message);
    }
  });

  const prompt = buildGradingPrompt(controls, submission);
  const grading = await callClaudeGrading(prompt);
  const catalogSource = getCatalogSourceMetadata();
  const primaryControl = controls[0];
  const dbFindingState = mapAiFindingStateToDb(grading.finding_state);

  const { data: finding, error: findingError } = await supabase
    .from('oscal_findings')
    .insert({
      tenant_id: tenantId,
      student_id: studentId,
      track_id: lesson.track_id,
      lesson_id: lessonId,
      control_id: primaryControl.controlId,
      catalog_source: JSON.stringify(catalogSource),
      finding_state: dbFindingState,
      observation: {
        feedback: grading.feedback,
        strengths: grading.strengths,
        gaps: grading.gaps,
        ai_finding_state: grading.finding_state,
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
    aiFindingState: grading.finding_state,
  };
}
