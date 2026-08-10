import type { SupabaseClient } from '@supabase/supabase-js';

import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { getCatalogSourceMetadata } from '@/lib/grading/catalogSource';
import {
  buildToolWalkthroughFieldMappingPrompt,
  type PriorFindingForFieldMapping,
} from '@/lib/grading/buildToolWalkthroughFieldMappingPrompt';
import {
  mapAiFindingStateToDb,
  type AiFindingState,
} from '@/lib/grading/mapFindingState';
import type { GradedFinding } from '@/lib/grading/gradeSubmission';
import type { ToolWalkthroughSubmission } from '@/lib/lessons/toolWalkthroughValidation';

export { MissingAnthropicApiKeyError };

export type GradeToolWalkthroughLessonInput = {
  supabase: SupabaseClient;
  lessonId: string;
  studentId: string;
  tenantId: string;
};

export type GradeToolWalkthroughLessonResult = {
  finding: GradedFinding;
  aiFindingState: AiFindingState;
  priorFindingId: string;
};

function isToolWalkthroughSubmission(
  value: unknown
): value is ToolWalkthroughSubmission {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    record.type === 'tool_walkthrough' &&
    typeof record.storagePath === 'string' &&
    typeof record.externalReference === 'string' &&
    typeof record.reflection === 'string'
  );
}

function assertScreenshotComplete(submission: ToolWalkthroughSubmission): void {
  if (!submission.storagePath.trim()) {
    throw new Error('Screenshot evidence upload is required before grading');
  }
}

export async function loadPriorFindingForLesson(input: {
  supabase: SupabaseClient;
  studentId: string;
  prerequisiteLessonId: string;
}): Promise<PriorFindingForFieldMapping | null> {
  const { supabase, studentId, prerequisiteLessonId } = input;

  const { data, error } = await supabase
    .from('oscal_findings')
    .select(
      'id, control_id, finding_state, student_narrative, observation, lesson:lessons!oscal_findings_lesson_id_fkey(title)'
    )
    .eq('student_id', studentId)
    .eq('lesson_id', prerequisiteLessonId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Failed to load prerequisite oscal_findings:', error);
    throw new Error('Failed to load prerequisite finding for grading');
  }

  if (!data) {
    return null;
  }

  const lessonJoin = data.lesson as
    | { title?: string | null }
    | { title?: string | null }[]
    | null
    | undefined;
  const sourceLessonTitle = Array.isArray(lessonJoin)
    ? (lessonJoin[0]?.title ?? null)
    : (lessonJoin?.title ?? null);

  return {
    id: data.id,
    controlId: data.control_id,
    findingState: data.finding_state,
    studentNarrative: data.student_narrative,
    observation: data.observation,
    sourceLessonTitle,
  };
}

/**
 * Grade a tool_walkthrough lesson submission by RAG-checking the field-mapping
 * reflection against the student's oscal_findings from depends_on_lesson_id.
 */
export async function gradeToolWalkthroughLesson(
  input: GradeToolWalkthroughLessonInput
): Promise<GradeToolWalkthroughLessonResult> {
  const { supabase, lessonId, studentId, tenantId } = input;

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select(
      'id, track_id, dcwf_code, title, lesson_type, depends_on_lesson_id, control_id'
    )
    .eq('id', lessonId)
    .maybeSingle();

  if (lessonError || !lesson) {
    throw new Error('Lesson not found');
  }

  if (lesson.lesson_type !== 'tool_walkthrough') {
    throw new Error('Lesson is not a tool_walkthrough');
  }

  if (!lesson.depends_on_lesson_id) {
    throw new Error(
      'Lesson has no depends_on_lesson_id; cannot grade against a prior finding'
    );
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

  if (!isToolWalkthroughSubmission(progress.submission)) {
    throw new Error('Submission payload missing from lesson progress');
  }

  const submission = progress.submission;
  assertScreenshotComplete(submission);

  const priorFinding = await loadPriorFindingForLesson({
    supabase,
    studentId,
    prerequisiteLessonId: lesson.depends_on_lesson_id,
  });

  if (!priorFinding) {
    throw new Error(
      'No oscal_findings row found for the prerequisite IAM lab lesson. Complete Evidence Collection & Validation and receive a graded finding before submitting this walkthrough.'
    );
  }

  const prompt = buildToolWalkthroughFieldMappingPrompt(priorFinding, {
    externalReference: submission.externalReference,
    reflection: submission.reflection,
    storagePath: submission.storagePath,
    lessonTitle: lesson.title,
  });

  const grading: ClaudeGradingResult = await callClaudeGrading(prompt);
  const catalogSource = getCatalogSourceMetadata();
  const dbFindingState = mapAiFindingStateToDb(grading.finding_state);
  const controlId =
    typeof lesson.control_id === 'string' && lesson.control_id.trim()
      ? lesson.control_id.trim()
      : priorFinding.controlId;

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
        grading_mode: 'prior_finding_field_mapping',
        prior_finding_id: priorFinding.id,
        external_reference: submission.externalReference,
        storage_path: submission.storagePath,
      },
      student_narrative: submission.reflection,
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
    priorFindingId: priorFinding.id,
  };
}
