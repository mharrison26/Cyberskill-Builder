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
import { NETWORK_TOPOLOGY_FAULT_MIN_JUSTIFICATION_LENGTH } from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type NetworkTopologyFaultTicketProps = {
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

type FaultLocationOption = {
  id: string;
  label: string;
};

type FormErrors = Partial<Record<'faultLocation' | 'justification', string>>;

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function normalizeLocationId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
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
        ? `analyst@ws-a:~$ ${block.command}`
        : '';
      return [promptLine, block.output.replace(/\r\n/g, '\n')]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

function parseFaultLocations(
  sources: Array<Record<string, unknown>>
): FaultLocationOption[] {
  for (const source of sources) {
    const raw =
      source.faultLocations ??
      source.fault_locations ??
      source.devices ??
      source.options;
    if (!Array.isArray(raw) || raw.length === 0) continue;

    const opts: FaultLocationOption[] = [];
    for (const entry of raw) {
      if (typeof entry === 'string' && entry.trim()) {
        const id = normalizeLocationId(entry);
        opts.push({
          id,
          label: entry.trim().replace(/[_-]+/g, ' '),
        });
        continue;
      }
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const record = entry as Record<string, unknown>;
      const idRaw =
        typeof record.id === 'string'
          ? record.id
          : typeof record.value === 'string'
            ? record.value
            : typeof record.key === 'string'
              ? record.key
              : '';
      if (!idRaw.trim()) continue;
      const id = normalizeLocationId(idRaw);
      const label =
        typeof record.label === 'string' && record.label.trim()
          ? record.label.trim()
          : typeof record.name === 'string' && record.name.trim()
            ? record.name.trim()
            : idRaw.trim().replace(/[_-]+/g, ' ');
      opts.push({ id, label });
    }
    if (opts.length > 0) return opts;
  }
  return [];
}

function resolveMinJustificationLength(
  expectedState: Record<string, unknown>
): number {
  const value =
    expectedState.minJustificationLength ??
    expectedState.min_justification_length;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return NETWORK_TOPOLOGY_FAULT_MIN_JUSTIFICATION_LENGTH;
}

export function NetworkTopologyFaultTicket({
  ticket,
  readOnly = false,
  className,
}: NetworkTopologyFaultTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);

  const prompt =
    typeof initialState.prompt === 'string' && initialState.prompt.trim()
      ? initialState.prompt.trim()
      : 'Review the network diagram and static diagnostic output. Identify which device or subnet is misconfigured, then justify your answer with basic subnetting / TCP-IP reasoning.';

  const diagram =
    typeof initialState.diagram === 'string' && initialState.diagram.trim()
      ? initialState.diagram.trim()
      : typeof initialState.networkDiagram === 'string' &&
          initialState.networkDiagram.trim()
        ? initialState.networkDiagram.trim()
        : typeof initialState.topology === 'string' &&
            initialState.topology.trim()
          ? initialState.topology.trim()
          : 'No network diagram was seeded for this ticket.';

  const transcript = useMemo(
    () => buildTerminalTranscript(initialState),
    [initialState]
  );

  const faultLocations = useMemo(
    () => parseFaultLocations([initialState, expectedState]),
    [initialState, expectedState]
  );

  const minJustificationLength = resolveMinJustificationLength(expectedState);

  const [faultLocation, setFaultLocation] = useState('');
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;

    clearOutcome();

    const nextErrors: FormErrors = {};
    if (!faultLocation) {
      nextErrors.faultLocation = 'Select the misconfigured device or subnet.';
    }
    if (justification.trim().length < minJustificationLength) {
      nextErrors.justification = `Justification must be at least ${minJustificationLength} characters.`;
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'network_topology_fault',
          faultLocation,
          justification: justification.trim(),
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
      aria-labelledby="network-topology-fault-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2
          id="network-topology-fault-heading"
          className="text-lg font-semibold"
        >
          Network topology fault
        </h2>
        <Badge variant="outline">PI-04 · Diagram + diagnostics</Badge>
      </div>

      <p className="max-w-prose text-sm text-muted-foreground">{prompt}</p>

      <div className="overflow-hidden rounded-lg border border-border">
        <p className="border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Network diagram
        </p>
        <pre
          className="max-h-[22rem] overflow-auto bg-terminal px-3 py-3 font-mono text-xs leading-relaxed text-terminal-foreground"
          aria-label="Network topology diagram"
        >
          <code>{diagram}</code>
        </pre>
      </div>

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
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Identify the misconfigured device or subnet
            </CardTitle>
            <CardDescription>
              Choose the fault location, then justify with subnetting / TCP-IP
              evidence from the diagram and output (min {minJustificationLength}{' '}
              characters).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="network-topology-fault-location">
                Misconfigured device / subnet
              </Label>
              <select
                id="network-topology-fault-location"
                name="faultLocation"
                value={faultLocation}
                disabled={readOnly || isSubmitting}
                aria-invalid={errors.faultLocation ? true : undefined}
                aria-describedby={
                  errors.faultLocation
                    ? 'network-topology-fault-location-error'
                    : undefined
                }
                className={cn(
                  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                  errors.faultLocation && 'border-destructive'
                )}
                onChange={(event) => {
                  setFaultLocation(event.target.value);
                  clearOutcome();
                  if (errors.faultLocation) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.faultLocation;
                      return next;
                    });
                  }
                }}
              >
                <option value="">Select fault location…</option>
                {faultLocations.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              {errors.faultLocation ? (
                <p
                  id="network-topology-fault-location-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.faultLocation}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="network-topology-justification">
                Justification
              </Label>
              <Textarea
                id="network-topology-justification"
                name="justification"
                value={justification}
                disabled={readOnly || isSubmitting}
                rows={6}
                placeholder="Explain which addressing/routing evidence points to this device or subnet…"
                aria-invalid={errors.justification ? true : undefined}
                aria-describedby={
                  errors.justification
                    ? 'network-topology-justification-error'
                    : 'network-topology-justification-hint'
                }
                className={cn(errors.justification && 'border-destructive')}
                onChange={(event) => {
                  setJustification(event.target.value);
                  clearOutcome();
                  if (errors.justification) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.justification;
                      return next;
                    });
                  }
                }}
              />
              <p
                id="network-topology-justification-hint"
                className="text-xs text-muted-foreground"
              >
                {justification.trim().length} / {minJustificationLength}{' '}
                characters minimum
              </p>
              {errors.justification ? (
                <p
                  id="network-topology-justification-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.justification}
                </p>
              ) : null}
            </div>

            <Button type="submit" disabled={readOnly || isSubmitting}>
              {isSubmitting ? 'Submitting…' : 'Submit diagnosis'}
            </Button>
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
