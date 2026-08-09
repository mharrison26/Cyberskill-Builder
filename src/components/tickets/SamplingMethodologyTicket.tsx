'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_SAMPLING_POPULATION_SEED,
  DEFAULT_SAMPLING_POPULATION_SIZE,
  SAMPLING_RISK_CRITERION_LABELS,
  buildMockTransactionPopulation,
  clampPopulationSize,
  isSamplingRiskCriterion,
  type MockTransaction,
  type SamplingRiskCriterion,
} from '@/lib/sampling/mockTransactions';
import { SAMPLING_METHODOLOGY_MIN_FIELD_LENGTH } from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type SamplingMethodologyTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type FormErrors = {
  sampleSelection?: string;
  riskBasedAdditions?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseTransactions(value: unknown): MockTransaction[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const parsed: MockTransaction[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || typeof row.amount !== 'number') continue;
    const riskFlags = Array.isArray(row.riskFlags)
      ? row.riskFlags.filter(
          (flag): flag is SamplingRiskCriterion =>
            typeof flag === 'string' && isSamplingRiskCriterion(flag)
        )
      : [];
    parsed.push({
      id: row.id,
      timestamp: typeof row.timestamp === 'string' ? row.timestamp : '',
      user: typeof row.user === 'string' ? row.user : '',
      department: typeof row.department === 'string' ? row.department : '',
      vendor: typeof row.vendor === 'string' ? row.vendor : '',
      amount: row.amount,
      currency: 'USD',
      description: typeof row.description === 'string' ? row.description : '',
      riskFlags,
    });
  }
  return parsed.length > 0 ? parsed : null;
}

function resolveRiskCriteria(
  initialState: Record<string, unknown>,
  expectedState: Record<string, unknown>
): SamplingRiskCriterion[] {
  for (const source of [expectedState, initialState]) {
    const raw = source.requiredRiskCriteria ?? source.riskCriteria;
    if (!Array.isArray(raw)) continue;
    const criteria = raw.filter(
      (item): item is SamplingRiskCriterion =>
        typeof item === 'string' && isSamplingRiskCriterion(item)
    );
    if (criteria.length > 0) return criteria;
  }
  return ['high_value', 'privileged_account', 'after_hours', 'foreign_vendor'];
}

function resolveSampleSize(
  initialState: Record<string, unknown>,
  expectedState: Record<string, unknown>
): number {
  const methodology = asRecord(initialState.methodology);
  const fromExpected =
    expectedState.requiredSampleSize ?? expectedState.sampleSize;
  const fromMethodology = methodology.sampleSize;
  for (const value of [fromExpected, fromMethodology]) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
  }
  return 25;
}

