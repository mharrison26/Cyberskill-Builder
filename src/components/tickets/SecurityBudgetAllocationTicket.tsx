'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
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
import { Textarea } from '@/components/ui/textarea';
import {
  parseBudgetRequests,
  type SecurityBudgetRequest,
} from '@/lib/scoring/securityBudgetAllocationShared';
import {
  SECURITY_BUDGET_ALLOCATION_DEFAULT_BUDGET,
  SECURITY_BUDGET_ALLOCATION_MIN_JUSTIFICATION_LENGTH,
} from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type SecurityBudgetAllocationTicketProps = {
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

function resolvePositiveNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  return fallback;
}

function resolvePositiveInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}

function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function categoryTone(category: string): string {
  const c = category.toLowerCase();
  if (c === 'staffing') {
    return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400';
  }
  if (c === 'training') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
  }
  return 'border-border bg-muted/50 text-foreground';
}

function formatOrg(initialState: Record<string, unknown>): {
  name: string;
  mission: string | null;
} {
  const org = initialState.organization ?? initialState.orgProfile;
  if (typeof org === 'string' && org.trim()) {
    return { name: org.trim(), mission: null };
  }
  const record = asRecord(org);
  return {
    name:
      (typeof record.name === 'string' && record.name.trim()) || 'Organization',
    mission:
      (typeof record.mission === 'string' && record.mission.trim()) ||
      (typeof record.description === 'string' && record.description.trim()) ||
      null,
  };
}

function parseAllocationInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/[$,]/g, '');
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

