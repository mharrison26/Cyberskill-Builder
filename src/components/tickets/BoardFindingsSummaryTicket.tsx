'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  BOARD_FINDINGS_ASK_TYPES,
  BOARD_FINDINGS_SUMMARY_MAX_LENGTH,
  BOARD_FINDINGS_SUMMARY_MIN_LENGTH,
  type BoardFindingsAskType,
} from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type BoardFindingsSummaryTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type TechnicalFinding = {
  id: string;
  technicalTitle: string;
  technicalDetail: string;
  source?: string;
};

type FormErrors = Partial<
  Record<'summary' | 'askType' | 'askStatement', string>
>;

const ASK_LABELS: Record<BoardFindingsAskType, string> = {
  budget: 'Budget — request funding or resources',
  decision: 'Decision — request a specific approval or risk choice',
  awareness: 'Awareness — inform the board; no immediate decision',
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function resolvePositiveInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}

function parseFindings(
  initialState: Record<string, unknown>
): TechnicalFinding[] {
  const raw = initialState.findings ?? initialState.technicalFindings;
  if (!Array.isArray(raw)) return [];

  const findings: TechnicalFinding[] = [];
  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return;
    }
    const rec = entry as Record<string, unknown>;
    const id =
      typeof rec.id === 'string' && rec.id.trim()
        ? rec.id.trim()
        : `f${index + 1}`;
    const technicalTitle =
      typeof rec.technicalTitle === 'string' && rec.technicalTitle.trim()
        ? rec.technicalTitle.trim()
        : typeof rec.title === 'string' && rec.title.trim()
          ? rec.title.trim()
          : id;
    const technicalDetail =
      typeof rec.technicalDetail === 'string' && rec.technicalDetail.trim()
        ? rec.technicalDetail.trim()
        : typeof rec.detail === 'string' && rec.detail.trim()
          ? rec.detail.trim()
          : typeof rec.summary === 'string' && rec.summary.trim()
            ? rec.summary.trim()
            : '';
    if (!technicalDetail) return;
    const source =
      typeof rec.source === 'string' && rec.source.trim()
        ? rec.source.trim()
        : undefined;
    findings.push({ id, technicalTitle, technicalDetail, source });
  });
  return findings;
}

function parseAskOptions(
  initialState: Record<string, unknown>,
  expectedState: Record<string, unknown>
): BoardFindingsAskType[] {
  const raw =
    expectedState.acceptableAskTypes ??
    expectedState.acceptable_ask_types ??
    initialState.askOptions ??
    initialState.ask_options;
  if (!Array.isArray(raw)) return [...BOARD_FINDINGS_ASK_TYPES];

  const parsed = raw
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is BoardFindingsAskType =>
      (BOARD_FINDINGS_ASK_TYPES as readonly string[]).includes(item)
    );
  return parsed.length > 0
    ? Array.from(new Set(parsed))
    : [...BOARD_FINDINGS_ASK_TYPES];
}

