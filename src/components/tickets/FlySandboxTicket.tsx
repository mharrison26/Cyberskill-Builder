'use client';

import { useEffect, useRef, useState } from 'react';
import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';

import { Button } from '@/components/ui/button';
import {
  parseCisHardeningChecklist,
  type CisHardeningChecklistItem,
} from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

import '@xterm/xterm/css/xterm.css';

type FlySandboxTicketProps = {
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

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function checklistFromTicket(
  ticket: FlySandboxTicketProps['ticket']
): CisHardeningChecklistItem[] {
  return parseCisHardeningChecklist(asRecord(ticket.initial_state));
}

function promptFromTicket(ticket: FlySandboxTicketProps['ticket']): string {
  const initial = asRecord(ticket.initial_state);
  if (typeof initial.prompt === 'string' && initial.prompt.trim()) {
    return initial.prompt.trim();
  }
  return 'Harden this intentionally unhardened Linux host using the checklist, then submit for config-diff scoring.';
}

export function FlySandboxTicket({
  ticket,
  readOnly = false,
  className,
}: FlySandboxTicketProps) {
  const checklist = checklistFromTicket(ticket);
  const prompt = promptFromTicket(ticket);

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
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [terminalReady, setTerminalReady] = useState(false);

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
        theme: {
          background: '#0f172a',
          foreground: '#e2e8f0',
          cursor: '#94a3b8',
        },
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
          '\r\n[sandbox] Connected to ephemeral Linux shell.\r\n'
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
    if (readOnly) return;
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
        // Ignore — student can still click Launch.
      }
    }

    void hydrateExisting();
    return () => {
      cancelled = true;
    };
  }, [ticket.id, readOnly]);

  async function handleLaunch() {
    if (readOnly || isLaunching) return;
    setIsLaunching(true);
    setLaunchError(null);
    setSubmitError(null);
    setSubmitSuccess(false);

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

  async function handleSubmit() {
    if (readOnly || isSubmitting || !session) return;
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

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
          files: snapshotBody.files,
          fileModes: snapshotBody.fileModes ?? {},
        }),
      });

      const submitBody = (await submitResponse.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!submitResponse.ok) {
        setSubmitError(submitBody.error ?? 'Submission failed');
        return;
      }

      setSubmitSuccess(true);
    } catch {
      setSubmitError('Network error during submit');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="fly-sandbox-heading"
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-card text-card-foreground',
        className
      )}
      data-ticket-id={ticket.id}
      data-ticket-type={ticket.ticket_type}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 id="fly-sandbox-heading" className="text-base font-semibold">
            Ephemeral Linux sandbox
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">{prompt}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={readOnly || isLaunching || Boolean(session)}
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
            disabled={readOnly || !session || isStopping}
            onClick={() => void handleStop()}
          >
            {isStopping ? 'Stopping…' : 'Stop'}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={readOnly || !session || isSubmitting}
            onClick={() => void handleSubmit()}
          >
            {isSubmitting ? 'Submitting…' : 'Submit hardening'}
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
      {submitError ? (
        <p
          className="border-b border-border px-4 py-2 text-sm text-destructive"
          role="alert"
        >
          {submitError}
        </p>
      ) : null}
      {submitSuccess ? (
        <p className="border-b border-border px-4 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          Submission scored. Review progress feedback for checklist results.
        </p>
      ) : null}

      <div className="grid gap-0 md:grid-cols-[minmax(16rem,22rem)_1fr]">
        <aside className="border-b border-border md:border-b-0 md:border-r">
          <p className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            CIS-derived checklist
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
            aria-label="Ephemeral sandbox web terminal"
          />
        </div>
      </div>
    </section>
  );
}
