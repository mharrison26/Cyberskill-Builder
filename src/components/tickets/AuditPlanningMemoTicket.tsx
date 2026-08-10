'use client';

import { useMemo, useState } from 'react';

import { TrainingFeedbackPanel } from '@/components/feedback/TrainingFeedbackPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  extractTrainingFeedback,
  isTrainingFeedback,
  type TrainingFeedback,
} from '@/lib/feedback';
import { AUDIT_PLANNING_MEMO_MIN_FIELD_LENGTH } from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type AuditPlanningMemoTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type FormErrors = Partial<
  Record<'objective' | 'scope' | 'riskFocus' | 'plannedProcedures', string>
>;

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
  return AUDIT_PLANNING_MEMO_MIN_FIELD_LENGTH;
}

export function AuditPlanningMemoTicket({
  ticket,
  readOnly = false,
  className,
}: AuditPlanningMemoTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);
  const minFieldLength = resolveMinFieldLength(expectedState);

  const prompt = useMemo(() => {
    if (typeof initialState.prompt === 'string' && initialState.prompt.trim()) {
      return initialState.prompt.trim();
    }
    return 'Draft an audit planning memo covering objective, scope, risk focus, and planned procedures for this engagement.';
  }, [initialState.prompt]);

  const scopeSummary = useMemo(() => {
    const scope = asRecord(initialState.engagementScope ?? initialState.scope);
    const parts: string[] = [];
    for (const key of ['company', 'period', 'system'] as const) {
      if (typeof scope[key] === 'string' && scope[key].trim()) {
        parts.push(`${key}: ${scope[key].trim()}`);
      }
    }
    return parts;
  }, [initialState.engagementScope, initialState.scope]);

  const [objective, setObjective] = useState('');
  const [scope, setScope] = useState('');
  const [riskFocus, setRiskFocus] = useState('');
  const [plannedProcedures, setPlannedProcedures] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
  const [trainingFeedback, setTrainingFeedback] =
    useState<TrainingFeedback | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): boolean {
    const next: FormErrors = {};
    const fields: Array<[keyof FormErrors, string, string]> = [
      ['objective', objective, 'Objective'],
      ['scope', scope, 'Scope'],
      ['riskFocus', riskFocus, 'Risk focus'],
      ['plannedProcedures', plannedProcedures, 'Planned procedures'],
    ];
    for (const [key, value, label] of fields) {
      const trimmed = value.trim();
      if (!trimmed) {
        next[key] = `${label} is required.`;
      } else if (trimmed.length < minFieldLength) {
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
    setTrainingFeedback(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'audit_planning_memo',
          objective: objective.trim(),
          scope: scope.trim(),
          riskFocus: riskFocus.trim(),
          plannedProcedures: plannedProcedures.trim(),
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
        structuredResult?: Record<string, unknown>;
        trainingFeedback?: TrainingFeedback;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit planning memo.');
      }
      setScoreStatus(payload.status ?? null);
      setFeedback(payload.feedback ?? 'Submission recorded.');
      setTrainingFeedback(
        (isTrainingFeedback(payload.trainingFeedback)
          ? payload.trainingFeedback
          : null) ??
          extractTrainingFeedback(payload.structuredResult ?? null)
      );
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
      aria-labelledby="audit-planning-memo-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="audit-planning-memo-heading" className="text-lg font-semibold">
          Audit planning memo
        </h2>
        <Badge variant="secondary">PI-02 Stage 1</Badge>
      </div>

      <p className="max-w-prose text-sm text-muted-foreground">{prompt}</p>

      {scopeSummary.length > 0 ? (
        <ul className="list-inside list-disc text-sm text-muted-foreground">
          {scopeSummary.map((line) => (
            <li key={line} className="capitalize">
              {line}
            </li>
          ))}
        </ul>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-5">
        {(
          [
            ['objective', 'Objective', objective, setObjective],
            ['scope', 'Scope', scope, setScope],
            ['riskFocus', 'Risk focus', riskFocus, setRiskFocus],
            [
              'plannedProcedures',
              'Planned procedures',
              plannedProcedures,
              setPlannedProcedures,
            ],
          ] as const
        ).map(([key, label, value, setter]) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={`planning-${key}`}>{label}</Label>
            <Textarea
              id={`planning-${key}`}
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
            {isSubmitting ? 'Submitting…' : 'Submit planning memo'}
          </Button>
        ) : null}

        {submitError ? (
          <p className="text-sm text-destructive" role="alert">
            {submitError}
          </p>
        ) : null}
        {trainingFeedback ? (
          <TrainingFeedbackPanel feedback={trainingFeedback} />
        ) : feedback ? (
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
