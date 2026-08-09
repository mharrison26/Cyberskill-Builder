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
import {
  CONTROL_IMPLEMENTATION_ADEQUACY_JUDGMENTS,
  CONTROL_IMPLEMENTATION_ADEQUACY_JUDGMENT_LABELS,
  CONTROL_IMPLEMENTATION_ADEQUACY_MIN_JUSTIFICATION_LENGTH,
  type ControlImplementationAdequacyJudgment,
} from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type ControlImplementationAdequacyTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type FormErrors = Partial<Record<'judgment' | 'justification', string>>;

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readString(
  source: Record<string, unknown>,
  keys: string[],
  fallback = ''
): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

function resolveMinJustificationLength(
  expectedState: Record<string, unknown>
): number {
  const value = expectedState.minJustificationLength;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return CONTROL_IMPLEMENTATION_ADEQUACY_MIN_JUSTIFICATION_LENGTH;
}

export function ControlImplementationAdequacyTicket({
  ticket,
  readOnly = false,
  className,
}: ControlImplementationAdequacyTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);
  const minJustificationLength = resolveMinJustificationLength(expectedState);

  const scenario = useMemo(() => {
    return {
      controlId: readString(
        initialState,
        ['controlId', 'control_id'],
        readString(expectedState, ['controlId', 'control_id'], '—')
      ),
      controlTitle: readString(
        initialState,
        ['controlTitle', 'control_title', 'title'],
        'Control'
      ),
      systemName: readString(
        initialState,
        ['systemName', 'system_name', 'system'],
        'System under review'
      ),
      implementationStatement: readString(
        initialState,
        [
          'implementationStatement',
          'implementation_statement',
          'statement',
          'controlImplementation',
        ],
        ''
      ),
      prompt: readString(
        initialState,
        ['prompt'],
        'Judge whether the implementation statement adequately addresses the control requirements.'
      ),
    };
  }, [expectedState, initialState]);

  const [judgment, setJudgment] =
    useState<ControlImplementationAdequacyJudgment | ''>('');
  const [justification, setJustification] = useState('');
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

    if (!judgment) {
      nextErrors.judgment = 'Choose adequate or inadequate.';
    }

    const trimmed = justification.trim();
    if (!trimmed) {
      nextErrors.justification =
        'Write a justification that cites specific control requirements.';
    } else if (trimmed.length < minJustificationLength) {
      nextErrors.justification = `Justification must be at least ${minJustificationLength} characters.`;
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;

    clearOutcome();
    if (!validate() || !judgment) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'control_implementation_adequacy',
          judgment,
          justification: justification.trim(),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? 'Failed to submit adequacy judgment.'
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
      aria-labelledby="control-implementation-adequacy-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2
          id="control-implementation-adequacy-heading"
          className="text-lg font-semibold"
        >
          Implementation statement review
        </h2>
        <Badge variant="outline">Control adequacy</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-mono tracking-tight">
            {scenario.controlId}
            <span className="ml-2 font-sans text-sm font-normal text-muted-foreground">
              {scenario.controlTitle}
            </span>
          </CardTitle>
          <CardDescription>
            Review the written implementation for{' '}
            <span className="font-medium text-foreground">
              {scenario.systemName}
            </span>
            . Your justification will be graded against the live NIST SP 800-53
            control statement for this ID.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">{scenario.prompt}</p>
          {scenario.implementationStatement ? (
            <div>
              <p className="font-medium text-foreground">
                Implementation statement
              </p>
              <p className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground">
                {scenario.implementationStatement}
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground">
              Implementation statement is not loaded on this ticket. Ask an
              admin to seed{' '}
              <span className="font-medium">
                initial_state.implementationStatement
              </span>
              .
            </p>
          )}
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your judgment</CardTitle>
            <CardDescription>
              Choose adequate or inadequate, then justify with specific control
              requirements (min {minJustificationLength} characters).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Adequacy</legend>
              <div className="flex flex-wrap gap-3">
                {CONTROL_IMPLEMENTATION_ADEQUACY_JUDGMENTS.map((option) => (
                  <label
                    key={option}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm',
                      judgment === option
                        ? 'border-foreground bg-muted'
                        : 'border-border'
                    )}
                  >
                    <input
                      type="radio"
                      name="adequacy-judgment"
                      value={option}
                      checked={judgment === option}
                      disabled={readOnly || isSubmitting}
                      onChange={() => {
                        clearOutcome();
                        setJudgment(option);
                      }}
                    />
                    {CONTROL_IMPLEMENTATION_ADEQUACY_JUDGMENT_LABELS[option]}
                  </label>
                ))}
              </div>
              {errors.judgment ? (
                <p className="text-sm text-destructive" role="alert">
                  {errors.judgment}
                </p>
              ) : null}
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="cia-justification">
                Justification against control requirements
              </Label>
              <Textarea
                id="cia-justification"
                value={justification}
                disabled={readOnly || isSubmitting}
                onChange={(event) => {
                  clearOutcome();
                  setJustification(event.target.value);
                }}
                rows={6}
                placeholder="Cite specific control requirements (e.g. account types, managers, lifecycle actions, reviews, termination notifications) and explain how this statement meets or fails them…"
              />
              <p className="text-xs text-muted-foreground">
                {justification.trim().length}/{minJustificationLength}{' '}
                characters minimum
              </p>
              {errors.justification ? (
                <p className="text-sm text-destructive" role="alert">
                  {errors.justification}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting…' : 'Submit judgment'}
            </Button>
            {scoreStatus ? (
              <Badge
                variant={scoreStatus === 'resolved' ? 'default' : 'secondary'}
              >
                {scoreStatus.replace(/_/g, ' ')}
              </Badge>
            ) : null}
          </div>
        ) : null}

        {submitError ? (
          <p className="text-sm text-destructive" role="alert">
            {submitError}
          </p>
        ) : null}
        {feedback ? (
          <p
            className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
            role="status"
          >
            {feedback}
          </p>
        ) : null}
      </form>
    </section>
  );
}
