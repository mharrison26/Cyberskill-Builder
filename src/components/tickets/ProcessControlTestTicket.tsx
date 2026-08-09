'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  parseProcessControlSampleItems,
  type ProcessControlOutcome,
} from '@/lib/scoring/processControlTest';
import { PROCESS_CONTROL_TEST_MIN_NOTES_LENGTH } from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type ProcessControlTestTicketProps = {
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

export function ProcessControlTestTicket({
  ticket,
  readOnly = false,
  className,
}: ProcessControlTestTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);

  const sampleItems = useMemo(
    () => parseProcessControlSampleItems(initialState),
    [initialState]
  );

  const minNotesLength = useMemo(() => {
    const value = expectedState.minNotesLength;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return Math.floor(value);
    }
    return PROCESS_CONTROL_TEST_MIN_NOTES_LENGTH;
  }, [expectedState.minNotesLength]);

  const prompt =
    typeof initialState.prompt === 'string' && initialState.prompt.trim()
      ? initialState.prompt.trim()
      : 'Review the sample evidence, determine pass/fail, and list exception item IDs.';

  const controlObjective =
    typeof initialState.controlObjective === 'string'
      ? initialState.controlObjective.trim()
      : typeof initialState.control_objective === 'string'
        ? initialState.control_objective.trim()
        : null;

  const attributeKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const item of sampleItems) {
      for (const key of Object.keys(item.attributes)) {
        keys.add(key);
      }
    }
    return Array.from(keys);
  }, [sampleItems]);

  const [controlOutcome, setControlOutcome] =
    useState<ProcessControlOutcome | ''>('');
  const [selectedExceptions, setSelectedExceptions] = useState<Set<string>>(
    () => new Set()
  );
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function toggleException(id: string) {
    setSelectedExceptions((prev) => {
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

    if (controlOutcome !== 'pass' && controlOutcome !== 'fail') {
      setFormError('Select a control outcome (pass or fail).');
      return;
    }
    if (notes.trim().length < minNotesLength) {
      setFormError(`Testing notes must be at least ${minNotesLength} characters.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'process_control_test',
          controlOutcome,
          exceptionItemIds: Array.from(selectedExceptions),
          notes: notes.trim(),
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit control test.');
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
      aria-labelledby="process-control-test-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2
          id="process-control-test-heading"
          className="text-lg font-semibold"
        >
          Process control test
        </h2>
        <Badge variant="secondary">Sample evidence</Badge>
      </div>

      <p className="max-w-prose text-sm text-muted-foreground">{prompt}</p>
      {controlObjective ? (
        <p className="text-sm">
          <span className="font-medium">Control objective: </span>
          {controlObjective}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Exception
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Item
              </th>
              {attributeKeys.map((key) => (
                <th key={key} scope="col" className="px-3 py-2 font-medium">
                  {key.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sampleItems.map((item) => (
              <tr key={item.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 align-top">
                  <input
                    type="checkbox"
                    checked={selectedExceptions.has(item.id)}
                    onChange={() => toggleException(item.id)}
                    disabled={readOnly || isSubmitting}
                    aria-label={`Mark ${item.id} as exception`}
                  />
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="font-medium">{item.id}</div>
                  <div className="text-muted-foreground">{item.label}</div>
                  {item.notes ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {item.notes}
                    </div>
                  ) : null}
                </td>
                {attributeKeys.map((key) => (
                  <td
                    key={key}
                    className="px-3 py-2 align-top text-muted-foreground"
                  >
                    {item.attributes[key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
            {sampleItems.length === 0 ? (
              <tr>
                <td
                  colSpan={2 + attributeKeys.length}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No sample items seeded for this ticket.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Control outcome</legend>
          <div className="flex flex-wrap gap-4">
            {(['pass', 'fail'] as const).map((outcome) => (
              <label key={outcome} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="controlOutcome"
                  value={outcome}
                  checked={controlOutcome === outcome}
                  onChange={() => setControlOutcome(outcome)}
                  disabled={readOnly || isSubmitting}
                />
                <span className="capitalize">{outcome}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <Label htmlFor="process-control-notes">Testing notes</Label>
          <Textarea
            id="process-control-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={readOnly || isSubmitting}
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            Document how you evaluated the sample. Minimum {minNotesLength}{' '}
            characters.
          </p>
        </div>

        {!readOnly ? (
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Submit control test'}
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
