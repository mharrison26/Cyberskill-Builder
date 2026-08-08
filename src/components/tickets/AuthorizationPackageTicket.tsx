'use client';

import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Ticket } from '@/types';

type ArtifactView = {
  code: string;
  label: string;
  status: 'present' | 'missing' | 'incomplete' | string;
  summary: string;
  payload: Record<string, unknown> | null;
};

type PackageResponse = {
  complete?: boolean;
  missingCodes?: string[];
  artifacts?: ArtifactView[];
  compiledAt?: string;
  error?: string;
};

type SubmitResponse = {
  success?: boolean;
  status?: string;
  feedback?: string;
  error?: string;
};

type AuthorizationPackageTicketProps = {
  ticket: Pick<Ticket, 'id' | 'ticket_type' | 'initial_state' | 'expected_state'>;
  readOnly?: boolean;
  className?: string;
};

function statusTone(status: string): string {
  if (status === 'present') return 'bg-emerald-500/15 text-emerald-800 border-emerald-500/30';
  if (status === 'incomplete') return 'bg-amber-500/15 text-amber-900 border-amber-500/30';
  return 'bg-muted text-muted-foreground';
}

export function AuthorizationPackageTicket({
  ticket,
  readOnly = false,
  className,
}: AuthorizationPackageTicketProps) {
  const [pkg, setPkg] = useState<PackageResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'ok' | 'error' | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/tickets/${ticket.id}/package`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        const data = (await res.json()) as PackageResponse;
        if (!res.ok) {
          throw new Error(data.error || 'Failed to compile package');
        }
        if (!cancelled) {
          setPkg(data);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : 'Failed to load package'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [ticket.id]);

  async function handleSubmit() {
    if (readOnly || isSubmitting) return;
    setIsSubmitting(true);
    setFeedback(null);
    setFeedbackTone(null);

    try {
      const res = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'authorization_package',
          acknowledged: true,
        }),
      });
      const data = (await res.json()) as SubmitResponse;
      if (!res.ok) {
        throw new Error(data.error || 'Submit failed');
      }
      setFeedback(data.feedback ?? 'Submitted.');
      setFeedbackTone(data.status === 'resolved' ? 'ok' : 'error');
      setAcknowledged(true);
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Failed to submit package review'
      );
      setFeedbackTone('error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="auth-package-heading"
      className={cn('space-y-4', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="space-y-1">
        <h2 id="auth-package-heading" className="text-base font-semibold">
          Compiled authorization package
        </h2>
        <p className="text-sm text-muted-foreground">
          Read-only compilation of your GRC-03 SSP fragment, GRC-04 POA&M
          entries, and GRC-09 OSCAL generator artifacts. Acknowledge the package
          when ready, then continue to the AO review Q&A.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Compiling package…</p>
      ) : null}

      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}

      {pkg?.artifacts ? (
        <ul className="space-y-3">
          {pkg.artifacts.map((artifact) => {
            const isOpen = expanded[artifact.code] ?? false;
            return (
              <li
                key={artifact.code}
                className="rounded-lg border border-border bg-card px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {artifact.code} — {artifact.label}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {artifact.summary}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn('capitalize', statusTone(artifact.status))}
                  >
                    {artifact.status}
                  </Badge>
                </div>
                {artifact.payload ? (
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setExpanded((prev) => ({
                          ...prev,
                          [artifact.code]: !isOpen,
                        }))
                      }
                    >
                      {isOpen ? 'Hide artifact JSON' : 'Show artifact JSON'}
                    </Button>
                    {isOpen ? (
                      <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted/50 p-3 text-xs">
                        {JSON.stringify(artifact.payload, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {pkg ? (
        <p className="text-sm text-muted-foreground">
          {pkg.complete
            ? 'All required artifacts are present.'
            : `Incomplete — missing: ${(pkg.missingCodes ?? []).join(', ') || 'unknown'}.`}
          {pkg.compiledAt
            ? ` Compiled ${new Date(pkg.compiledAt).toLocaleString()}.`
            : null}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={acknowledged}
            disabled={readOnly || !pkg?.complete}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          I have reviewed the compiled authorization package
        </label>
        <Button
          type="button"
          disabled={
            readOnly || !acknowledged || !pkg?.complete || isSubmitting
          }
          onClick={() => void handleSubmit()}
        >
          {isSubmitting ? 'Submitting…' : 'Submit package review'}
        </Button>
      </div>

      {feedback ? (
        <p
          className={cn(
            'text-sm whitespace-pre-wrap',
            feedbackTone === 'ok' ? 'text-emerald-800' : 'text-destructive'
          )}
          role="status"
        >
          {feedback}
        </p>
      ) : null}
    </section>
  );
}
