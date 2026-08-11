'use client';

import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  restoredString,
  useTicketWorkbenchForm,
} from '@/hooks/useTicketWorkbenchForm';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  extractPoamRefsFromPayload,
  extractSeedSarPriors,
  SAR_MIN_SUMMARY_LENGTH,
  type SarPoamRef,
} from '@/lib/scoring/securityAssessmentReportShared';
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

type SecurityAssessmentReportTicketProps = {
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

function resolveMinLength(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}

function statusTone(status: string): string {
  if (status === 'present')
    return 'bg-status-satisfied text-status-satisfied-foreground border-status-satisfied-foreground/20';
  if (status === 'incomplete' || status === 'seed')
    return 'bg-status-insufficient text-status-insufficient-foreground border-status-insufficient-foreground/20';
  return 'bg-muted text-muted-foreground';
}

function summarizeSsp(payload: Record<string, unknown> | null): string {
  if (!payload) return 'No SSP fragment available.';
  const name =
    (typeof payload.systemName === 'string' && payload.systemName) ||
    (typeof payload.sspTitle === 'string' && payload.sspTitle) ||
    null;
  const keys = Object.keys(payload);
  return name
    ? `System: ${name}. Keys: ${keys.slice(0, 6).join(', ')}.`
    : `SSP artifact keys: ${keys.slice(0, 8).join(', ') || '(empty)'}.`;
}

export function SecurityAssessmentReportTicket({
  ticket,
  readOnly = false,
  className,
}: SecurityAssessmentReportTicketProps) {
  const {
    submission,
    formReadOnly,
    hideSubmit,
    lastFeedback,
  } = useTicketWorkbenchForm(readOnly);
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);
  const minSummaryLength = resolveMinLength(
    expectedState.minSummaryLength,
    SAR_MIN_SUMMARY_LENGTH
  );
  const seed = extractSeedSarPriors(initialState);

  const [sspPayload, setSspPayload] = useState<Record<string, unknown> | null>(
    seed.sspPayload
  );
  const [poamRefs, setPoamRefs] = useState<SarPoamRef[]>(seed.poamRefs);
  const [sspSource, setSspSource] = useState<'live' | 'seed' | 'none'>(
    seed.sspPayload ? 'seed' : 'none'
  );
  const [poamSource, setPoamSource] = useState<'live' | 'seed' | 'none'>(
    seed.poamRefs.length > 0 ? 'seed' : 'none'
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sarSummary, setSarSummary] = useState(() => restoredString(submission, 'sarSummary'));
  const [expanded, setExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(() => lastFeedback);
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
          throw new Error(data.error || 'Failed to load prior artifacts');
        }
        if (cancelled) return;

        const ssp = data.artifacts?.find((a) => a.code === 'GRC-03');
        const poam = data.artifacts?.find((a) => a.code === 'GRC-04');
        const liveSsp =
          ssp?.payload &&
          (ssp.status === 'present' || ssp.status === 'incomplete')
            ? ssp.payload
            : null;
        const livePoam = extractPoamRefsFromPayload(poam?.payload ?? null);

        if (liveSsp) {
          setSspPayload(liveSsp);
          setSspSource('live');
        } else if (seed.sspPayload) {
          setSspPayload(seed.sspPayload);
          setSspSource('seed');
        } else {
          setSspPayload(null);
          setSspSource('none');
        }

        if (livePoam.length > 0) {
          setPoamRefs(livePoam);
          setPoamSource('live');
        } else if (seed.poamRefs.length > 0) {
          setPoamRefs(seed.poamRefs);
          setPoamSource('seed');
        } else {
          setPoamRefs([]);
          setPoamSource('none');
        }
      } catch (error) {
        if (!cancelled) {
          // Standalone seed preview still works without the package API.
          if (seed.sspPayload || seed.poamRefs.length > 0) {
            setSspPayload(seed.sspPayload);
            setPoamRefs(seed.poamRefs);
            setSspSource(seed.sspPayload ? 'seed' : 'none');
            setPoamSource(seed.poamRefs.length > 0 ? 'seed' : 'none');
            setLoadError(null);
          } else {
            setLoadError(
              error instanceof Error
                ? error.message
                : 'Failed to load prior SSP / POA&M artifacts'
            );
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // seed is derived from ticket.initial_state; ticket.id is the fetch key.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [ticket.id]);

  async function handleSubmit() {
    if (formReadOnly || hideSubmit || isSubmitting) return;
    setIsSubmitting(true);
    setFeedback(null);
    setFeedbackTone(null);

    try {
      const res = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'security_assessment_report',
          sarSummary,
        }),
      });
      const data = (await res.json()) as SubmitResponse;
      if (!res.ok) {
        throw new Error(data.error || 'Submit failed');
      }
      setFeedback(data.feedback ?? 'Submitted.');
      setFeedbackTone(data.status === 'resolved' ? 'ok' : 'error');
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : 'Failed to submit Security Assessment Report'
      );
      setFeedbackTone('error');
    } finally {
      setIsSubmitting(false);
    }
  }

  const sspStatus =
    sspSource === 'none'
      ? 'missing'
      : sspSource === 'seed'
        ? 'seed'
        : 'present';
  const poamStatus =
    poamSource === 'none'
      ? 'missing'
      : poamSource === 'seed'
        ? 'seed'
        : 'present';

  return (
    <section
      aria-labelledby="sar-heading"
      className={cn('space-y-4', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="space-y-1">
        <h2 id="sar-heading" className="text-base font-semibold">
          Security Assessment Report (SAR) summary
        </h2>
        <p className="text-sm text-muted-foreground">
          Review your GRC-03 SSP fragment and GRC-04 POA&M entries, then draft a
          short SAR summary. Scoring requires all three artifacts and checks
          that each POA&M finding is referenced in the SAR.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">
          Loading prior SSP / POA&M artifacts…
        </p>
      ) : null}

      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}

      <ul className="space-y-3">
        <li className="rounded-lg border border-border bg-card px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium">GRC-03 — SSP fragment</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {summarizeSsp(sspPayload)}
                {sspSource === 'seed'
                  ? ' (seed preview — live submission preferred when available)'
                  : null}
              </p>
            </div>
            <Badge
              variant="outline"
              className={cn('capitalize', statusTone(sspStatus))}
            >
              {sspStatus}
            </Badge>
          </div>
          {sspPayload ? (
            <div className="mt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setExpanded((prev) => !prev)}
              >
                {expanded ? 'Hide SSP JSON' : 'Show SSP JSON'}
              </Button>
              {expanded ? (
                <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted/50 p-3 text-xs">
                  {JSON.stringify(sspPayload, null, 2)}
                </pre>
              ) : null}
            </div>
          ) : null}
        </li>

        <li className="rounded-lg border border-border bg-card px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium">GRC-04 — POA&M entries</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {poamRefs.length > 0
                  ? `${poamRefs.length} entr${poamRefs.length === 1 ? 'y' : 'ies'} to cover in the SAR.`
                  : 'No POA&M entries available.'}
                {poamSource === 'seed'
                  ? ' (seed preview — live submission preferred when available)'
                  : null}
              </p>
            </div>
            <Badge
              variant="outline"
              className={cn('capitalize', statusTone(poamStatus))}
            >
              {poamStatus}
            </Badge>
          </div>
          {poamRefs.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {poamRefs.map((ref) => (
                <li
                  key={ref.findingId}
                  className="rounded-md bg-muted/40 px-3 py-2 text-sm"
                >
                  <p className="font-medium">
                    {ref.findingId}
                    {ref.title ? ` — ${ref.title}` : ''}
                  </p>
                  {ref.weaknessDescription ? (
                    <p className="mt-1 text-muted-foreground">
                      {ref.weaknessDescription}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      </ul>

      <div className="space-y-2">
        <Label htmlFor="sar-summary">SAR summary</Label>
        <Textarea
          id="sar-summary"
          value={sarSummary}
          disabled={formReadOnly}
          onChange={(event) => setSarSummary(event.target.value)}
          rows={8}
          placeholder="Describe assessment scope, system context from the SSP, and each finding tracked in the POA&M (include finding ids)."
        />
        <p className="text-xs text-muted-foreground">
          {sarSummary.length} / {minSummaryLength} characters minimum. Reference
          each POA&M finding id (or title) for consistency.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button
          type="button"
          disabled={
            readOnly ||
            isSubmitting ||
            sspSource === 'none' ||
            poamSource === 'none' ||
            sarSummary.trim().length < minSummaryLength
          }
          onClick={() => void handleSubmit()}
        >
          {isSubmitting ? 'Submitting…' : 'Submit SAR summary'}
        </Button>
      </div>

      {feedback ? (
        <p
          className={cn(
            'text-sm whitespace-pre-wrap',
            feedbackTone === 'ok' ? 'text-status-satisfied-foreground' : 'text-destructive'
          )}
          role="status"
        >
          {feedback}
        </p>
      ) : null}
    </section>
  );
}
