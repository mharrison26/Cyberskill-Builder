'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  asSubmissionRecord,
  restoredStringSet,
  useTicketWorkbenchForm,
} from '@/hooks/useTicketWorkbenchForm';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  parseSoc2ChangeTickets,
  parseSoc2Criterion,
  parseSoc2ExceptionDefinition,
  parseSoc2TestProcedure,
  type Soc2ChangeTicket,
} from '@/lib/scoring/soc2ChangeManagementTest';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type Soc2ChangeManagementTestTicketProps = {
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
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

function boolLabel(value: boolean): string {
  return value ? 'Yes' : 'No';
}

function changeTypeLabel(changeType: Soc2ChangeTicket['changeType']): string {
  if (changeType === 'emergency') return 'Emergency';
  if (changeType === 'normal') return 'Normal';
  return 'Standard';
}

export function Soc2ChangeManagementTestTicket({
  ticket,
  readOnly = false,
  className,
}: Soc2ChangeManagementTestTicketProps) {
  const {
    submission,
    formReadOnly,
    hideSubmit,
    lastFeedback,
    lastScoreStatus,
  } = useTicketWorkbenchForm(readOnly);
  const restored = asSubmissionRecord(submission);
  const initialState = asRecord(ticket.initial_state);

  const criterion = useMemo(
    () => parseSoc2Criterion(initialState),
    [initialState]
  );
  const procedureSteps = useMemo(
    () => parseSoc2TestProcedure(initialState),
    [initialState]
  );
  const exceptionDefinition = useMemo(
    () => parseSoc2ExceptionDefinition(initialState),
    [initialState]
  );
  const changeTickets = useMemo(
    () => parseSoc2ChangeTickets(initialState),
    [initialState]
  );

  const prompt = readString(
    initialState,
    ['prompt'],
    'Apply the written test procedure to each change ticket. Flag exceptions, then report the exception count and rate for the population.'
  );

  const populationSize = changeTickets.length;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    restoredStringSet(submission, 'exceptionIds')
  );
  const [exceptionCount, setExceptionCount] = useState(() => {
    const value = restored.exceptionCount;
    return typeof value === 'number' || typeof value === 'string'
      ? String(value)
      : '';
  });
  const [exceptionRate, setExceptionRate] = useState(() => {
    const value = restored.exceptionRate;
    return typeof value === 'number' || typeof value === 'string'
      ? String(value)
      : '';
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(() => lastFeedback);
  const [scoreStatus, setScoreStatus] = useState<string | null>(
    () => lastScoreStatus
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  function clearOutcome() {
    setFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);
    setFormError(null);
  }

  function toggleException(id: string) {
    if (formReadOnly || hideSubmit) return;
    clearOutcome();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function syncCountFromSelection() {
    if (formReadOnly || hideSubmit) return;
    clearOutcome();
    const count = selectedIds.size;
    setExceptionCount(String(count));
    if (populationSize > 0) {
      const rate = Math.round((count / populationSize) * 10000) / 100;
      setExceptionRate(String(rate));
    }
  }

  function validate(): boolean {
    const count = Number(exceptionCount);
    const rate = Number(String(exceptionRate).replace(/%$/, ''));
    if (!Number.isInteger(count) || count < 0) {
      setFormError('Enter a non-negative integer exception count.');
      return false;
    }
    if (!Number.isFinite(rate) || rate < 0) {
      setFormError('Enter a non-negative exception rate (percent).');
      return false;
    }
    if (selectedIds.size === 0) {
      setFormError(
        'Mark at least the change tickets you believe are exceptions (exact set is required for full credit).'
      );
      return false;
    }
    setFormError(null);
    return true;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (formReadOnly || hideSubmit) return;

    clearOutcome();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'soc2_change_management_test',
          exceptionCount: Number(exceptionCount),
          exceptionRate: Number(String(exceptionRate).replace(/%$/, '')),
          exceptionIds: Array.from(selectedIds).sort(),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? 'Failed to submit SOC 2 exception test results.'
        );
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
      aria-labelledby="soc2-cm-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="soc2-cm-heading" className="text-lg font-semibold">
          SOC 2 change-management test
        </h2>
        <Badge variant="outline">TSC · Exception testing</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {criterion
              ? `${criterion.id} — ${criterion.title}`
              : 'Trust services criterion'}
          </CardTitle>
          <CardDescription>{prompt}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          {criterion?.description ? (
            <p className="whitespace-pre-wrap">{criterion.description}</p>
          ) : null}
          {exceptionDefinition ? (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
              <p className="font-medium text-foreground">
                Exception definition
              </p>
              <p className="mt-1 whitespace-pre-wrap">{exceptionDefinition}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {procedureSteps.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Test procedure</CardTitle>
            <CardDescription>
              Apply these steps to every item in the evidence population.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              {procedureSteps.map((step) => (
                <li key={step} className="whitespace-pre-wrap">
                  {step}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Change tickets ({populationSize})
          </CardTitle>
          <CardDescription>
            Review each ticket against the procedure. Check the box for items
            you classify as exceptions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {changeTickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No change tickets were seeded for this ticket.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Exception</th>
                    <th className="px-2 py-2 font-medium">ID</th>
                    <th className="px-2 py-2 font-medium">Title</th>
                    <th className="px-2 py-2 font-medium">Type</th>
                    <th className="px-2 py-2 font-medium">Approved</th>
                    <th className="px-2 py-2 font-medium">Approver</th>
                    <th className="px-2 py-2 font-medium">Test evidence</th>
                    <th className="px-2 py-2 font-medium">Requires CAB</th>
                    <th className="px-2 py-2 font-medium">CAB approved</th>
                    <th className="px-2 py-2 font-medium">Retro-approval</th>
                  </tr>
                </thead>
                <tbody>
                  {changeTickets.map((change) => {
                    const checked = selectedIds.has(change.id);
                    return (
                      <tr
                        key={change.id}
                        className={cn(
                          'border-b border-border/70 align-top',
                          checked && 'bg-muted/40'
                        )}
                      >
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-foreground"
                            checked={checked}
                            disabled={formReadOnly || isSubmitting}
                            aria-label={`Mark ${change.id} as exception`}
                            onChange={() => toggleException(change.id)}
                          />
                        </td>
                        <td className="px-2 py-2 font-medium text-foreground">
                          {change.id}
                        </td>
                        <td className="px-2 py-2 text-foreground">
                          {change.title}
                        </td>
                        <td className="px-2 py-2">
                          {changeTypeLabel(change.changeType)}
                        </td>
                        <td className="px-2 py-2">
                          {boolLabel(change.approved)}
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">
                          {change.approver ?? '—'}
                        </td>
                        <td className="max-w-[14rem] px-2 py-2 text-muted-foreground">
                          {change.testEvidence ?? '—'}
                        </td>
                        <td className="px-2 py-2">
                          {boolLabel(change.requiresCab)}
                        </td>
                        <td className="px-2 py-2">
                          {boolLabel(change.cabApproved)}
                        </td>
                        <td className="px-2 py-2">
                          {change.changeType === 'emergency'
                            ? change.retroApproval === null
                              ? '—'
                              : boolLabel(change.retroApproval)
                            : 'n/a'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Exception results</CardTitle>
            <CardDescription>
              Report count and rate for the full population
              {populationSize > 0 ? ` (n=${populationSize})` : ''}. You can sync
              count/rate from your selected exceptions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={
                  formReadOnly || isSubmitting || selectedIds.size === 0
                }
                onClick={syncCountFromSelection}
              >
                Fill count &amp; rate from selection ({selectedIds.size})
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="soc2-exception-count">Exception count</Label>
                <Input
                  id="soc2-exception-count"
                  inputMode="numeric"
                  value={exceptionCount}
                  disabled={formReadOnly || isSubmitting}
                  onChange={(event) => {
                    clearOutcome();
                    setExceptionCount(event.target.value);
                  }}
                  placeholder="e.g. 4"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="soc2-exception-rate">Exception rate (%)</Label>
                <Input
                  id="soc2-exception-rate"
                  inputMode="decimal"
                  value={exceptionRate}
                  disabled={formReadOnly || isSubmitting}
                  onChange={(event) => {
                    clearOutcome();
                    setExceptionRate(event.target.value);
                  }}
                  placeholder="e.g. 40"
                />
              </div>
            </div>

            {formError ? (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={formReadOnly || isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Submit test results'}
          </Button>
          {scoreStatus ? (
            <Badge variant={scoreStatus === 'resolved' ? 'default' : 'outline'}>
              {scoreStatus.replace(/_/g, ' ')}
            </Badge>
          ) : null}
        </div>

        {submitError ? (
          <p className="text-sm text-destructive" role="alert">
            {submitError}
          </p>
        ) : null}
        {feedback ? (
          <p
            className={cn(
              'rounded-md border px-3 py-2 text-sm',
              scoreStatus === 'resolved'
                ? 'border-status-satisfied-foreground/20 bg-status-satisfied text-status-satisfied-foreground'
                : 'border-border bg-muted/40 text-muted-foreground'
            )}
            role="status"
          >
            {feedback}
          </p>
        ) : null}
      </form>
    </section>
  );
}
