import type { SupabaseClient } from '@supabase/supabase-js';

import {
  gradeSubmission,
  MissingAnthropicApiKeyError,
} from '@/lib/grading/gradeSubmission';
import type { CatalogLabSubmission } from '@/lib/lessons/catalogLabValidation';
import type { ConceptualSubmission } from '@/lib/lessons/conceptualValidation';
import type { ToolWalkthroughSubmission } from '@/lib/lessons/toolWalkthroughValidation';
import type { CCCERValues } from '@/types';

/**
 * Run AI grading after a lesson submission has already been persisted.
 *
 * Calls the shared grading pipeline directly (same logic as POST
 * /api/lessons/[lessonId]/grade). Failures are recorded on lesson_progress
 * so the client can show an explicit retry state instead of indefinite pending.
 */
export type TriggerGradingInput = {
  supabase: SupabaseClient;
  progressId: string;
  studentId: string;
  tenantId: string;
  lessonId: string;
  trackId: string;
  dcwfCode: string | null;
  submission:
    | CCCERValues
    | ToolWalkthroughSubmission
    | CatalogLabSubmission
    | ConceptualSubmission;
};

export type TriggerGradingResult = {
  status: 'completed' | 'failed';
  findingId?: string;
  aiFindingState?: string;
  error?: string;
};

async function markGradingStarted(
  supabase: SupabaseClient,
  progressId: string
): Promise<void> {
  const { error } = await supabase
    .from('lesson_progress')
    .update({
      grading_started_at: new Date().toISOString(),
      grading_error: null,
    })
    .eq('id', progressId);

  if (error) {
    console.error('[grading] Failed to mark grading started:', error);
  }
}

async function markGradingFailed(
  supabase: SupabaseClient,
  progressId: string,
  message: string
): Promise<void> {
  const { error } = await supabase
    .from('lesson_progress')
    .update({
      grading_error: message.slice(0, 1000),
    })
    .eq('id', progressId);

  if (error) {
    console.error('[grading] Failed to persist grading_error:', error);
  }
}

async function markGradingSucceeded(
  supabase: SupabaseClient,
  progressId: string
): Promise<void> {
  const { error } = await supabase
    .from('lesson_progress')
    .update({
      grading_error: null,
      graded_at: new Date().toISOString(),
    })
    .eq('id', progressId);

  if (error) {
    console.error('[grading] Failed to clear grading_error:', error);
  }
}

export async function triggerGrading(
  input: TriggerGradingInput
): Promise<TriggerGradingResult> {
  const { supabase, progressId, studentId, lessonId, tenantId } = input;

  console.info('[grading] Running AI grading', {
    progressId,
    studentId,
    lessonId,
  });

  await markGradingStarted(supabase, progressId);

  try {
    const result = await gradeSubmission({
      supabase,
      lessonId,
      studentId,
      tenantId,
    });

    await markGradingSucceeded(supabase, progressId);

    return {
      status: 'completed',
      findingId: result.finding.id,
      aiFindingState: result.aiFindingState,
    };
  } catch (error) {
    if (error instanceof MissingAnthropicApiKeyError) {
      console.warn('[grading] Failed: ANTHROPIC_API_KEY is not configured');
      const message =
        'Grading failed: AI grading is not configured. Your answer is saved — retry once grading is enabled, or contact an admin.';
      await markGradingFailed(supabase, progressId, message);
      return {
        status: 'failed',
        error: message,
      };
    }

    const message =
      error instanceof Error ? error.message : 'Unknown grading error';
    console.error('[grading] Failed:', message);
    const userMessage = `Grading failed, your answer is saved. You can retry. (${message})`;
    await markGradingFailed(supabase, progressId, userMessage);
    return {
      status: 'failed',
      error: userMessage,
    };
  }
}
