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
import {
  NETWORK_FAULT_TYPE_LABELS,
  NETWORK_FAULT_TYPES,
  NETWORK_NEXT_DIAGNOSTIC_STEP_LABELS,
  NETWORK_NEXT_DIAGNOSTIC_STEPS,
  type NetworkFaultType,
  type NetworkNextDiagnosticStep,
} from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type NetworkDiagnosticsTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type CommandBlock = {
  command: string;
  output: string;
};

type FormErrors = Partial<Record<'faultType' | 'nextDiagnosticStep', string>>;

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseCommands(initialState: Record<string, unknown>): CommandBlock[] {
  const raw = initialState.commands;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry): CommandBlock | null => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const command =
        typeof record.command === 'string'
          ? record.command.trim()
          : typeof record.cmd === 'string'
            ? record.cmd.trim()
            : '';
      const output =
        typeof record.output === 'string'
          ? record.output
          : typeof record.result === 'string'
            ? record.result
            : '';
      if (!command && !output.trim()) return null;
      return { command, output };
    })
    .filter((entry): entry is CommandBlock => entry !== null);
}

function buildTerminalTranscript(
  initialState: Record<string, unknown>
): string {
  const combined =
    typeof initialState.terminalOutput === 'string'
      ? initialState.terminalOutput
      : typeof initialState.terminal_output === 'string'
        ? initialState.terminal_output
        : typeof initialState.output === 'string'
          ? initialState.output
          : '';

  if (combined.trim()) {
    return combined.replace(/\r\n/g, '\n');
  }

  const commands = parseCommands(initialState);
  if (commands.length === 0) {
    return 'No command output was seeded for this ticket.';
  }

  return commands
    .map((block) => {
      const promptLine = block.command
        ? `C:\\Users\\analyst>${block.command}`
        : '';
      return [promptLine, block.output.replace(/\r\n/g, '\n')]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

function resolveOptionList(
  sources: Array<Record<string, unknown>>,
  keys: string[],
  fallback: readonly string[]
): string[] {
  for (const source of sources) {
    for (const key of keys) {
      const raw = source[key];
      if (!Array.isArray(raw)) continue;
      const opts = raw
        .filter((item): item is string => typeof item === 'string')
        .map((item) =>
          item
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, '_')
        )
        .filter(Boolean);
      if (opts.length > 0) return opts;
    }
  }
  return [...fallback];
}

function faultLabel(value: string): string {
  if (value in NETWORK_FAULT_TYPE_LABELS) {
    return NETWORK_FAULT_TYPE_LABELS[value as NetworkFaultType];
  }
  return value.replace(/_/g, ' ');
}

function nextStepLabel(value: string): string {
  if (value in NETWORK_NEXT_DIAGNOSTIC_STEP_LABELS) {
    return NETWORK_NEXT_DIAGNOSTIC_STEP_LABELS[
      value as NetworkNextDiagnosticStep
    ];
  }
  return value.replace(/_/g, ' ');
}

export function NetworkDiagnosticsTicket({
  ticket,
  readOnly = false,
  className,
}: NetworkDiagnosticsTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);

  const prompt =
    typeof initialState.prompt === 'string' && initialState.prompt.trim()
      ? initialState.prompt.trim()
      : 'Review the static ipconfig / ping / traceroute output, identify the root cause, then choose the best next diagnostic step.';

  const transcript = useMemo(
    () => buildTerminalTranscript(initialState),
    [initialState]
  );

  const faultOptions = useMemo(
    () =>
      resolveOptionList(
        [initialState, expectedState],
        ['faultOptions', 'fault_options', 'rootCauseOptions'],
        NETWORK_FAULT_TYPES
      ),
    [initialState, expectedState]
  );

  const nextStepOptions = useMemo(
    () =>
      resolveOptionList(
        [initialState, expectedState],
        ['nextStepOptions', 'next_step_options', 'diagnosticStepOptions'],
        NETWORK_NEXT_DIAGNOSTIC_STEPS
      ),
    [initialState, expectedState]
  );

  const [step, setStep] = useState<1 | 2>(1);
  const [faultType, setFaultType] = useState('');
  const [nextDiagnosticStep, setNextDiagnosticStep] = useState('');
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

  function goToStep2() {
    clearOutcome();
    if (!faultType) {
      setErrors({ faultType: 'Select the root-cause fault type.' });
      return;
    }
    setErrors({});
    setStep(2);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;

    clearOutcome();

    if (!faultType || !nextDiagnosticStep) {
      setErrors({
        faultType: faultType ? undefined : 'Select the root-cause fault type.',
        nextDiagnosticStep: nextDiagnosticStep
          ? undefined
          : 'Select the next diagnostic step.',
      });
      if (!faultType) setStep(1);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'network_diagnostics',
          faultType,
          nextDiagnosticStep,
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
      aria-labelledby="network-diagnostics-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="network-diagnostics-heading" className="text-lg font-semibold">
          Network command diagnostics
        </h2>
        <Badge variant="outline">PI-04 · Static output</Badge>
        <Badge variant="secondary">Step {step} of 2</Badge>
      </div>

      <p className="max-w-prose text-sm text-muted-foreground">{prompt}</p>

      {/*
        WebContainer terminals are interactive sandboxes for scripting tickets.
        For static pre-generated output we render a terminal-styled code block.
      */}
      <div className="overflow-hidden rounded-lg border border-border">
        <p className="border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Terminal (read-only capture)
        </p>
        <pre
          className="max-h-[28rem] overflow-auto bg-terminal px-3 py-3 font-mono text-xs leading-relaxed text-terminal-foreground"
          aria-label="Static command output"
        >
          <code>{transcript}</code>
        </pre>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {step === 1 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Step 1 — Identify the root cause
              </CardTitle>
              <CardDescription>
                Based on the ipconfig, ping, and traceroute results, what is the
                primary fault?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label htmlFor="network-fault-type">Fault type</Label>
              <select
                id="network-fault-type"
                name="faultType"
                value={faultType}
                disabled={readOnly || isSubmitting}
                aria-invalid={errors.faultType ? true : undefined}
                aria-describedby={
                  errors.faultType ? 'network-fault-type-error' : undefined
                }
                className={cn(
                  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                  errors.faultType && 'border-destructive'
                )}
                onChange={(event) => {
                  setFaultType(event.target.value);
                  clearOutcome();
                  if (errors.faultType) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.faultType;
                      return next;
                    });
                  }
                }}
              >
                <option value="">Select root cause…</option>
                {faultOptions.map((value) => (
                  <option key={value} value={value}>
                    {faultLabel(value)}
                  </option>
                ))}
              </select>
              {errors.faultType ? (
                <p
                  id="network-fault-type-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.faultType}
                </p>
              ) : null}
              <div className="pt-2">
                <Button
                  type="button"
                  disabled={readOnly || isSubmitting}
                  onClick={goToStep2}
                >
                  Continue to next step
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Step 2 — Choose the next diagnostic step
              </CardTitle>
              <CardDescription>
                You selected:{' '}
                <span className="font-medium text-foreground">
                  {faultLabel(faultType)}
                </span>
                . What should you do next to confirm or isolate the fault?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label htmlFor="network-next-step">Next diagnostic step</Label>
              <select
                id="network-next-step"
                name="nextDiagnosticStep"
                value={nextDiagnosticStep}
                disabled={readOnly || isSubmitting}
                aria-invalid={errors.nextDiagnosticStep ? true : undefined}
                aria-describedby={
                  errors.nextDiagnosticStep
                    ? 'network-next-step-error'
                    : undefined
                }
                className={cn(
                  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                  errors.nextDiagnosticStep && 'border-destructive'
                )}
                onChange={(event) => {
                  setNextDiagnosticStep(event.target.value);
                  clearOutcome();
                  if (errors.nextDiagnosticStep) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.nextDiagnosticStep;
                      return next;
                    });
                  }
                }}
              >
                <option value="">Select next step…</option>
                {nextStepOptions.map((value) => (
                  <option key={value} value={value}>
                    {nextStepLabel(value)}
                  </option>
                ))}
              </select>
              {errors.nextDiagnosticStep ? (
                <p
                  id="network-next-step-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.nextDiagnosticStep}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={readOnly || isSubmitting}
                  onClick={() => {
                    clearOutcome();
                    setStep(1);
                  }}
                >
                  Back
                </Button>
                <Button type="submit" disabled={readOnly || isSubmitting}>
                  {isSubmitting ? 'Submitting…' : 'Submit diagnosis'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

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
