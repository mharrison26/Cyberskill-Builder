import type { SupabaseClient } from '@supabase/supabase-js';

import {
  gradeSubmission,
  MissingAnthropicApiKeyError,
} from '@/lib/grading/gradeSubmission';
import type { CCCERValues } from '@/types';

/**
 * Queue or run AI grading after a lesson submission.
 *
 * Calls the shared grading pipeline directly (same logic as POST
 * /api/lessons/[lessonId]/grade).
 */
export type TriggerGradingInput = {
  supabase: SupabaseClient;
  progressId: string;
  studentId: string;
  tenantId: string;
  lessonId: string;
  trackId: string;
  dcwfCode: string | null;
  submission: CCCERValues;
};

export type TriggerGradingResult = {
  queued: boolean;
  findingId?: string;
  aiFindingState?: string;
  error?: string;
};

export async function triggerGrading(
  input: TriggerGradingInput
): Promise<TriggerGradingResult> {
  const { supabase, progressId, studentId, lessonId, tenantId } = input;

  console.info('[grading] Running AI grading', {
    progressId,
    studentId,
    lessonId,
  });

  try {
    const result = await gradeSubmission({
      supabase,
      lessonId,
      studentId,
      tenantId,
    });

    return {
      queued: false,
      findingId: result.finding.id,
      aiFindingState: result.aiFindingState,
    };
  } catch (error) {
    if (error instanceof MissingAnthropicApiKeyError) {
      console.warn('[grading] Skipped: ANTHROPIC_API_KEY is not configured');
      return {
        queued: true,
        error: error.message,
      };
    }

    const message =
      error instanceof Error ? error.message : 'Unknown grading error';
    console.error('[grading] Failed:', message);
    return {
      queued: true,
      error: message,
    };
  }
}
