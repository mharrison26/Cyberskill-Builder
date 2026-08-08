'use client';

import { useState, useTransition } from 'react';

import { resolveTicket, startTicket } from '@/components/tickets/actions';
import { TicketStatusBadge } from '@/components/tickets/TicketStatusBadge';
import { Button } from '@/components/ui/button';
import type { TicketProgressStatus } from '@/types';

type TicketStatusControlProps = {
  trackSlug: string;
  ticketId: string;
  status: TicketProgressStatus;
  /** Hide start/resolve mutations (admin preview). */
  readOnly?: boolean;
};

export function TicketStatusControl({
  trackSlug,
  ticketId,
  status,
  readOnly = false,
}: TicketStatusControlProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const result = await startTicket(trackSlug, ticketId);
      if (result.error) setError(result.error);
    });
  }

  function handleResolve() {
    setError(null);
    startTransition(async () => {
      const result = await resolveTicket(trackSlug, ticketId);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">
          Status
        </span>
        <TicketStatusBadge status={status} />
      </div>

      {readOnly ? (
        <p className="text-sm text-muted-foreground">
          Preview — actions disabled
        </p>
      ) : null}

      {!readOnly && status === 'new' ? (
        <Button type="button" onClick={handleStart} disabled={isPending}>
          {isPending ? 'Opening…' : 'Open ticket'}
        </Button>
      ) : null}

      {!readOnly && status === 'in_progress' ? (
        <Button type="button" onClick={handleResolve} disabled={isPending}>
          {isPending ? 'Submitting…' : 'Submit / Resolve'}
        </Button>
      ) : null}

      {!readOnly && status === 'resolved' ? (
        <p className="text-sm text-muted-foreground">
          This ticket is resolved.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
