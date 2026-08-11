'use client';

import { useMemo, useState } from 'react';

import { CCCERForm } from '@/components/CCCERForm';
import { EvidenceCodeBlock } from '@/components/EvidenceCodeBlock';
import { Badge } from '@/components/ui/badge';
import {
  restoredString,
  useTicketWorkbenchForm,
} from '@/hooks/useTicketWorkbenchForm';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CCCER_MIN_FIELD_LENGTH } from '@/lib/scoring/ticketUi';
import type { CCCERValues, Ticket } from '@/types';
import { cn } from '@/lib/utils';

type CccerExceptionTicketProps = {
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

function resolveMinFieldLength(expectedState: Record<string, unknown>): number {
  const value = expectedState.minFieldLength;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return CCCER_MIN_FIELD_LENGTH;
}

function resolveEvidenceCode(initialState: Record<string, unknown>): string {
  const artifact =
    initialState.evidenceArtifact ?? initialState.evidence_artifact;
  if (typeof artifact === 'string' && artifact.trim()) {
    return artifact.trim();
  }
  if (artifact && typeof artifact === 'object') {
    return JSON.stringify(artifact, null, 2);
  }

  const summary =
    typeof initialState.exceptionSummary === 'string'
      ? initialState.exceptionSummary
      : typeof initialState.exception_summary === 'string'
        ? initialState.exception_summary
        : null;

  const fallback = {
    relatedTicketCode:
      initialState.relatedTicketCode ??
      initialState.related_ticket_code ??
      'AUD-05',
    controlObjective:
      initialState.controlObjective ?? initialState.control_objective ?? null,
    criteriaSource:
      initialState.criteriaSource ?? initialState.criteria_source ?? null,
    exceptionSummary: summary,
    exceptions: initialState.exceptions ?? initialState.exceptionUsers ?? [],
  };

  return JSON.stringify(fallback, null, 2);
}

/**
 * Ticket work UI for CCCER audit-exception write-ups.
 * Reuses ArtifactLabLesson building blocks: EvidenceCodeBlock + CCCERForm (F22).
 */
export function CccerExceptionTicket({
  ticket,
  readOnly = false,
  className,
}: CccerExceptionTicketProps) {
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
  const evidenceCode = useMemo(
    () => resolveEvidenceCode(initialState),
    [initialState]
  );

  const relatedCode =
    typeof initialState.relatedTicketCode === 'string' &&
    initialState.relatedTicketCode.trim()
      ? initialState.relatedTicketCode.trim()
      : typeof initialState.related_ticket_code === 'string' &&
          initialState.related_ticket_code.trim()
        ? initialState.related_ticket_code.trim()
        : 'AUD-05';

  const cccerInitialValues = useMemo(
    () => ({
      condition: restoredString(submission, 'condition'),
      criteria: restoredString(submission, 'criteria'),
      cause: restoredString(submission, 'cause'),
      effect: restoredString(submission, 'effect'),
      recommendation: restoredString(submission, 'recommendation'),
    }),
    [submission]
  );
  const prompt =
    typeof initialState.prompt === 'string' && initialState.prompt.trim()
      ? initialState.prompt.trim()
      : 'Analyze the audit exception evidence and document your finding using Condition, Criteria, Cause, Effect, and Recommendation (CCCER).';

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(() => lastFeedback);
  const [scoreStatus, setScoreStatus] = useState<string | null>(() => lastScoreStatus);

  async function handleSubmit(values: CCCERValues) {
    if (formReadOnly || hideSubmit) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setFeedback(null);
    setScoreStatus(null);

    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cccer',
          condition: values.condition.trim(),
          criteria: values.criteria.trim(),
          cause: values.cause.trim(),
          effect: values.effect.trim(),
          recommendation: values.recommendation.trim(),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit CCCER finding.');
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
      aria-labelledby="cccer-exception-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="cccer-exception-heading" className="text-lg font-semibold">
          Audit exception write-up
        </h2>
        <Badge variant="outline">{relatedCode}</Badge>
        <Badge variant="secondary">CCCER</Badge>
        <Badge variant="outline">IIA / GAO</Badge>
      </div>

      <p className="max-w-prose text-sm text-muted-foreground">{prompt}</p>

      <EvidenceCodeBlock
        code={evidenceCode}
        language="json"
        title="Exception evidence summary"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your finding</CardTitle>
          <CardDescription>
            Analyze the exception evidence above and document your assessment
            using CCCER (same structure as the Artifact Lab finding form).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {readOnly ? (
            <p className="text-sm text-muted-foreground">
              Preview mode — CCCER submission is disabled.
            </p>
          ) : (
            <CCCERForm
              initialValues={cccerInitialValues}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              submitError={submitError}
              submitSuccess={false}
              submitLabel="Submit CCCER finding"
              minLength={minFieldLength}
            />
          )}

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
              {feedback}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
