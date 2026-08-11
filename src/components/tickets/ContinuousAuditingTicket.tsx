'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  restoredString,
  useTicketWorkbenchForm,
} from '@/hooks/useTicketWorkbenchForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  CONTINUOUS_AUDITING_FREQUENCIES,
  CONTINUOUS_AUDITING_MIN_EXCEPTION_LENGTH,
  CONTINUOUS_AUDITING_MIN_FIELD_LENGTH,
} from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type ContinuousAuditingTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type RequiredFieldKey =
  'controlArea' | 'frequency' | 'dataSource' | 'exceptionHandling';

type OptionalFieldKey =
  'automationMethod' | 'owners' | 'escalation' | 'falsePositiveHandling';

type FieldKey = RequiredFieldKey | OptionalFieldKey;

type FormErrors = Partial<Record<FieldKey, string>>;

const OPTIONAL_FIELD_META: Array<{
  key: OptionalFieldKey;
  label: string;
  description: string;
  placeholder: string;
  rows: number;
}> = [
  {
    key: 'automationMethod',
    label: 'Automation method (optional)',
    description:
      'How the continuous test will run (scheduled query, scripted join, GRC rule, etc.).',
    placeholder:
      'e.g. Month-end SQL job joins BambooHR terminations to Okta disable timestamps…',
    rows: 3,
  },
  {
    key: 'owners',
    label: 'Owners (optional)',
    description: 'Who maintains the analytic vs who remediates exceptions.',
    placeholder:
      'e.g. Internal Audit owns the report; IAM owns remediation tickets…',
    rows: 2,
  },
  {
    key: 'escalation',
    label: 'Escalation (optional)',
    description: 'When overdue or high-risk exceptions escalate and to whom.',
    placeholder:
      'e.g. Open privileged-access exceptions escalate to CISO within 24 hours…',
    rows: 3,
  },
  {
    key: 'falsePositiveHandling',
    label: 'False-positive handling (optional)',
    description:
      'How benign exceptions are documented, suppressed (time-bound), and how rules are tuned.',
    placeholder:
      'e.g. Known contractor grace-period cases require manager attestation and 30-day allow-list…',
    rows: 3,
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

function resolveMinLength(
  expectedState: Record<string, unknown>,
  key: string,
  fallback: number
): number {
  const value = expectedState[key];
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}

function resolveFixedControlArea(
  initialState: Record<string, unknown>,
  expectedState: Record<string, unknown>
): string | null {
  return (
    stringField(expectedState, 'controlArea', 'control_area') ??
    stringField(
      initialState,
      'controlArea',
      'control_area',
      'controlTitle',
      'control_title'
    )
  );
}

function resolveAllowControlAreaSelect(
  initialState: Record<string, unknown>
): boolean {
  return initialState.allowControlAreaSelect === true;
}

function resolveControlAreaOptions(
  initialState: Record<string, unknown>,
  fixedArea: string | null
): string[] {
  const raw =
    initialState.controlAreaOptions ?? initialState.control_area_options;
  if (Array.isArray(raw)) {
    const items = raw
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (items.length > 0) return items;
  }
  return fixedArea ? [fixedArea] : [];
}

function formatScenarioDetails(
  initialState: Record<string, unknown>
): string[] {
  const lines: string[] = [];
  const scenario = asRecord(initialState.scenario ?? initialState.orgScenario);

  const orderedKeys = [
    'organization',
    'controlArea',
    'currentTest',
    'painPoints',
    'availableData',
    'constraints',
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

  const prompt = stringField(initialState, 'prompt');
  if (prompt) {
    lines.push(prompt);
  }

  return lines;
}

export function ContinuousAuditingTicket({
  ticket,
  readOnly = false,
  className,
}: ContinuousAuditingTicketProps) {
  const {
    submission,
    formReadOnly,
    hideSubmit,
    lastFeedback,
    lastScoreStatus,
  } = useTicketWorkbenchForm(readOnly);
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);

  const fixedControlArea = useMemo(
    () => resolveFixedControlArea(initialState, expectedState),
    [initialState, expectedState]
  );
  const allowSelect = resolveAllowControlAreaSelect(initialState);
  const controlAreaOptions = useMemo(
    () => resolveControlAreaOptions(initialState, fixedControlArea),
    [initialState, fixedControlArea]
  );

  const minFieldLength = resolveMinLength(
    expectedState,
    'minFieldLength',
    CONTINUOUS_AUDITING_MIN_FIELD_LENGTH
  );
  const minExceptionLength = resolveMinLength(
    expectedState,
    'minExceptionLength',
    CONTINUOUS_AUDITING_MIN_EXCEPTION_LENGTH
  );

  const scenarioLines = useMemo(
    () => formatScenarioDetails(initialState),
    [initialState]
  );

  const [controlArea, setControlArea] = useState(
    () =>
      restoredString(submission, 'controlArea') ||
      fixedControlArea ||
      controlAreaOptions[0] ||
      ''
  );
  const [frequency, setFrequency] = useState(() =>
    restoredString(submission, 'frequency')
  );
  const [frequencyNote, setFrequencyNote] = useState(() =>
    restoredString(submission, 'frequencyNote')
  );
  const [dataSource, setDataSource] = useState(() =>
    restoredString(submission, 'dataSource')
  );
  const [exceptionHandling, setExceptionHandling] = useState(() =>
    restoredString(submission, 'exceptionHandling')
  );
  const [optionalFields, setOptionalFields] = useState<
    Record<OptionalFieldKey, string>
  >(() => ({
    automationMethod: restoredString(submission, 'automationMethod'),
    owners: restoredString(submission, 'owners'),
    escalation: restoredString(submission, 'escalation'),
    falsePositiveHandling: restoredString(submission, 'falsePositiveHandling'),
  }));
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(() => lastFeedback);
  const [scoreStatus, setScoreStatus] = useState<string | null>(
    () => lastScoreStatus
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  function clearStatus() {
    setFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);
  }

  function validate(): boolean {
    const nextErrors: FormErrors = {};

    if (!controlArea.trim()) {
      nextErrors.controlArea = 'Control area is required.';
    }

    const frequencyText = [frequency.trim(), frequencyNote.trim()]
      .filter(Boolean)
      .join(' — ');
    if (!frequency.trim()) {
      nextErrors.frequency = 'Select or describe a frequency.';
    } else if (frequencyText.length < minFieldLength) {
      nextErrors.frequency = `Frequency (plus note) must be at least ${minFieldLength} characters. Add a short rationale.`;
    }

    if (!dataSource.trim()) {
      nextErrors.dataSource = 'Data source is required.';
    } else if (dataSource.trim().length < minFieldLength) {
      nextErrors.dataSource = `Must be at least ${minFieldLength} characters.`;
    }

    if (!exceptionHandling.trim()) {
      nextErrors.exceptionHandling = 'Exception-handling process is required.';
    } else if (exceptionHandling.trim().length < minExceptionLength) {
      nextErrors.exceptionHandling = `Must be at least ${minExceptionLength} characters.`;
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (formReadOnly || hideSubmit) return;

    clearStatus();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const frequencyText = [frequency.trim(), frequencyNote.trim()]
        .filter(Boolean)
        .join(' — ');

      const body: Record<string, string> = {
        type: 'continuous_auditing',
        controlArea: controlArea.trim(),
        frequency: frequencyText,
        dataSource: dataSource.trim(),
        exceptionHandling: exceptionHandling.trim(),
      };

      for (const [key, value] of Object.entries(optionalFields)) {
        const trimmed = value.trim();
        if (trimmed) {
          body[key] = trimmed;
        }
      }

      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? 'Failed to submit continuous auditing design.'
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

  const controlAreaLocked = Boolean(fixedControlArea) && !allowSelect;

  return (
    <section
      aria-labelledby="continuous-auditing-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="continuous-auditing-heading" className="text-lg font-semibold">
          Continuous auditing design
        </h2>
        <Badge variant="outline">Single control area</Badge>
      </div>

      <div className="space-y-2 rounded-md border border-border bg-muted/30 px-4 py-3">
        <p className="text-sm font-medium">Scenario</p>
        {scenarioLines.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {scenarioLines.map((line) => (
              <li key={line} className="whitespace-pre-wrap">
                {line}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Design a continuous auditing approach for one control area. Graded
            against pinned continuous auditing guidance (frequency, data source,
            exception handling).
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="ca-control-area">Control area</Label>
          {controlAreaLocked ? (
            <Input
              id="ca-control-area"
              value={controlArea}
              readOnly
              disabled={formReadOnly || isSubmitting}
            />
          ) : controlAreaOptions.length > 1 || allowSelect ? (
            <select
              id="ca-control-area"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={controlArea}
              onChange={(event) => {
                setControlArea(event.target.value);
                clearStatus();
                if (errors.controlArea) {
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.controlArea;
                    return next;
                  });
                }
              }}
              disabled={formReadOnly || isSubmitting}
              aria-invalid={errors.controlArea ? true : undefined}
            >
              <option value="">Select a control area…</option>
              {controlAreaOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <Input
              id="ca-control-area"
              value={controlArea}
              onChange={(event) => {
                setControlArea(event.target.value);
                clearStatus();
              }}
              placeholder="e.g. Timely access revocation"
              disabled={formReadOnly || isSubmitting}
              aria-invalid={errors.controlArea ? true : undefined}
            />
          )}
          {errors.controlArea ? (
            <p role="alert" className="text-sm text-destructive">
              {errors.controlArea}
            </p>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="ca-frequency">Frequency</Label>
            <select
              id="ca-frequency"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={frequency}
              onChange={(event) => {
                setFrequency(event.target.value);
                clearStatus();
                if (errors.frequency) {
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.frequency;
                    return next;
                  });
                }
              }}
              disabled={formReadOnly || isSubmitting}
              aria-invalid={errors.frequency ? true : undefined}
            >
              <option value="">Select frequency…</option>
              {CONTINUOUS_AUDITING_FREQUENCIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ca-frequency-note">Frequency rationale</Label>
            <Textarea
              id="ca-frequency-note"
              value={frequencyNote}
              onChange={(event) => {
                setFrequencyNote(event.target.value);
                clearStatus();
              }}
              rows={3}
              placeholder="Why this cadence fits the control risk (vs annual manual testing)…"
              disabled={formReadOnly || isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              Frequency + rationale must total at least {minFieldLength}{' '}
              characters.
            </p>
          </div>
          {errors.frequency ? (
            <p role="alert" className="text-sm text-destructive">
              {errors.frequency}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="ca-data-source">Data source</Label>
          <Textarea
            id="ca-data-source"
            value={dataSource}
            onChange={(event) => {
              setDataSource(event.target.value);
              clearStatus();
              if (errors.dataSource) {
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.dataSource;
                  return next;
                });
              }
            }}
            rows={4}
            placeholder="Name systems, fields, and how the population is obtained (API, export, log join)…"
            disabled={formReadOnly || isSubmitting}
            aria-invalid={errors.dataSource ? true : undefined}
          />
          <p className="text-xs text-muted-foreground">
            Minimum {minFieldLength} characters.
          </p>
          {errors.dataSource ? (
            <p role="alert" className="text-sm text-destructive">
              {errors.dataSource}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="ca-exception-handling">
            Exception-handling process
          </Label>
          <Textarea
            id="ca-exception-handling"
            value={exceptionHandling}
            onChange={(event) => {
              setExceptionHandling(event.target.value);
              clearStatus();
              if (errors.exceptionHandling) {
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.exceptionHandling;
                  return next;
                });
              }
            }}
            rows={6}
            placeholder="Who receives exceptions, triage SLAs, investigation steps, remediation evidence, and closure…"
            disabled={formReadOnly || isSubmitting}
            aria-invalid={errors.exceptionHandling ? true : undefined}
          />
          <p className="text-xs text-muted-foreground">
            Minimum {minExceptionLength} characters. Graded against pinned
            continuous auditing guidance.
          </p>
          {errors.exceptionHandling ? (
            <p role="alert" className="text-sm text-destructive">
              {errors.exceptionHandling}
            </p>
          ) : null}
        </div>

        <div className="space-y-5 border-t border-border pt-4">
          <p className="text-sm font-medium text-muted-foreground">
            Optional design details
          </p>
          {OPTIONAL_FIELD_META.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={`ca-${field.key}`}>{field.label}</Label>
              <p className="text-xs text-muted-foreground">
                {field.description}
              </p>
              <Textarea
                id={`ca-${field.key}`}
                value={optionalFields[field.key]}
                onChange={(event) => {
                  const value = event.target.value;
                  setOptionalFields((prev) => ({
                    ...prev,
                    [field.key]: value,
                  }));
                  clearStatus();
                }}
                rows={field.rows}
                placeholder={field.placeholder}
                disabled={formReadOnly || isSubmitting}
              />
            </div>
          ))}
        </div>

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

        {!hideSubmit ? (
          <Button type="submit" disabled={formReadOnly || isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Submit continuous auditing design'}
          </Button>
        ) : null}
      </form>
    </section>
  );
}
