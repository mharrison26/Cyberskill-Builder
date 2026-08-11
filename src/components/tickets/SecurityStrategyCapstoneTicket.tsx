'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  asSubmissionRecord,
  restoredString,
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
import { Textarea } from '@/components/ui/textarea';
import {
  SECURITY_STRATEGY_CAPSTONE_DEFAULT_MIN_MEMO_LENGTH,
  SECURITY_STRATEGY_CAPSTONE_DEFAULT_MIN_OUTCOMES,
  SECURITY_STRATEGY_CAPSTONE_DEFAULT_MIN_PRIORITIES,
  SECURITY_STRATEGY_CAPSTONE_MIN_SECTION_LENGTH,
} from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type SecurityStrategyCapstoneTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type PriorityRow = {
  title: string;
  rationale: string;
};

type OutcomeRow = {
  title: string;
  metric: string;
};

type FormErrors = {
  priorities?: string;
  resourcing?: string;
  outcomes?: string;
  memo?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function resolvePositiveInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
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

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatMoney(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `$${value.toLocaleString('en-US')}`;
  }
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function restoredPriorityRows(
  submission: Record<string, unknown> | null | undefined,
  minPriorities: number
): PriorityRow[] {
  const raw = submission?.priorities;
  const rows: PriorityRow[] = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as Record<string, unknown>;
      rows.push({
        title: typeof record.title === 'string' ? record.title : '',
        rationale: typeof record.rationale === 'string' ? record.rationale : '',
      });
    }
  }
  while (rows.length < minPriorities) rows.push({ title: '', rationale: '' });
  return rows;
}

function restoredOutcomeRows(
  submission: Record<string, unknown> | null | undefined,
  minOutcomes: number
): OutcomeRow[] {
  const raw = submission?.expectedOutcomes;
  const rows: OutcomeRow[] = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as Record<string, unknown>;
      rows.push({
        title: typeof record.title === 'string' ? record.title : '',
        metric: typeof record.metric === 'string' ? record.metric : '',
      });
    }
  }
  while (rows.length < minOutcomes) rows.push({ title: '', metric: '' });
  return rows;
}

