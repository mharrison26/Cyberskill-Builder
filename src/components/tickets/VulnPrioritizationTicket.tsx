'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  restoredString,
  restoredStringArray,
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
import {
  parseVulnerabilities,
  type VulnerabilityItem,
} from '@/lib/scoring/vulnPrioritization';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type VulnPrioritizationTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
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
  fallback: string
): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

function exposureLabel(exposure: VulnerabilityItem['exposure']): string {
  if (exposure === 'internet') return 'Internet-facing';
  if (exposure === 'partner') return 'Partner / extranet';
  return 'Internal';
}

function cvssTone(cvss: number): string {
  if (cvss >= 9)
    return 'border-destructive/30 bg-destructive/10 text-destructive';
  if (cvss >= 7)
    return 'border-status-insufficient-foreground/20 bg-status-insufficient text-status-insufficient-foreground';
  if (cvss >= 4) return 'border-border bg-muted/50 text-foreground';
  return 'border-border bg-muted/30 text-muted-foreground';
}

export function VulnPrioritizationTicket({
  ticket,
  readOnly = false,
  className,
}: VulnPrioritizationTicketProps) {
  const {
    submission,
    formReadOnly,
    hideSubmit,
    lastFeedback,
    lastScoreStatus,
  } = useTicketWorkbenchForm(readOnly);
  const initialState = asRecord(ticket.initial_state);

  const vulnerabilities = useMemo(
    () => parseVulnerabilities(initialState),
    [initialState]
  );

  const prompt = readString(
    initialState,
    ['prompt'],
    'Review each vulnerability’s CVSS score, exposed system, and exploit-available flag. Build a patch schedule that remediates the highest-risk findings first.'
  );

  const [orderedIds, setOrderedIds] = useState(() => {
    const fromSubmission = restoredStringArray(submission, 'orderedIds');
    if (fromSubmission.length > 0) return fromSubmission;
    return vulnerabilities.map((v) => v.id);
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(() => lastFeedback);
  const [scoreStatus, setScoreStatus] = useState<string | null>(() => lastScoreStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const byId = useMemo(() => {
    const map = new Map<string, VulnerabilityItem>();
    for (const vuln of vulnerabilities) {
      map.set(vuln.id, vuln);
    }
    return map;
  }, [vulnerabilities]);

  const orderedVulns = useMemo(
    () =>
      orderedIds
        .map((id) => byId.get(id))
        .filter((item): item is VulnerabilityItem => Boolean(item)),
    [orderedIds, byId]
  );

  function clearOutcome() {
    setFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);
  }

  function moveItem(index: number, direction: -1 | 1) {
    if (formReadOnly || hideSubmit) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= orderedIds.length) return;

    clearOutcome();
    setOrderedIds((prev) => {
      const next = [...prev];
      const tmp = next[index]!;
      next[index] = next[nextIndex]!;
      next[nextIndex] = tmp;
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (formReadOnly || hideSubmit) return;

    clearOutcome();

    if (orderedIds.length === 0) {
      setSubmitError('No vulnerabilities are available to schedule.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'vuln_prioritization',
          orderedIds,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit patch schedule.');
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
      aria-labelledby="vuln-prioritization-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="vuln-prioritization-heading" className="text-lg font-semibold">
          Vulnerability patch schedule
        </h2>
        <Badge variant="outline">Prioritize · CVSS + exposure</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Task</CardTitle>
          <CardDescription>{prompt}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Rank 1 = patch first. Use the up/down controls to reorder. Prefer
            higher CVSS, internet-facing systems, and findings with public
            exploits.
          </p>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Prioritized schedule ({orderedVulns.length})
            </CardTitle>
            <CardDescription>
              Ordered list of vulnerabilities — soonest remediation at the top.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {orderedVulns.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No vulnerabilities were seeded for this ticket.
              </p>
            ) : (
              <ol className="space-y-3">
                {orderedVulns.map((vuln, index) => (
                  <li
                    key={vuln.id}
                    className="flex gap-3 rounded-md border border-border bg-background p-3"
                  >
                    <div className="flex w-10 shrink-0 flex-col items-center gap-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        #{index + 1}
                      </span>
                      <div className="flex flex-col gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          disabled={formReadOnly || isSubmitting || index === 0}
                          aria-label={`Move ${vuln.id} up`}
                          onClick={() => moveItem(index, -1)}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          disabled={
                            readOnly ||
                            isSubmitting ||
                            index === orderedVulns.length - 1
                          }
                          aria-label={`Move ${vuln.id} down`}
                          onClick={() => moveItem(index, 1)}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">
                          {vuln.title}
                        </p>
                        {vuln.cveId ? (
                          <Badge variant="outline">{vuln.cveId}</Badge>
                        ) : null}
                        <Badge
                          variant="outline"
                          className={cn('font-mono', cvssTone(vuln.cvss))}
                        >
                          CVSS {vuln.cvss.toFixed(1)}
                        </Badge>
                        {vuln.exploitAvailable ? (
                          <Badge variant="destructive">Exploit available</Badge>
                        ) : (
                          <Badge variant="outline">No known exploit</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">
                          Exposed system:{' '}
                        </span>
                        {vuln.exposedSystem}
                        <span className="mx-2 text-border">·</span>
                        {exposureLabel(vuln.exposure)}
                      </p>
                      {vuln.description ? (
                        <p className="text-sm text-muted-foreground">
                          {vuln.description}
                        </p>
                      ) : null}
                      <p className="font-mono text-xs text-muted-foreground">
                        {vuln.id}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
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

        <Button type="submit" disabled={formReadOnly || isSubmitting}>
          {isSubmitting ? 'Submitting…' : 'Submit patch schedule'}
        </Button>
      </form>
    </section>
  );
}
