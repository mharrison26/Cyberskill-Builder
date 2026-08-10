'use client';

import type { ReactNode } from 'react';

import { useTicketWorkbench } from '@/components/tickets/TicketWorkbenchProvider';

/**
 * Gates the scenario form until the ticket is opened, and remounts on retry
 * so local form state resets for a new attempt.
 */
export function TicketWorkbenchFormGate({
  children,
}: {
  children: (args: {
    readOnly: boolean;
    formKey: string | number;
  }) => ReactNode;
}) {
  const { answersEditable, requiresOpen, retryKey, readOnlyPreview, status } =
    useTicketWorkbench();

  const readOnly = readOnlyPreview || !answersEditable;

  return (
    <div className="space-y-3">
      {requiresOpen ? (
        <div
          role="status"
          className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm"
        >
          <p className="font-medium">Open the ticket to begin</p>
          <p className="mt-0.5 text-muted-foreground">
            The SLA timer starts when you click Open ticket. Submitting is
            disabled until the ticket is open.
          </p>
        </div>
      ) : null}

      {status === 'resolved' || status === 'reviewed' ? (
        <div
          role="status"
          className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm"
        >
          <p className="font-medium">Scenario locked</p>
          <p className="mt-0.5 text-muted-foreground">
            Your submitted answers are shown read-only. Use Retry scenario to
            start a new graded attempt.
          </p>
        </div>
      ) : null}

      <fieldset
        disabled={!answersEditable}
        className="min-w-0 space-y-6 border-0 p-0 disabled:opacity-90"
      >
        {children({ readOnly, formKey: retryKey })}
      </fieldset>
    </div>
  );
}
