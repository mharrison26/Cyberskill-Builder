'use client';

import { useEffect, useMemo, useState } from 'react';

import { PriorityBadge } from '@/components/tickets/PriorityBadge';
import { SlaCountdown } from '@/components/tickets/SlaCountdown';
import { TicketStatusBadge } from '@/components/tickets/TicketStatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  parseSlaQueueSimItems,
  type SlaQueueSimItem,
} from '@/lib/scoring/slaQueueSim';
import {
  TRIAGE_CATEGORIES,
  TRIAGE_CATEGORY_LABELS,
  TRIAGE_PRIORITIES,
  TRIAGE_PRIORITY_LABELS,
  type TriageCategory,
  type TriagePriority,
} from '@/lib/scoring/ticketUi';
import { getSlaState } from '@/lib/tickets/sla';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type SlaQueueSimTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type ItemWork = {
  priority: TriagePriority | '';
  category: string;
  resolution: string;
  resolvedAt: string | null;
};

type FormErrors = Partial<
  Record<'priority' | 'category' | 'resolution', string>
>;

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function categoryLabel(category: string): string {
  if (category in TRIAGE_CATEGORY_LABELS) {
    return TRIAGE_CATEGORY_LABELS[category as TriageCategory];
  }
  return category.replace(/_/g, ' ');
}

function emptyWork(): ItemWork {
  return { priority: '', category: '', resolution: '', resolvedAt: null };
}

function buildInitialWork(items: SlaQueueSimItem[]): Record<string, ItemWork> {
  const map: Record<string, ItemWork> = {};
  for (const item of items) {
    map[item.id] = emptyWork();
  }
  return map;
}

function itemStatus(
  work: ItemWork | undefined,
  slaMinutes: number,
  startedAt: string | null,
  nowMs: number
): 'new' | 'in_progress' | 'resolved' {
  if (work?.resolvedAt) return 'resolved';
  if (!startedAt) return 'new';
  const sla = getSlaState(slaMinutes, startedAt, nowMs);
  if (sla.isOverdue) return 'in_progress';
  return 'in_progress';
}

