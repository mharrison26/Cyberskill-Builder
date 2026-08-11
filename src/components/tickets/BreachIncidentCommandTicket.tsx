'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  asSubmissionRecord,
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
import {
  BREACH_INCIDENT_COMMAND_MIN_JUSTIFICATION_LENGTH,
  parseBreachIncidentCommandExpectedState,
  parseBreachIncidentFacts,
  parseBreachIncidentStages,
  type BreachDecisionPoint,
} from '@/lib/scoring/breachIncidentCommand';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type BreachIncidentCommandTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type DecisionState = {
  selectedOptionIds: string[];
  selectedOptionId: string;
  justification: string;
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

function emptyDecisionState(): DecisionState {
  return {
    selectedOptionIds: [],
    selectedOptionId: '',
    justification: '',
  };
}

function restoredDecisions(
  submission: Record<string, unknown> | null | undefined,
  decisionPoints: Array<{ id: string; type: string }>
): Record<string, DecisionState> {
  const initial: Record<string, DecisionState> = {};
  const raw = submission?.decisions;
  const saved =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  for (const dp of decisionPoints) {
    const state = saved[dp.id];
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      initial[dp.id] = emptyDecisionState();
      continue;
    }
    const record = state as Record<string, unknown>;
    if (dp.type === 'multi_select') {
      const ids = record.selectedOptionIds;
      initial[dp.id] = {
        selectedOptionIds: Array.isArray(ids)
          ? ids.filter((id): id is string => typeof id === 'string')
          : [],
        selectedOptionId: '',
        justification:
          typeof record.justification === 'string' ? record.justification : '',
      };
    } else {
      initial[dp.id] = {
        selectedOptionIds: [],
        selectedOptionId:
          typeof record.selectedOptionId === 'string'
            ? record.selectedOptionId
            : '',
        justification:
          typeof record.justification === 'string' ? record.justification : '',
      };
    }
  }
  return initial;
}

