'use client';

import { useState, useTransition } from 'react';

import { retryTicket } from '@/components/tickets/actions';
import { useTicketWorkbench } from '@/components/tickets/TicketWorkbenchProvider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrainingFeedbackPanel } from '@/components/feedback/TrainingFeedbackPanel';
import { extractTrainingFeedback } from '@/lib/feedback/types';
import { cn } from '@/lib/utils';

function formatAttemptTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TicketAttemptPanel({ className }: { className?: string }) {
  const workbench = useTicketWorkbench();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    attempts,
    attemptCount,
    maxAttempts,
    canRetry,
    status,
    lastFeedback,
    lastScoreStatus,
    lastStructuredResult,
    trackSlug,
    ticketId,
    beginRetryLocally,
    refresh,
    readOnlyPreview,
  } = workbench;

  if (readOnlyPreview) return null;

  const training = extractTrainingFeedback(lastStructuredResult);

  const showOutcome =
    Boolean(lastFeedback || training) &&
    (status === 'resolved' ||
      status === 'reviewed' ||
      status === 'in_progress');

  function handleRetry() {
    setError(null);
    beginRetryLocally();
    startTransition(async () => {
      const result = await retryTicket(trackSlug, ticketId);
      if (result.error) {
        setError(result.error);
        refresh();
        return;
      }
      if (result.startedAt) {
        workbench.setProgress({
          status: 'in_progress',
          startedAt: result.startedAt,
          slaDueAt: result.slaDueAt ?? null,
          resolvedAt: null,
          slaMet: null,
        });
      }
      refresh();
    });
  }

  if (attemptCount === 0 && !showOutcome && !canRetry) {
    return null;
  }

  return (
    <section
      aria-labelledby="ticket-attempts-heading"
      className={cn(
        'space-y-4 rounded-lg border border-border bg-muted/20 px-4 py-4',
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="ticket-attempts-heading"
            className="text-base font-semibold"
          >
            Attempts
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {attemptCount} of {maxAttempts} used
          </p>
        </div>
        {canRetry ? (
          <Button
            type="button"
            variant="outline"
            onClick={handleRetry}
            disabled={isPending}
          >
            {isPending ? 'Starting…' : 'Retry scenario'}
          </Button>
        ) : null}
        {!canRetry && status === 'resolved' ? (
          <p className="text-sm text-muted-foreground">
            Maximum attempts reached
          </p>
        ) : null}
      </div>

      {showOutcome ? (
        <div className="space-y-2 rounded-md border border-border bg-background px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">Latest grading feedback</p>
            {lastScoreStatus ? (
              <Badge variant="outline" className="capitalize">
                {lastScoreStatus.replace(/_/g, ' ')}
              </Badge>
            ) : null}
          </div>
          {training ? (
            <TrainingFeedbackPanel feedback={training} />
          ) : lastFeedback ? (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {lastFeedback}
            </p>
          ) : null}
        </div>
      ) : null}

      {attempts.length > 0 ? (
        <ol className="space-y-2">
          {[...attempts]
            .sort((a, b) => b.attempt_number - a.attempt_number)
            .map((attempt) => (
              <li
                key={attempt.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/80 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    Attempt {attempt.attempt_number}
                  </span>
                  <Badge variant="outline" className="capitalize">
                    {attempt.score_status.replace(/_/g, ' ')}
                  </Badge>
                  {attempt.sla_met === true ? (
                    <Badge
                      variant="secondary"
                      className="bg-status-satisfied/15 text-status-satisfied-foreground"
                    >
                      SLA met
                    </Badge>
                  ) : null}
                  {attempt.sla_met === false ? (
                    <Badge
                      variant="secondary"
                      className="bg-status-blocked/15 text-status-blocked-foreground"
                    >
                      SLA breached
                    </Badge>
                  ) : null}
                </div>
                <time
                  dateTime={attempt.submitted_at}
                  className="font-mono text-xs text-muted-foreground"
                >
                  {formatAttemptTime(attempt.submitted_at)}
                </time>
              </li>
            ))}
        </ol>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
