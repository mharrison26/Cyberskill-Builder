'use client';

import { useEffect, useState } from 'react';

import { DefensePlayback } from '@/components/DefensePlayback';
import {
  DefenseRecorder,
  type DefenseRecordingResult,
} from '@/components/DefenseRecorder';
import { CompiledPackagePanel } from '@/components/tickets/CompiledPackagePanel';
import { Button } from '@/components/ui/button';
import {
  asSubmissionRecord,
  restoredString,
  useTicketWorkbenchForm,
} from '@/hooks/useTicketWorkbenchForm';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AO_REVIEW_MIN_ANSWER_LENGTH } from '@/lib/scoring/ticketUi';
import { cn } from '@/lib/utils';
import type { MockDefenseRecording, Ticket } from '@/types';

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
  ticket: Pick<
    Ticket,
    'id' | 'track_id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

function toPlaybackRecording(
  result: DefenseRecordingResult
): MockDefenseRecording {
  return {
    id: result.id,
    url: result.url,
    mediaType: result.mediaType,
    durationSeconds: result.durationSeconds,
    isPublic: result.isPublic,
    createdAt: new Date().toISOString(),
  };
}

function restoredAnswerMap(
  submission: Record<string, unknown> | null | undefined
): Record<string, string> {
  const raw = submission?.answers;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

function writtenAnswersComplete(
  questions: AoQuestion[],
  answers: Record<string, string>
): boolean {
  if (questions.length === 0) return false;
  return questions.every((question) => {
    const answer = (answers[question.id] ?? '').trim();
    return answer.length >= AO_REVIEW_MIN_ANSWER_LENGTH;
  });
}

/**
 * Sheet GRC-10 / ISSO-05 / legacy GRC-11 flagship: compile GRC-03/04/09 into the
 * package under review, generate AO questions via RAG, then defend residual risk.
 *
 * PI-14 (verbal defense recorder) is live — DefenseRecorder is the primary
 * response path; written Q&A remains an explicit fallback.
 */
export function AoReviewTicket({
  ticket,
  readOnly = false,
  className,
}: AoReviewTicketProps) {
  const {
    submission,
    formReadOnly,
    hideSubmit,
    lastFeedback,
  } = useTicketWorkbenchForm(readOnly);
  const restored = asSubmissionRecord(submission);
  const savedAnswers = restoredAnswerMap(restored);
  const [questions, setQuestions] = useState<AoQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>(() => savedAnswers);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(() => lastFeedback);
  const [feedbackTone, setFeedbackTone] = useState<'ok' | 'error' | null>(null);
  const [defense, setDefense] = useState<MockDefenseRecording | null>(null);
  const [showWritten, setShowWritten] = useState(false);
  const [reflection, setReflection] = useState(() => restoredString(submission, 'reflection'));

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
            const next = { ...savedAnswers, ...prev };
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

  function handleDefenseSubmitted(result: DefenseRecordingResult) {
    setDefense(toPlaybackRecording(result));
    setFeedback(null);
    setFeedbackTone(null);
  }

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
          type: 'ao_review',
          questions,
          answers,
          defenseRecordingId: defense?.id ?? null,
          reflection: reflection.trim() || undefined,
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

  const hasVerbalDefense = Boolean(defense?.id);
  const hasWrittenFallback = writtenAnswersComplete(questions, answers);
  const canSubmit =
    !readOnly &&
    !loading &&
    questions.length > 0 &&
    !isSubmitting &&
    (hasVerbalDefense || hasWrittenFallback);

  return (
    <section
      aria-labelledby="ao-review-heading"
      className={cn('space-y-4', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="space-y-1">
        <h2 id="ao-review-heading" className="text-base font-semibold">
          RMF package defense (AO review)
        </h2>
        <p className="text-sm text-muted-foreground">
          Defend residual risk and POA&M adequacy for your compiled ATO package
          (GRC-03 SSP, GRC-04 POA&M, GRC-09 OSCAL). Record audio or video
          answering the RAG-generated AO questions — primary path (PI-14
          DefenseRecorder). Written answers are the fallback. Resolving this
          ticket marks it as your track flagship portfolio item.
        </p>
        {meta ? <p className="text-xs text-muted-foreground">{meta}</p> : null}
      </div>

      <CompiledPackagePanel
        ticketId={ticket.id}
        heading="Package under review"
        description="Your GRC-03, GRC-04, and GRC-09 artifacts compiled for this student and track. AO questions are grounded in this package."
      />

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

      {!loading && !loadError && questions.length > 0 ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Primary: verbal defense</h3>
            <p className="text-xs text-muted-foreground">
              {/* PI-14 live: DefenseRecorder is the primary AO response path. */}
              Answer the AO questions aloud, then confirm upload before
              submitting the ticket.
            </p>
          </div>

          {defense ? (
            <div className="space-y-3">
              <DefensePlayback
                recording={defense}
                persistVisibility={!defense.id.startsWith('defense-local-')}
                showVisibilityToggle={!defense.id.startsWith('defense-local-')}
                onPublicChange={(next) =>
                  setDefense((prev) =>
                    prev ? { ...prev, isPublic: next } : prev
                  )
                }
              />
              {!hideSubmit ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setDefense(null)}
                >
                  Record again
                </Button>
              ) : null}
            </div>
          ) : (
            <DefenseRecorder
              artifactId={ticket.id}
              trackId={ticket.track_id}
              promptQuestions={questions}
              onSubmitted={handleDefenseSubmitted}
            />
          )}
        </div>
      ) : null}

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">
              Fallback: written responses
            </h3>
            <p className="text-xs text-muted-foreground">
              Use if you cannot record, or to add a short written reflection
              alongside your recording. Complete every question (
              {AO_REVIEW_MIN_ANSWER_LENGTH}+ characters) to submit without a
              recording.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setShowWritten((open) => !open)}
          >
            {showWritten ? 'Hide written path' : 'Show written path'}
          </Button>
        </div>

        {showWritten ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="ao-reflection" className="text-sm">
                Optional reflection (not required when a recording is uploaded)
              </Label>
              <Textarea
                id="ao-reflection"
                value={reflection}
                disabled={formReadOnly}
                rows={3}
                placeholder="Optional notes for graders or your portfolio…"
                onChange={(event) => setReflection(event.target.value)}
              />
            </div>

            <ol className="space-y-5">
              {questions.map((question, index) => (
                <li key={question.id} className="space-y-2">
                  <Label
                    htmlFor={`ao-${question.id}`}
                    className="text-sm leading-snug"
                  >
                    {index + 1}. {question.prompt}
                  </Label>
                  <Textarea
                    id={`ao-${question.id}`}
                    value={answers[question.id] ?? ''}
                    disabled={formReadOnly}
                    rows={4}
                    placeholder={`Written answer (min ${AO_REVIEW_MIN_ANSWER_LENGTH} characters if used without a recording)…`}
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
          </>
        ) : null}
      </div>

      <Button
        type="button"
        disabled={!canSubmit}
        onClick={() => void handleSubmit()}
      >
        {isSubmitting ? 'Submitting…' : 'Submit AO defense'}
      </Button>

      {!hasVerbalDefense &&
      !hasWrittenFallback &&
      !loading &&
      questions.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Upload a verbal defense recording (primary), or complete written
          answers for every question (fallback) to enable submit.
        </p>
      ) : null}

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