function resolveMinLengths(expectedState: Record<string, unknown>): {
  minMethodologyLength: number;
  minRiskAdditionsLength: number;
} {
  const methodology =
    typeof expectedState.minMethodologyLength === 'number' &&
    expectedState.minMethodologyLength > 0
      ? Math.floor(expectedState.minMethodologyLength)
      : typeof expectedState.minFieldLength === 'number' &&
          expectedState.minFieldLength > 0
        ? Math.floor(expectedState.minFieldLength)
        : SAMPLING_METHODOLOGY_MIN_FIELD_LENGTH;

  const risk =
    typeof expectedState.minRiskAdditionsLength === 'number' &&
    expectedState.minRiskAdditionsLength > 0
      ? Math.floor(expectedState.minRiskAdditionsLength)
      : methodology;

  return {
    minMethodologyLength: methodology,
    minRiskAdditionsLength: risk,
  };
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function SamplingMethodologyTicket({
  ticket,
  readOnly = false,
  className,
}: SamplingMethodologyTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);
  const sampleSize = resolveSampleSize(initialState, expectedState);
  const riskCriteria = resolveRiskCriteria(initialState, expectedState);
  const { minMethodologyLength, minRiskAdditionsLength } =
    resolveMinLengths(expectedState);

  const methodologyRecord = asRecord(initialState.methodology);
  const methodologyLabel =
    typeof methodologyRecord.description === 'string' &&
    methodologyRecord.description.trim()
      ? methodologyRecord.description.trim()
      : `Statistical random sampling of size ${sampleSize}, plus risk-based additions for high-risk attributes.`;

  const prompt =
    typeof initialState.prompt === 'string' && initialState.prompt.trim()
      ? initialState.prompt.trim()
      : `Review the transaction population and the stated sampling methodology. Describe how you would select the sample of ${sampleSize}, then identify risk-based additions.`;

  const transactions = useMemo(() => {
    const state = asRecord(ticket.initial_state);
    const fromState = parseTransactions(state.transactions);
    if (fromState) return fromState;

    const size =
      typeof state.populationSize === 'number'
        ? clampPopulationSize(state.populationSize)
        : DEFAULT_SAMPLING_POPULATION_SIZE;
    const seed =
      typeof state.populationSeed === 'number'
        ? Math.floor(state.populationSeed)
        : DEFAULT_SAMPLING_POPULATION_SEED;
    return buildMockTransactionPopulation(size, seed);
  }, [ticket.initial_state]);

  const riskFlagCounts = useMemo(() => {
    const counts: Partial<Record<SamplingRiskCriterion, number>> = {};
    for (const txn of transactions) {
      for (const flag of txn.riskFlags) {
        counts[flag] = (counts[flag] ?? 0) + 1;
      }
    }
    return counts;
  }, [transactions]);

  const [sampleSelection, setSampleSelection] = useState('');
  const [riskBasedAdditions, setRiskBasedAdditions] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    if (!sampleSelection.trim()) {
      nextErrors.sampleSelection = 'Describe how you would select the sample.';
    } else if (sampleSelection.trim().length < minMethodologyLength) {
      nextErrors.sampleSelection = `Sample selection must be at least ${minMethodologyLength} characters.`;
    }

    if (!riskBasedAdditions.trim()) {
      nextErrors.riskBasedAdditions =
        'Identify risk-based additions to the sample.';
    } else if (riskBasedAdditions.trim().length < minRiskAdditionsLength) {
      nextErrors.riskBasedAdditions = `Risk-based additions must be at least ${minRiskAdditionsLength} characters.`;
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;

    setSubmitError(null);
    setFeedback(null);
    setScoreStatus(null);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'sampling_methodology',
          sampleSelection: sampleSelection.trim(),
          riskBasedAdditions: riskBasedAdditions.trim(),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? 'Failed to submit sampling methodology.'
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
      aria-labelledby="sampling-methodology-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="sampling-methodology-heading" className="text-lg font-semibold">
          Sampling methodology
        </h2>
        <Badge variant="outline">n = {sampleSize}</Badge>
        <Badge variant="secondary">Population {transactions.length}</Badge>
      </div>

      <p className="max-w-prose text-sm text-muted-foreground">{prompt}</p>

      <div className="space-y-2 rounded-md border border-border bg-muted/30 px-3 py-3">
        <h3 className="text-sm font-medium">Stated approach</h3>
        <p className="text-sm text-muted-foreground">{methodologyLabel}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {riskCriteria.map((criterion) => (
            <Badge key={criterion} variant="outline">
              {SAMPLING_RISK_CRITERION_LABELS[criterion]}
              {typeof riskFlagCounts[criterion] === 'number'
                ? ` (${riskFlagCounts[criterion]})`
                : ''}
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Transaction population</h3>
        <div className="max-h-80 overflow-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Risk flags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((txn) => (
                <TableRow key={txn.id}>
                  <TableCell className="font-mono text-xs">{txn.id}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {txn.timestamp.replace('T', ' ').replace('Z', '')}
                  </TableCell>
                  <TableCell className="text-xs">{txn.user}</TableCell>
                  <TableCell className="text-xs">{txn.vendor}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatAmount(txn.amount)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {txn.riskFlags.length > 0
                      ? txn.riskFlags
                          .map((flag) => SAMPLING_RISK_CRITERION_LABELS[flag])
                          .join(', ')
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="sampling-sample-selection">
            How would you select the sample?
          </Label>
          <Textarea
            id="sampling-sample-selection"
            name="sampleSelection"
            rows={5}
            value={sampleSelection}
            onChange={(event) => setSampleSelection(event.target.value)}
            disabled={readOnly || isSubmitting}
            aria-invalid={errors.sampleSelection ? true : undefined}
            placeholder={`Describe statistical / random selection of size ${sampleSize} from the population…`}
          />
          {errors.sampleSelection ? (
            <p className="text-sm text-destructive" role="alert">
              {errors.sampleSelection}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Align with the stated approach (min {minMethodologyLength} chars).
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="sampling-risk-additions">Risk-based additions</Label>
          <Textarea
            id="sampling-risk-additions"
            name="riskBasedAdditions"
            rows={5}
            value={riskBasedAdditions}
            onChange={(event) => setRiskBasedAdditions(event.target.value)}
            disabled={readOnly || isSubmitting}
            aria-invalid={errors.riskBasedAdditions ? true : undefined}
            placeholder="Identify which high-risk attributes you would add judgmentally and why…"
          />
          {errors.riskBasedAdditions ? (
            <p className="text-sm text-destructive" role="alert">
              {errors.riskBasedAdditions}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Cover the listed risk criteria (min {minRiskAdditionsLength}{' '}
              chars).
            </p>
          )}
        </div>

        {submitError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {submitError}
          </p>
        ) : null}

        {feedback ? (
          <div
            role="status"
            className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
          >
            {scoreStatus ? (
              <p className="mb-1 font-medium capitalize">
                Status: {scoreStatus.replace(/_/g, ' ')}
              </p>
            ) : null}
            <p className="text-muted-foreground">{feedback}</p>
          </div>
        ) : null}

        <Button type="submit" disabled={readOnly || isSubmitting}>
          {isSubmitting ? 'Submitting…' : 'Submit methodology'}
        </Button>
      </form>
    </section>
  );
}
