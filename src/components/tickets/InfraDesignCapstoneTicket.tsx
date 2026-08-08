'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  INFRA_DESIGN_DOC_MIN_BODY_LENGTH,
  INFRA_DESIGN_DOC_MIN_TITLE_LENGTH,
  INFRA_DESIGN_FOLLOWUP_MIN_ANSWER_LENGTH,
} from '@/lib/scoring/ticketUi';
import { cn } from '@/lib/utils';
import type { Ticket } from '@/types';

type InfraQuestion = {
  id: string;
  prompt: string;
  focus?: string;
};

type DesignDoc = {
  title: string;
  body: string;
  topologyChoice?: string;
};

type PhaseResponse = {
  phase?: 'design' | 'questions';
  designDoc?: DesignDoc | null;
  questions?: InfraQuestion[];
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

type InfraDesignCapstoneTicketProps = {
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

export function InfraDesignCapstoneTicket({
  ticket,
  readOnly = false,
  className,
}: InfraDesignCapstoneTicketProps) {
  const expectedState = asRecord(ticket.expected_state);
  const initialState = asRecord(ticket.initial_state);
  const minBodyLength = resolveMinLength(
    expectedState.minBodyLength,
    INFRA_DESIGN_DOC_MIN_BODY_LENGTH
  );
  const minTitleLength = resolveMinLength(
    expectedState.minTitleLength,
    INFRA_DESIGN_DOC_MIN_TITLE_LENGTH
  );
  const minAnswerLength = resolveMinLength(
    expectedState.minAnswerLength,
    INFRA_DESIGN_FOLLOWUP_MIN_ANSWER_LENGTH
  );

  const scenarioHint =
    typeof initialState.prompt === 'string'
      ? initialState.prompt
      : 'Document a backup topology decision for Harbor Dental, then answer tradeoff follow-ups generated from your design.';

  const [phase, setPhase] = useState<'design' | 'questions'>('design');
  const [title, setTitle] = useState('Harbor Dental backup topology ADR');
  const [topologyChoice, setTopologyChoice] = useState('');
  const [body, setBody] = useState('');
  const [questions, setQuestions] = useState<InfraQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
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
        const res = await fetch(`/api/tickets/${ticket.id}/infra-questions`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        const data = (await res.json()) as PhaseResponse;
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load capstone progress');
        }
        if (cancelled) return;

        if (data.designDoc) {
          setTitle(data.designDoc.title || '');
          setBody(data.designDoc.body || '');
          setTopologyChoice(data.designDoc.topologyChoice || '');
        }

        if (data.phase === 'questions' && (data.questions?.length ?? 0) > 0) {
          setPhase('questions');
          setQuestions(data.questions ?? []);
          setAnswers((prev) => {
            const next = { ...prev };
            for (const q of data.questions ?? []) {
              if (next[q.id] === undefined) next[q.id] = '';
            }
            return next;
          });
          setMeta(
            data.source
              ? `Questions ${
                  data.source === 'llm'
                    ? 'generated from your design doc'
                    : 'derived from your design doc'
                }${
                  data.generatedAt
                    ? ` · ${new Date(data.generatedAt).toLocaleString()}`
                    : ''
                }`
              : null
          );
        } else {
          setPhase('design');
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
      const res = await fetch(`/api/tickets/${ticket.id}/infra-questions`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          designDoc: {
            title,
            body,
            topologyChoice: topologyChoice.trim() || undefined,
          },
        }),
      });
      const data = (await res.json()) as PhaseResponse;
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate follow-up questions');
      }

      setPhase('questions');
      setQuestions(data.questions ?? []);
      setAnswers((prev) => {
        const next = { ...prev };
        for (const q of data.questions ?? []) {
          if (next[q.id] === undefined) next[q.id] = '';
        }
        return next;
      });
      setMeta(
        data.source
          ? `Questions ${
              data.source === 'llm'
                ? 'generated from your design doc'
                : 'derived from your design doc'
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
          : 'Failed to generate follow-up questions'
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
          type: 'infra_design_capstone',
          designDoc: {
            title,
            body,
            topologyChoice: topologyChoice.trim() || undefined,
          },
          questions,
          answers,
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
          : 'Failed to submit infrastructure design capstone'
      );
      setFeedbackTone('error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="infra-design-capstone-heading"
      className={cn('space-y-5', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="space-y-1">
        <h2 id="infra-design-capstone-heading" className="text-base font-semibold">
          Infrastructure design decision (SA-07 / PI-07)
        </h2>
        <p className="text-sm text-muted-foreground">{scenarioHint}</p>
        <p className="text-xs text-muted-foreground">
          Phase 1: write a short backup-topology ADR. Phase 2: answer 4–5
          tradeoff questions generated from your design (flagship portfolio
          item).
        </p>
        {meta ? <p className="text-xs text-muted-foreground">{meta}</p> : null}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading capstone progress…</p>
      ) : null}

      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}

      <div className="space-y-3 rounded-md border border-border p-4">
        <h3 className="text-sm font-medium">
          Phase 1 — Design decision document
        </h3>
        <div className="space-y-2">
          <Label htmlFor="infra-design-title">Title</Label>
          <Input
            id="infra-design-title"
            value={title}
            disabled={readOnly || phase === 'questions'}
            onChange={(event) => setTitle(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {title.trim().length} / min {minTitleLength}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="infra-design-topology">
            Topology choice (short label)
          </Label>
          <Input
            id="infra-design-topology"
            value={topologyChoice}
            disabled={readOnly || phase === 'questions'}
            placeholder="e.g. 3-2-1 NAS + immutable cloud"
            onChange={(event) => setTopologyChoice(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="infra-design-body">Decision document</Label>
          <Textarea
            id="infra-design-body"
            value={body}
            disabled={readOnly || phase === 'questions'}
            rows={12}
            placeholder="State the backup topology you chose, constraints you honored, alternatives you rejected, explicit tradeoffs, failure modes, and who operates restores…"
            onChange={(event) => setBody(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {body.trim().length} / min {minBodyLength} characters
          </p>
        </div>

        {phase === 'design' ? (
          <Button
            type="button"
            disabled={
              readOnly ||
              loading ||
              generating ||
              title.trim().length < minTitleLength ||
              body.trim().length < minBodyLength
            }
            onClick={() => void handleGenerateQuestions()}
          >
            {generating
              ? 'Generating follow-up questions…'
              : 'Generate tradeoff follow-up questions'}
          </Button>
        ) : null}
      </div>

      {phase === 'questions' ? (
        <div className="space-y-4">
          <h3 className="text-sm font-medium">
            Phase 2 — Tradeoff follow-up questions
          </h3>
          <ol className="space-y-5">
            {questions.map((question, index) => (
              <li key={question.id} className="space-y-2">
                <Label
                  htmlFor={`infra-${question.id}`}
                  className="text-sm leading-snug"
                >
                  {index + 1}. {question.prompt}
                </Label>
                <Textarea
                  id={`infra-${question.id}`}
                  value={answers[question.id] ?? ''}
                  disabled={readOnly}
                  rows={4}
                  placeholder={`Write a substantiated answer (min ${minAnswerLength} characters)…`}
                  onChange={(event) =>
                    setAnswers((prev) => ({
                      ...prev,
                      [question.id]: event.target.value,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {(answers[question.id] ?? '').trim().length} characters
                </p>
              </li>
            ))}
          </ol>

          <Button
            type="button"
            disabled={
              readOnly || loading || questions.length === 0 || isSubmitting
            }
            onClick={() => void handleSubmit()}
          >
            {isSubmitting ? 'Submitting…' : 'Submit design + answers'}
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
          {isFlagship ? ' Flagship portfolio item (PI-07) recorded.' : ''}
        </p>
      ) : null}
    </section>
  );
}
