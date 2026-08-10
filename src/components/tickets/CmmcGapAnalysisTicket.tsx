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
  CMMC_GAP_ANALYSIS_MIN_LENGTH,
  CMMC_PRACTICE_SCORE_VALUES,
  type CmmcPracticeScoreValue,
} from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type CmmcGapAnalysisTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type PracticePrompt = {
  id: string;
  title?: string;
  domain?: string;
  implementationSummary?: string;
};

type FormErrors = {
  practices?: string;
  readinessPercent?: string;
  gapAnalysis?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function resolveMinGapAnalysisLength(
  expectedState: Record<string, unknown>
): number {
  const value = expectedState.minGapAnalysisLength;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return CMMC_GAP_ANALYSIS_MIN_LENGTH;
}

function parsePracticePrompts(
  initialState: Record<string, unknown>
): PracticePrompt[] {
  const fromPrompts = initialState.practices;
  if (Array.isArray(fromPrompts)) {
    return fromPrompts
      .map((entry): PracticePrompt | null => {
        if (typeof entry === 'string' && entry.trim()) {
          return { id: entry.trim() };
        }
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          const record = entry as Record<string, unknown>;
          const id =
            typeof record.id === 'string'
              ? record.id.trim()
              : typeof record.practiceId === 'string'
                ? record.practiceId.trim()
                : '';
          if (!id) return null;
          const implementationSummary =
            typeof record.implementationSummary === 'string' &&
            record.implementationSummary.trim()
              ? record.implementationSummary.trim()
              : typeof record.summary === 'string' && record.summary.trim()
                ? record.summary.trim()
                : undefined;
          return {
            id,
            title:
              typeof record.title === 'string' && record.title.trim()
                ? record.title.trim()
                : undefined,
            domain:
              typeof record.domain === 'string' && record.domain.trim()
                ? record.domain.trim()
                : undefined,
            implementationSummary,
          };
        }
        return null;
      })
      .filter((entry): entry is PracticePrompt => entry !== null);
  }

  const ids = initialState.practiceIds;
  if (Array.isArray(ids)) {
    return ids
      .filter(
        (id): id is string => typeof id === 'string' && Boolean(id.trim())
      )
      .map((id) => ({ id: id.trim() }));
  }

  return [];
}

const SCORE_LABELS: Record<CmmcPracticeScoreValue, string> = {
  met: 'Met',
  partial: 'Partial',
  not_met: 'Not met',
};

