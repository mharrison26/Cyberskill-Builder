'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AUDIT_COMMITTEE_BRIEF_MIN_SUMMARY_LENGTH,
  parsePriorFindings,
} from '@/lib/scoring/ticketUi';
import { cn } from '@/lib/utils';
import type { Ticket } from '@/types';

type AcQuestion = {
  id: string;
  prompt: string;
  focus?: string;
};

type PriorFinding = {
  id: string;
  title: string;
  summary: string;
  controlId?: string;
  source?: string;
  ticketCode?: string | null;
};

type PhaseResponse = {
  phase?: 'summary' | 'questions';
  executiveSummary?: string | null;
  priorFindings?: PriorFinding[];
  priorFindingsSource?: 'prior_submission' | 'seed' | 'empty';
  priorFindingsNarrative?: string;
  questions?: AcQuestion[];
  source?: string;
  generatedAt?: string;
  error?: string;
};

type SubmitResponse = {
  success?: boolean;
  status?: string;
  feedback?: string;
  isFlagship?: boolean;
  error?: string;
};

type AuditCommitteeBriefTicketProps = {
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

function seedFindingsFromTicket(
  initialState: Record<string, unknown>
): PriorFinding[] {
  return parsePriorFindings(initialState).map((finding) => ({
    id: finding.id,
    title: finding.title?.trim() || finding.id,
    summary: finding.summary,
    controlId: finding.controlId,
    source: 'seed',
    ticketCode: 'AUD-06',
  }));
}

export function AuditCommitteeBriefTicket({
  ticket,
  readOnly = false,
  className,
}: AuditCommitteeBriefTicketProps) {
  const expectedState = asRecord(ticket.expected_state);
  const initialState = asRecord(ticket.initial_state);
  const minSummaryLength = resolveMinLength(
    expectedState.minSummaryLength,
    AUDIT_COMMITTEE_BRIEF_MIN_SUMMARY_LENGTH
  );

  const scenarioHint =
    typeof initialState.prompt === 'string'
      ? initialState.prompt
      : 'Compile your AUD-06 findings into a short executive summary, then generate audit-committee questions grounded in that summary.';

  const [phase, setPhase] = useState<'summary' | 'questions'>('summary');
  const [executiveSummary, setExecutiveSummary] = useState('');
  const [priorFindings, setPriorFindings] = useState<PriorFinding[]>(() =>
    seedFindingsFromTicket(initialState)
  );
  const [priorFindingsSource, setPriorFindingsSource] = useState<
    'prior_submission' | 'seed' | 'empty'
  >('seed');
  const [priorFindingsNarrative, setPriorFindingsNarrative] = useState('');
  const [questions, setQuestions] = useState<AcQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'ok' | 'error' | null>(null);
  const [isFlagship, setIsFlagship] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/tickets/${ticket.id}/ac-questions`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        const data = (await res.json()) as PhaseResponse;
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load audit-committee brief');
        }
        if (cancelled) return;

        if (data.priorFindings && data.priorFindings.length > 0) {
          setPriorFindings(data.priorFindings);
        }
        if (data.priorFindingsSource) {
          setPriorFindingsSource(data.priorFindingsSource);
        }
        if (typeof data.priorFindingsNarrative === 'string') {
          setPriorFindingsNarrative(data.priorFindingsNarrative);
        }
        if (typeof data.executiveSummary === 'string') {
          setExecutiveSummary(data.executiveSummary);
        }

        if (data.phase === 'questions' && (data.questions?.length ?? 0) > 0) {
          setPhase('questions');
          setQuestions(data.questions ?? []);
          setMeta(
            data.source
              ? `Questions ${
                  data.source === 'llm'
                    ? 'generated from your executive summary'
                    : 'derived from your executive summary'
                }${
                  data.generatedAt
                    ? ` · ${new Date(data.generatedAt).toLocaleString()}`
                    : ''
                }`
              : null
          );
        } else {
          setPhase('summary');
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : 'Failed to load progress'
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

  async function handleGenerateQuestions() {
    if (readOnly || generating) return;
    setGenerating(true);
    setLoadError(null);
    setFeedback(null);

    try {
      const res = await fetch(`/api/tickets/${ticket.id}/ac-questions`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          executiveSummary,
        }),
      });
      const data = (await res.json()) as PhaseResponse;
      if (!res.ok) {
        throw new Error(
          data.error || 'Failed to generate audit-committee questions'
        );
      }

      setPhase('questions');
      setQuestions(data.questions ?? []);
      if (typeof data.priorFindingsNarrative === 'string') {
        setPriorFindingsNarrative(data.priorFindingsNarrative);
      }
      setMeta(
        data.source
          ? `Questions ${
              data.source === 'llm'
                ? 'generated from your executive summary'
                : 'derived from your executive summary'
            }${
              data.generatedAt
                ? ` · ${new Date(data.generatedAt).toLocaleString()}`
                : ''
            }`
          : null
      );
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : 'Failed to generate audit-committee questions'
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmit() {
    if (readOnly || isSubmitting) return;
    setIsSubmitting(true);
    setFeedback(null);
    setFeedbackTone(null);
    setIsFlagship(false);

    try {
      const res = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'audit_committee_brief',
          executiveSummary,
          questions,
          priorFindingsNarrative:
            priorFindingsNarrative ||
            priorFindings.map((f) => `${f.title}: ${f.summary}`).join('\n\n'),
        }),
      });
      const data = (await res.json()) as SubmitResponse;
      if (!res.ok) {
        throw new Error(data.error || 'Submit failed');
      }
      setFeedback(data.feedback ?? 'Submitted.');
      setFeedbackTone(data.status === 'resolved' ? 'ok' : 'error');
      setIsFlagship(Boolean(data.isFlagship));
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : 'Failed to submit audit-committee brief'
      );
      setFeedbackTone('error');
    } finally {
      setIsSubmitting(false);
    }
  }

  const findingsSourceLabel =
    priorFindingsSource === 'prior_submission'
      ? 'Loaded from your prior AUD-06 / CCCER submissions'
      : priorFindingsSource === 'seed'
        ? 'Using seeded prior findings (standalone mode)'
        : 'No prior findings available';

  return (
    <section
      aria-labelledby="ac-brief-heading"
      className={cn('space-y-5', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="space-y-1">
        <h2 id="ac-brief-heading" className="text-base font-semibold">
          Audit committee brief
        </h2>
        <p className="text-sm text-muted-foreground">{scenarioHint}</p>
        <p className="text-xs text-muted-foreground">
          Compile prior findings into a short executive summary, generate 4–5
          audit-committee questions, then submit the package as your track
          flagship portfolio item (AUD-07).
        </p>
        {meta ? <p className="text-xs text-muted-foreground">{meta}</p> : null}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">
          Loading prior findings and brief progress…
        </p>
      ) : null}

      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}

      <div className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Prior findings (AUD-06)</h3>
          <p className="text-xs text-muted-foreground">{findingsSourceLabel}</p>
        </div>
        {priorFindings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No prior findings were found. Ask an admin to seed{' '}
            <code className="text-xs">initial_state.prior_findings</code>, or
            complete AUD-06 first.
          </p>
        ) : (
          <ul className="space-y-3">
            {priorFindings.map((finding) => (
              <li
                key={finding.id}
                className="rounded-md border border-border/80 px-3 py-2"
              >
                <p className="text-sm font-medium">
                  {finding.title}
                  {finding.controlId ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {finding.controlId}
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {finding.summary}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="ac-exec-summary" className="text-sm font-medium">
          Executive summary
        </Label>
        <Textarea
          id="ac-exec-summary"
          value={executiveSummary}
          disabled={readOnly}
          rows={10}
          placeholder={`Compile the prior findings into a short committee-ready summary (min ${minSummaryLength} characters). Cover severity, root-cause themes, remediation posture, and residual risk…`}
          onChange={(event) => setExecutiveSummary(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {executiveSummary.trim().length} / {minSummaryLength} characters
        </p>
      </div>

      {phase === 'summary' ? (
        <Button
          type="button"
          disabled={
            readOnly ||
            loading ||
            generating ||
            executiveSummary.trim().length < minSummaryLength
          }
          onClick={() => void handleGenerateQuestions()}
        >
          {generating
            ? 'Generating audit-committee questions…'
            : 'Generate audit-committee questions'}
        </Button>
      ) : null}

      {phase === 'questions' ? (
        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">
              Compiled package — audit-committee questions
            </h3>
            <p className="text-xs text-muted-foreground">
              Review the summary (you may refine it) and these questions before
              submitting the flagship portfolio package. Questions are generated
              once and stored.
            </p>
          </div>
          <ol className="list-decimal space-y-3 pl-5">
            {questions.map((question) => (
              <li key={question.id} className="text-sm leading-snug">
                <span>{question.prompt}</span>
                {question.focus ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({question.focus})
                  </span>
                ) : null}
              </li>
            ))}
          </ol>

          <Button
            type="button"
            disabled={
              readOnly ||
              isSubmitting ||
              questions.length === 0 ||
              executiveSummary.trim().length < minSummaryLength
            }
            onClick={() => void handleSubmit()}
          >
            {isSubmitting ? 'Submitting…' : 'Submit audit-committee brief'}
          </Button>
        </div>
      ) : null}

      {feedback ? (
        <p
          className={cn(
            'text-sm whitespace-pre-wrap',
            feedbackTone === 'ok' ? 'text-emerald-800' : 'text-destructive'
          )}
          role="status"
        >
          {feedback}
          {isFlagship ? (
            <span className="mt-2 block font-medium">
              Marked as your track flagship portfolio item.
            </span>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
