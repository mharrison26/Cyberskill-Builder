'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  restoredString,
  useTicketWorkbenchForm,
} from '@/hooks/useTicketWorkbenchForm';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ASSESSMENT_PROCEDURES_MIN_FIELD_LENGTH } from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type AssessmentProceduresTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type FormErrors = {
  examine?: string;
  interview?: string;
  test?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function resolveControlId(
  initialState: Record<string, unknown>,
  expectedState: Record<string, unknown>
): string | null {
  for (const source of [expectedState, initialState]) {
    const value = source.controlId ?? source.control_id;
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function resolveMinFieldLength(expectedState: Record<string, unknown>): number {
  const value = expectedState.minFieldLength;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return ASSESSMENT_PROCEDURES_MIN_FIELD_LENGTH;
}

export function AssessmentProceduresTicket({
  ticket,
  readOnly = false,
  className,
}: AssessmentProceduresTicketProps) {
  const {
    submission,
    formReadOnly,
    hideSubmit,
    lastFeedback,
    lastScoreStatus,
  } = useTicketWorkbenchForm(readOnly);
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);
  const controlId = useMemo(
    () => resolveControlId(initialState, expectedState),
    [initialState, expectedState]
  );
  const minFieldLength = resolveMinFieldLength(expectedState);

  const prompt =
    typeof initialState.prompt === 'string' && initialState.prompt.trim()
      ? initialState.prompt.trim()
      : 'Write SP 800-53A assessment procedures for the assigned control using Examine, Interview, and Test methods.';

  const [examine, setExamine] = useState(() => restoredString(submission, 'examine'));
  const [interview, setInterview] = useState(() => restoredString(submission, 'interview'));
  const [test, setTest] = useState(() => restoredString(submission, 'test'));
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(() => lastFeedback);
  const [scoreStatus, setScoreStatus] = useState<string | null>(() => lastScoreStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    const fields: Array<[keyof FormErrors, string]> = [
      ['examine', examine],
      ['interview', interview],
      ['test', test],
    ];

    for (const [key, value] of fields) {
      const trimmed = value.trim();
      if (!trimmed) {
        nextErrors[key] =
          `${key[0]!.toUpperCase()}${key.slice(1)} procedures are required.`;
      } else if (trimmed.length < minFieldLength) {
        nextErrors[key] =
          `${key[0]!.toUpperCase()}${key.slice(1)} must be at least ${minFieldLength} characters.`;
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (formReadOnly || hideSubmit) return;

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
          type: 'assessment_procedures',
          controlId: controlId ?? undefined,
          examine: examine.trim(),
          interview: interview.trim(),
          test: test.trim(),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? 'Failed to submit assessment procedures.'
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
      aria-labelledby="assessment-procedures-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2
          id="assessment-procedures-heading"
          className="text-lg font-semibold"
        >
          Assessment procedures
        </h2>
        {controlId ? (
          <Badge variant="outline">Control {controlId.toUpperCase()}</Badge>
        ) : (
          <Badge variant="destructive">Missing control ID</Badge>
        )}
        <Badge variant="secondary">SP 800-53A</Badge>
      </div>

      <p className="max-w-prose text-sm text-muted-foreground">{prompt}</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="assessment-examine">Examine</Label>
          <Textarea
            id="assessment-examine"
            name="examine"
            rows={5}
            value={examine}
            onChange={(event) => setExamine(event.target.value)}
            disabled={formReadOnly || isSubmitting}
            aria-invalid={errors.examine ? true : undefined}
            placeholder="Describe what artifacts, configurations, or records you would examine…"
          />
          {errors.examine ? (
            <p className="text-sm text-destructive" role="alert">
              {errors.examine}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Review documentation and system artifacts (min {minFieldLength}{' '}
              chars).
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="assessment-interview">Interview</Label>
          <Textarea
            id="assessment-interview"
            name="interview"
            rows={5}
            value={interview}
            onChange={(event) => setInterview(event.target.value)}
            disabled={formReadOnly || isSubmitting}
            aria-invalid={errors.interview ? true : undefined}
            placeholder="Describe who you would interview and what questions you would ask…"
          />
          {errors.interview ? (
            <p className="text-sm text-destructive" role="alert">
              {errors.interview}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Identify personnel and interview focus (min {minFieldLength}{' '}
              chars).
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="assessment-test">Test</Label>
          <Textarea
            id="assessment-test"
            name="test"
            rows={5}
            value={test}
            onChange={(event) => setTest(event.target.value)}
            disabled={formReadOnly || isSubmitting}
            aria-invalid={errors.test ? true : undefined}
            placeholder="Describe how you would test mechanisms or processes that implement the control…"
          />
          {errors.test ? (
            <p className="text-sm text-destructive" role="alert">
              {errors.test}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Exercise mechanisms and processes (min {minFieldLength} chars).
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

        <Button type="submit" disabled={formReadOnly || isSubmitting || !controlId}>
          {isSubmitting ? 'Submitting…' : 'Submit procedures'}
        </Button>
      </form>
    </section>
  );
}
