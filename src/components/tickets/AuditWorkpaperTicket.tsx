'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AUDIT_WORKPAPER_MIN_FIELD_LENGTH,
  AUDIT_WORKPAPER_MIN_IDENTITY_LENGTH,
} from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type AuditWorkpaperTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type NarrativeFieldKey =
  'objective' | 'procedurePerformed' | 'evidenceObtained' | 'conclusion';

type IdentityFieldKey = 'preparer' | 'reviewer';

type FieldKey = NarrativeFieldKey | IdentityFieldKey;

type FormErrors = Partial<Record<FieldKey, string>>;

const NARRATIVE_FIELD_META: Array<{
  key: NarrativeFieldKey;
  label: string;
  description: string;
  placeholder: string;
  rows: number;
}> = [
  {
    key: 'objective',
    label: 'Objective',
    description:
      'Restate the stated test objective so a reviewer knows what question this workpaper answers.',
    placeholder:
      'e.g. Determine whether terminated user accounts are disabled within 24 hours of the HR effective date…',
    rows: 3,
  },
  {
    key: 'procedurePerformed',
    label: 'Procedure performed',
    description:
      'Describe the concrete steps you executed (population, sample, systems examined, comparisons).',
    placeholder:
      'e.g. Obtained the Q2 HR termination list (n=47). Selected a sample of 15 terminations…',
    rows: 5,
  },
  {
    key: 'evidenceObtained',
    label: 'Evidence obtained',
    description:
      'Identify the artifacts inspected and how they support your conclusion.',
    placeholder:
      'e.g. HR termination export (CSV), IAM account status export dated 2026-07-15, disablement tickets…',
    rows: 4,
  },
  {
    key: 'conclusion',
    label: 'Conclusion',
    description:
      'Answer the stated test objective with a clear opinion and quantify any exceptions.',
    placeholder:
      'e.g. Based on the sample, the control is not operating effectively: 3 of 15 terminations…',
    rows: 5,
  },
];

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
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

function resolveMinFieldLength(expectedState: Record<string, unknown>): number {
  const value = expectedState.minFieldLength;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return AUDIT_WORKPAPER_MIN_FIELD_LENGTH;
}

function resolveMinIdentityLength(
  expectedState: Record<string, unknown>
): number {
  const value = expectedState.minIdentityLength;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return AUDIT_WORKPAPER_MIN_IDENTITY_LENGTH;
}

function resolveMinConclusionLength(
  expectedState: Record<string, unknown>,
  minFieldLength: number
): number {
  const value = expectedState.minConclusionLength;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return minFieldLength;
}

function resolveStatedTestObjective(
  initialState: Record<string, unknown>,
  expectedState: Record<string, unknown>
): string | null {
  return (
    stringField(expectedState, 'testObjective', 'test_objective') ??
    stringField(
      initialState,
      'testObjective',
      'test_objective',
      'statedTestObjective',
      'stated_test_objective',
      'controlTestObjective',
      'control_test_objective'
    )
  );
}

function formatScenarioDetails(
  initialState: Record<string, unknown>
): string[] {
  const lines: string[] = [];
  const scenario = asRecord(
    initialState.scenario ?? initialState.controlTestScenario
  );

  const orderedKeys = [
    'organization',
    'system',
    'policy',
    'population',
    'sample',
    'period',
    'availableEvidence',
    'notes',
  ];

  for (const key of orderedKeys) {
    const value = scenario[key];
    if (typeof value === 'string' && value.trim()) {
      lines.push(value.trim());
    } else if (Array.isArray(value)) {
      const items = value.filter(
        (entry) => typeof entry === 'string'
      ) as string[];
      if (items.length > 0) {
        lines.push(`${key}: ${items.join('; ')}`);
      }
    }
  }

  if (lines.length === 0) {
    for (const [key, value] of Object.entries(scenario)) {
      if (typeof value === 'string' && value.trim()) {
        lines.push(`${key}: ${value.trim()}`);
      }
    }
  }

  return lines;
}

