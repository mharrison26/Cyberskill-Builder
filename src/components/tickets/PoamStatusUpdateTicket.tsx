'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  POAM_STATUS_UPDATE_STATUSES,
  POAM_STATUS_UPDATE_STATUS_LABELS,
  POAM_STATUS_UPDATE_MIN_JUSTIFICATION_LENGTH,
  parsePoamStatusUpdateEvidence,
  parsePoamStatusUpdateItem,
  type PoamStatusUpdateStatus,
} from '@/lib/scoring/poamStatusUpdate';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type PoamStatusUpdateTicketProps = {
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

export function PoamStatusUpdateTicket({
  ticket,
  readOnly = false,
  className,
}: PoamStatusUpdateTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);

  const poamItem = useMemo(
    () => parsePoamStatusUpdateItem(initialState),
    [initialState]
  );
  const evidence = useMemo(
    () => parsePoamStatusUpdateEvidence(initialState),
    [initialState]
  );

  const minJustificationLength = useMemo(() => {
    const value = expectedState.minJustificationLength;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
    return POAM_STATUS_UPDATE_MIN_JUSTIFICATION_LENGTH;
  }, [expectedState.minJustificationLength]);

  const prompt = readString(
    initialState,
    ['prompt'],
    'Review this mid-remediation POA&M item and update its status. Do not close without verified evidence.'
  );

  const asOfDate = readString(initialState, ['asOfDate', 'as_of_date'], '');

  const [status, setStatus] = useState<PoamStatusUpdateStatus | ''>('');
  const [justification, setJustification] = useState('');
  const [citedEvidenceIds, setCitedEvidenceIds] = useState<Set<string>>(
    () => new Set()
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function toggleEvidence(id: string) {
    setCitedEvidenceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    setFormError(null);
    setSubmitError(null);
    setFeedback(null);
    setScoreStatus(null);

    if (!status) {
      setFormError('Select a status: on track, delayed, or closed.');
      return;
    }
    if (justification.trim().length < minJustificationLength) {
      setFormError(
        `Justification must be at least ${minJustificationLength} characters.`
      );
      return;
    }
    if (status === 'closed' && evidence.length > 0 && citedEvidenceIds.size === 0) {
      setFormError(
        'Closing requires citing at least one evidence item. Closure also requires verification evidence in the scenario.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'poam_status_update',
          status,
          justification: justification.trim(),
          citedEvidenceIds: Array.from(citedEvidenceIds),
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit POA&M status update.');
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
      aria-labelledby="poam-status-update-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2
          id="poam-status-update-heading"
          className="text-lg font-semibold"
        >
          POA&M status update
        </h2>
        <Badge variant="secondary">Mid-remediation</Badge>
        {asOfDate ? (
          <Badge variant="outline">As of {asOfDate}</Badge>
        ) : null}
      </div>

      <p className="max-w-prose text-sm text-muted-foreground">{prompt}</p>

      {poamItem ? (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-sm font-medium">
                {poamItem.controlId
                  ? `${poamItem.controlId.toUpperCase()} — `
                  : ''}
                {poamItem.title ?? poamItem.id}
              </p>
              <p className="text-xs text-muted-foreground">{poamItem.id}</p>
            </div>
            {poamItem.currentStatus ? (
              <Badge variant="outline">
                Current: {poamItem.currentStatus}
              </Badge>
            ) : null}
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {poamItem.owner ? (
              <div>
                <dt className="text-muted-foreground">Owner</dt>
                <dd>{poamItem.owner}</dd>
              </div>
            ) : null}
            {poamItem.scheduledCompletionDate ? (
              <div>
                <dt className="text-muted-foreground">
                  Scheduled completion
                </dt>
                <dd>{poamItem.scheduledCompletionDate}</dd>
              </div>
            ) : null}
          </dl>

          <div>
            <h3 className="mb-1 text-sm font-medium">Weakness</h3>
            <p className="text-sm text-muted-foreground">{poamItem.weakness}</p>
          </div>

          {poamItem.milestones.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className="border-b border-border bg-muted/40">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Milestone
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Due
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {poamItem.milestones.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-3 py-2">{m.description}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {m.dueDate ?? '—'}
                      </td>
                      <td className="px-3 py-2">{m.status ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-destructive">
          This ticket is missing a POA&M item in initial_state.
        </p>
      )}

      {evidence.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Evidence on file</h3>
          <p className="text-xs text-muted-foreground">
            Closure requires provided and verified evidence. Select any items
            you cite if proposing closed.
          </p>
          <ul className="space-y-2">
            {evidence.map((item) => {
              const selected = citedEvidenceIds.has(item.id);
              return (
                <li key={item.id}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2 text-sm',
                      selected && 'border-primary bg-muted/30',
                      readOnly && 'cursor-default'
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected}
                      disabled={readOnly}
                      onChange={() => toggleEvidence(item.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{item.label}</span>
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        <Badge variant="outline">{item.id}</Badge>
                        <Badge
                          variant={item.provided ? 'secondary' : 'outline'}
                        >
                          {item.provided ? 'Provided' : 'Missing'}
                        </Badge>
                        <Badge
                          variant={item.verified ? 'secondary' : 'outline'}
                        >
                          {item.verified ? 'Verified' : 'Unverified'}
                        </Badge>
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset disabled={readOnly || isSubmitting} className="space-y-3">
          <legend className="text-sm font-medium">Updated status</legend>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {POAM_STATUS_UPDATE_STATUSES.map((option) => (
              <label
                key={option}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm',
                  status === option && 'border-primary bg-muted/30',
                  readOnly && 'cursor-default'
                )}
              >
                <input
                  type="radio"
                  name="poam-status"
                  value={option}
                  checked={status === option}
                  onChange={() => {
                    setStatus(option);
                    setFeedback(null);
                    setScoreStatus(null);
                    setSubmitError(null);
                  }}
                />
                {POAM_STATUS_UPDATE_STATUS_LABELS[option]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <Label htmlFor="poam-status-justification">
            Justification ({justification.trim().length}/
            {minJustificationLength} min)
          </Label>
          <Textarea
            id="poam-status-justification"
            value={justification}
            disabled={readOnly || isSubmitting}
            onChange={(event) => {
              setJustification(event.target.value);
              setFeedback(null);
              setScoreStatus(null);
              setSubmitError(null);
            }}
            rows={5}
            placeholder="Cite milestones, dates, and evidence (or missing verification) that support your status decision."
          />
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
          <p
            className={cn(
              'text-sm',
              scoreStatus === 'resolved'
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-amber-800 dark:text-amber-300'
            )}
            role="status"
          >
            {feedback}
          </p>
        ) : null}

        {!readOnly ? (
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Submit status update'}
          </Button>
        ) : null}
      </form>
    </section>
  );
}
