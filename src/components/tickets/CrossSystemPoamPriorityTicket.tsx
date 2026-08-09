'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  flattenPoamItems,
  parseCrossSystemPoamSystems,
  type CrossSystemPoamItem,
  type CrossSystemPoamSystem,
  type PoamItemSeverity,
} from '@/lib/scoring/crossSystemPoamPriority';
import {
  FIPS_199_IMPACT_LEVEL_LABELS,
  type Fips199ImpactLevel,
} from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type CrossSystemPoamPriorityTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readString(
  source: Record<string, unknown>,
  keys: string[],
  fallback: string
): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

function impactTone(level: Fips199ImpactLevel): string {
  if (level === 'high') {
    return 'border-destructive/30 bg-destructive/10 text-destructive';
  }
  if (level === 'moderate') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400';
  }
  return 'border-border bg-muted/40 text-muted-foreground';
}

function severityTone(severity: PoamItemSeverity): string {
  if (severity === 'critical') {
    return 'border-destructive/40 bg-destructive/15 text-destructive';
  }
  if (severity === 'high') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400';
  }
  if (severity === 'moderate') {
    return 'border-border bg-muted/50 text-foreground';
  }
  return 'border-border bg-muted/30 text-muted-foreground';
}

export function CrossSystemPoamPriorityTicket({
  ticket,
  readOnly = false,
  className,
}: CrossSystemPoamPriorityTicketProps) {
  const initialState = asRecord(ticket.initial_state);

  const systems = useMemo(
    () => parseCrossSystemPoamSystems(initialState),
    [initialState]
  );

  const allItems = useMemo(() => flattenPoamItems(systems), [systems]);

  const prompt = readString(
    initialState,
    ['prompt'],
    'Review POA&M summaries across systems at different FIPS 199 impact levels. Produce one prioritized cross-system remediation order (highest risk first) using impact × severity.'
  );

  const [orderedIds, setOrderedIds] = useState<string[]>(() =>
    allItems.map((item) => item.id)
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const byId = useMemo(() => {
    const map = new Map<string, CrossSystemPoamItem>();
    for (const item of allItems) {
      map.set(item.id, item);
    }
    return map;
  }, [allItems]);

  const orderedItems = useMemo(
    () =>
      orderedIds
        .map((id) => byId.get(id))
        .filter((item): item is CrossSystemPoamItem => Boolean(item)),
    [orderedIds, byId]
  );

  function clearOutcome() {
    setFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);
  }

  function moveItem(index: number, direction: -1 | 1) {
    if (readOnly) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= orderedIds.length) return;

    clearOutcome();
    setOrderedIds((prev) => {
      const next = [...prev];
      const tmp = next[index]!;
      next[index] = next[nextIndex]!;
      next[nextIndex] = tmp;
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;

    clearOutcome();

    if (orderedIds.length === 0) {
      setSubmitError('No POA&M items are available to prioritize.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cross_system_poam_priority',
          orderedIds,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit remediation order.');
      }

      setScoreStatus(payload.status ?? null);
      setFeedback(payload.feedback ?? 'Submission recorded.');
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Something went wrong while submitting.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="cross-system-poam-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="cross-system-poam-heading" className="text-lg font-semibold">
          Cross-system POA&M prioritization
        </h2>
        <Badge variant="outline">ISSO · impact × severity</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Task</CardTitle>
          <CardDescription>{prompt}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Rank 1 = remediate first. Weight each item as{' '}
            <span className="font-medium text-foreground">
              FIPS 199 system impact × POA&M severity
            </span>{' '}
            (impact: low=1, moderate=2, high=3; severity: low=1, moderate=2,
            high=3, critical=4). Break ties by earlier due date.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">
          System POA&M summaries
        </h3>
        {systems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No systems were seeded for this ticket.
          </p>
        ) : (
          systems.map((system) => (
            <SystemPoamCard key={system.id} system={system} />
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Prioritized remediation order ({orderedItems.length})
            </CardTitle>
            <CardDescription>
              Ordered list across all systems — soonest remediation at the top.
              Use up/down to reorder.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {orderedItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No POA&M items were seeded for this ticket.
              </p>
            ) : (
              <ol className="space-y-3">
                {orderedItems.map((item, index) => (
                  <li
                    key={item.id}
                    className="flex gap-3 rounded-md border border-border bg-background p-3"
                  >
                    <div className="flex w-10 shrink-0 flex-col items-center gap-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        #{index + 1}
                      </span>
                      <div className="flex flex-col gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          disabled={readOnly || isSubmitting || index === 0}
                          aria-label={`Move ${item.id} up`}
                          onClick={() => moveItem(index, -1)}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          disabled={
                            readOnly ||
                            isSubmitting ||
                            index === orderedItems.length - 1
                          }
                          aria-label={`Move ${item.id} down`}
                          onClick={() => moveItem(index, 1)}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">
                          {item.title}
                        </p>
                        <Badge
                          variant="outline"
                          className={cn(severityTone(item.severity))}
                        >
                          {item.severity}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(impactTone(item.impactLevel))}
                        >
                          {FIPS_199_IMPACT_LEVEL_LABELS[item.impactLevel]}{' '}
                          impact
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">
                          System:{' '}
                        </span>
                        {item.systemName}
                        {item.dueDate ? (
                          <>
                            <span className="mx-2 text-border">·</span>
                            Due {item.dueDate}
                          </>
                        ) : null}
                      </p>
                      {item.weakness ? (
                        <p className="text-sm text-muted-foreground">
                          {item.weakness}
                        </p>
                      ) : null}
                      <p className="font-mono text-xs text-muted-foreground">
                        {item.id}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {submitError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {submitError}
          </p>
        ) : null}

        {feedback ? (
          <p
            role="status"
            className={cn(
              'rounded-md border px-4 py-3 text-sm',
              scoreStatus === 'resolved'
                ? 'border-status-satisfied-foreground/20 bg-status-satisfied text-status-satisfied-foreground'
                : 'border-border bg-muted/40 text-foreground'
            )}
          >
            {scoreStatus ? (
              <span className="mb-1 block font-medium capitalize">
                {scoreStatus.replace(/_/g, ' ')}
              </span>
            ) : null}
            {feedback}
          </p>
        ) : null}

        <Button type="submit" disabled={readOnly || isSubmitting}>
          {isSubmitting ? 'Submitting…' : 'Submit remediation order'}
        </Button>
      </form>
    </section>
  );
}

function SystemPoamCard({ system }: { system: CrossSystemPoamSystem }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{system.name}</CardTitle>
          <Badge
            variant="outline"
            className={cn(impactTone(system.impactLevel))}
          >
            FIPS 199 {FIPS_199_IMPACT_LEVEL_LABELS[system.impactLevel]}
          </Badge>
          <Badge variant="outline" className="font-mono text-xs">
            {system.id}
          </Badge>
        </div>
        {system.description ? (
          <CardDescription>{system.description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        {system.poamItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open POA&M items.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">ID</th>
                  <th className="py-2 pr-3 font-medium">Title</th>
                  <th className="py-2 pr-3 font-medium">Severity</th>
                  <th className="py-2 font-medium">Due</th>
                </tr>
              </thead>
              <tbody>
                {system.poamItems.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">
                      {item.id}
                    </td>
                    <td className="py-2 pr-3">
                      <p className="font-medium text-foreground">
                        {item.title}
                      </p>
                      {item.weakness ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.weakness}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge
                        variant="outline"
                        className={cn(severityTone(item.severity))}
                      >
                        {item.severity}
                      </Badge>
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {item.dueDate ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
