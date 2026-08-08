'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AO_REVIEW_MIN_ANSWER_LENGTH } from '@/lib/scoring/aoReview';
import { cn } from '@/lib/utils';
import type { Ticket } from '@/types';

type AoQuestion = {
  id: string;
  prompt: string;
  focus?: string;
};

type QuestionsResponse = {
  questions?: AoQuestion[];
  source?: string;
  generatedAt?: string;
  error?: string;
};

type SubmitResponse = {
  success?: boolean;
  status?: string;
  feedback?: string;
  error?: string;
};

type AoReviewTicketProps = {
  ticket: Pick<Ticket, 'id' | 'ticket_type' | 'initial_state' | 'expected_state'>;
  readOnly?: boolean;
  className?: string;
};

export function AoReviewTicket({
  ticket,
  readOnly = false,
  className,
}: AoReviewTicketProps) {
  const [questions, setQuestions] = useState<AoQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'ok' | 'error' | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/tickets/${ticket.id}/ao-questions`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });
        const data = (await res.json()) as QuestionsResponse;
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load AO questions');
        }
        if (!cancelled) {
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
              ? `Questions ${data.source === 'llm' ? 'generated from your package' : 'derived from your package'} ${
                  data.generatedAt
                    ? `· ${new Date(data.generatedAt).toLocaleString()}`
                    : ''
                }`
              : null
          );
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : 'Failed to load questions'
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
          type: 'ao_review',
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
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Failed to submit AO answers'
      );
      setFeedbackTone('error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="ao-review-heading"
      className={cn('space-y-4', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="space-y-1">
        <h2 id="ao-review-heading" className="text-base font-semibold">
          Authorizing Official review
        </h2>
        <p className="text-sm text-muted-foreground">
          Answer these risk-acceptance questions grounded in your compiled
          authorization package. Questions are generated once and stored so they
          do not change on every visit.
        </p>
        {meta ? (
          <p className="text-xs text-muted-foreground">{meta}</p>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">
          Generating AO questions from your package…
        </p>
      ) : null}

      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}

      <ol className="space-y-5">
        {questions.map((question, index) => (
          <li key={question.id} className="space-y-2">
            <Label htmlFor={`ao-${question.id}`} className="text-sm leading-snug">
              {index + 1}. {question.prompt}
            </Label>
            <Textarea
              id={`ao-${question.id}`}
              value={answers[question.id] ?? ''}
              disabled={readOnly}
              rows={4}
              placeholder={`Write a substantiated answer (min ${AO_REVIEW_MIN_ANSWER_LENGTH} characters)…`}
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
        disabled={readOnly || loading || questions.length === 0 || isSubmitting}
        onClick={() => void handleSubmit()}
      >
        {isSubmitting ? 'Submitting…' : 'Submit AO responses'}
      </Button>

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
