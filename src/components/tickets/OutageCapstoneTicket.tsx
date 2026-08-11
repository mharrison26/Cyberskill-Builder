'use client';

import { useEffect, useRef, useState } from 'react';
import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';
import { useTheme } from 'next-themes';

import { Badge } from '@/components/ui/badge';
import {
  asSubmissionRecord,
  useTicketWorkbenchForm,
} from '@/hooks/useTicketWorkbenchForm';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  OUTAGE_CAPSTONE_MIN_REPORT_FIELD_LENGTH,
  parseOutageDiagnosisChecklist,
  type OutageDiagnosisChecklistItem,
} from '@/lib/scoring/ticketUi';
import { readTerminalTheme } from '@/lib/terminalTheme';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

import '@xterm/xterm/css/xterm.css';

type OutageCapstoneTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type SandboxSessionPayload = {
  sessionId: string;
  machineId: string;
  websocketUrl: string;
  expiresAt?: string;
  reused?: boolean;
};

type IncidentReportFields = {
  timeline: string;
  rootCause: string;
  remediation: string;
  prevention: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function checklistFromTicket(
  ticket: OutageCapstoneTicketProps['ticket']
): OutageDiagnosisChecklistItem[] {
  return parseOutageDiagnosisChecklist(asRecord(ticket.initial_state));
}

function promptFromTicket(ticket: OutageCapstoneTicketProps['ticket']): string {
  const initial = asRecord(ticket.initial_state);
  if (typeof initial.prompt === 'string' && initial.prompt.trim()) {
    return initial.prompt.trim();
  }
  return 'Diagnose and remediate the live outage in the Fly sandbox, then file a post-incident report.';
}

function minReportLength(ticket: OutageCapstoneTicketProps['ticket']): number {
  const expected = asRecord(ticket.expected_state);
  const raw = expected.minReportFieldLength ?? expected.min_report_field_length;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  return OUTAGE_CAPSTONE_MIN_REPORT_FIELD_LENGTH;
}

const REPORT_FIELDS: Array<{
  key: keyof IncidentReportFields;
  label: string;
  placeholder: string;
}> = [
  {
    key: 'timeline',
    label: 'Timeline',
    placeholder:
      'Ordered events: detection → diagnosis → remediation → verification…',
  },
  {
    key: 'rootCause',
    label: 'Root cause',
    placeholder:
      'Underlying technical causes (misconfiguration, disk pressure, …)',
  },
  {
    key: 'remediation',
    label: 'Remediation',
    placeholder: 'What you changed, removed, and how you verified recovery…',
  },
  {
    key: 'prevention',
    label: 'Prevention',
    placeholder: 'Monitoring, change control, runbook, or capacity follow-ups…',
  },
];

export function OutageCapstoneTicket({
  ticket,
  readOnly = false,
  className,
}: OutageCapstoneTicketProps) {
  const {
    submission,
    formReadOnly,
    hideSubmit,
    lastFeedback,
    lastScoreStatus,
  } = useTicketWorkbenchForm(readOnly);
  const restored = asSubmissionRecord(submission);
  const { resolvedTheme } = useTheme();
  const checklist = checklistFromTicket(ticket);
  const prompt = promptFromTicket(ticket);
  const minLength = minReportLength(ticket);

  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const [session, setSession] = useState<SandboxSessionPayload | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(() => lastFeedback);
  const [scoreStatus, setScoreStatus] = useState<string | null>(
    () => lastScoreStatus
  );
  const [terminalReady, setTerminalReady] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof IncidentReportFields, string>>
  >({});
  const [report, setReport] = useState<IncidentReportFields>(() => {
    const saved = restored.report;
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      const record = saved as Record<string, unknown>;
      return {
        timeline: typeof record.timeline === 'string' ? record.timeline : '',
        rootCause: typeof record.rootCause === 'string' ? record.rootCause : '',
        remediation:
          typeof record.remediation === 'string' ? record.remediation : '',
        prevention:
          typeof record.prevention === 'string' ? record.prevention : '',
      };
    }
    return {
      timeline: '',
      rootCause: '',
      remediation: '',
      prevention: '',
    };
  });

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    async function bootTerminal(websocketUrl: string) {
      if (!terminalHostRef.current) return;

      const [{ Terminal: XTerm }, { FitAddon: Fit }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ]);

      if (cancelled || !terminalHostRef.current) return;

      terminalRef.current?.dispose();
      socketRef.current?.close();

      const terminal = new XTerm({
        cursorBlink: true,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
        fontSize: 13,
        theme: readTerminalTheme(),
      });
      const fitAddon = new Fit();
      terminal.loadAddon(fitAddon);
      terminal.open(terminalHostRef.current);
      fitAddon.fit();
      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      const socket = new WebSocket(websocketUrl);
      socket.binaryType = 'arraybuffer';
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        if (!cancelled) setTerminalReady(true);
        terminal.writeln(
          '\r\n[sandbox] Connected — diagnose the outage, then remediate.\r\n'
        );
      });
      socket.addEventListener('message', (event) => {
        if (typeof event.data === 'string') {
          terminal.write(event.data);
          return;
        }
        if (event.data instanceof ArrayBuffer) {
          terminal.write(new Uint8Array(event.data));
        }
      });
      socket.addEventListener('close', () => {
        if (!cancelled) setTerminalReady(false);
        terminal.writeln('\r\n[sandbox] Terminal disconnected.\r\n');
      });
      socket.addEventListener('error', () => {
        terminal.writeln('\r\n[sandbox] WebSocket error.\r\n');
      });

      terminal.onData((data) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(data);
        }
      });

      resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
      });
      resizeObserver.observe(terminalHostRef.current);
    }

    if (session?.websocketUrl) {
      void bootTerminal(session.websocketUrl);
    }

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      socketRef.current?.close();
      socketRef.current = null;
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      setTerminalReady(false);
    };
  }, [session?.websocketUrl]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.theme = readTerminalTheme();
    terminal.refresh(0, terminal.rows - 1);
  }, [resolvedTheme]);

  useEffect(() => {
    if (formReadOnly || hideSubmit) return;
    let cancelled = false;

    async function hydrateExisting() {
      try {
        const response = await fetch(`/api/tickets/${ticket.id}/sandbox`, {
          method: 'GET',
        });
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as {
          session?: SandboxSessionPayload | null;
        };
        if (body.session?.websocketUrl && !cancelled) {
          setSession(body.session);
        }
      } catch {
        // Student can still click Launch.
      }
    }

    void hydrateExisting();
    return () => {
      cancelled = true;
    };
  }, [ticket.id, readOnly]);

  function setReportField(key: keyof IncidentReportFields, value: string) {
    setReport((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);
  }

  async function handleLaunch() {
    if (readOnly || isLaunching) return;
    setIsLaunching(true);
    setLaunchError(null);
    setSubmitError(null);
    setFeedback(null);
    setScoreStatus(null);

    try {
      const response = await fetch(`/api/tickets/${ticket.id}/sandbox`, {
        method: 'POST',
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        websocketUrl?: string;
        sessionId?: string;
        machineId?: string;
        expiresAt?: string;
        reused?: boolean;
      };

      if (
        !response.ok ||
        !body.websocketUrl ||
        !body.sessionId ||
        !body.machineId
      ) {
        setLaunchError(body.error ?? 'Failed to launch sandbox');
        return;
      }

      setSession({
        sessionId: body.sessionId,
        machineId: body.machineId,
        websocketUrl: body.websocketUrl,
        expiresAt: body.expiresAt,
        reused: body.reused,
      });
    } catch {
      setLaunchError('Network error launching sandbox');
    } finally {
      setIsLaunching(false);
    }
  }

  async function handleStop() {
    if (readOnly || isStopping || !session) return;
    setIsStopping(true);
    setLaunchError(null);
    try {
      await fetch(`/api/tickets/${ticket.id}/sandbox`, { method: 'DELETE' });
      socketRef.current?.close();
      setSession(null);
      setTerminalReady(false);
    } catch {
      setLaunchError('Failed to stop sandbox');
    } finally {
      setIsStopping(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (formReadOnly || hideSubmit || isSubmitting) return;

    const errors: Partial<Record<keyof IncidentReportFields, string>> = {};
    for (const field of REPORT_FIELDS) {
      const value = report[field.key].trim();
      if (!value) {
        errors[field.key] = 'Required.';
      } else if (value.length < minLength) {
        errors[field.key] = `At least ${minLength} characters.`;
      }
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    if (!session) {
      setSubmitError('Launch and remediate in the sandbox before submitting.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setFeedback(null);
    setScoreStatus(null);

    try {
      const snapshotResponse = await fetch(
        `/api/tickets/${ticket.id}/sandbox/snapshot`,
        { method: 'POST' }
      );
      const snapshotBody = (await snapshotResponse
        .json()
        .catch(() => ({}))) as {
        error?: string;
        files?: Record<string, string>;
        fileModes?: Record<string, string>;
      };

      if (!snapshotResponse.ok || !snapshotBody.files) {
        setSubmitError(
          snapshotBody.error ??
            'Could not capture sandbox filesystem. Is the sandbox still running?'
        );
        return;
      }

      const submitResponse = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'outage_capstone',
          files: snapshotBody.files,
          fileModes: snapshotBody.fileModes ?? {},
          report: {
            timeline: report.timeline.trim(),
            rootCause: report.rootCause.trim(),
            remediation: report.remediation.trim(),
            prevention: report.prevention.trim(),
          },
        }),
      });

      const submitBody = (await submitResponse.json().catch(() => ({}))) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!submitResponse.ok) {
        setSubmitError(submitBody.error ?? 'Submission failed');
        return;
      }

      setScoreStatus(submitBody.status ?? null);
      setFeedback(submitBody.feedback ?? 'Submission recorded.');
    } catch {
      setSubmitError('Network error during submit');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="outage-capstone-heading"
      className={cn('space-y-6', className)}
      data-ticket-id={ticket.id}
      data-ticket-type={ticket.ticket_type}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="outage-capstone-heading" className="text-lg font-semibold">
          Outage response capstone
        </h2>
        <Badge variant="outline">PI-05 · Fly sandbox</Badge>
        <Badge variant="outline">PI-06 · config-diff + report</Badge>
      </div>
      <p className="max-w-prose text-sm text-muted-foreground">{prompt}</p>

      <div
        className={cn(
          'overflow-hidden rounded-lg border border-border bg-card text-card-foreground'
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h3 className="text-base font-semibold">Live remediation shell</h3>
            <p className="text-sm text-muted-foreground">
              Sandbox boots in a broken state. Fix the service and disk issue,
              then keep the session running for submit snapshot.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={formReadOnly || isLaunching || Boolean(session)}
              onClick={() => void handleLaunch()}
            >
              {isLaunching
                ? 'Launching…'
                : session
                  ? 'Sandbox running'
                  : 'Launch sandbox'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={formReadOnly || !session || isStopping}
              onClick={() => void handleStop()}
            >
              {isStopping ? 'Stopping…' : 'Stop'}
            </Button>
          </div>
        </div>

        {launchError ? (
          <p
            className="border-b border-border px-4 py-2 text-sm text-destructive"
            role="alert"
          >
            {launchError}
          </p>
        ) : null}

        <div className="grid gap-0 md:grid-cols-[minmax(16rem,22rem)_1fr]">
          <aside className="border-b border-border md:border-b-0 md:border-r">
            <p className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Diagnosis checklist
            </p>
            {checklist.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">
                No checklist seeded for this ticket.
              </p>
            ) : (
              <ol className="max-h-80 space-y-3 overflow-y-auto p-3 md:max-h-[28rem]">
                {checklist.map((item, index) => (
                  <li key={item.id} className="text-sm">
                    <p className="font-medium text-foreground">
                      <span className="mr-1.5 text-muted-foreground">
                        {index + 1}.
                      </span>
                      {item.title}
                    </p>
                    {item.description ? (
                      <p className="mt-1 text-muted-foreground">
                        {item.description}
                      </p>
                    ) : null}
                    {item.hint ? (
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {item.hint}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
            <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
              {session ? (
                <p>
                  Machine {session.machineId.slice(0, 8)}…
                  {session.expiresAt
                    ? ` · expires ${new Date(session.expiresAt).toLocaleTimeString()}`
                    : ''}
                  {terminalReady ? ' · terminal connected' : ' · connecting…'}
                </p>
              ) : (
                <p>Launch a Fly sandbox to get a real shell (PI-05).</p>
              )}
            </div>
          </aside>

          <div className="relative flex min-h-[20rem] flex-col bg-terminal">
            {!session ? (
              <p className="px-4 py-3 text-sm text-terminal-muted">
                Launch the sandbox to open the interactive terminal.
              </p>
            ) : null}
            <div
              ref={terminalHostRef}
              className="h-80 w-full flex-1 px-1 py-1 md:h-[28rem] [&_.xterm]:h-full [&_.xterm-viewport]:overflow-auto"
              aria-label="Outage remediation web terminal"
            />
          </div>
        </div>
      </div>

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="space-y-4"
      >
        <div>
          <h3 className="text-base font-semibold">Post-incident report</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Required sections are graded against a pinned quality rubric
            (timeline, root cause, remediation, prevention). Each field needs at
            least {minLength} characters. Remediation state and report quality
            are both hard gates.
          </p>
        </div>

        {REPORT_FIELDS.map((field) => (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={`outage-report-${field.key}`}>{field.label}</Label>
            <Textarea
              id={`outage-report-${field.key}`}
              value={report[field.key]}
              onChange={(event) =>
                setReportField(field.key, event.target.value)
              }
              placeholder={field.placeholder}
              disabled={formReadOnly || isSubmitting}
              rows={4}
              className="min-h-[6rem]"
            />
            {fieldErrors[field.key] ? (
              <p className="text-sm text-destructive" role="alert">
                {fieldErrors[field.key]}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {report[field.key].trim().length}/{minLength} characters
              </p>
            )}
          </div>
        ))}

        {submitError ? (
          <p className="text-sm text-destructive" role="alert">
            {submitError}
          </p>
        ) : null}
        {feedback ? (
          <div
            className={cn(
              'rounded-md border px-3 py-2 text-sm whitespace-pre-wrap',
              scoreStatus === 'resolved'
                ? 'border-status-satisfied-foreground/20 text-status-satisfied-foreground'
                : 'border-border text-foreground'
            )}
          >
            {scoreStatus ? (
              <p className="mb-1 font-medium capitalize">
                Status: {scoreStatus.replace(/_/g, ' ')}
              </p>
            ) : null}
            {feedback}
          </div>
        ) : null}

        {!hideSubmit ? (
          <Button
            type="submit"
            disabled={formReadOnly || isSubmitting || !session}
          >
            {isSubmitting ? 'Submitting…' : 'Submit remediation + report'}
          </Button>
        ) : null}
      </form>
    </section>
  );
}