export function AuditWorkpaperTicket({
  ticket,
  readOnly = false,
  className,
}: AuditWorkpaperTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);

  const statedTestObjective = useMemo(
    () => resolveStatedTestObjective(initialState, expectedState),
    [initialState, expectedState]
  );

  const minFieldLength = resolveMinFieldLength(expectedState);
  const minIdentityLength = resolveMinIdentityLength(expectedState);
  const minConclusionLength = resolveMinConclusionLength(
    expectedState,
    minFieldLength
  );

  const controlId =
    stringField(initialState, 'controlId', 'control_id') ??
    stringField(expectedState, 'controlId', 'control_id');
  const controlTitle = stringField(
    initialState,
    'controlTitle',
    'control_title'
  );

  const prompt =
    stringField(initialState, 'prompt') ??
    'Complete the structured workpaper for this control test. Your conclusion will be graded against the stated test objective.';

  const scenarioLines = useMemo(
    () => formatScenarioDetails(initialState),
    [initialState]
  );

  const [objective, setObjective] = useState('');
  const [procedurePerformed, setProcedurePerformed] = useState('');
  const [evidenceObtained, setEvidenceObtained] = useState('');
  const [conclusion, setConclusion] = useState('');
  const [preparer, setPreparer] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const narrativeValues: Record<NarrativeFieldKey, string> = {
    objective,
    procedurePerformed,
    evidenceObtained,
    conclusion,
  };

  const narrativeSetters: Record<NarrativeFieldKey, (value: string) => void> = {
    objective: setObjective,
    procedurePerformed: setProcedurePerformed,
    evidenceObtained: setEvidenceObtained,
    conclusion: setConclusion,
  };

  function validate(): boolean {
    const nextErrors: FormErrors = {};

    for (const meta of NARRATIVE_FIELD_META) {
      const trimmed = narrativeValues[meta.key].trim();
      const min =
        meta.key === 'conclusion' ? minConclusionLength : minFieldLength;
      if (!trimmed) {
        nextErrors[meta.key] = `${meta.label} is required.`;
      } else if (trimmed.length < min) {
        nextErrors[meta.key] =
          `${meta.label} must be at least ${min} characters.`;
      }
    }

    if (!preparer.trim()) {
      nextErrors.preparer = 'Preparer is required.';
    } else if (preparer.trim().length < minIdentityLength) {
      nextErrors.preparer = `Preparer must be at least ${minIdentityLength} characters.`;
    }

    if (!reviewer.trim()) {
      nextErrors.reviewer = 'Reviewer is required.';
    } else if (reviewer.trim().length < minIdentityLength) {
      nextErrors.reviewer = `Reviewer must be at least ${minIdentityLength} characters.`;
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
          type: 'audit_workpaper',
          objective: objective.trim(),
          procedurePerformed: procedurePerformed.trim(),
          evidenceObtained: evidenceObtained.trim(),
          conclusion: conclusion.trim(),
          preparer: preparer.trim(),
          reviewer: reviewer.trim(),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit workpaper.');
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
      aria-labelledby="audit-workpaper-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="audit-workpaper-heading" className="text-lg font-semibold">
          Audit workpaper
        </h2>
        {controlId ? (
          <Badge variant="outline">
            Control {controlId.toUpperCase()}
            {controlTitle ? ` — ${controlTitle}` : ''}
          </Badge>
        ) : null}
        <Badge variant="secondary">Structured workpaper</Badge>
      </div>

      <p className="max-w-prose text-sm text-muted-foreground">{prompt}</p>

      {statedTestObjective ? (
        <div className="rounded-md border border-border bg-muted/30 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Stated test objective
          </p>
          <p className="mt-1 text-sm text-foreground">{statedTestObjective}</p>
        </div>
      ) : (
        <p className="text-sm text-destructive" role="alert">
          This ticket is missing a stated test objective
          (initial_state.testObjective).
        </p>
      )}

      {scenarioLines.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Control test scenario</h3>
          <ul className="max-w-prose list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {scenarioLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-5">
        {NARRATIVE_FIELD_META.map((meta) => {
          const min =
            meta.key === 'conclusion' ? minConclusionLength : minFieldLength;
          return (
            <div key={meta.key} className="space-y-2">
              <Label htmlFor={`workpaper-${meta.key}`}>{meta.label}</Label>
              <Textarea
                id={`workpaper-${meta.key}`}
                name={meta.key}
                rows={meta.rows}
                value={narrativeValues[meta.key]}
                onChange={(event) =>
                  narrativeSetters[meta.key](event.target.value)
                }
                disabled={readOnly || isSubmitting}
                aria-invalid={errors[meta.key] ? true : undefined}
                placeholder={meta.placeholder}
              />
              {errors[meta.key] ? (
                <p className="text-sm text-destructive" role="alert">
                  {errors[meta.key]}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {meta.description} (min {min} chars).
                </p>
              )}
            </div>
          );
        })}

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="workpaper-preparer">Preparer</Label>
            <Input
              id="workpaper-preparer"
              name="preparer"
              value={preparer}
              onChange={(event) => setPreparer(event.target.value)}
              disabled={readOnly || isSubmitting}
              aria-invalid={errors.preparer ? true : undefined}
              placeholder="Your name"
              autoComplete="name"
            />
            {errors.preparer ? (
              <p className="text-sm text-destructive" role="alert">
                {errors.preparer}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Who prepared this workpaper (min {minIdentityLength} chars).
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="workpaper-reviewer">Reviewer</Label>
            <Input
              id="workpaper-reviewer"
              name="reviewer"
              value={reviewer}
              onChange={(event) => setReviewer(event.target.value)}
              disabled={readOnly || isSubmitting}
              aria-invalid={errors.reviewer ? true : undefined}
              placeholder="Reviewer name"
              autoComplete="off"
            />
            {errors.reviewer ? (
              <p className="text-sm text-destructive" role="alert">
                {errors.reviewer}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Who reviewed this workpaper (min {minIdentityLength} chars).
              </p>
            )}
          </div>
        </div>

        {submitError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {submitError}
          </p>
        ) : null}

        {feedback ? (
          <div
            role="status"
            className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
          >
            {scoreStatus ? (
              <p className="mb-1 font-medium capitalize">
                Status: {scoreStatus.replace(/_/g, ' ')}
              </p>
            ) : null}
            <p className="text-muted-foreground">{feedback}</p>
          </div>
        ) : null}

        <Button
          type="submit"
          disabled={readOnly || isSubmitting || !statedTestObjective}
        >
          {isSubmitting ? 'Submitting…' : 'Submit workpaper'}
        </Button>
      </form>
    </section>
  );
}
