'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  PROGRAM_RISK_SUMMARY_DEFAULT_MIN_SUMMARY_LENGTH,
  PROGRAM_RISK_SUMMARY_DEFAULT_TOP_N,
  buildRiskSystemCitations,
  parseProgramCandidateRisks,
  parseProgramCandidateThemes,
  parseProgramRiskSystems,
  parseProgramRiskSummaryExpectedState,
  type ProgramCandidateRisk,
} from '@/lib/scoring/programRiskSummary';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type ProgramRiskSummaryTicketProps = {
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

function ratingTone(rating: string): string {
  const r = rating.toLowerCase();
  if (r === 'critical' || r === 'high') {
    return 'border-destructive/30 bg-destructive/10 text-destructive';
  }
  if (r === 'moderate' || r === 'medium') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400';
  }
  return 'border-border bg-muted/40 text-muted-foreground';
}

export function ProgramRiskSummaryTicket({
  ticket,
  readOnly = false,
  className,
}: ProgramRiskSummaryTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);

  const systems = useMemo(
    () => parseProgramRiskSystems(initialState),
    [initialState]
  );
  const candidateRisks = useMemo(
    () => parseProgramCandidateRisks(initialState),
    [initialState]
  );
  const candidateThemes = useMemo(
    () => parseProgramCandidateThemes(initialState),
    [initialState]
  );

  const citations = useMemo(
    () => buildRiskSystemCitations(systems, candidateRisks),
    [systems, candidateRisks]
  );

  const topN = useMemo(() => {
    const raw = initialState.topN ?? expectedState.topN;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
      return Math.floor(raw);
    }
    return PROGRAM_RISK_SUMMARY_DEFAULT_TOP_N;
  }, [initialState.topN, expectedState.topN]);

  const minSummaryLength = useMemo(() => {
    const parsed = parseProgramRiskSummaryExpectedState(
      expectedState,
      initialState
    );
    if (parsed) return parsed.minSummaryLength;
    const fromInitial = initialState.minSummaryLength;
    if (
      typeof fromInitial === 'number' &&
      Number.isFinite(fromInitial) &&
      fromInitial > 0
    ) {
      return Math.floor(fromInitial);
    }
    return PROGRAM_RISK_SUMMARY_DEFAULT_MIN_SUMMARY_LENGTH;
  }, [expectedState, initialState]);

  const prompt = readString(
    initialState,
    ['prompt'],
    'Aggregate system risk ratings into a program-level summary. Select the top program risks (risk-weighted) and the common themes across systems.'
  );

  const program = asRecord(initialState.program);
  const programName = readString(program, ['name'], 'Enterprise program');
  const reportingPeriod = readString(
    program,
    ['reportingPeriod', 'reporting_period', 'period'],
    ''
  );

  const riskById = useMemo(() => {
    const map = new Map<string, ProgramCandidateRisk>();
    for (const risk of candidateRisks) map.set(risk.id, risk);
    return map;
  }, [candidateRisks]);

  const [topRiskIds, setTopRiskIds] = useState<string[]>([]);
  const [themeIds, setThemeIds] = useState<Set<string>>(() => new Set());
  const [summary, setSummary] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function clearOutcome() {
    setFormError(null);
    setSubmitError(null);
    setFeedback(null);
    setScoreStatus(null);
  }

  function addTopRisk(id: string) {
    if (readOnly) return;
    clearOutcome();
    setTopRiskIds((prev) => {
      if (prev.includes(id) || prev.length >= topN) return prev;
      return [...prev, id];
    });
  }

  function removeTopRisk(id: string) {
    if (readOnly) return;
    clearOutcome();
    setTopRiskIds((prev) => prev.filter((x) => x !== id));
  }

  function moveTopRisk(index: number, direction: -1 | 1) {
    if (readOnly) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= topRiskIds.length) return;
    clearOutcome();
    setTopRiskIds((prev) => {
      const next = [...prev];
      const tmp = next[index]!;
      next[index] = next[nextIndex]!;
      next[nextIndex] = tmp;
      return next;
    });
  }

  function toggleTheme(id: string) {
    if (readOnly) return;
    clearOutcome();
    setThemeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    clearOutcome();

    if (topRiskIds.length !== topN) {
      setFormError(
        `Select exactly ${topN} program risks, ranked highest first.`
      );
      return;
    }
    if (themeIds.size === 0) {
      setFormError('Select at least one common theme across systems.');
      return;
    }
    if (summary.trim().length < minSummaryLength) {
      setFormError(
        `Program summary must be at least ${minSummaryLength} characters.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'program_risk_summary',
          topRiskIds,
          themeIds: Array.from(themeIds),
          summary: summary.trim(),
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };
      if (!response.ok) {
        throw new Error(
          payload.error ?? 'Failed to submit program risk summary.'
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
      aria-labelledby="program-risk-summary-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="program-risk-summary-heading" className="text-lg font-semibold">
          Program risk summary
        </h2>
        <Badge variant="secondary">ISSM · Risk rollup</Badge>
      </div>

      <p className="max-w-prose text-sm text-muted-foreground">{prompt}</p>

      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm">
        <p className="font-medium">{programName}</p>
        {reportingPeriod ? (
          <p className="text-muted-foreground">
            Reporting period: {reportingPeriod}
          </p>
        ) : null}
        <p className="mt-1 text-muted-foreground">
          Weight risks by severity/score and how many systems they affect. Rank
          the top {topN} program risks (highest first), select common themes,
          and write a short program summary.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">System risk ratings</h3>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  System
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Overall
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Residual risks
                </th>
              </tr>
            </thead>
            <tbody>
              {systems.map((system) => (
                <tr
                  key={system.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-3 py-2 align-top font-medium">
                    {system.name}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span
                      className={cn(
                        'inline-flex rounded-md border px-2 py-0.5 text-xs font-medium capitalize',
                        ratingTone(system.overallRating)
                      )}
                    >
                      {system.overallRating}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <ul className="space-y-1 text-muted-foreground">
                      {system.risks.map((risk) => (
                        <li key={`${system.id}-${risk.id}`}>
                          <span className="font-medium text-foreground">
                            {risk.title}
                          </span>
                          {' · '}
                          <span className="capitalize">{risk.severity}</span>
                          {' / '}
                          <span className="capitalize">{risk.likelihood}</span>
                          {typeof risk.score === 'number'
                            ? ` · score ${risk.score}`
                            : null}
                        </li>
                      ))}
                      {system.risks.length === 0 ? (
                        <li>No residual risks listed.</li>
                      ) : null}
                    </ul>
                  </td>
                </tr>
              ))}
              {systems.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    No systems were seeded for this ticket.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">
          Candidate program risks (rollup)
        </h3>
        <p className="text-sm text-muted-foreground">
          Systems citing each risk and per-system scores. Add the top {topN} to
          your ranked list — highest program risk first.
        </p>
        <ul className="space-y-2">
          {citations.map(
            ({ risk, citations: cites, systemsAffected, scoreSum }) => {
              const alreadyRanked = topRiskIds.includes(risk.id);
              const atCapacity = topRiskIds.length >= topN;
              return (
                <li
                  key={risk.id}
                  className="rounded-md border border-border px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{risk.title}</p>
                      <p className="text-muted-foreground">
                        {systemsAffected} system
                        {systemsAffected === 1 ? '' : 's'}
                        {scoreSum > 0 ? ` · score sum ${scoreSum}` : null}
                      </p>
                      {cites.length > 0 ? (
                        <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                          {cites.map((c) => (
                            <li key={`${risk.id}-${c.systemId}`}>
                              {c.systemName}
                              {typeof c.score === 'number'
                                ? ` (score ${c.score})`
                                : ` (${c.severity}/${c.likelihood})`}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Not cited in the system excerpts (distractor).
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        readOnly || isSubmitting || alreadyRanked || atCapacity
                      }
                      onClick={() => addTopRisk(risk.id)}
                    >
                      {alreadyRanked
                        ? 'In top list'
                        : atCapacity
                          ? 'Top list full'
                          : 'Add to top'}
                    </Button>
                  </div>
                </li>
              );
            }
          )}
        </ul>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <h3 className="text-sm font-medium">
            Top {topN} program risks (ranked)
          </h3>
          {topRiskIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No risks ranked yet. Add candidates from the rollup above.
            </p>
          ) : (
            <ol className="space-y-2">
              {topRiskIds.map((id, index) => {
                const risk = riskById.get(id);
                return (
                  <li
                    key={id}
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
                          aria-label={`Move ${id} up`}
                          onClick={() => moveTopRisk(index, -1)}
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
                            index === topRiskIds.length - 1
                          }
                          aria-label={`Move ${id} down`}
                          onClick={() => moveTopRisk(index, 1)}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{risk?.title ?? id}</p>
                      <p className="text-xs text-muted-foreground">{id}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      disabled={readOnly || isSubmitting}
                      aria-label={`Remove ${id}`}
                      onClick={() => removeTopRisk(id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">
            Common themes across systems
          </legend>
          <ul className="space-y-2">
            {candidateThemes.map((theme) => (
              <li key={theme.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/30">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={themeIds.has(theme.id)}
                    onChange={() => toggleTheme(theme.id)}
                    disabled={readOnly || isSubmitting}
                    aria-label={theme.label}
                  />
                  <span>
                    <span className="font-medium">{theme.label}</span>
                    {theme.detail ? (
                      <span className="mt-0.5 block text-muted-foreground">
                        {theme.detail}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <div className="space-y-2">
          <Label htmlFor="program-risk-summary-narrative">
            Program-level summary
          </Label>
          <Textarea
            id="program-risk-summary-narrative"
            value={summary}
            onChange={(event) => {
              clearOutcome();
              setSummary(event.target.value);
            }}
            disabled={readOnly || isSubmitting}
            rows={5}
            placeholder="Summarize the top program risks and cross-system themes for leadership…"
          />
          <p className="text-xs text-muted-foreground">
            {summary.trim().length}/{minSummaryLength} characters minimum
          </p>
        </div>

        {!readOnly ? (
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Submit program risk summary'}
          </Button>
        ) : null}

        {formError || submitError ? (
          <p className="text-sm text-destructive" role="alert">
            {formError ?? submitError}
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
            <p className="mt-1 text-muted-foreground">{feedback}</p>
          </div>
        ) : null}
      </form>
    </section>
  );
}