export function BreachIncidentCommandTicket({
  ticket,
  readOnly = false,
  className,
}: BreachIncidentCommandTicketProps) {
  const {
    submission,
    formReadOnly,
    hideSubmit,
    lastFeedback,
    lastScoreStatus,
  } = useTicketWorkbenchForm(readOnly);
  const restored = asSubmissionRecord(submission);
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);

  const stages = useMemo(
    () => parseBreachIncidentStages(initialState),
    [initialState]
  );
  const incident = useMemo(
    () => parseBreachIncidentFacts(initialState),
    [initialState]
  );
  const minJustificationLength = useMemo(() => {
    const parsed = parseBreachIncidentCommandExpectedState(
      expectedState,
      initialState
    );
    return (
      parsed?.minJustificationLength ??
      BREACH_INCIDENT_COMMAND_MIN_JUSTIFICATION_LENGTH
    );
  }, [expectedState, initialState]);

  const prompt = readString(
    initialState,
    ['prompt'],
    'As ISSM, work the breach through each stage. At every decision point, choose the incident-command action and briefly justify it.'
  );
  const role = readString(initialState, ['role'], 'ISSM');

  const allDecisionPoints = useMemo(
    () => stages.flatMap((s) => s.decisionPoints),
    [stages]
  );

  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [decisions, setDecisions] = useState<Record<string, DecisionState>>(
    () => restoredDecisions(restored, allDecisionPoints)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [scoreFeedback, setScoreFeedback] = useState<string | null>(() => lastFeedback);
  const [scoreStatus, setScoreStatus] = useState<string | null>(() => lastScoreStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeStage = stages[activeStageIndex] ?? null;

  function clearOutcome() {
    setScoreFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);
  }

  function updateDecision(
    decisionPointId: string,
    patch: Partial<DecisionState>
  ) {
    clearOutcome();
    setDecisions((prev) => ({
      ...prev,
      [decisionPointId]: {
        ...(prev[decisionPointId] ?? emptyDecisionState()),
        ...patch,
      },
    }));
    setErrors((prev) => {
      if (!prev[decisionPointId]) return prev;
      const next = { ...prev };
      delete next[decisionPointId];
      return next;
    });
  }

  function toggleMultiOption(decisionPointId: string, optionId: string) {
    const current = decisions[decisionPointId] ?? emptyDecisionState();
    const set = new Set(current.selectedOptionIds);
    if (set.has(optionId)) set.delete(optionId);
    else set.add(optionId);
    updateDecision(decisionPointId, {
      selectedOptionIds: Array.from(set),
    });
  }

  function validateDecisionPoint(dp: BreachDecisionPoint): string | null {
    const state = decisions[dp.id] ?? emptyDecisionState();
    if (dp.type === 'multi_select') {
      if (state.selectedOptionIds.length === 0) {
        return 'Select at least one option (leave distractors unchecked).';
      }
    } else if (!state.selectedOptionId) {
      return 'Select one option.';
    }
    const trimmed = state.justification.trim();
    if (!trimmed) {
      return 'Provide a brief justification for this decision.';
    }
    if (trimmed.length < minJustificationLength) {
      return `Justification must be at least ${minJustificationLength} characters.`;
    }
    return null;
  }

  function validate(): boolean {
    const nextErrors: Record<string, string> = {};
    for (const dp of allDecisionPoints) {
      const err = validateDecisionPoint(dp);
      if (err) nextErrors[dp.id] = err;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      const firstFailedId = Object.keys(nextErrors)[0];
      const stageIdx = stages.findIndex((s) =>
        s.decisionPoints.some((dp) => dp.id === firstFailedId)
      );
      if (stageIdx >= 0) setActiveStageIndex(stageIdx);
      return false;
    }
    return true;
  }

  function buildSubmissionDecisions() {
    const out: Record<
      string,
      | { selectedOptionIds: string[]; justification: string }
      | { selectedOptionId: string; justification: string }
    > = {};
    for (const dp of allDecisionPoints) {
      const state = decisions[dp.id] ?? emptyDecisionState();
      if (dp.type === 'multi_select') {
        out[dp.id] = {
          selectedOptionIds: state.selectedOptionIds,
          justification: state.justification.trim(),
        };
      } else {
        out[dp.id] = {
          selectedOptionId: state.selectedOptionId,
          justification: state.justification.trim(),
        };
      }
    }
    return out;
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
          type: 'breach_incident_command',
          decisions: buildSubmissionDecisions(),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? 'Failed to submit incident-command decisions.'
        );
      }

      setScoreStatus(payload.status ?? null);
      setScoreFeedback(payload.feedback ?? 'Submission recorded.');
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

  function stageCompletionLabel(stageIndex: number): string {
    const stage = stages[stageIndex];
    if (!stage) return '';
    const complete = stage.decisionPoints.every((dp) => {
      const state = decisions[dp.id];
      if (!state) return false;
      const hasSelection =
        dp.type === 'multi_select'
          ? state.selectedOptionIds.length > 0
          : Boolean(state.selectedOptionId);
      return hasSelection && state.justification.trim().length > 0;
    });
    return complete ? 'answered' : 'open';
  }

  return (
    <section
      aria-labelledby="breach-incident-command-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2
          id="breach-incident-command-heading"
          className="text-lg font-semibold"
        >
          Breach incident command
        </h2>
        <Badge variant="secondary">Role: {role}</Badge>
        {incident?.id ? <Badge variant="outline">{incident.id}</Badge> : null}
      </div>

      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
        {prompt}
      </p>

      {incident ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{incident.title}</CardTitle>
            <CardDescription>
              {incident.system}
              {incident.id ? ` · ${incident.id}` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Work each stage in order. Submit once after all decision points are
            complete. Distractors (e.g. premature press notice or declaring
            contained while beaconing remains) will fail the answer key.
          </CardContent>
        </Card>
      ) : null}

      {stages.length > 0 ? (
        <div
          role="tablist"
          aria-label="Incident stages"
          className="flex flex-wrap gap-2"
        >
          {stages.map((stage, index) => {
            const selected = index === activeStageIndex;
            const status = stageCompletionLabel(index);
            return (
              <Button
                key={stage.id}
                type="button"
                role="tab"
                aria-selected={selected}
                variant={selected ? 'default' : 'outline'}
                size="sm"
                disabled={isSubmitting}
                onClick={() => setActiveStageIndex(index)}
                className="gap-2"
              >
                <span>
                  {index + 1}.{' '}
                  {stage.title.replace(/^Stage\s+\d+\s*[—–-]\s*/i, '')}
                </span>
                <Badge
                  variant={status === 'answered' ? 'secondary' : 'outline'}
                  className="font-normal"
                >
                  {status}
                </Badge>
              </Button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No stages seeded for this ticket.
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {activeStage ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{activeStage.title}</CardTitle>
              {activeStage.brief ? (
                <CardDescription className="whitespace-pre-wrap text-sm leading-relaxed">
                  {activeStage.brief}
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-8">
              {activeStage.decisionPoints.map((dp) => {
                const state = decisions[dp.id] ?? emptyDecisionState();
                return (
                  <fieldset key={dp.id} className="space-y-3">
                    <legend className="text-sm font-medium">{dp.prompt}</legend>
                    <ul className="space-y-2">
                      {dp.options.map((option) => {
                        const inputId = `${dp.id}-${option.id}`;
                        const checked =
                          dp.type === 'multi_select'
                            ? state.selectedOptionIds.includes(option.id)
                            : state.selectedOptionId === option.id;
                        return (
                          <li key={option.id}>
                            <label
                              htmlFor={inputId}
                              className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/30"
                            >
                              <input
                                id={inputId}
                                type={
                                  dp.type === 'multi_select'
                                    ? 'checkbox'
                                    : 'radio'
                                }
                                name={
                                  dp.type === 'single_select'
                                    ? dp.id
                                    : undefined
                                }
                                className="mt-1"
                                checked={checked}
                                disabled={formReadOnly || isSubmitting}
                                onChange={() => {
                                  if (dp.type === 'multi_select') {
                                    toggleMultiOption(dp.id, option.id);
                                  } else {
                                    updateDecision(dp.id, {
                                      selectedOptionId: option.id,
                                    });
                                  }
                                }}
                              />
                              <span>
                                <span className="font-medium">
                                  {option.label}
                                </span>
                                {option.detail ? (
                                  <span className="mt-0.5 block text-muted-foreground">
                                    {option.detail}
                                  </span>
                                ) : null}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>

                    <div className="space-y-2">
                      <Label htmlFor={`justification-${dp.id}`}>
                        Justification
                      </Label>
                      <Textarea
                        id={`justification-${dp.id}`}
                        value={state.justification}
                        disabled={formReadOnly || isSubmitting}
                        rows={3}
                        placeholder="Briefly justify this incident-command decision…"
                        onChange={(event) =>
                          updateDecision(dp.id, {
                            justification: event.target.value,
                          })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        {state.justification.trim().length}/
                        {minJustificationLength} characters minimum
                      </p>
                    </div>

                    {errors[dp.id] ? (
                      <p className="text-sm text-destructive" role="alert">
                        {errors[dp.id]}
                      </p>
                    ) : null}
                  </fieldset>
                );
              })}
            </CardContent>
          </Card>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={activeStageIndex <= 0 || isSubmitting}
            onClick={() => setActiveStageIndex((i) => Math.max(0, i - 1))}
          >
            Previous stage
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={activeStageIndex >= stages.length - 1 || isSubmitting}
            onClick={() =>
              setActiveStageIndex((i) => Math.min(stages.length - 1, i + 1))
            }
          >
            Next stage
          </Button>

          {!hideSubmit ? (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? 'Submitting…'
                : 'Submit all incident-command decisions'}
            </Button>
          ) : null}

          {scoreStatus ? (
            <Badge
              variant={scoreStatus === 'resolved' ? 'default' : 'secondary'}
            >
              {scoreStatus.replace(/_/g, ' ')}
            </Badge>
          ) : null}
        </div>

        {submitError ? (
          <p className="text-sm text-destructive" role="alert">
            {submitError}
          </p>
        ) : null}
        {scoreFeedback ? (
          <p
            className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
            role="status"
          >
            {scoreFeedback}
          </p>
        ) : null}
      </form>
    </section>
  );
}