export function SecurityStrategyCapstoneTicket({
  ticket,
  readOnly = false,
  className,
}: SecurityStrategyCapstoneTicketProps) {
  const {
    submission,
    formReadOnly,
    hideSubmit,
    lastFeedback,
    lastScoreStatus,
  } = useTicketWorkbenchForm(readOnly);
  const restored = asSubmissionRecord(submission);
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);

  const minSectionLength = resolvePositiveInt(
    expectedState.minSectionLength ?? initialState.minSectionLength,
    SECURITY_STRATEGY_CAPSTONE_MIN_SECTION_LENGTH
  );
  const minMemoLength = resolvePositiveInt(
    expectedState.minMemoLength ?? initialState.minMemoLength,
    SECURITY_STRATEGY_CAPSTONE_DEFAULT_MIN_MEMO_LENGTH
  );
  const minPriorities = resolvePositiveInt(
    expectedState.minPriorities ?? initialState.minPriorities,
    SECURITY_STRATEGY_CAPSTONE_DEFAULT_MIN_PRIORITIES
  );
  const minOutcomes = resolvePositiveInt(
    expectedState.minOutcomes ?? initialState.minOutcomes,
    SECURITY_STRATEGY_CAPSTONE_DEFAULT_MIN_OUTCOMES
  );

  const prompt = readString(
    initialState,
    ['prompt'],
    'Draft a one-year security strategy memo for leadership covering top priorities, resourcing under the budget envelope, and expected outcomes.'
  );

  const organization = useMemo(() => {
    const org = asRecord(initialState.organization ?? initialState.org);
    const name =
      (typeof org.name === 'string' && org.name.trim()) ||
      (typeof initialState.organization === 'string'
        ? initialState.organization.trim()
        : 'Organization');
    const lines: string[] = [];
    for (const key of ['mission', 'size', 'industry', 'notes'] as const) {
      if (typeof org[key] === 'string' && org[key].trim()) {
        lines.push(`${key}: ${org[key].trim()}`);
      }
    }
    return { name, lines };
  }, [initialState.organization, initialState.org]);

  const riskProfile = useMemo(() => {
    const profile = asRecord(
      initialState.riskProfile ?? initialState.risk_profile
    );
    const overall =
      typeof profile.overall === 'string' ? profile.overall.trim() : '';
    const threatContext =
      (typeof profile.threatContext === 'string' &&
        profile.threatContext.trim()) ||
      (typeof profile.threat_context === 'string' &&
        profile.threat_context.trim()) ||
      '';
    const topRisksRaw = profile.topRisks ?? profile.top_risks;
    const topRisks: string[] = [];
    if (Array.isArray(topRisksRaw)) {
      for (const risk of topRisksRaw) {
        if (typeof risk === 'string' && risk.trim()) {
          topRisks.push(risk.trim());
        } else {
          const record = asRecord(risk);
          const title =
            (typeof record.title === 'string' && record.title.trim()) ||
            (typeof record.name === 'string' && record.name.trim()) ||
            null;
          if (!title) continue;
          const severity =
            typeof record.severity === 'string' ? record.severity.trim() : '';
          topRisks.push(severity ? `${title} (${severity})` : title);
        }
      }
    }
    return { overall, threatContext, topRisks };
  }, [initialState.riskProfile, initialState.risk_profile]);

  const budget = useMemo(() => {
    const record = asRecord(initialState.budget);
    return {
      fiscalYear:
        typeof record.fiscalYear === 'string' ? record.fiscalYear.trim() : '',
      total: formatMoney(record.totalBudget ?? record.total_budget),
      constraints: stringList(record.constraints),
      mustFund: stringList(record.mustFund ?? record.must_fund),
    };
  }, [initialState.budget]);

  const priorFindings = useMemo(() => {
    const raw = initialState.priorFindings ?? initialState.prior_findings;
    if (!Array.isArray(raw)) return [] as Array<Record<string, string>>;
    return raw
      .map((finding) => {
        if (typeof finding === 'string') {
          return { title: finding };
        }
        const record = asRecord(finding);
        return {
          id: typeof record.id === 'string' ? record.id : '',
          title:
            (typeof record.title === 'string' && record.title.trim()) ||
            (typeof record.name === 'string' && record.name.trim()) ||
            '',
          severity: typeof record.severity === 'string' ? record.severity : '',
          source: typeof record.source === 'string' ? record.source : '',
          status: typeof record.status === 'string' ? record.status : '',
        };
      })
      .filter((finding) => finding.title);
  }, [initialState.priorFindings, initialState.prior_findings]);

  const [priorities, setPriorities] = useState<PriorityRow[]>(() =>
    restoredPriorityRows(restored, minPriorities)
  );
  const [resourcing, setResourcing] = useState(() =>
    restoredString(submission, 'resourcing')
  );
  const [outcomes, setOutcomes] = useState<OutcomeRow[]>(() =>
    restoredOutcomeRows(restored, minOutcomes)
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(() => lastFeedback);
  const [scoreStatus, setScoreStatus] = useState<string | null>(() => lastScoreStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const memoPreview = useMemo(() => {
    const priorityLines = priorities
      .map((row, index) => {
        const title = row.title.trim();
        if (!title) return null;
        const rationale = row.rationale.trim();
        return `${index + 1}. ${title}${rationale ? ` — ${rationale}` : ''}`;
      })
      .filter(Boolean)
      .join('\n');
    const outcomeLines = outcomes
      .map((row) => {
        const title = row.title.trim();
        if (!title) return null;
        const metric = row.metric.trim();
        return `- ${title}${metric ? ` (${metric})` : ''}`;
      })
      .filter(Boolean)
      .join('\n');
    return [
      '## Top priorities',
      priorityLines || '(none yet)',
      '',
      '## Resourcing',
      resourcing.trim() || '(none yet)',
      '',
      '## Expected outcomes',
      outcomeLines || '(none yet)',
    ].join('\n');
  }, [priorities, resourcing, outcomes]);

  function clearOutcome() {
    setFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);
  }

  function validate(): boolean {
    const next: FormErrors = {};
    const filledPriorities = priorities.filter((row) => row.title.trim());
    if (filledPriorities.length < minPriorities) {
      next.priorities = `Provide at least ${minPriorities} ranked priorities with titles.`;
    } else {
      const prioritiesText = filledPriorities
        .map(
          (row, index) =>
            `${index + 1}. ${row.title.trim()}${row.rationale.trim() ? ` — ${row.rationale.trim()}` : ''}`
        )
        .join('\n');
      if (prioritiesText.length < minSectionLength) {
        next.priorities = `Priorities section must be at least ${minSectionLength} characters (add rationales).`;
      }
    }

    if (!resourcing.trim()) {
      next.resourcing = 'Resourcing is required.';
    } else if (resourcing.trim().length < minSectionLength) {
      next.resourcing = `Resourcing must be at least ${minSectionLength} characters.`;
    }

    const filledOutcomes = outcomes.filter((row) => row.title.trim());
    if (filledOutcomes.length < minOutcomes) {
      next.outcomes = `Provide at least ${minOutcomes} expected outcomes.`;
    } else {
      const outcomesText = filledOutcomes
        .map(
          (row) =>
            `- ${row.title.trim()}${row.metric.trim() ? ` (${row.metric.trim()})` : ''}`
        )
        .join('\n');
      if (outcomesText.length < minSectionLength) {
        next.outcomes = `Outcomes section must be at least ${minSectionLength} characters (add metrics).`;
      }
    }

    if (memoPreview.replace(/\(none yet\)/g, '').length < minMemoLength) {
      next.memo = `Combined memo must reach ${minMemoLength} characters (currently ~${memoPreview.length}).`;
    }

    setErrors(next);
    return Object.keys(next).length === 0;
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
          type: 'security_strategy_capstone',
          priorities: priorities
            .filter((row) => row.title.trim())
            .map((row, index) => ({
              rank: index + 1,
              title: row.title.trim(),
              rationale: row.rationale.trim(),
            })),
          resourcing: resourcing.trim(),
          expectedOutcomes: outcomes
            .filter((row) => row.title.trim())
            .map((row) => ({
              title: row.title.trim(),
              metric: row.metric.trim(),
            })),
          memo: memoPreview,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit strategy memo.');
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
      aria-labelledby="security-strategy-capstone-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2
          id="security-strategy-capstone-heading"
          className="text-lg font-semibold"
        >
          One-year security strategy
        </h2>
        <Badge variant="secondary">ISSM-07 flagship</Badge>
        <Badge variant="outline">Tier 3</Badge>
      </div>

      <p className="max-w-prose text-sm text-muted-foreground">{prompt}</p>
      <p className="max-w-prose text-sm text-muted-foreground">
        Use the scenario inputs below — do not invent a different org, budget,
        or findings set. On resolve, this submission becomes your track flagship
        portfolio item.
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{organization.name}</CardTitle>
            <CardDescription>Organization & mission</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            {organization.lines.length > 0 ? (
              organization.lines.map((line) => <p key={line}>{line}</p>)
            ) : (
              <p>No organization profile provided.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Risk profile</CardTitle>
            <CardDescription>
              {riskProfile.overall
                ? `Overall: ${riskProfile.overall}`
                : 'Residual risk & threats'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {riskProfile.threatContext ? (
              <p>{riskProfile.threatContext}</p>
            ) : null}
            {riskProfile.topRisks.length > 0 ? (
              <ul className="list-inside list-disc">
                {riskProfile.topRisks.map((risk) => (
                  <li key={risk}>{risk}</li>
                ))}
              </ul>
            ) : (
              <p>No top risks listed.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Budget{budget.fiscalYear ? ` · ${budget.fiscalYear}` : ''}
            </CardTitle>
            <CardDescription>
              {budget.total ? `Envelope ${budget.total}` : 'FY constraints'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {budget.mustFund.length > 0 ? (
              <div>
                <p className="font-medium text-foreground">Must-fund</p>
                <ul className="list-inside list-disc">
                  {budget.mustFund.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {budget.constraints.length > 0 ? (
              <div>
                <p className="font-medium text-foreground">Constraints</p>
                <ul className="list-inside list-disc">
                  {budget.constraints.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {priorFindings.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Prior findings</CardTitle>
            <CardDescription>
              Address these themes in priorities and outcomes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {priorFindings.map((finding) => (
                <li
                  key={`${finding.id}-${finding.title}`}
                  className="rounded-md border border-border px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {finding.id ? (
                      <Badge variant="outline">{finding.id}</Badge>
                    ) : null}
                    {finding.severity ? (
                      <Badge variant="secondary">{finding.severity}</Badge>
                    ) : null}
                    {finding.status ? (
                      <span className="text-xs text-muted-foreground">
                        {finding.status}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 font-medium">{finding.title}</p>
                  {finding.source ? (
                    <p className="text-xs text-muted-foreground">
                      Source: {finding.source}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Top priorities (ranked)</Label>
            {!hideSubmit ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSubmitting}
                onClick={() => {
                  clearOutcome();
                  setPriorities((prev) => [
                    ...prev,
                    { title: '', rationale: '' },
                  ]);
                }}
              >
                Add priority
              </Button>
            ) : null}
          </div>
          {priorities.map((row, index) => (
            <div
              key={`priority-${index}`}
              className="space-y-2 rounded-md border border-border p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Priority {index + 1}</p>
                {!readOnly && priorities.length > minPriorities ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isSubmitting}
                    onClick={() => {
                      clearOutcome();
                      setPriorities((prev) =>
                        prev.filter((_, i) => i !== index)
                      );
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              <Input
                value={row.title}
                placeholder="Priority title"
                disabled={formReadOnly || isSubmitting}
                onChange={(e) => {
                  clearOutcome();
                  const value = e.target.value;
                  setPriorities((prev) =>
                    prev.map((item, i) =>
                      i === index ? { ...item, title: value } : item
                    )
                  );
                }}
              />
              <Textarea
                value={row.rationale}
                placeholder="Why this ranks here (tie to risk / findings)"
                rows={3}
                disabled={formReadOnly || isSubmitting}
                onChange={(e) => {
                  clearOutcome();
                  const value = e.target.value;
                  setPriorities((prev) =>
                    prev.map((item, i) =>
                      i === index ? { ...item, rationale: value } : item
                    )
                  );
                }}
              />
            </div>
          ))}
          {errors.priorities ? (
            <p className="text-sm text-destructive">{errors.priorities}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              At least {minPriorities} priorities; section ≥ {minSectionLength}{' '}
              characters.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="strategy-resourcing">Resourcing</Label>
          <Textarea
            id="strategy-resourcing"
            value={resourcing}
            onChange={(e) => {
              clearOutcome();
              setResourcing(e.target.value);
            }}
            disabled={formReadOnly || isSubmitting}
            rows={6}
            placeholder="Map the FY envelope and people to your priorities. Honor must-fund items and hard constraints."
            aria-invalid={Boolean(errors.resourcing)}
          />
          {errors.resourcing ? (
            <p className="text-sm text-destructive">{errors.resourcing}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Minimum {minSectionLength} characters.
            </p>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Expected outcomes</Label>
            {!hideSubmit ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSubmitting}
                onClick={() => {
                  clearOutcome();
                  setOutcomes((prev) => [...prev, { title: '', metric: '' }]);
                }}
              >
                Add outcome
              </Button>
            ) : null}
          </div>
          {outcomes.map((row, index) => (
            <div
              key={`outcome-${index}`}
              className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-2"
            >
              <div className="space-y-2 sm:col-span-2 sm:flex sm:items-center sm:justify-between">
                <p className="text-sm font-medium">Outcome {index + 1}</p>
                {!readOnly && outcomes.length > minOutcomes ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isSubmitting}
                    onClick={() => {
                      clearOutcome();
                      setOutcomes((prev) => prev.filter((_, i) => i !== index));
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              <Input
                value={row.title}
                placeholder="Outcome"
                disabled={formReadOnly || isSubmitting}
                onChange={(e) => {
                  clearOutcome();
                  const value = e.target.value;
                  setOutcomes((prev) =>
                    prev.map((item, i) =>
                      i === index ? { ...item, title: value } : item
                    )
                  );
                }}
              />
              <Input
                value={row.metric}
                placeholder="Measurable target within the year"
                disabled={formReadOnly || isSubmitting}
                onChange={(e) => {
                  clearOutcome();
                  const value = e.target.value;
                  setOutcomes((prev) =>
                    prev.map((item, i) =>
                      i === index ? { ...item, metric: value } : item
                    )
                  );
                }}
              />
            </div>
          ))}
          {errors.outcomes ? (
            <p className="text-sm text-destructive">{errors.outcomes}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              At least {minOutcomes} outcomes; section ≥ {minSectionLength}{' '}
              characters.
            </p>
          )}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Memo preview</CardTitle>
            <CardDescription>
              Submitted as a cohesive strategy memo (min {minMemoLength} chars)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">
              {memoPreview}
            </pre>
            {errors.memo ? (
              <p className="mt-2 text-sm text-destructive">{errors.memo}</p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                ~{memoPreview.length} characters
              </p>
            )}
          </CardContent>
        </Card>

        {!hideSubmit ? (
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Submit strategy memo'}
          </Button>
        ) : null}

        {submitError ? (
          <p className="text-sm text-destructive" role="alert">
            {submitError}
          </p>
        ) : null}
        {feedback ? (
          <div
            role="status"
            className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm"
          >
            {scoreStatus ? (
              <p className="font-medium capitalize">
                Status: {scoreStatus.replace(/_/g, ' ')}
              </p>
            ) : null}
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
              {feedback}
            </p>
          </div>
        ) : null}
      </form>
    </section>
  );
}
