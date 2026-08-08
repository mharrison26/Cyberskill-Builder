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
import { TOOL_WALKTHROUGH_MIN_JUSTIFICATION_LENGTH } from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type ToolWalkthroughTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type FormErrors = {
  riskRegisterId?: string;
  justification?: string;
};

type WalkthroughStep = {
  title?: string;
  body: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseSteps(initialState: Record<string, unknown>): WalkthroughStep[] {
  const raw = initialState.steps;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry): WalkthroughStep | null => {
      if (typeof entry === 'string' && entry.trim()) {
        return { body: entry.trim() };
      }
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const record = entry as Record<string, unknown>;
        const body =
          typeof record.body === 'string'
            ? record.body.trim()
            : typeof record.text === 'string'
              ? record.text.trim()
              : '';
        if (!body) return null;
        const title =
          typeof record.title === 'string' && record.title.trim()
            ? record.title.trim()
            : undefined;
        return { title, body };
      }
      return null;
    })
    .filter((step): step is WalkthroughStep => step !== null);
}

function resolveMinJustificationLength(
  expectedState: Record<string, unknown>
): number {
  const value = expectedState.minJustificationLength;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return TOOL_WALKTHROUGH_MIN_JUSTIFICATION_LENGTH;
}

export function ToolWalkthroughTicket({
  ticket,
  readOnly = false,
  className,
}: ToolWalkthroughTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);
  const steps = useMemo(() => parseSteps(initialState), [initialState]);
  const minJustificationLength = resolveMinJustificationLength(expectedState);

  const toolName =
    typeof initialState.toolName === 'string' && initialState.toolName.trim()
      ? initialState.toolName.trim()
      : 'SimpleRisk';
  const toolUrlFromState =
    typeof initialState.toolUrl === 'string' && initialState.toolUrl.trim()
      ? initialState.toolUrl.trim()
      : null;
  const toolUrlFromEnv =
    typeof process.env.NEXT_PUBLIC_SIMPLERISK_URL === 'string' &&
    process.env.NEXT_PUBLIC_SIMPLERISK_URL.trim()
      ? process.env.NEXT_PUBLIC_SIMPLERISK_URL.trim()
      : null;
  const toolUrl = toolUrlFromState ?? toolUrlFromEnv;
  const toolHint =
    typeof initialState.toolHint === 'string' && initialState.toolHint.trim()
      ? initialState.toolHint.trim()
      : 'Use your self-hosted SimpleRisk instance to log the risk described in the scenario brief.';

  const [riskRegisterId, setRiskRegisterId] = useState('');
  const [justification, setJustification] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    const trimmedId = riskRegisterId.trim();
    if (!trimmedId) {
      nextErrors.riskRegisterId = 'Risk register entry ID is required.';
    }

    const trimmedJustification = justification.trim();
    if (!trimmedJustification) {
      nextErrors.justification = 'Likelihood/impact justification is required.';
    } else if (trimmedJustification.length < minJustificationLength) {
      nextErrors.justification = `Justification must be at least ${minJustificationLength} characters.`;
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
          type: 'tool_walkthrough',
          riskRegisterId: riskRegisterId.trim(),
          justification: justification.trim(),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit walkthrough.');
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
      aria-labelledby="tool-walkthrough-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="tool-walkthrough-heading" className="text-lg font-semibold">
          Tool walkthrough
        </h2>
        <Badge variant="outline">{toolName}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Open {toolName}</CardTitle>
          <CardDescription>{toolHint}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {toolUrl ? (
            <p className="text-sm">
              <a
                href={toolUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Open {toolName}
              </a>
              <span className="text-muted-foreground">
                {' '}
                (opens in a new tab)
              </span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your instructor will provide the URL for the self-hosted
              SimpleRisk instance. Set{' '}
              <code className="text-xs">initial_state.toolUrl</code> on the
              ticket when ready.
            </p>
          )}
        </CardContent>
      </Card>

      {steps.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Walkthrough steps</CardTitle>
            <CardDescription>
              Complete these steps in {toolName}, then submit the risk ID and
              your likelihood/impact justification below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-3 pl-5 text-sm">
              {steps.map((step, index) => (
                <li key={`${index}-${step.title ?? step.body.slice(0, 24)}`}>
                  {step.title ? (
                    <p className="font-medium text-foreground">{step.title}</p>
                  ) : null}
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Risk register entry ID</CardTitle>
            <CardDescription>
              Enter the numeric risk ID (or RISK-n reference) created in
              SimpleRisk.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="ticket-risk-register-id">Risk register ID</Label>
            <Input
              id="ticket-risk-register-id"
              type="text"
              value={riskRegisterId}
              onChange={(event) => {
                setRiskRegisterId(event.target.value);
                setFeedback(null);
                setScoreStatus(null);
                setSubmitError(null);
                if (errors.riskRegisterId) {
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.riskRegisterId;
                    return next;
                  });
                }
              }}
              placeholder="42 or RISK-42"
              aria-invalid={errors.riskRegisterId ? true : undefined}
              aria-describedby={
                errors.riskRegisterId
                  ? 'ticket-risk-register-id-error'
                  : undefined
              }
              disabled={readOnly || isSubmitting}
            />
            {errors.riskRegisterId ? (
              <p
                id="ticket-risk-register-id-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.riskRegisterId}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Likelihood / impact justification
            </CardTitle>
            <CardDescription>
              Explain how you assessed likelihood and impact using
              risk-assessment practice (NIST SP 800-30). Reference concrete
              threat, vulnerability, and harm factors — not labels alone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="ticket-risk-justification">Justification</Label>
            <Textarea
              id="ticket-risk-justification"
              value={justification}
              onChange={(event) => {
                setJustification(event.target.value);
                setFeedback(null);
                setScoreStatus(null);
                setSubmitError(null);
                if (errors.justification) {
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.justification;
                    return next;
                  });
                }
              }}
              rows={8}
              placeholder="Describe likelihood factors (threat capability/intent or non-adversarial frequency, control gaps) and impact (mission, assets, individuals, etc.)…"
              aria-invalid={errors.justification ? true : undefined}
              aria-describedby={
                errors.justification
                  ? 'ticket-risk-justification-error'
                  : 'ticket-risk-justification-hint'
              }
              disabled={readOnly || isSubmitting}
            />
            <p
              id="ticket-risk-justification-hint"
              className="text-xs text-muted-foreground"
            >
              Minimum {minJustificationLength} characters. Graded against
              retrieved SP 800-30 guidance text.
            </p>
            {errors.justification ? (
              <p
                id="ticket-risk-justification-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.justification}
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
          {isSubmitting ? 'Submitting…' : 'Submit walkthrough'}
        </Button>
      </form>
    </section>
  );
}
