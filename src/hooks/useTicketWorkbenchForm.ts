'use client';

import { useOptionalTicketWorkbench } from '@/components/tickets/TicketWorkbenchProvider';

/**
 * Shared workbench form bindings: restored submission, feedback, and read-only.
 * Safe outside the provider (returns nulls / prop readOnly).
 */
export function useTicketWorkbenchForm(readOnlyProp = false) {
  const workbench = useOptionalTicketWorkbench();
  const submission = workbench?.submission ?? null;
  const formReadOnly =
    readOnlyProp || Boolean(workbench && !workbench.answersEditable);
  const hideSubmit =
    formReadOnly ||
    workbench?.status === 'resolved' ||
    workbench?.status === 'reviewed';

  return {
    workbench,
    submission,
    formReadOnly,
    hideSubmit,
    lastFeedback: workbench?.lastFeedback ?? null,
    lastScoreStatus: workbench?.lastScoreStatus ?? null,
    lastStructuredResult: workbench?.lastStructuredResult ?? null,
  };
}

/** Narrow persisted submission JSON for field restore. */
export function asSubmissionRecord(
  submission: unknown
): Record<string, unknown> {
  if (
    submission &&
    typeof submission === 'object' &&
    !Array.isArray(submission)
  ) {
    return submission as Record<string, unknown>;
  }
  return {};
}

export function restoredString(
  submission: unknown,
  keys: string | string[],
  fallback = ''
): string {
  const record = asSubmissionRecord(submission);
  const list = Array.isArray(keys) ? keys : [keys];
  for (const key of list) {
    const value = record[key];
    if (typeof value === 'string') return value;
  }
  return fallback;
}

export function restoredStringArray(
  submission: unknown,
  keys: string | string[]
): string[] {
  const record = asSubmissionRecord(submission);
  const list = Array.isArray(keys) ? keys : [keys];
  for (const key of list) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    return value.filter(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0
    );
  }
  return [];
}

export function restoredStringSet(
  submission: unknown,
  keys: string | string[]
): Set<string> {
  return new Set(restoredStringArray(submission, keys));
}
