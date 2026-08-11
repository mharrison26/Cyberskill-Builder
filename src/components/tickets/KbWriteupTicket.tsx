'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import {
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { KB_WRITEUP_MIN_FIELD_LENGTH } from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type KbWriteupTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type FieldKey = 'problem' | 'rootCause' | 'resolutionSteps' | 'preventionTip';

type FormErrors = Partial<Record<FieldKey, string>>;

const FIELD_META: Array<{
  key: FieldKey;
  label: string;
  description: string;
  placeholder: string;
  rows: number;
}> = [
  {
    key: 'problem',
    label: 'Problem',
    description:
      'What the user experienced — symptoms, who was affected, and when it happened.',
    placeholder:
      'Describe the user-visible problem in plain language (who, what failed, under what conditions)…',
    rows: 4,
  },
  {
    key: 'rootCause',
    label: 'Root cause',
    description:
      'The underlying reason, not only the symptom. Explain acronyms on first use.',
    placeholder:
      'Explain the root cause clearly. Expand jargon (e.g. MFA = multi-factor authentication)…',
    rows: 4,
  },
  {
    key: 'resolutionSteps',
    label: 'Resolution steps',
    description:
      'Ordered steps another agent can follow, including how you verified the fix.',
    placeholder: '1. …\n2. …\n3. Verify: …',
    rows: 6,
  },
  {
    key: 'preventionTip',
    label: 'Prevention tip',
    description:
      'A concrete tip that reduces recurrence for users, agents, or system owners.',
    placeholder: 'Give one actionable prevention tip tied to the root cause…',
    rows: 3,
  },
];

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function resolveMinFieldLength(expectedState: Record<string, unknown>): number {
  const value = expectedState.minFieldLength;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return KB_WRITEUP_MIN_FIELD_LENGTH;
}

function stringField(
  record: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function KbWriteupTicket({
  ticket,
  readOnly = false,
  className,
}: KbWriteupTicketProps) {
  const {
    submission,
    formReadOnly,
    hideSubmit,
    lastFeedback,
    lastScoreStatus,
  } = useTicketWorkbenchForm(readOnly);
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);
  const minFieldLength = resolveMinFieldLength(expectedState);

  const context = useMemo(() => {
    const ticketCode =
      stringField(initialState, 'ticketCode', 'ticket_code') ?? 'HD-03';
    const title =
      stringField(initialState, 'title') ??
      'Document the resolved helpdesk issue as a knowledge-base article';
    const requester = stringField(initialState, 'requester');
    const category = stringField(initialState, 'category');
    const resolvedSummary = stringField(
      initialState,
      'resolvedSummary',
      'resolved_summary'
    );
    const symptoms = stringField(initialState, 'symptoms');
    const environment = stringField(initialState, 'environment');
    const prompt =
      stringField(initialState, 'prompt') ??
      'After resolving the ticket, write a reusable KB article: Problem, Root Cause, Resolution Steps, and Prevention Tip. Grade is writing quality (clarity, completeness, jargon explained) — not a compliance framework.';

    const notesRaw =
      initialState.resolutionNotes ?? initialState.resolution_notes;
    let resolutionNotes: string[] = [];
    if (typeof notesRaw === 'string' && notesRaw.trim()) {
      resolutionNotes = notesRaw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    } else if (Array.isArray(notesRaw)) {
      resolutionNotes = notesRaw
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean);
    }

    return {
      ticketCode,
      title,
      requester,
      category,
      resolvedSummary,
      symptoms,
      environment,
      prompt,
      resolutionNotes,
    };
  }, [initialState]);

  const [fields, setFields] = useState<Record<FieldKey, string>>(() => ({
    problem: restoredString(submission, 'problem'),
    rootCause: restoredString(submission, 'rootCause'),
    resolutionSteps: restoredString(submission, 'resolutionSteps'),
    preventionTip: restoredString(submission, 'preventionTip'),
  }));
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(() => lastFeedback);
  const [scoreStatus, setScoreStatus] = useState<string | null>(() => lastScoreStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function clearOutcome() {
    setFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);
  }

  function validate(): boolean {
    const nextErrors: FormErrors = {};

    for (const meta of FIELD_META) {
      const trimmed = fields[meta.key].trim();
      if (!trimmed) {
        nextErrors[meta.key] = `${meta.label} is required.`;
      } else if (trimmed.length < minFieldLength) {
        nextErrors[meta.key] =
          `${meta.label} must be at least ${minFieldLength} characters.`;
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
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
          type: 'kb_writeup',
          problem: fields.problem.trim(),
          rootCause: fields.rootCause.trim(),
          resolutionSteps: fields.resolutionSteps.trim(),
          preventionTip: fields.preventionTip.trim(),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit KB write-up.');
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
      aria-labelledby="kb-writeup-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="kb-writeup-heading" className="text-lg font-semibold">
          Knowledge-base write-up
        </h2>
        <Badge variant="outline">{context.ticketCode}</Badge>
        <Badge variant="secondary">Writing quality</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{context.title}</CardTitle>
          <CardDescription>{context.prompt}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {context.requester ? (
            <p>
              <span className="font-medium text-foreground">Requester: </span>
              <span className="text-muted-foreground">{context.requester}</span>
            </p>
          ) : null}
          {context.category ? (
            <p>
              <span className="font-medium text-foreground">Category: </span>
              <span className="text-muted-foreground">{context.category}</span>
            </p>
          ) : null}
          {context.environment ? (
            <p>
              <span className="font-medium text-foreground">Environment: </span>
              <span className="text-muted-foreground">
                {context.environment}
              </span>
            </p>
          ) : null}
          {context.symptoms ? (
            <div>
              <p className="font-medium text-foreground">Symptoms</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {context.symptoms}
              </p>
            </div>
          ) : null}
          {context.resolvedSummary ? (
            <div>
              <p className="font-medium text-foreground">Resolved summary</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {context.resolvedSummary}
              </p>
            </div>
          ) : null}
          {context.resolutionNotes.length > 0 ? (
            <div>
              <p className="font-medium text-foreground">Agent notes</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                {context.resolutionNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {FIELD_META.map((meta) => (
          <div key={meta.key} className="space-y-2">
            <Label htmlFor={`kb-${meta.key}`}>{meta.label}</Label>
            <p className="text-xs text-muted-foreground">{meta.description}</p>
            <Textarea
              id={`kb-${meta.key}`}
              value={fields[meta.key]}
              onChange={(event) => {
                const value = event.target.value;
                setFields((prev) => ({ ...prev, [meta.key]: value }));
                clearOutcome();
                if (errors[meta.key]) {
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next[meta.key];
                    return next;
                  });
                }
              }}
              rows={meta.rows}
              placeholder={meta.placeholder}
              aria-invalid={errors[meta.key] ? true : undefined}
              disabled={formReadOnly || isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              Minimum {minFieldLength} characters.
            </p>
            {errors[meta.key] ? (
              <p role="alert" className="text-sm text-destructive">
                {errors[meta.key]}
              </p>
            ) : null}
          </div>
        ))}

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

        {!hideSubmit ? (
          <Button type="submit" disabled={formReadOnly || isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Submit KB write-up'}
          </Button>
        ) : null}
      </form>
    </section>
  );
}