export function SecurityBudgetAllocationTicket({
  ticket,
  readOnly = false,
  className,
}: SecurityBudgetAllocationTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);

  const requests = useMemo(
    () => parseBudgetRequests(initialState),
    [initialState]
  );

  const totalBudget = resolvePositiveNumber(
    expectedState.totalBudget ??
      initialState.totalBudget ??
      initialState.total_budget ??
      initialState.budget,
    SECURITY_BUDGET_ALLOCATION_DEFAULT_BUDGET
  );

  const minJustificationLength = resolvePositiveInt(
    expectedState.minJustificationLength ?? initialState.minJustificationLength,
    SECURITY_BUDGET_ALLOCATION_MIN_JUSTIFICATION_LENGTH
  );

  const fiscalYear = readString(
    initialState,
    ['fiscalYear', 'fiscal_year'],
    'FY'
  );
  const prompt = readString(
    initialState,
    ['prompt'],
    'Allocate the FY security budget across competing requests. Total allocated must not exceed the budget. Justify the allocation based on risk reduction.'
  );
  const org = useMemo(() => formatOrg(initialState), [initialState]);

  const [allocations, setAllocations] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const req of requests) {
      initial[req.id] = '0';
    }
    return initial;
  });
  const [justification, setJustification] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parsedAllocations = useMemo(() => {
    const out: Record<string, number> = {};
    let invalid = false;
    for (const req of requests) {
      const n = parseAllocationInput(allocations[req.id] ?? '0');
      if (n === null) {
        invalid = true;
        out[req.id] = 0;
      } else {
        out[req.id] = n;
      }
    }
    return { values: out, invalid };
  }, [allocations, requests]);

  const budgetUsed = useMemo(
    () =>
      Object.values(parsedAllocations.values).reduce((sum, n) => sum + n, 0),
    [parsedAllocations.values]
  );
  const remaining = totalBudget - budgetUsed;
  const overBudget = budgetUsed > totalBudget;

  function clearOutcome() {
    setFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);
    setFormError(null);
  }

  function updateAllocation(id: string, value: string) {
    if (readOnly) return;
    clearOutcome();
    setAllocations((prev) => ({ ...prev, [id]: value }));
  }

  function setFull(req: SecurityBudgetRequest) {
    updateAllocation(req.id, String(req.amountRequested));
  }

  function setZero(req: SecurityBudgetRequest) {
    updateAllocation(req.id, '0');
  }

  function validate(): boolean {
    if (requests.length === 0) {
      setFormError('No budget requests are seeded for this ticket.');
      return false;
    }
    if (parsedAllocations.invalid) {
      setFormError('Each allocation must be a whole number ≥ 0.');
      return false;
    }
    for (const req of requests) {
      const allocated = parsedAllocations.values[req.id] ?? 0;
      if (allocated > req.amountRequested) {
        setFormError(
          `${req.title}: allocation cannot exceed ${formatUsd(req.amountRequested)}.`
        );
        return false;
      }
    }
    if (overBudget) {
      setFormError(
        `Total allocated (${formatUsd(budgetUsed)}) exceeds the ${fiscalYear} budget (${formatUsd(totalBudget)}).`
      );
      return false;
    }
    if (budgetUsed <= 0) {
      setFormError('Allocate a positive total across one or more requests.');
      return false;
    }
    if (justification.trim().length < minJustificationLength) {
      setFormError(
        `Justification must be at least ${minJustificationLength} characters and tie choices to risk reduction.`
      );
      return false;
    }
    return true;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;

    clearOutcome();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'security_budget_allocation',
          allocations: parsedAllocations.values,
          justification: justification.trim(),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit budget allocation.');
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
      aria-labelledby="security-budget-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="security-budget-heading" className="text-lg font-semibold">
          Security budget allocation
        </h2>
        <Badge variant="outline">{fiscalYear}</Badge>
        <Badge variant="secondary">{formatUsd(totalBudget)} ceiling</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{org.name}</CardTitle>
          <CardDescription>{prompt}</CardDescription>
        </CardHeader>
        {org.mission ? (
          <CardContent className="text-sm text-muted-foreground">
            <p>{org.mission}</p>
          </CardContent>
        ) : null}
      </Card>

      <div
        className={cn(
          'sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm backdrop-blur',
          overBudget
            ? 'border-destructive/40 bg-destructive/10'
            : 'border-border bg-background/90'
        )}
        role="status"
        aria-live="polite"
      >
        <div className="space-y-0.5">
          <p className="font-medium text-foreground">
            Allocated {formatUsd(budgetUsed)} of {formatUsd(totalBudget)}
          </p>
          <p
            className={cn(
              'text-muted-foreground',
              overBudget && 'text-destructive'
            )}
          >
            {overBudget
              ? `Over budget by ${formatUsd(budgetUsed - totalBudget)}`
              : `Remaining ${formatUsd(remaining)}`}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Partial funding allowed · 0 … amount requested per line
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            Competing requests ({requests.length})
          </h3>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No budget requests were seeded for this ticket.
            </p>
          ) : (
            requests.map((req) => {
              const allocated = parsedAllocations.values[req.id] ?? 0;
              const overLine = allocated > req.amountRequested;
              return (
                <Card key={req.id}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <CardTitle className="text-base">{req.title}</CardTitle>
                        <div className="flex flex-wrap gap-2">
                          <Badge
                            variant="outline"
                            className={categoryTone(req.category)}
                          >
                            {req.category}
                          </Badge>
                          <Badge variant="secondary">
                            Requested {formatUsd(req.amountRequested)}
                          </Badge>
                        </div>
                      </div>
                      {!readOnly ? (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setFull(req)}
                          >
                            Fund full
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setZero(req)}
                          >
                            Zero
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    <CardDescription className="pt-1">
                      {req.riskContext || 'No risk context provided.'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex max-w-xs flex-col gap-1.5">
                      <Label htmlFor={`alloc-${req.id}`}>Allocate (USD)</Label>
                      <Input
                        id={`alloc-${req.id}`}
                        inputMode="numeric"
                        type="text"
                        value={allocations[req.id] ?? '0'}
                        onChange={(event) =>
                          updateAllocation(req.id, event.target.value)
                        }
                        disabled={readOnly}
                        aria-invalid={overLine || undefined}
                        className={cn(overLine && 'border-destructive')}
                      />
                      {overLine ? (
                        <p className="text-xs text-destructive">
                          Cannot exceed {formatUsd(req.amountRequested)}.
                        </p>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="budget-justification">
            Risk-based justification (min {minJustificationLength} chars)
          </Label>
          <p className="text-xs text-muted-foreground">
            Tie each material funding choice (and cuts/zeros) to residual-risk
            reduction. Do not only list dollar amounts.
          </p>
          <Textarea
            id="budget-justification"
            value={justification}
            onChange={(event) => {
              clearOutcome();
              setJustification(event.target.value);
            }}
            disabled={readOnly}
            rows={8}
            placeholder="Example: Full EDR closes unmanaged endpoint detection gaps driving ransomware dwell time; zero vanity dashboard because it is cosmetic relative to ConMon backlog…"
          />
          <p className="text-xs text-muted-foreground">
            {justification.trim().length} / {minJustificationLength}
          </p>
        </div>

        {formError ? (
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        ) : null}
        {submitError ? (
          <p className="text-sm text-destructive" role="alert">
            {submitError}
          </p>
        ) : null}
        {feedback ? (
          <div
            className={cn(
              'rounded-md border px-3 py-2 text-sm',
              scoreStatus === 'resolved'
                ? 'border-emerald-500/30 bg-emerald-500/10'
                : 'border-border bg-muted/40'
            )}
            role="status"
          >
            {scoreStatus ? (
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {scoreStatus}
              </p>
            ) : null}
            <p>{feedback}</p>
          </div>
        ) : null}

        {!readOnly ? (
          <Button type="submit" disabled={isSubmitting || overBudget}>
            {isSubmitting ? 'Submitting…' : 'Submit allocation'}
          </Button>
        ) : null}
      </form>
    </section>
  );
}
