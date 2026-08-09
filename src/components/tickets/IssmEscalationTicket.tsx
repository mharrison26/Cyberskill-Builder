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
  ISSM_ESCALATION_DECISIONS,
  ISSM_ESCALATION_DECISION_LABELS,
  ISSM_ESCALATION_MIN_MEMO_LENGTH,
  type IssmEscalationDecision,
} from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type IssmEscalationTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type FormErrors = Partial<Record<'decision' | 'memo', string>>;

type AffectedSystem = {
  id: string;
  name: string;
  isso: string;
  impactLevel: string;
  notes: string;
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

function resolveMinMemoLength(expectedState: Record<string, unknown>): number {
  const value =
    expectedState.minMemoLength ?? expectedState.minJustificationLength;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return ISSM_ESCALATION_MIN_MEMO_LENGTH;
}

function parseAffectedSystems(
  scenario: Record<string, unknown>
): AffectedSystem[] {
  const raw = scenario.affectedSystems ?? scenario.systems;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry, index): AffectedSystem | null => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const name = readString(record, ['name', 'system', 'title']);
      if (!name) return null;
      return {
        id:
          typeof record.id === 'string' && record.id.trim()
            ? record.id.trim()
            : `system-${index + 1}`,
        name,
        isso: readString(record, ['isso', 'issoName', 'owner']),
        impactLevel: readString(record, [
          'impactLevel',
          'fips199',
          'categorization',
        ]),
        notes: readString(record, ['notes', 'summary', 'description']),
      };
    })
    .filter((system): system is AffectedSystem => system !== null);
}

export function IssmEscalationTicket({
  ticket,
  readOnly = false,
  className,
}: IssmEscalationTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);
  const minMemoLength = resolveMinMemoLength(expectedState);

  const prompt = readString(
    initialState,
    ['prompt'],
    'Decide whether this risk requires ISSM-level escalation or can be handled at ISSO level, then draft the memo or non-escalation rationale.'
  );

  const scenario = useMemo(() => {
    const nested = asRecord(
      initialState.scenario ?? initialState.riskScenario
    );
    return {
      title: readString(
        nested,
        ['title'],
        readString(initialState, ['scenarioTitle'], 'Cross-system risk scenario')
      ),
      summary: readString(
        nested,
        ['summary', 'description'],
        readString(initialState, ['scenarioSummary'], 'See scenario brief.')
      ),
      sharedDependency: readString(nested, [
        'sharedDependency',
        'shared_dependency',
        'dependency',
      ]),
      impact: readString(nested, ['impact'], ''),
      resourceNeeds: readString(nested, [
        'resourceNeeds',
        'resource_needs',
        'resources',
      ]),
      residualRisk: readString(nested, ['residualRisk', 'residual_risk'], ''),
      conflictingPriorities: readString(
        nested,
        ['conflictingPriorities', 'conflicting_priorities'],
        ''
      ),
      timeline: readString(nested, ['timeline'], ''),
      affectedSystems: parseAffectedSystems(nested),
    };
  }, [initialState]);

  const [decision, setDecision] = useState<IssmEscalationDecision | ''>('');
  const [memo, setMemo] = useState('');
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
      nextErrors.decision = 'Choose escalate to ISSM or handle at ISSO level.';
    }

    const trimmed = memo.trim();
    if (!trimmed) {
      nextErrors.memo =
        'Draft an escalation memo or non-escalation rationale grounded in the criteria.';
    } else if (trimmed.length < minMemoLength) {
      nextErrors.memo = `Memo must be at least ${minMemoLength} characters.`;
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
          type: 'issm_escalation',
          decision,
          memo: memo.trim(),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? 'Failed to submit ISSM escalation decision.'
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

  const memoLabel =
    decision === 'handle_at_isso'
      ? 'Non-escalation rationale'
      : 'Escalation memo';

  return (
    <section
      aria-labelledby="issm-escalation-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="issm-escalation-heading" className="text-lg font-semibold">
          ISSO → ISSM escalation
        </h2>
        <Badge variant="outline">Cross-system risk decision</Badge>
      </div>

      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
        {prompt}
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{scenario.title}</CardTitle>
          <CardDescription>
            Apply ISSM escalation criteria to this multi-system risk. Your memo
            will be graded against pinned escalation-criteria guidance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="whitespace-pre-wrap text-muted-foreground">
            {scenario.summary}
          </p>
          {scenario.sharedDependency ? (
            <p>
              <span className="font-medium text-foreground">
                Shared dependency:{' '}
              </span>
              <span className="text-muted-foreground">
                {scenario.sharedDependency}
              </span>
            </p>
          ) : null}
          {scenario.affectedSystems.length > 0 ? (
            <div className="space-y-2">
              <p className="font-medium text-foreground">Affected systems</p>
              <ul className="space-y-2">
                {scenario.affectedSystems.map((system) => (
                  <li
                    key={system.id}
                    className="rounded-md border border-border px-3 py-2"
                  >
                    <p className="font-medium text-foreground">{system.name}</p>
                    <p className="text-muted-foreground">
                      {[
                        system.isso ? `ISSO: ${system.isso}` : null,
                        system.impactLevel
                          ? `FIPS 199: ${system.impactLevel}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {system.notes ? (
                      <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                        {system.notes}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {scenario.impact ? (
            <div>
              <p className="font-medium text-foreground">Impact</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {scenario.impact}
              </p>
            </div>
          ) : null}
          {scenario.resourceNeeds ? (
            <div>
              <p className="font-medium text-foreground">Resource / authority</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {scenario.resourceNeeds}
              </p>
            </div>
          ) : null}
          {scenario.residualRisk ? (
            <div>
              <p className="font-medium text-foreground">Residual risk</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {scenario.residualRisk}
              </p>
            </div>
          ) : null}
          {scenario.conflictingPriorities ? (
            <div>
              <p className="font-medium text-foreground">
                Conflicting priorities
              </p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {scenario.conflictingPriorities}
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
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your decision</CardTitle>
            <CardDescription>
              Choose escalate to ISSM or handle at ISSO level, then draft the
              memo (min {minMemoLength} characters).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Decision</legend>
              <div className="flex flex-wrap gap-3">
                {ISSM_ESCALATION_DECISIONS.map((option) => (
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
                      name="issm-decision"
                      value={option}
                      checked={decision === option}
                      disabled={readOnly || isSubmitting}
                      onChange={() => {
                        clearOutcome();
                        setDecision(option);
                      }}
                    />
                    {ISSM_ESCALATION_DECISION_LABELS[option]}
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
              <Label htmlFor="issm-memo">{memoLabel}</Label>
              <Textarea
                id="issm-memo"
                value={memo}
                disabled={readOnly || isSubmitting}
                onChange={(event) => {
                  clearOutcome();
                  setMemo(event.target.value);
                }}
                rows={8}
                placeholder="Name affected systems and ISSOs, cross-system impact, resource/authority limits, residual risk, interim controls, and the decision requested (or why ISSO-level handling is sufficient)…"
              />
              <p className="text-xs text-muted-foreground">
                {memo.trim().length}/{minMemoLength} characters minimum
              </p>
              {errors.memo ? (
                <p className="text-sm text-destructive" role="alert">
                  {errors.memo}
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
