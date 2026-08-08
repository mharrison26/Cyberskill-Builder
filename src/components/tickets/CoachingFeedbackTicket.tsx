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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { COACHING_FEEDBACK_MIN_FIELD_LENGTH } from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type CoachingFeedbackTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type FieldKey = 'strengths' | 'gaps' | 'actionItems' | 'delivery';

type FormErrors = Partial<Record<FieldKey, string>>;

const FIELD_META: Array<{
  key: FieldKey;
  label: string;
  description: string;
  placeholder: string;
  rows: number;
}> = [
  {
    key: 'strengths',
    label: 'Strengths observed',
    description:
      'Cite anything the junior did that was useful — even small wins. Be specific.',
    placeholder:
      'Example: They contacted the user quickly and confirmed the VPN client was involved…',
    rows: 4,
  },
  {
    key: 'gaps',
    label: 'Gaps / missed steps / tone issues',
    description:
      'Point to concrete problems in the notes: missing steps, vague language, or unprofessional tone.',
    placeholder:
      'Quote or paraphrase the notes. Example: “reset stuff / lol / fixed i guess” skips identity verification and verification with the user…',
    rows: 5,
  },
  {
    key: 'actionItems',
    label: 'Actionable coaching items',
    description:
      'Tell the junior exactly what to do on the next ticket (checklist, template, habit).',
    placeholder:
      '1. Document: reproduce → change → verify with user.\n2. Replace slang with professional wording.\n3. …',
    rows: 5,
  },
  {
    key: 'delivery',
    label: 'Respectful delivery',
    description:
      'How you would say this in a 1:1 — firm on quality, respectful to the person.',
    placeholder:
      'Draft the short coaching message you would give the junior…',
    rows: 4,
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
  return COACHING_FEEDBACK_MIN_FIELD_LENGTH;
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

function resolveJuniorNotes(initialState: Record<string, unknown>): string {
  const nested = asRecord(
    initialState.juniorNotes ?? initialState.junior_notes
  );

  const fromNested =
    stringField(nested, 'body', 'text', 'notes') ??
    (typeof initialState.juniorNotes === 'string'
      ? initialState.juniorNotes.trim()
      : null) ??
    stringField(
      initialState,
      'junior_notes',
      'notes',
      'ticketNotes',
      'ticket_notes'
    );

  if (fromNested) return fromNested;

  const notesRaw = initialState.notes;
  if (Array.isArray(notesRaw)) {
    const lines = notesRaw
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (lines.length > 0) return lines.join('\n');
  }

  return 'No junior notes were provided for this ticket.';
}

export function CoachingFeedbackTicket({
  ticket,
  readOnly = false,
  className,
}: CoachingFeedbackTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);
  const minFieldLength = resolveMinFieldLength(expectedState);

  const context = useMemo(() => {
    const ticketCode =
      stringField(initialState, 'ticketCode', 'ticket_code') ?? 'HD-04';
    const title =
      stringField(initialState, 'title') ??
      'Review junior technician ticket notes and write coaching feedback';
    const juniorTech = stringField(
      initialState,
      'juniorTech',
      'junior_tech',
      'juniorName',
      'junior_name'
    );
    const requester = stringField(initialState, 'requester');
    const category = stringField(initialState, 'category');
    const prompt =
      stringField(initialState, 'prompt') ??
      'Read the junior tech’s ticket notes. Write structured coaching feedback that is specific, actionable, and respectful. Grade is coaching quality — not a compliance framework.';
    const juniorNotes = resolveJuniorNotes(initialState);

    return {
      ticketCode,
      title,
      juniorTech,
      requester,
      category,
      prompt,
      juniorNotes,
    };
  }, [initialState]);

  const [fields, setFields] = useState<Record<FieldKey, string>>({
    strengths: '',
    gaps: '',
    actionItems: '',
    delivery: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
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
    if (readOnly) return;

    clearOutcome();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'coaching_feedback',
          strengths: fields.strengths.trim(),
          gaps: fields.gaps.trim(),
          actionItems: fields.actionItems.trim(),
          delivery: fields.delivery.trim(),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? 'Failed to submit coaching feedback.'
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
      aria-labelledby="coaching-feedback-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="coaching-feedback-heading" className="text-lg font-semibold">
          Junior notes coaching review
        </h2>
        <Badge variant="outline">{context.ticketCode}</Badge>
        <Badge variant="secondary">Coaching quality</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{context.title}</CardTitle>
          <CardDescription>{context.prompt}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {context.juniorTech ? (
            <p>
              <span className="font-medium text-foreground">Junior tech: </span>
              <span className="text-muted-foreground">{context.juniorTech}</span>
            </p>
          ) : null}
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
          <div>
            <p className="font-medium text-foreground">
              Junior technician ticket notes
            </p>
            <pre className="mt-2 whitespace-pre-wrap rounded-md border border-border bg-muted/40 px-4 py-3 font-sans text-sm text-muted-foreground">
              {context.juniorNotes}
            </pre>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {FIELD_META.map((meta) => (
          <div key={meta.key} className="space-y-2">
            <Label htmlFor={`coaching-${meta.key}`}>{meta.label}</Label>
            <p className="text-xs text-muted-foreground">{meta.description}</p>
            <Textarea
              id={`coaching-${meta.key}`}
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
              disabled={readOnly || isSubmitting}
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

        <Button type="submit" disabled={readOnly || isSubmitting}>
          {isSubmitting ? 'Submitting…' : 'Submit coaching feedback'}
        </Button>
      </form>
    </section>
  );
}
