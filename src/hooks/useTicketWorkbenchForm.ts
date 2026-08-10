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
