'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FINDINGS_SUMMARY_MIN_FIELD_LENGTH } from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type FindingsSummaryTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type FormErrors = Partial<
  Record<'executiveSummary' | 'findingsDetail' | 'recommendations', string>
>;

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function FindingsSummaryTicket({
  ticket,
  readOnly = false,
  className,
}: FindingsSummaryTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);

  const minFieldLength = useMemo(() => {
    const value = expectedState.minFieldLength;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
    return FINDINGS_SUMMARY_MIN_FIELD_LENGTH;
  }, [expectedState.minFieldLength]);

  const prompt =
    typeof initialState.prompt === 'string' && initialState.prompt.trim()
      ? initialState.prompt.trim()
      : 'Compile an engagement findings summary from the prior control-test outcomes.';

  const rollup = useMemo(() => {
    const raw =
      initialState.priorStageOutcomes ??
      initialState.prior_stage_outcomes ??
      initialState.rollupContext ??
      initialState.rollup;
    if (!Array.isArray(raw))
      return [] as Array<{ title: string; detail: string }>;
    return raw
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item))
          return null;
        const rec = item as Record<string, unknown>;
        const title =
          typeof rec.title === 'string'
            ? rec.title.trim()
            : typeof rec.control === 'string'
              ? rec.control.trim()
              : '';
        const detail =
          typeof rec.detail === 'string'
            ? rec.detail.trim()
            : typeof rec.summary === 'string'
              ? rec.summary.trim()
              : typeof rec.outcome === 'string'
                ? rec.outcome.trim()
                : '';
        if (!title && !detail) return null;
        return { title: title || 'Finding', detail };
      })
      .filter((item): item is { title: string; detail: string } =>
        Boolean(item)
      );
  }, [initialState]);

  const [executiveSummary, setExecutiveSummary] = useState('');
  const [findingsDetail, setFindingsDetail] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): boolean {
    const next: FormErrors = {};
    const fields: Array<[keyof FormErrors, string, string]> = [
      ['executiveSummary', executiveSummary, 'Executive summary'],
      ['findingsDetail', findingsDetail, 'Findings detail'],
      ['recommendations', recommendations, 'Recommendations'],
    ];
    for (const [key, value, label] of fields) {
      const trimmed = value.trim();
      if (!trimmed) next[key] = `${label} is required.`;
      else if (trimmed.length < minFieldLength) {
        next[key] = `${label} must be at least ${minFieldLength} characters.`;
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
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
          type: 'findings_summary',
          executiveSummary: executiveSummary.trim(),
          findingsDetail: findingsDetail.trim(),
          recommendations: recommendations.trim(),
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit findings summary.');
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
      aria-labelledby="findings-summary-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="findings-summary-heading" className="text-lg font-semibold">
          Findings summary
        </h2>
        <Badge variant="secondary">PI-02 Final stage</Badge>
      </div>

      <p className="max-w-prose text-sm text-muted-foreground">{prompt}</p>

      {rollup.length > 0 ? (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <h3 className="text-sm font-medium">
            Prior stage outcomes (context)
          </h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {rollup.map((item) => (
              <li key={`${item.title}-${item.detail.slice(0, 24)}`}>
                <span className="font-medium text-foreground">
                  {item.title}:{' '}
                </span>
                {item.detail}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-5">
        {(
          [
            [
              'executiveSummary',
              'Executive summary',
              executiveSummary,
              setExecutiveSummary,
            ],
            [
              'findingsDetail',
              'Findings detail',
              findingsDetail,
              setFindingsDetail,
            ],
            [
              'recommendations',
              'Recommendations',
              recommendations,
              setRecommendations,
            ],
          ] as const
        ).map(([key, label, value, setter]) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={`findings-${key}`}>{label}</Label>
            <Textarea
              id={`findings-${key}`}
              value={value}
              onChange={(e) => setter(e.target.value)}
              disabled={readOnly || isSubmitting}
              rows={4}
              aria-invalid={Boolean(errors[key])}
            />
            {errors[key] ? (
              <p className="text-sm text-destructive">{errors[key]}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Minimum {minFieldLength} characters.
              </p>
            )}
          </div>
        ))}

        {!readOnly ? (
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Submit findings summary'}
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
            <p className="mt-1 text-muted-foreground">{feedback}</p>
          </div>
        ) : null}
      </form>
    </section>
  );
}
