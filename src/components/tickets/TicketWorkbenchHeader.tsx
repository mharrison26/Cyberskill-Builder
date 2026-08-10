'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CheckCircle2 } from 'lucide-react';

import { startTicket } from '@/components/tickets/actions';
import { SlaCountdown } from '@/components/tickets/SlaCountdown';
import { TicketStatusBadge } from '@/components/tickets/TicketStatusBadge';
import { useTicketWorkbench } from '@/components/tickets/TicketWorkbenchProvider';
import { Button } from '@/components/ui/button';
import { computeSlaDueAt } from '@/lib/tickets/sla';
import { TICKET_STATUS_FLOW } from '@/lib/tickets/status';
import { cn } from '@/lib/utils';

type TicketWorkbenchHeaderProps = {
  slaMinutes: number;
  className?: string;
};

/**
 * Status stepper, SLA, and Open-ticket action — all driven by shared workbench state.
 * Scenario submit lives in the work form and syncs this header via the provider.
 */
export function TicketWorkbenchHeader({
  slaMinutes,
  className,
}: TicketWorkbenchHeaderProps) {
  const workbench = useTicketWorkbench();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    status,
    startedAt,
    resolvedAt,
    slaDueAt,
    slaMet,
    trackSlug,
    ticketId,
    readOnlyPreview,
    setProgress,
    refresh,
  } = workbench;

  function openTicket() {
    setError(null);

    const previous = {
      status,
      startedAt,
      resolvedAt,
      slaDueAt,
      slaMet,
    };
    const now = new Date().toISOString();
    setProgress({
      status: 'in_progress',
      startedAt: now,
      resolvedAt: null,
      slaDueAt: computeSlaDueAt(now, slaMinutes),
      slaMet: null,
    });

    startTransition(async () => {
      const result = await startTicket(trackSlug, ticketId);
      if (result.error) {
        setProgress(previous);
        setError(result.error);
        return;
      }
      if (result.startedAt) {
        setProgress({
          status: 'in_progress',
          startedAt: result.startedAt,
          slaDueAt:
            result.slaDueAt ?? computeSlaDueAt(result.startedAt, slaMinutes),
          resolvedAt: null,
          slaMet: null,
        });
      }
      refresh();
      router.refresh();
    });
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">SLA</span>
          <SlaCountdown
            slaMinutes={slaMinutes}
            startedAt={startedAt}
            resolvedAt={resolvedAt}
            slaDueAt={slaDueAt}
            slaMet={slaMet}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">
            Status
          </span>
          <ol
            className="flex flex-wrap items-center gap-1.5"
            aria-label="Ticket lifecycle"
          >
            {TICKET_STATUS_FLOW.map((step, index) => {
              const reached = TICKET_STATUS_FLOW.indexOf(status) >= index;
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

        {readOnlyPreview ? (
          <p className="text-sm text-muted-foreground">
            Preview — actions disabled
          </p>
        ) : null}

        {!readOnlyPreview && status === 'reviewed' ? (
          <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Assessor reviewed
          </p>
        ) : null}

        {!readOnlyPreview && status === 'resolved' ? (
          <p className="text-sm text-muted-foreground">
            Resolved — use Retry scenario to start another attempt
          </p>
        ) : null}

        {!readOnlyPreview && status === 'in_progress' ? (
          <p className="text-sm text-muted-foreground">
            Complete the scenario below, then submit
          </p>
        ) : null}

        {!readOnlyPreview && status === 'new' ? (
          <Button type="button" onClick={openTicket} disabled={isPending}>
            {isPending ? 'Opening…' : 'Open ticket'}
          </Button>
        ) : null}

        {error ? (
          <p role="alert" className="w-full text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
