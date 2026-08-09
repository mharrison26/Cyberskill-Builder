'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  parseSspCandidateGaps,
  parseSspExcerpt,
} from '@/lib/scoring/sspGapReview';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type SspGapReviewTicketProps = {
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

export function SspGapReviewTicket({
  ticket,
  readOnly = false,
  className,
}: SspGapReviewTicketProps) {
  const initialState = asRecord(ticket.initial_state);

  const excerpt = useMemo(
    () => parseSspExcerpt(initialState),
    [initialState]
  );
  const candidateGaps = useMemo(
    () => parseSspCandidateGaps(initialState),
    [initialState]
  );

  const systemName = readString(
    initialState,
    ['systemName', 'system_name'],
    'Draft information system'
  );
  const sspTitle = readString(
    initialState,
    ['sspTitle', 'ssp_title'],
    'Draft System Security Plan (excerpt)'
  );
  const prompt = readString(
    initialState,
    ['prompt'],
    'Review the draft SSP excerpt and select every quality gap you find. Some checklist items are distractors.'
  );

  const [selectedGaps, setSelectedGaps] = useState<Set<string>>(
    () => new Set()
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function toggleGap(id: string) {
    setSelectedGaps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    setFormError(null);
    setSubmitError(null);
    setFeedback(null);
    setScoreStatus(null);

    if (selectedGaps.size === 0) {
      setFormError('Select at least one gap from the checklist before submitting.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'ssp_gap_review',
          selectedGapIds: Array.from(selectedGaps),
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit SSP gap review.');
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
      aria-labelledby="ssp-gap-review-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="ssp-gap-review-heading" className="text-lg font-semibold">
          SSP gap review
        </h2>
        <Badge variant="secondary">Draft quality check</Badge>
      </div>

      <p className="max-w-prose text-sm text-muted-foreground">{prompt}</p>

      <div className="space-y-4 rounded-lg border border-border bg-muted/20 px-4 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            System
          </p>
          <p className="text-sm font-medium">{systemName}</p>
          <p className="text-sm text-muted-foreground">{sspTitle}</p>
        </div>

        {excerpt?.overview ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              System overview
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{excerpt.overview}</p>
          </div>
        ) : null}

        {excerpt?.roles ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Roles & authorization
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{excerpt.roles}</p>
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-md border border-border bg-background">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Control
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Status
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Responsible role
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Implementation statement
                </th>
              </tr>
            </thead>
            <tbody>
              {(excerpt?.controlImplementations ?? []).map((control) => (
                <tr
                  key={control.controlId}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium">{control.controlId}</div>
                    <div className="text-muted-foreground">{control.title}</div>
                  </td>
                  <td className="px-3 py-2 align-top text-muted-foreground">
                    {control.status}
                  </td>
                  <td className="px-3 py-2 align-top text-muted-foreground">
                    {control.responsibleRole || '—'}
                  </td>
                  <td className="px-3 py-2 align-top text-muted-foreground">
                    {control.narrative || '—'}
                  </td>
                </tr>
              ))}
              {!excerpt?.controlImplementations.length ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    No SSP control statements seeded for this ticket.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">
            Candidate gaps — select all that apply
          </legend>
          <ul className="space-y-2">
            {candidateGaps.map((gap) => (
              <li key={gap.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/30">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selectedGaps.has(gap.id)}
                    onChange={() => toggleGap(gap.id)}
                    disabled={readOnly || isSubmitting}
                    aria-label={gap.label}
                  />
                  <span>
                    <span className="font-medium">{gap.label}</span>
                    {gap.detail ? (
                      <span className="mt-0.5 block text-muted-foreground">
                        {gap.detail}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
            {candidateGaps.length === 0 ? (
              <li className="text-sm text-muted-foreground">
                No candidate gaps seeded for this ticket.
              </li>
            ) : null}
          </ul>
        </fieldset>

        {!readOnly ? (
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Submit gap review'}
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