export function CmmcGapAnalysisTicket({
  ticket,
  readOnly = false,
  className,
}: CmmcGapAnalysisTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);
  const practices = useMemo(
    () => parsePracticePrompts(initialState),
    [initialState]
  );
  const minGapAnalysisLength = resolveMinGapAnalysisLength(expectedState);

  const companyName =
    typeof initialState.companyName === 'string' &&
    initialState.companyName.trim()
      ? initialState.companyName.trim()
      : 'Fictional company';
  const companySummary =
    typeof initialState.companySummary === 'string' &&
    initialState.companySummary.trim()
      ? initialState.companySummary.trim()
      : null;
  const implementationSummary =
    typeof initialState.implementationSummary === 'string' &&
    initialState.implementationSummary.trim()
      ? initialState.implementationSummary.trim()
      : typeof initialState.summary === 'string' && initialState.summary.trim()
        ? initialState.summary.trim()
        : 'No implementation summary was provided on this ticket.';
  const readinessFormula =
    typeof initialState.readinessFormula === 'string' &&
    initialState.readinessFormula.trim()
      ? initialState.readinessFormula.trim()
      : typeof expectedState.readinessFormula === 'string' &&
          expectedState.readinessFormula.trim()
        ? expectedState.readinessFormula.trim()
        : null;

  const [scores, setScores] = useState<
    Record<string, CmmcPracticeScoreValue | ''>
  >(() => Object.fromEntries(practices.map((practice) => [practice.id, ''])));
  const [readinessPercent, setReadinessPercent] = useState('');
  const [gapAnalysis, setGapAnalysis] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): boolean {
    const nextErrors: FormErrors = {};

    if (practices.length === 0) {
      nextErrors.practices =
        'This ticket has no practice IDs configured. Ask an admin to set initial_state.practiceIds.';
    } else {
      const missing = practices.filter((practice) => !scores[practice.id]);
      if (missing.length > 0) {
        nextErrors.practices = `Score every practice (met / partial / not met). Missing: ${missing
          .map((practice) => practice.id)
          .join(', ')}.`;
      }
    }

    const readiness = Number(readinessPercent.trim().replace(/%$/, ''));
    if (
      readinessPercent.trim() === '' ||
      !Number.isFinite(readiness) ||
      readiness < 0 ||
      readiness > 100
    ) {
      nextErrors.readinessPercent =
        'Enter an overall readiness percentage from 0 to 100.';
    }

    const trimmedGap = gapAnalysis.trim();
    if (!trimmedGap) {
      nextErrors.gapAnalysis = 'Gap analysis narrative is required.';
    } else if (trimmedGap.length < minGapAnalysisLength) {
      nextErrors.gapAnalysis = `Gap analysis must be at least ${minGapAnalysisLength} characters.`;
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
      const readiness = Number(readinessPercent.trim().replace(/%$/, ''));
      const practiceScores = practices.map((practice) => ({
        practiceId: practice.id,
        score: scores[practice.id] as CmmcPracticeScoreValue,
      }));

      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cmmc_gap_analysis',
          practiceScores,
          gapAnalysis: gapAnalysis.trim(),
          readinessPercent: readiness,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit gap analysis.');
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
      aria-labelledby="cmmc-gap-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="cmmc-gap-heading" className="text-lg font-semibold">
          CMMC gap analysis
        </h2>
        <Badge variant="outline">CMMC 2.0 Level 2</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{companyName}</CardTitle>
          <CardDescription>
            Review the control implementation summary, score each practice, then
            document gaps and overall readiness.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {companySummary ? (
            <p className="text-muted-foreground whitespace-pre-wrap">
              {companySummary}
            </p>
          ) : null}
          <div>
            <p className="mb-1 font-medium text-foreground">
              Control implementation summary
            </p>
            <p className="whitespace-pre-wrap text-muted-foreground">
              {implementationSummary}
            </p>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Practice scores</CardTitle>
            <CardDescription>
              For each CMMC 2.0 Level 2 practice below, mark whether the company
              evidence indicates met, partial, or not met.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {practices.length === 0 ? (
              <p className="text-sm text-destructive" role="alert">
                No practices configured on this ticket.
              </p>
            ) : (
              practices.map((practice) => (
                <fieldset
                  key={practice.id}
                  className="space-y-2 rounded-md border border-border/70 p-3"
                >
                  <legend className="px-1 text-sm font-medium">
                    {practice.id}
                    {practice.domain ? (
                      <span className="ml-2 font-normal text-muted-foreground">
                        {practice.domain}
                      </span>
                    ) : null}
                  </legend>
                  {practice.title ? (
                    <p className="text-xs text-muted-foreground">
                      {practice.title}
                    </p>
                  ) : null}
                  {practice.implementationSummary ? (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {practice.implementationSummary}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-4">
                    {CMMC_PRACTICE_SCORE_VALUES.map((value) => {
                      const inputId = `${practice.id}-${value}`;
                      return (
                        <label
                          key={value}
                          htmlFor={inputId}
                          className="flex items-center gap-2 text-sm"
                        >
                          <input
                            id={inputId}
                            type="radio"
                            name={`score-${practice.id}`}
                            value={value}
                            checked={scores[practice.id] === value}
                            disabled={readOnly || isSubmitting}
                            onChange={() => {
                              setScores((prev) => ({
                                ...prev,
                                [practice.id]: value,
                              }));
                              setFeedback(null);
                              setScoreStatus(null);
                              setSubmitError(null);
                              if (errors.practices) {
                                setErrors((prev) => {
                                  const next = { ...prev };
                                  delete next.practices;
                                  return next;
                                });
                              }
                            }}
                          />
                          {SCORE_LABELS[value]}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))
            )}
            {errors.practices ? (
              <p role="alert" className="text-sm text-destructive">
                {errors.practices}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Overall readiness</CardTitle>
            <CardDescription>
              {readinessFormula
                ? `Derive readiness from your practice scores using: ${readinessFormula}`
                : "Estimate the company's CMMC Level 2 readiness for this practice subset (0–100%)."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="cmmc-readiness-percent">Readiness percentage</Label>
            <Input
              id="cmmc-readiness-percent"
              type="number"
              min={0}
              max={100}
              step={1}
              value={readinessPercent}
              onChange={(event) => {
                setReadinessPercent(event.target.value);
                setFeedback(null);
                setScoreStatus(null);
                setSubmitError(null);
                if (errors.readinessPercent) {
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.readinessPercent;
                    return next;
                  });
                }
              }}
              placeholder="e.g. 45"
              aria-invalid={errors.readinessPercent ? true : undefined}
              aria-describedby={
                errors.readinessPercent
                  ? 'cmmc-readiness-percent-error'
                  : undefined
              }
              disabled={readOnly || isSubmitting}
              className="max-w-[12rem]"
            />
            {errors.readinessPercent ? (
              <p
                id="cmmc-readiness-percent-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.readinessPercent}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gap analysis</CardTitle>
            <CardDescription>
              Explain gaps (and strengths) relative to the practices you scored.
              Cite practice IDs and concrete control shortfalls from the company
              summary.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="cmmc-gap-analysis">Gap analysis narrative</Label>
            <Textarea
              id="cmmc-gap-analysis"
              value={gapAnalysis}
              onChange={(event) => {
                setGapAnalysis(event.target.value);
                setFeedback(null);
                setScoreStatus(null);
                setSubmitError(null);
                if (errors.gapAnalysis) {
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.gapAnalysis;
                    return next;
                  });
                }
              }}
              rows={10}
              placeholder="For each partial or not-met practice, explain what the company is missing versus the CMMC practice requirement…"
              aria-invalid={errors.gapAnalysis ? true : undefined}
              aria-describedby={
                errors.gapAnalysis
                  ? 'cmmc-gap-analysis-error'
                  : 'cmmc-gap-analysis-hint'
              }
              disabled={readOnly || isSubmitting}
            />
            <p
              id="cmmc-gap-analysis-hint"
              className="text-xs text-muted-foreground"
            >
              Minimum {minGapAnalysisLength} characters. Graded against
              retrieved CMMC practice descriptions from the pinned corpus.
            </p>
            {errors.gapAnalysis ? (
              <p
                id="cmmc-gap-analysis-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.gapAnalysis}
              </p>
            ) : null}
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
          {isSubmitting ? 'Submitting…' : 'Submit gap analysis'}
        </Button>
      </form>
    </section>
  );
}
