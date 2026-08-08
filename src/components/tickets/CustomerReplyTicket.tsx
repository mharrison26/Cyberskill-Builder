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
import { CUSTOMER_REPLY_MIN_REPLY_LENGTH } from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type CustomerReplyTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type FormErrors = {
  reply?: string;
};

type CustomerEmail = {
  from: string;
  to: string;
  subject: string;
  receivedAt: string | null;
  body: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseCustomerEmail(
  initialState: Record<string, unknown>
): CustomerEmail {
  const nested = asRecord(
    initialState.customerEmail ??
      initialState.customer_email ??
      initialState.email
  );

  const from =
    typeof nested.from === 'string' && nested.from.trim()
      ? nested.from.trim()
      : typeof nested.sender === 'string' && nested.sender.trim()
        ? nested.sender.trim()
        : 'Customer';

  const to =
    typeof nested.to === 'string' && nested.to.trim()
      ? nested.to.trim()
      : 'support@company.example';

  const subject =
    typeof nested.subject === 'string' && nested.subject.trim()
      ? nested.subject.trim()
      : typeof initialState.subject === 'string' && initialState.subject.trim()
        ? initialState.subject.trim()
        : '(no subject)';

  const receivedAt =
    typeof nested.receivedAt === 'string' && nested.receivedAt.trim()
      ? nested.receivedAt.trim()
      : typeof nested.date === 'string' && nested.date.trim()
        ? nested.date.trim()
        : null;

  const body =
    typeof nested.body === 'string' && nested.body.trim()
      ? nested.body.trim()
      : typeof nested.text === 'string' && nested.text.trim()
        ? nested.text.trim()
        : 'See scenario brief for the customer email.';

  return { from, to, subject, receivedAt, body };
}

function resolveMinReplyLength(expectedState: Record<string, unknown>): number {
  const value = expectedState.minReplyLength;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return CUSTOMER_REPLY_MIN_REPLY_LENGTH;
}

export function CustomerReplyTicket({
  ticket,
  readOnly = false,
  className,
}: CustomerReplyTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);
  const email = useMemo(() => parseCustomerEmail(initialState), [initialState]);
  const minReplyLength = resolveMinReplyLength(expectedState);

  const workPrompt =
    typeof initialState.prompt === 'string' && initialState.prompt.trim()
      ? initialState.prompt.trim()
      : "Draft a professional reply that acknowledges the customer's frustration, states clear next steps in plain language, and keeps a calm tone.";

  const [reply, setReply] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    const trimmed = reply.trim();
    if (!trimmed) {
      nextErrors.reply = 'A drafted reply is required.';
    } else if (trimmed.length < minReplyLength) {
      nextErrors.reply = `Reply must be at least ${minReplyLength} characters.`;
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
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'customer_reply',
          reply: reply.trim(),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit reply.');
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
      aria-labelledby="customer-reply-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="customer-reply-heading" className="text-lg font-semibold">
          Customer reply
        </h2>
        <Badge variant="outline">De-escalation</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Incoming customer email</CardTitle>
          <CardDescription>
            Read the angry customer message, then draft your reply below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <dl className="grid gap-2 sm:grid-cols-[6rem_1fr]">
            <dt className="text-muted-foreground">From</dt>
            <dd className="font-medium">{email.from}</dd>
            <dt className="text-muted-foreground">To</dt>
            <dd>{email.to}</dd>
            <dt className="text-muted-foreground">Subject</dt>
            <dd className="font-medium">{email.subject}</dd>
            {email.receivedAt ? (
              <>
                <dt className="text-muted-foreground">Received</dt>
                <dd>{email.receivedAt}</dd>
              </>
            ) : null}
          </dl>
          <div
            className="rounded-md border border-border bg-muted/40 px-4 py-3 whitespace-pre-wrap"
            data-testid="customer-email-body"
          >
            {email.body}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your task</CardTitle>
          <CardDescription>{workPrompt}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Graded against a pinned communication rubric: acknowledge
            frustration, state next steps, avoid jargon, professional tone.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Drafted reply</CardTitle>
          <CardDescription>
            Write the email you would send to the customer (body only).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="customer-reply-body">Reply body</Label>
              <Textarea
                id="customer-reply-body"
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                disabled={readOnly || isSubmitting}
                rows={10}
                placeholder="Hi Jordan — I'm sorry you've been locked out…"
                aria-invalid={Boolean(errors.reply)}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {reply.trim().length} / {minReplyLength} characters minimum
                </span>
                {errors.reply ? (
                  <span className="text-destructive">{errors.reply}</span>
                ) : null}
              </div>
            </div>

            {!readOnly ? (
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Submitting…' : 'Submit reply'}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Preview mode — submission disabled.
              </p>
            )}

            {submitError ? (
              <p className="text-sm text-destructive" role="alert">
                {submitError}
              </p>
            ) : null}

            {feedback ? (
              <div
                className={cn(
                  'rounded-md border px-3 py-2 text-sm',
                  scoreStatus === 'resolved'
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'border-amber-500/40 bg-amber-500/10'
                )}
                role="status"
              >
                {scoreStatus ? (
                  <p className="mb-1 font-medium capitalize">
                    {scoreStatus.replace(/_/g, ' ')}
                  </p>
                ) : null}
                <p>{feedback}</p>
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
