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
import { CONFIG_FAULT_DIAGNOSIS_MIN_IMPACT_LENGTH } from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type ConfigFaultDiagnosisTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type FormErrors = Partial<
  Record<'faultLineNumber' | 'impactExplanation', string>
>;

type NumberedLine = {
  lineNumber: number;
  text: string;
  selectable: boolean;
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

function resolveMinImpactLength(
  expectedState: Record<string, unknown>
): number {
  const value =
    expectedState.minImpactLength ?? expectedState.min_impact_length;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return CONFIG_FAULT_DIAGNOSIS_MIN_IMPACT_LENGTH;
}

function buildNumberedLines(configText: string): NumberedLine[] {
  const lines = configText.replace(/\r\n/g, '\n').split('\n');
  return lines.map((text, index) => {
    const lineNumber = index + 1;
    const selectable = text.trim().length > 0;
    return { lineNumber, text, selectable };
  });
}

export function ConfigFaultDiagnosisTicket({
  ticket,
  readOnly = false,
  className,
}: ConfigFaultDiagnosisTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);
  const minImpactLength = resolveMinImpactLength(expectedState);

  const configFileName = readString(
    initialState,
    ['configFileName', 'config_file_name', 'filename', 'fileName'],
    'named.conf'
  );

  const configKind = readString(
    initialState,
    ['configKind', 'config_kind'],
    configFileName
  );

  const prompt = readString(
    initialState,
    ['prompt'],
    'Review the read-only config snippet, identify the specific misconfigured line, and explain the operational impact.'
  );

  const configText = useMemo(() => {
    const raw = readString(
      initialState,
      ['configText', 'config_text', 'config', 'snippet'],
      ''
    );
    return raw.replace(/\r\n/g, '\n');
  }, [initialState]);

  const numberedLines = useMemo(
    () => buildNumberedLines(configText),
    [configText]
  );

  const selectableLines = useMemo(
    () => numberedLines.filter((line) => line.selectable),
    [numberedLines]
  );

  const displayBlock = useMemo(() => {
    if (numberedLines.length === 0) {
      return 'No config snippet was seeded for this ticket.';
    }
    const width = String(numberedLines.length).length;
    return numberedLines
      .map(
        (line) =>
          `${String(line.lineNumber).padStart(width, ' ')} | ${line.text}`
      )
      .join('\n');
  }, [numberedLines]);

  const [faultLineNumber, setFaultLineNumber] = useState('');
  const [impactExplanation, setImpactExplanation] = useState('');
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
    const line = Number.parseInt(faultLineNumber, 10);
    if (!faultLineNumber || !Number.isFinite(line) || line < 1) {
      nextErrors.faultLineNumber =
        'Select the line number of the misconfigured directive.';
    }

    const trimmed = impactExplanation.trim();
    if (!trimmed) {
      nextErrors.impactExplanation =
        'Explain the operational or security impact of this misconfiguration.';
    } else if (trimmed.length < minImpactLength) {
      nextErrors.impactExplanation = `Impact explanation must be at least ${minImpactLength} characters.`;
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;

    clearOutcome();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'config_fault_diagnosis',
          faultLineNumber: Number.parseInt(faultLineNumber, 10),
          impactExplanation: impactExplanation.trim(),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit diagnosis.');
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
      aria-labelledby="config-fault-diagnosis-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2
          id="config-fault-diagnosis-heading"
          className="text-lg font-semibold"
        >
          Config fault diagnosis
        </h2>
        <Badge variant="outline">Static {configKind}</Badge>
        <Badge variant="secondary">Line identification</Badge>
      </div>

      <p className="max-w-prose text-sm text-muted-foreground">{prompt}</p>

      <div className="overflow-hidden rounded-lg border border-border">
        <p className="border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {configFileName} (read-only)
        </p>
        <pre
          className="max-h-[28rem] overflow-auto bg-slate-900 px-3 py-3 font-mono text-xs leading-relaxed text-slate-100"
          aria-label={`${configFileName} with line numbers`}
        >
          <code>{displayBlock}</code>
        </pre>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Identify the misconfigured line
            </CardTitle>
            <CardDescription>
              Choose the specific line that contains the fault, then explain
              what breaks or what risk it introduces (min {minImpactLength}{' '}
              characters).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="config-fault-line">Faulty line</Label>
              <select
                id="config-fault-line"
                name="faultLineNumber"
                value={faultLineNumber}
                disabled={
                  readOnly || isSubmitting || selectableLines.length === 0
                }
                aria-invalid={errors.faultLineNumber ? true : undefined}
                aria-describedby={
                  errors.faultLineNumber ? 'config-fault-line-error' : undefined
                }
                className={cn(
                  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                  errors.faultLineNumber && 'border-destructive'
                )}
                onChange={(event) => {
                  setFaultLineNumber(event.target.value);
                  clearOutcome();
                  if (errors.faultLineNumber) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.faultLineNumber;
                      return next;
                    });
                  }
                }}
              >
                <option value="">Select line number…</option>
                {selectableLines.map((line) => (
                  <option key={line.lineNumber} value={String(line.lineNumber)}>
                    Line {line.lineNumber}: {line.text.trim()}
                  </option>
                ))}
              </select>
              {errors.faultLineNumber ? (
                <p
                  id="config-fault-line-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.faultLineNumber}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="config-fault-impact">Impact explanation</Label>
              <Textarea
                id="config-fault-impact"
                name="impactExplanation"
                value={impactExplanation}
                disabled={readOnly || isSubmitting}
                aria-invalid={errors.impactExplanation ? true : undefined}
                aria-describedby={
                  errors.impactExplanation
                    ? 'config-fault-impact-error'
                    : 'config-fault-impact-hint'
                }
                onChange={(event) => {
                  setImpactExplanation(event.target.value);
                  clearOutcome();
                  if (errors.impactExplanation) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.impactExplanation;
                      return next;
                    });
                  }
                }}
                rows={5}
                placeholder="Describe the operational or security impact if this line stays as written…"
              />
              <p
                id="config-fault-impact-hint"
                className="text-xs text-muted-foreground"
              >
                {impactExplanation.trim().length}/{minImpactLength} characters
                minimum
              </p>
              {errors.impactExplanation ? (
                <p
                  id="config-fault-impact-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.impactExplanation}
                </p>
              ) : null}
            </div>

            {!readOnly ? (
              <div className="pt-1">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting…' : 'Submit diagnosis'}
                </Button>
              </div>
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
      </form>
    </section>
  );
}
