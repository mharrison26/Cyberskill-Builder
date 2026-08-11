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
  PROGRAM_METRICS_BRIEF_DEFAULT_MAX_SELECTED,
  PROGRAM_METRICS_BRIEF_DEFAULT_MIN_RATIONALE_LENGTH,
  PROGRAM_METRICS_BRIEF_DEFAULT_MIN_SELECTED,
} from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type ProgramMetricsBriefTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type CandidateMetric = {
  id: string;
  label: string;
  formulaHint?: string;
};

type FormErrors = {
  selection?: string;
  calculations?: string;
  rationale?: string;
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

function resolvePositiveInt(
  source: Record<string, unknown>,
  keys: string[],
  fallback: number
): number {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
  }
  return fallback;
}

function parseCandidateMetrics(
  initialState: Record<string, unknown>
): CandidateMetric[] {
  const raw = initialState.candidateMetrics ?? initialState.candidate_metrics;
  if (!Array.isArray(raw)) return [];
  const out: CandidateMetric[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const id =
      typeof record.id === 'string' && record.id.trim()
        ? record.id.trim()
        : null;
    const label =
      typeof record.label === 'string' && record.label.trim()
        ? record.label.trim()
        : id;
    if (!id || !label) continue;
    const formulaHint =
      typeof record.formulaHint === 'string' && record.formulaHint.trim()
        ? record.formulaHint.trim()
        : typeof record.formula_hint === 'string' && record.formula_hint.trim()
          ? record.formula_hint.trim()
          : undefined;
    out.push({ id, label, formulaHint });
  }
  return out;
}

function parsePoamByAge(
  rawData: Record<string, unknown>
): Record<string, number> | null {
  const poam = asRecord(rawData.poamByAge ?? rawData.poam_by_age);
  const keys = ['0_30', '31_60', '61_90', 'over_90'] as const;
  const out: Record<string, number> = {};
  let any = false;
  for (const key of keys) {
    const n = poam[key];
    if (typeof n === 'number' && Number.isFinite(n)) {
      out[key] = n;
      any = true;
    }
  }
  return any ? out : null;
}

