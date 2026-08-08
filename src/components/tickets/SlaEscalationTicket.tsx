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
  SLA_ESCALATION_DECISIONS,
  SLA_ESCALATION_DECISION_LABELS,
  SLA_ESCALATION_MIN_JUSTIFICATION_LENGTH,
  type SlaEscalationDecision,
} from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type SlaEscalationTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type FormErrors = Partial<Record<'decision' | 'justification', string>>;

type PolicySection = {
  id: string;
  title: string;
  text: string;
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
  return SLA_ESCALATION_MIN_JUSTIFICATION_LENGTH;
}

function parsePolicySections(
  initialState: Record<string, unknown>
): PolicySection[] {
  const nested = asRecord(initialState.policy);
  const raw = nested.sections ?? initialState.policySections;

  if (Array.isArray(raw)) {
    return raw
      .map((entry, index): PolicySection | null => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return null;
        }
        const record = entry as Record<string, unknown>;
        const text =
          typeof record.text === 'string'
            ? record.text.trim()
            : typeof record.body === 'string'
              ? record.body.trim()
              : '';
        if (!text) return null;
        const id =
          typeof record.id === 'string' && record.id.trim()
            ? record.id.trim()
            : `section-${index + 1}`;
        const title =
          typeof record.title === 'string' && record.title.trim()
            ? record.title.trim()
            : id;
        return { id, title, text };
      })
      .filter((section): section is PolicySection => section !== null);
  }

  const policyText = readString(
    nested,
    ['text', 'body', 'markdown'],
    readString(initialState, ['policyText', 'policy_text'])
  );
  if (policyText) {
    return [{ id: 'policy', title: 'SLA / escalation policy', text: policyText }];
  }

  return [];
}

export function SlaEscalationTicket({
  ticket,
  readOnly = false,
  className,
}: SlaEscalationTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);
  const minJustificationLength = resolveMinJustificationLength(expectedState);
  const policySections = useMemo(
    () => parsePolicySections(initialState),
    [initialState]
  );

  const policyTitle = useMemo(() => {
    const nested = asRecord(initialState.policy);
    return readString(
      nested,
      ['title', 'name'],
      readString(
        initialState,
        ['policyTitle'],
        'Helpdesk SLA and Escalation Policy'
      )
    );
  }, [initialState]);

  const scenario = useMemo(() => {
    const nested = asRecord(
      initialState.scenario ?? initialState.supportScenario
    );
    return {
      title: readString(
        nested,
        ['title'],
        readString(initialState, ['scenarioTitle'], 'Support scenario')
      ),
      summary: readString(
        nested,
        ['summary', 'description'],
        readString(initialState, ['scenarioSummary'], 'See scenario brief.')
      ),
      requester: readString(nested, ['requester'], ''),
      impact: readString(nested, ['impact'], ''),
      symptoms: readString(nested, ['symptoms'], ''),
      timeline: readString(nested, ['timeline'], ''),
      stepsTried: readString(nested, ['stepsTried', 'steps_tried'], ''),
      priorityHint: readString(nested, ['priorityHint', 'priority'], ''),
    };
  }, [initialState]);

  const [decision, setDecision] = useState<SlaEscalationDecision | ''>('');
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

    if (!decision) {
      nextErrors.decision = 'Choose escalate or resolve.';
    }

    const trimmed = justification.trim();
    if (!trimmed) {
      nextErrors.justification =
        'Write a justification that cites the SLA/escalation policy.';
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
    if (!validate() || !decision) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'sla_escalation',
          decision,
          justification: justification.trim(),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit escalation decision.');
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
      aria-labelledby="sla-escalation-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="sla-escalation-heading" className="text-lg font-semibold">
          Escalate or resolve
        </h2>
        <Badge variant="outline">SLA policy decision</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{policyTitle}</CardTitle>
          <CardDescription>
            Use only this policy when deciding. Your justification will be
            graded against the same pinned policy text.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {policySections.length === 0 ? (
            <p className="text-muted-foreground">
              Policy sections are not loaded on this ticket. Ask an admin to
              seed <span className="font-medium">initial_state.policy</span>.
            </p>
          ) : (
            policySections.map((section) => (
              <div key={section.id}>
                <p className="font-medium text-foreground">{section.title}</p>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                  {section.text}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{scenario.title}</CardTitle>
          <CardDescription>
            Apply the policy to this specific support scenario.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="whitespace-pre-wrap text-muted-foreground">
            {scenario.summary}
          </p>
          {scenario.requester ? (
            <p>
              <span className="font-medium text-foreground">Requester: </span>
              <span className="text-muted-foreground">{scenario.requester}</span>
            </p>
          ) : null}
          {scenario.priorityHint ? (
            <p>
              <span className="font-medium text-foreground">Priority hint: </span>
              <span className="text-muted-foreground">
                {scenario.priorityHint}
              </span>
            </p>
          ) : null}
          {scenario.impact ? (
            <div>
              <p className="font-medium text-foreground">Impact</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {scenario.impact}
              </p>
            </div>
          ) : null}
          {scenario.symptoms ? (
            <div>
              <p className="font-medium text-foreground">Symptoms</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {scenario.symptoms}
              </p>
            </div>
          ) : null}
          {scenario.timeline ? (
            <div>
              <p className="font-medium text-foreground">Timeline</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {scenario.timeline}
              </p>
            </div>
          ) : null}
          {scenario.stepsTried ? (
            <div>
              <p className="font-medium text-foreground">Steps already tried</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {scenario.stepsTried}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your decision</CardTitle>
            <CardDescription>
              Choose escalate or resolve, then justify with a policy citation
              and scenario facts (min {minJustificationLength} characters).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Decision</legend>
              <div className="flex flex-wrap gap-3">
                {SLA_ESCALATION_DECISIONS.map((option) => (
                  <label
                    key={option}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm',
                      decision === option
                        ? 'border-foreground bg-muted'
                        : 'border-border'
                    )}
                  >
                    <input
                      type="radio"
                      name="sla-decision"
                      value={option}
                      checked={decision === option}
                      disabled={readOnly || isSubmitting}
                      onChange={() => {
                        clearOutcome();
                        setDecision(option);
                      }}
                    />
                    {SLA_ESCALATION_DECISION_LABELS[option]}
                  </label>
                ))}
              </div>
              {errors.decision ? (
                <p className="text-sm text-destructive" role="alert">
                  {errors.decision}
                </p>
              ) : null}
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="sla-justification">Policy justification</Label>
              <Textarea
                id="sla-justification"
                value={justification}
                disabled={readOnly || isSubmitting}
                onChange={(event) => {
                  clearOutcome();
                  setJustification(event.target.value);
                }}
                rows={6}
                placeholder="Cite the policy section (Tier-1 scope or a mandatory escalate trigger) and connect it to facts from the scenario…"
              />
              <p className="text-xs text-muted-foreground">
                {justification.trim().length}/{minJustificationLength} characters
                minimum
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
              {isSubmitting ? 'Submitting…' : 'Submit decision'}
            </Button>
            {scoreStatus ? (
              <Badge
                variant={
                  scoreStatus === 'resolved' ? 'default' : 'secondary'
                }
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