export function SlaQueueSimTicket({
  ticket,
  readOnly = false,
  className,
}: SlaQueueSimTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const items = useMemo(
    () => parseSlaQueueSimItems(asRecord(ticket.initial_state)),
    [ticket.initial_state]
  );

  const prompt =
    typeof initialState.prompt === 'string' && initialState.prompt.trim()
      ? initialState.prompt.trim()
      : 'Several tickets just opened at once. Start the simulation, work the queue by priority and SLA, then submit the batch.';

  const [simulationStartedAt, setSimulationStartedAt] = useState<string | null>(
    null
  );
  const [workById, setWorkById] = useState<Record<string, ItemWork>>(() =>
    buildInitialWork(items)
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    items[0]?.id ?? null
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setWorkById(buildInitialWork(items));
    setSelectedId(items[0]?.id ?? null);
  }, [items]);

  useEffect(() => {
    if (!simulationStartedAt) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [simulationStartedAt]);

  const selected = items.find((item) => item.id === selectedId) ?? null;
  const selectedWork = selected ? workById[selected.id] : undefined;

  const resolvedCount = items.filter(
    (item) => workById[item.id]?.resolvedAt
  ).length;

  const categoryOptions = selected
    ? selected.categoryOptions && selected.categoryOptions.length > 0
      ? selected.categoryOptions
      : [...TRIAGE_CATEGORIES]
    : [];

  function clearOutcome() {
    setFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);
  }

  function startSimulation() {
    if (readOnly || simulationStartedAt) return;
    clearOutcome();
    setSimulationStartedAt(new Date().toISOString());
    setNowMs(Date.now());
  }

  function updateSelected(patch: Partial<ItemWork>) {
    if (!selected || selectedWork?.resolvedAt) return;
    clearOutcome();
    setWorkById((prev) => ({
      ...prev,
      [selected.id]: { ...prev[selected.id], ...patch },
    }));
  }

  function validateSelected(): boolean {
    if (!selected || !selectedWork) return false;
    const next: FormErrors = {};
    if (!selectedWork.priority) next.priority = 'Assign a priority (P1–P4).';
    if (!selectedWork.category) next.category = 'Select a category.';
    if (!selectedWork.resolution) next.resolution = 'Choose a resolution.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function resolveSelected() {
    if (readOnly || !selected || !simulationStartedAt) return;
    if (!validateSelected()) return;
    const resolvedAt = new Date().toISOString();
    setWorkById((prev) => ({
      ...prev,
      [selected.id]: { ...prev[selected.id], resolvedAt },
    }));
    setErrors({});
    const nextOpen = items.find(
      (item) => item.id !== selected.id && !workById[item.id]?.resolvedAt
    );
    if (nextOpen) setSelectedId(nextOpen.id);
  }

  async function handleSubmit() {
    if (readOnly) return;
    clearOutcome();

    if (!simulationStartedAt) {
      setSubmitError('Start the simulation before submitting.');
      return;
    }

    const incomplete = items.filter((item) => {
      const work = workById[item.id];
      return (
        !work?.resolvedAt ||
        !work.priority ||
        !work.category ||
        !work.resolution
      );
    });
    if (incomplete.length > 0) {
      setSubmitError(
        `Resolve every queue item before submitting (${items.length - incomplete.length}/${items.length} done).`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'sla_queue_sim',
          simulationStartedAt,
          items: items.map((item) => {
            const work = workById[item.id];
            return {
              id: item.id,
              priority: work.priority,
              category: work.category,
              resolution: work.resolution,
              resolvedAt: work.resolvedAt,
            };
          }),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit queue simulation.');
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

  if (items.length === 0) {
    return (
      <section
        className={cn(
          'rounded-lg border border-dashed border-border bg-muted/30 px-5 py-8',
          className
        )}
        data-ticket-type={ticket.ticket_type}
        data-ticket-id={ticket.id}
      >
        <h2 className="text-base font-semibold">Queue simulation</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This ticket is missing <code>initial_state.items</code>. Ask an admin
          to seed the queue batch.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="sla-queue-sim-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="sla-queue-sim-heading" className="text-lg font-semibold">
              Timed queue simulation
            </h2>
            <Badge variant="outline">PI-09 · Batch SLA</Badge>
          </div>
          <p className="max-w-prose text-sm text-muted-foreground">{prompt}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {resolvedCount}/{items.length} resolved
          </span>
          {!simulationStartedAt ? (
            <Button type="button" onClick={startSimulation} disabled={readOnly}>
              Start simulation
            </Button>
          ) : (
            <Badge variant="secondary">Timers running</Badge>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Priority hint</TableHead>
              <TableHead scope="col">Ticket</TableHead>
              <TableHead scope="col">SLA</TableHead>
              <TableHead scope="col">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const work = workById[item.id];
              const sla = getSlaState(
                item.slaMinutes,
                simulationStartedAt,
                nowMs
              );
              const status = itemStatus(
                work,
                item.slaMinutes,
                simulationStartedAt,
                nowMs
              );
              const isSelected = item.id === selectedId;
              return (
                <TableRow
                  key={item.id}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isSelected}
                  aria-label={`Select queue item: ${item.subject}${
                    sla.isOverdue ? ' (overdue)' : ''
                  }`}
                  className={cn(
                    'cursor-pointer',
                    isSelected && 'bg-muted/60',
                    sla.isOverdue &&
                      !work?.resolvedAt &&
                      'bg-status-blocked/40 hover:bg-status-blocked/60'
                  )}
                  onClick={() => setSelectedId(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedId(item.id);
                    }
                  }}
                >
                  <TableCell>
                    {work?.priority ? (
                      <PriorityBadge difficulty={work.priority} />
                    ) : item.difficulty ? (
                      <PriorityBadge difficulty={item.difficulty} />
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal font-medium">
                    <span className="line-clamp-2">{item.subject}</span>
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      {item.id}
                    </span>
                  </TableCell>
                  <TableCell>
                    <SlaCountdown
                      slaMinutes={item.slaMinutes}
                      startedAt={simulationStartedAt}
                      nowMs={nowMs}
                    />
                  </TableCell>
                  <TableCell>
                    <TicketStatusBadge status={status} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {selected && selectedWork ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{selected.subject}</CardTitle>
            <CardDescription>
              {selected.requester ? `From ${selected.requester} · ` : null}
              Assign priority and category, choose a resolution, then mark
              resolved before the SLA expires.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
              <p className="whitespace-pre-wrap text-muted-foreground">
                {selected.body || 'See scenario brief.'}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="queue-sim-priority">Priority</Label>
                <select
                  id="queue-sim-priority"
                  value={selectedWork.priority}
                  disabled={
                    readOnly ||
                    !simulationStartedAt ||
                    Boolean(selectedWork.resolvedAt) ||
                    isSubmitting
                  }
                  aria-invalid={errors.priority ? true : undefined}
                  className={cn(
                    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                    errors.priority && 'border-destructive'
                  )}
                  onChange={(event) => {
                    updateSelected({
                      priority: event.target.value as TriagePriority | '',
                    });
                    if (errors.priority) {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.priority;
                        return next;
                      });
                    }
                  }}
                >
                  <option value="">Select…</option>
                  {TRIAGE_PRIORITIES.map((value) => (
                    <option key={value} value={value}>
                      {TRIAGE_PRIORITY_LABELS[value]}
                    </option>
                  ))}
                </select>
                {errors.priority ? (
                  <p role="alert" className="text-sm text-destructive">
                    {errors.priority}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="queue-sim-category">Category</Label>
                <select
                  id="queue-sim-category"
                  value={selectedWork.category}
                  disabled={
                    readOnly ||
                    !simulationStartedAt ||
                    Boolean(selectedWork.resolvedAt) ||
                    isSubmitting
                  }
                  aria-invalid={errors.category ? true : undefined}
                  className={cn(
                    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                    errors.category && 'border-destructive'
                  )}
                  onChange={(event) => {
                    updateSelected({ category: event.target.value });
                    if (errors.category) {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.category;
                        return next;
                      });
                    }
                  }}
                >
                  <option value="">Select…</option>
                  {categoryOptions.map((value) => (
                    <option key={value} value={value}>
                      {categoryLabel(value)}
                    </option>
                  ))}
                </select>
                {errors.category ? (
                  <p role="alert" className="text-sm text-destructive">
                    {errors.category}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="queue-sim-resolution">Resolution</Label>
                <select
                  id="queue-sim-resolution"
                  value={selectedWork.resolution}
                  disabled={
                    readOnly ||
                    !simulationStartedAt ||
                    Boolean(selectedWork.resolvedAt) ||
                    isSubmitting
                  }
                  aria-invalid={errors.resolution ? true : undefined}
                  className={cn(
                    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                    errors.resolution && 'border-destructive'
                  )}
                  onChange={(event) => {
                    updateSelected({ resolution: event.target.value });
                    if (errors.resolution) {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.resolution;
                        return next;
                      });
                    }
                  }}
                >
                  <option value="">Select…</option>
                  {selected.resolutionOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {errors.resolution ? (
                  <p role="alert" className="text-sm text-destructive">
                    {errors.resolution}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={resolveSelected}
                disabled={
                  readOnly ||
                  !simulationStartedAt ||
                  Boolean(selectedWork.resolvedAt) ||
                  isSubmitting
                }
              >
                {selectedWork.resolvedAt ? 'Resolved' : 'Mark resolved'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

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

      <Button
        type="button"
        onClick={handleSubmit}
        disabled={readOnly || isSubmitting || !simulationStartedAt}
      >
        {isSubmitting ? 'Submitting…' : 'Submit queue batch'}
      </Button>
    </section>
  );
}
