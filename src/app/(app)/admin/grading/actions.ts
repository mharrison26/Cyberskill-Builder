'use server';

import { revalidatePath } from 'next/cache';

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createClient } from '@/lib/supabase/server';
import type { FindingState } from '@/types';

export type FindingActionResult = {
  error?: string;
  fieldErrors?: {
    id?: string;
    finding_state?: string;
    feedback?: string;
  };
};

const GRADING_STATES: FindingState[] = [
  'satisfied',
  'insufficient_evidence',
  'not_satisfied',
];

function isGradingState(value: string): value is FindingState {
  return GRADING_STATES.includes(value as FindingState);
}

function mergeObservationFeedback(
  observation: unknown,
  feedback: string
): Record<string, unknown> {
  const base =
    observation &&
    typeof observation === 'object' &&
    !Array.isArray(observation)
      ? { ...(observation as Record<string, unknown>) }
      : {};

  return { ...base, feedback };
}

export async function updateFinding(
  _prevState: FindingActionResult,
  formData: FormData
): Promise<FindingActionResult> {
  await requireAdmin();

  const id = String(formData.get('id') ?? '').trim();
  const findingState = String(formData.get('finding_state') ?? '').trim();
  const feedback = String(formData.get('feedback') ?? '').trim();

  const fieldErrors: FindingActionResult['fieldErrors'] = {};
  if (!id) fieldErrors.id = 'Finding id is required';
  if (!isGradingState(findingState)) {
    fieldErrors.finding_state = 'Select a valid finding state';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from('oscal_findings')
    .select('observation')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) {
    return { error: fetchError.message };
  }

  if (!existing) {
    return { error: 'Finding not found' };
  }

  const { error: updateError } = await supabase
    .from('oscal_findings')
    .update({
      finding_state: findingState,
      observation: mergeObservationFeedback(existing.observation, feedback),
      is_reviewed: true,
    })
    .eq('id', id);

  if (updateError) {
    return { error: updateError.message };
  }

  revalidatePath('/admin/grading');
  return {};
}