export function ProgramMetricsBriefTicket({
  ticket,
  readOnly = false,
  className,
}: ProgramMetricsBriefTicketProps) {
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

  const minSelected = resolvePositiveInt(
    { ...initialState, ...expectedState },
    ['minSelectedMetrics', 'min_selected_metrics'],
    PROGRAM_METRICS_BRIEF_DEFAULT_MIN_SELECTED
  );
  const maxSelected = resolvePositiveInt(
    { ...initialState, ...expectedState },
    ['maxSelectedMetrics', 'max_selected_metrics'],
    PROGRAM_METRICS_BRIEF_DEFAULT_MAX_SELECTED
  );
  const minRationale = resolvePositiveInt(
    { ...initialState, ...expectedState },
    ['minRationaleLength', 'min_rationale_length'],
    PROGRAM_METRICS_BRIEF_DEFAULT_MIN_RATIONALE_LENGTH
  );

  const candidates = useMemo(
    () => parseCandidateMetrics(initialState),
    [initialState]
  );

  const meta = useMemo(() => {
    const org = asRecord(initialState.organization);
    return {
      ticketCode: readString(
        initialState,
        ['ticketCode', 'ticket_code'],
        'ISSO-PM-01'
      ),
      prompt: readString(
        initialState,
        ['prompt'],
        'Select and calculate 2–3 metrics meaningful to leadership from the raw program data. Explain why each was chosen.'
      ),
      orgName: readString(org, ['name'], 'Organization'),
      systemName: readString(org, ['system'], 'System'),
      reportingPeriod: readString(
        initialState,
        ['reportingPeriod', 'reporting_period'],
        'Reporting period'
      ),
    };
  }, [initialState]);

  const rawData = useMemo(
    () => asRecord(initialState.rawData ?? initialState.raw_data),
    [initialState]
  );

  const poamByAge = useMemo(() => parsePoamByAge(rawData), [rawData]);
  const training = asRecord(rawData.training);
  const incidents = asRecord(rawData.incidents);

  const poamTotal = useMemo(() => {
    if (!poamByAge) return null;
    return Object.values(poamByAge).reduce((sum, n) => sum + n, 0);
  }, [poamByAge]);

  const [selected, setSelected] = useState<string[]>(() => {
    const raw = restored.selectedMetricIds;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (id): id is string => typeof id === 'string' && id.length > 0
    );
  });
  const [calcInputs, setCalcInputs] = useState<Record<string, string>>(() => {
    const raw = restored.calculations;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        out[key] = String(value);
      } else if (typeof value === 'string') {
        out[key] = value;
      }
    }
    return out;
  });
  const [rationale, setRationale] = useState(() =>
    restoredString(submission, 'rationale')
  );
  const [errors, setErrors] = useState<FormErrors>({});
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
  }

  function toggleMetric(id: string) {
    clearOutcome();
    setSelected((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= maxSelected) {
        return prev;
      }
      return [...prev, id];
    });
  }

  function validate(): boolean {
    const next: FormErrors = {};
    if (selected.length < minSelected || selected.length > maxSelected) {
      next.selection = `Select between ${minSelected} and ${maxSelected} metrics.`;
    }
    for (const id of selected) {
      const raw = calcInputs[id]?.trim() ?? '';
      if (!raw || Number.isNaN(Number(raw.replace(/%$/, '')))) {
        next.calculations =
          'Enter a numeric value for each selected metric (decimal rate or percent).';
        break;
      }
    }
    if (rationale.trim().length < minRationale) {
      next.rationale = `Rationale must be at least ${minRationale} characters.`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (formReadOnly || hideSubmit) return;

    clearOutcome();
    if (!validate()) return;

    const calculations: Record<string, number> = {};
    for (const id of selected) {
      calculations[id] = Number(
        (calcInputs[id] ?? '').trim().replace(/%$/, '')
      );
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'program_metrics_brief',
          selectedMetricIds: selected,
          calculations,
          rationale: rationale.trim(),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? 'Failed to submit program metrics brief.'
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
      aria-labelledby="program-metrics-brief-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2
          id="program-metrics-brief-heading"
          className="text-lg font-semibold"
        >
          Program metrics brief
        </h2>
        <Badge variant="secondary">{meta.ticketCode}</Badge>
        <Badge variant="outline">{meta.reportingPeriod}</Badge>
      </div>

      <p className="max-w-prose text-sm text-muted-foreground">{meta.prompt}</p>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{meta.orgName}</span>
        {' · '}
        {meta.systemName}
      </p>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Raw program data</CardTitle>
          <CardDescription>
            Derive leadership metrics from these figures. Distinct from helpdesk
            ticket-resolution KPIs — focus on program risk posture.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {poamByAge ? (
            <div>
              <h3 className="mb-2 text-sm font-medium">POA&M counts by age</h3>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">0–30</th>
                      <th className="px-2 py-1.5 font-medium">31–60</th>
                      <th className="px-2 py-1.5 font-medium">61–90</th>
                      <th className="px-2 py-1.5 font-medium">&gt;90</th>
                      <th className="px-2 py-1.5 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-border">
                      <td className="px-2 py-1 font-mono">
                        {poamByAge['0_30'] ?? '—'}
                      </td>
                      <td className="px-2 py-1 font-mono">
                        {poamByAge['31_60'] ?? '—'}
                      </td>
                      <td className="px-2 py-1 font-mono">
                        {poamByAge['61_90'] ?? '—'}
                      </td>
                      <td className="px-2 py-1 font-mono">
                        {poamByAge.over_90 ?? '—'}
                      </td>
                      <td className="px-2 py-1 font-mono font-medium">
                        {poamTotal ?? '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium">
                Security awareness training
              </h3>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Completed</th>
                      <th className="px-2 py-1.5 font-medium">Required</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-border">
                      <td className="px-2 py-1 font-mono">
                        {typeof training.completed === 'number'
                          ? training.completed
                          : '—'}
                      </td>
                      <td className="px-2 py-1 font-mono">
                        {typeof training.required === 'number'
                          ? training.required
                          : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium">Incidents (period)</h3>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Total</th>
                      <th className="px-2 py-1.5 font-medium">P1</th>
                      <th className="px-2 py-1.5 font-medium">P2</th>
                      <th className="px-2 py-1.5 font-medium">P3</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-border">
                      <td className="px-2 py-1 font-mono">
                        {typeof incidents.total === 'number'
                          ? incidents.total
                          : '—'}
                      </td>
                      <td className="px-2 py-1 font-mono">
                        {typeof incidents.p1 === 'number' ? incidents.p1 : '—'}
                      </td>
                      <td className="px-2 py-1 font-mono">
                        {typeof incidents.p2 === 'number' ? incidents.p2 : '—'}
                      </td>
                      <td className="px-2 py-1 font-mono">
                        {typeof incidents.p3 === 'number' ? incidents.p3 : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Select leadership metrics
            </CardTitle>
            <CardDescription>
              Choose {minSelected}–{maxSelected} metrics. Prefer program risk
              indicators over vanity activity counts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {candidates.length === 0 ? (
              <p className="text-sm text-destructive" role="alert">
                No candidate metrics are configured on this ticket.
              </p>
            ) : (
              <ul className="space-y-2">
                {candidates.map((metric) => {
                  const checked = selected.includes(metric.id);
                  const inputId = `${ticket.id}-metric-${metric.id}`;
                  const disabledAdd =
                    !checked && selected.length >= maxSelected;
                  return (
                    <li
                      key={metric.id}
                      className={cn(
                        'rounded-md border border-border px-3 py-2',
                        checked && 'bg-primary/5'
                      )}
                    >
                      <Label
                        htmlFor={inputId}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 font-normal',
                          (readOnly || disabledAdd) &&
                            !checked &&
                            'cursor-default opacity-60'
                        )}
                      >
                        <input
                          id={inputId}
                          type="checkbox"
                          className="mt-1 size-4 accent-primary"
                          checked={checked}
                          disabled={formReadOnly || disabledAdd}
                          onChange={() => toggleMetric(metric.id)}
                        />
                        <span className="space-y-0.5">
                          <span className="block text-sm font-medium text-foreground">
                            {metric.label}
                          </span>
                          {metric.formulaHint ? (
                            <span className="block font-mono text-xs text-muted-foreground">
                              {metric.formulaHint}
                            </span>
                          ) : null}
                        </span>
                      </Label>
                    </li>
                  );
                })}
              </ul>
            )}
            {errors.selection ? (
              <p className="text-xs text-destructive" role="alert">
                {errors.selection}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Selected {selected.length} of {minSelected}–{maxSelected}.
              </p>
            )}
          </CardContent>
        </Card>

        {selected.length > 0 ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Calculate selected metrics
              </CardTitle>
              <CardDescription>
                Enter rates as decimals (0.84) or percents (84). Both are
                accepted within tolerance.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {selected.map((id) => {
                const candidate = candidates.find((c) => c.id === id);
                const inputId = `${ticket.id}-calc-${id}`;
                return (
                  <div key={id} className="space-y-2">
                    <Label htmlFor={inputId}>{candidate?.label ?? id}</Label>
                    <Input
                      id={inputId}
                      inputMode="decimal"
                      value={calcInputs[id] ?? ''}
                      onChange={(e) => {
                        clearOutcome();
                        setCalcInputs((prev) => ({
                          ...prev,
                          [id]: e.target.value,
                        }));
                      }}
                      disabled={formReadOnly}
                      placeholder="e.g. 0.84 or 84"
                      aria-invalid={Boolean(errors.calculations)}
                    />
                    {candidate?.formulaHint ? (
                      <p className="font-mono text-xs text-muted-foreground">
                        {candidate.formulaHint}
                      </p>
                    ) : null}
                  </div>
                );
              })}
              {errors.calculations ? (
                <p
                  className="text-xs text-destructive sm:col-span-2"
                  role="alert"
                >
                  {errors.calculations}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="program-metrics-rationale">
            Why these metrics for leadership
          </Label>
          <Textarea
            id="program-metrics-rationale"
            value={rationale}
            onChange={(e) => {
              clearOutcome();
              setRationale(e.target.value);
            }}
            disabled={formReadOnly}
            rows={6}
            placeholder="Explain why each selected metric matters to the AO / ISSM / CISO — what decision or oversight question it answers…"
            aria-invalid={Boolean(errors.rationale)}
          />
          {errors.rationale ? (
            <p className="text-xs text-destructive">{errors.rationale}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {rationale.trim().length}/{minRationale} characters minimum. Tie
              each metric to residual risk or program oversight — not vanity
              activity.
            </p>
          )}
        </div>

        {!hideSubmit ? (
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Submit program metrics brief'}
          </Button>
        ) : null}

        {submitError ? (
          <p className="text-sm text-destructive" role="alert">
            {submitError}
          </p>
        ) : null}
        {feedback ? (
          <div
            className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
            role="status"
          >
            {scoreStatus ? (
              <p className="mb-1 font-medium capitalize">
                Status: {scoreStatus.replace(/_/g, ' ')}
              </p>
            ) : null}
            <p className="text-muted-foreground">{feedback}</p>
          </div>
        ) : null}
      </form>
    </section>
  );
}
