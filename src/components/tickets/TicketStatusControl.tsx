'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2 } from 'lucide-react';

import { resolveTicket, startTicket } from '@/components/tickets/actions';
import { TicketStatusBadge } from '@/components/tickets/TicketStatusBadge';
import { Button } from '@/components/ui/button';
import { nextTicketStatus, TICKET_STATUS_FLOW } from '@/lib/tickets/status';
import type { TicketProgressStatus } from '@/types';
import { cn } from '@/lib/utils';

type TicketStatusControlProps = {
  trackSlug: string;
  ticketId: string;
  status: TicketProgressStatus;
  /** Hide start/resolve mutations (admin preview). */
  readOnly?: boolean;
  /**
   * When provided, advances status locally (mock consoles) instead of
   * calling server actions. Reviewed is mock/local-only until grading wires it.
   */
  onStatusChange?: (next: TicketProgressStatus) => void;
  className?: string;
};

const ACTION_LABELS: Partial<
  Record<TicketProgressStatus, { idle: string; pending: string }>
> = {
  new: { idle: 'Open ticket', pending: 'Opening…' },
  in_progress: { idle: 'Submit / Resolve', pending: 'Submitting…' },
  resolved: { idle: 'Mark reviewed', pending: 'Saving…' },
};

/**
 * Ticket lifecycle control: New → In Progress → Resolved → Reviewed.
 */
export function TicketStatusControl({
  trackSlug,
  ticketId,
  status,
  readOnly = false,
  onStatusChange,
  className,
}: TicketStatusControlProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const next = nextTicketStatus(status);
  const action = status !== 'reviewed' ? ACTION_LABELS[status] : null;

  function advance() {
    if (!next) return;
    setError(null);

    if (onStatusChange) {
      onStatusChange(next);
      return;
    }

    if (status === 'resolved') {
      // Reviewed is assessor-side; no student server action yet.
      setError('Assessor review is not available from this console yet.');
      return;
    }

    startTransition(async () => {
      const result =
        status === 'new'
          ? await startTicket(trackSlug, ticketId)
          : await resolveTicket(trackSlug, ticketId);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3',
        className
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">
          Status
        </span>
        <ol className="flex flex-wrap items-center gap-1.5" aria-label="Ticket lifecycle">
          {TICKET_STATUS_FLOW.map((step, index) => {
            const reached =
              TICKET_STATUS_FLOW.indexOf(status) >= index;
            return (
              <li key={step} className="flex items-center gap-1.5">
                {index > 0 ? (
                  <span
                    className="text-muted-foreground/60"
                    aria-hidden="true"
                  >
                    →
                  </span>
                ) : null}
                <span
                  className={cn(
                    'text-xs',
                    step === status
                      ? 'font-semibold text-foreground'
                      : reached
                        ? 'text-muted-foreground'
                        : 'text-muted-foreground/50'
                  )}
                >
                  {step === 'in_progress'
                    ? 'In Progress'
                    : step.charAt(0).toUpperCase() + step.slice(1)}
                </span>
              </li>
            );
          })}
        </ol>
        <TicketStatusBadge status={status} />
      </div>

      {readOnly ? (
        <p className="text-sm text-muted-foreground">
          Preview — actions disabled
        </p>
      ) : null}

      {!readOnly && status === 'reviewed' ? (
        <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Assessor reviewed
        </p>
      ) : null}

      {!readOnly && action && next ? (
        <Button type="button" onClick={advance} disabled={isPending}>
          {isPending ? action.pending : action.idle}
        </Button>
      ) : null}

      {error ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