export function BoardFindingsSummaryTicket({
  ticket,
  readOnly = false,
  className,
}: BoardFindingsSummaryTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);

  const minSummaryLength = resolvePositiveInt(
    expectedState.minSummaryLength ?? initialState.minSummaryLength,
    BOARD_FINDINGS_SUMMARY_MIN_LENGTH
  );
  const maxSummaryLength = resolvePositiveInt(
    expectedState.maxSummaryLength ?? initialState.maxSummaryLength,
    BOARD_FINDINGS_SUMMARY_MAX_LENGTH
  );

  const findings = useMemo(() => parseFindings(initialState), [initialState]);
  const askOptions = useMemo(
    () => parseAskOptions(initialState, expectedState),
    [expectedState, initialState]
  );

  const prompt =
    typeof initialState.prompt === 'string' && initialState.prompt.trim()
      ? initialState.prompt.trim()
      : 'Translate the technical findings below into a one-page board-level summary. Use plain language, state business impact, and include a clear ask (budget, decision, or awareness).';

  const audience =
    typeof initialState.audience === 'string' && initialState.audience.trim()
      ? initialState.audience.trim()
      : 'Board of Directors / Audit Committee';

  const pageLimitNote =
    typeof initialState.pageLimitNote === 'string' &&
    initialState.pageLimitNote.trim()
      ? initialState.pageLimitNote.trim()
      : 'Target about one page (350–900 characters).';

  const org = asRecord(initialState.organization);
  const orgName =
    typeof org.name === 'string' && org.name.trim()
      ? org.name.trim()
      : 'HarborForge';
  const orgContext =
    typeof org.context === 'string' && org.context.trim()
      ? org.context.trim()
      : null;

  const [summary, setSummary] = useState('');
  const [askType, setAskType] = useState<BoardFindingsAskType | ''>('');
  const [askStatement, setAskStatement] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): boolean {
    const next: FormErrors = {};
    const trimmed = summary.trim();
    if (!trimmed) next.summary = 'Board summary is required.';
    else if (trimmed.length < minSummaryLength) {
      next.summary = `Summary must be at least ${minSummaryLength} characters.`;
    } else if (trimmed.length > maxSummaryLength) {
      next.summary = `Summary must be at most ${maxSummaryLength} characters.`;
    }
    if (!askType) next.askType = 'Select an ask type.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    setSubmitError(null);
    setFeedback(null);
    setScoreStatus(null);
    if (!validate() || !askType) return;

    setIsSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        type: 'board_findings_summary',
        summary: summary.trim(),
        askType,
      };
      if (askStatement.trim()) {
        body.askStatement = askStatement.trim();
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
        throw new Error(payload.error ?? 'Failed to submit board summary.');
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

  const summaryLength = summary.trim().length;

  return (
    <section
      aria-labelledby="board-findings-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="board-findings-heading" className="text-lg font-semibold">
          Board findings summary
        </h2>
        <Badge variant="secondary">One-page board brief</Badge>
      </div>

      <div className="space-y-1">
        <p className="max-w-prose text-sm text-muted-foreground">{prompt}</p>
        <p className="text-xs text-muted-foreground">
          Audience: {audience}
          {' · '}
          Organization: {orgName}
          {orgContext ? ` — ${orgContext}` : null}
        </p>
        <p className="text-xs text-muted-foreground">{pageLimitNote}</p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Technical findings (source)</h3>
          <p className="text-xs text-muted-foreground">
            Translate these ISSO/GRC findings into plain language. Do not dump
            control IDs without explaining business impact.
          </p>
        </div>
        {findings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No technical findings were seeded for this ticket.
          </p>
        ) : (
          <ul className="space-y-3">
            {findings.map((finding) => (
              <li
                key={finding.id}
                className="rounded-md border border-border/80 px-3 py-2"
              >
                <p className="text-sm font-medium">{finding.technicalTitle}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {finding.technicalDetail}
                </p>
                {finding.source ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Source: {finding.source}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="board-ask-type">Ask type</Label>
          <select
            id="board-ask-type"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={askType}
            disabled={readOnly || isSubmitting}
            aria-invalid={errors.askType ? true : undefined}
            onChange={(event) => {
              setAskType(event.target.value as BoardFindingsAskType | '');
              if (errors.askType) {
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.askType;
                  return next;
                });
              }
            }}
          >
            <option value="">Select budget, decision, or awareness…</option>
            {askOptions.map((option) => (
              <option key={option} value={option}>
                {ASK_LABELS[option]}
              </option>
            ))}
          </select>
          {errors.askType ? (
            <p className="text-sm text-destructive">{errors.askType}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="board-ask-statement">
            Ask statement{' '}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </Label>
          <Input
            id="board-ask-statement"
            value={askStatement}
            disabled={readOnly || isSubmitting}
            placeholder="One-line ask the board will remember…"
            onChange={(event) => setAskStatement(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="board-summary">One-page board summary</Label>
          <Textarea
            id="board-summary"
            value={summary}
            disabled={readOnly || isSubmitting}
            rows={14}
            placeholder="Open with why the board is briefed, translate each finding into plain language with business impact, and close with your ask…"
            aria-invalid={errors.summary ? true : undefined}
            onChange={(event) => {
              setSummary(event.target.value);
              if (errors.summary) {
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.summary;
                  return next;
                });
              }
            }}
          />
          <p className="text-xs text-muted-foreground">
            {summaryLength} / {minSummaryLength}–{maxSummaryLength} characters
          </p>
          {errors.summary ? (
            <p className="text-sm text-destructive">{errors.summary}</p>
          ) : null}
        </div>

        <Button type="submit" disabled={readOnly || isSubmitting}>
          {isSubmitting ? 'Submitting…' : 'Submit board summary'}
        </Button>
      </form>

      {submitError ? (
        <p className="text-sm text-destructive" role="alert">
          {submitError}
        </p>
      ) : null}

      {feedback ? (
        <p
          className={cn(
            'text-sm whitespace-pre-wrap',
            scoreStatus === 'resolved' ? 'text-emerald-800' : 'text-destructive'
          )}
          role="status"
        >
          {feedback}
        </p>
      ) : null}
    </section>
  );
}
