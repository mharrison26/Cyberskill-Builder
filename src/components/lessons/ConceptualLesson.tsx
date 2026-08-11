'use client';

import { LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { LessonContent } from '@/components/LessonContent';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { LessonGradingPhase } from '@/lib/grading/lessonGradingStatus';
import { CONCEPTUAL_MIN_MEMO_LENGTH } from '@/lib/lessons/conceptualValidation';
import type { Lesson } from '@/types';
import { cn } from '@/lib/utils';

type ConceptualLessonProps = {
  lesson: Lesson;
  content?: string | null;
  className?: string;
  initialMemo?: string | null;
  initialPhase?: LessonGradingPhase;
  initialGradingError?: string | null;
  initialSubmittedAt?: string | null;
};

function parseObjectives(text: string | null): string[] {
  if (!text?.trim()) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);
}

function resolveLessonMarkdown(
  content: string | null | undefined,
  scenarioBrief: string | null | undefined,
  objectives: string[]
): string | null {
  if (content?.trim()) {
    return content.trim();
  }

  if (scenarioBrief?.trim()) {
    return `## Scenario\n\n${scenarioBrief.trim()}`;
  }

  if (objectives.length === 0) {
    return null;
  }

  return objectives.map((objective) => `- ${objective}`).join('\n');
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

const SAMPLE_MARKDOWN = `## Overview

This conceptual lesson introduces core governance, risk, and compliance concepts aligned to **NIST SP 800-53 Rev. 5**.

### Key takeaways

- Control families group related security requirements
- Baselines are selected using FIPS 199 impact levels
- Tailoring reduces assessment scope through inheritance

\`\`\`text
RMF Step 2 (Select) → choose baseline → tailor controls → document in SSP
\`\`\`

> Full lesson content will replace this sample once published in the CMS.`;

const POLL_INTERVAL_MS = 2500;

export function ConceptualLesson({
  lesson,
  content,
  className,
  initialMemo = null,
  initialPhase = 'not_submitted',
  initialGradingError = null,
  initialSubmittedAt = null,
}: ConceptualLessonProps) {
  const router = useRouter();
  const objectives = parseObjectives(lesson.learning_objectives);
  const scenarioBrief =
    typeof lesson.content?.scenarioBrief === 'string' &&
    lesson.content.scenarioBrief.trim()
      ? lesson.content.scenarioBrief.trim()
      : null;
  const markdown =
    resolveLessonMarkdown(content, scenarioBrief, objectives) ??
    SAMPLE_MARKDOWN;

  const [started, setStarted] = useState(
    Boolean(initialMemo) || initialPhase !== 'not_submitted'
  );
  const [memo, setMemo] = useState(initialMemo ?? '');
  const [memoError, setMemoError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [phase, setPhase] = useState<LessonGradingPhase>(initialPhase);
  const [gradingError, setGradingError] = useState<string | null>(
    initialGradingError
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const waitStartedAtRef = useRef<number | null>(
    initialPhase === 'pending' && initialSubmittedAt
      ? Date.parse(initialSubmittedAt)
      : null
  );

  useEffect(() => {
    if (phase !== 'pending') {
      return;
    }

    if (waitStartedAtRef.current == null) {
      waitStartedAtRef.current = Date.now();
    }

    const tick = () => {
      const startedAt = waitStartedAtRef.current ?? Date.now();
      setElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      );
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'pending') {
      return;
    }

    let cancelled = false;

    async function pollStatus() {
      try {
        const response = await fetch(`/api/lessons/${lesson.id}/status`, {
          method: 'GET',
          cache: 'no-store',
        });
        if (!response.ok || cancelled) return;

        const payload = (await response.json()) as {
          phase?: LessonGradingPhase;
          memo?: string | null;
          gradingError?: string | null;
        };

        if (cancelled) return;

        if (payload.memo?.trim()) {
          setMemo(payload.memo);
        }

        if (payload.phase === 'completed') {
          setPhase('completed');
          setGradingError(null);
          router.refresh();
          return;
        }

        if (payload.phase === 'failed') {
          setPhase('failed');
          setGradingError(
            payload.gradingError ??
              'Grading failed — your answer is saved. You can retry.'
          );
        }
      } catch {
        // Keep polling; transient network errors should not clear pending state.
      }
    }

    void pollStatus();
    const timer = window.setInterval(() => {
      void pollStatus();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [phase, lesson.id, router]);

  function scrollToExercise() {
    setStarted(true);
    requestAnimationFrame(() => {
      document
        .getElementById('lesson-exercise')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (phase === 'pending' || phase === 'completed') return;

    setSubmitError(null);
    setGradingError(null);

    const trimmed = memo.trim();
    if (!trimmed) {
      setMemoError('Memo is required.');
      return;
    }
    if (trimmed.length < CONCEPTUAL_MIN_MEMO_LENGTH) {
      setMemoError(
        `Memo must be at least ${CONCEPTUAL_MIN_MEMO_LENGTH} characters.`
      );
      return;
    }
    setMemoError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/lessons/${lesson.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'conceptual',
          memo: trimmed,
          submittedAt: new Date().toISOString(),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        success?: boolean;
        grading?: {
          status?: 'completed' | 'failed' | 'queued';
          error?: string | null;
          findingId?: string | null;
          aiFindingState?: string | null;
        };
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to save memo submission.');
      }

      // Answer is saved before grading; reflect that immediately.
      setMemo(trimmed);
      waitStartedAtRef.current = Date.now();
      setElapsedSeconds(0);

      if (payload.grading?.status === 'completed') {
        setPhase('completed');
        setGradingError(null);
        router.refresh();
        return;
      }

      if (payload.grading?.status === 'failed') {
        setPhase('failed');
        setGradingError(
          payload.grading.error ??
            'Grading failed — your answer is saved. You can retry.'
        );
        return;
      }

      setPhase('pending');
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

  async function handleRetryGrading() {
    setIsRetrying(true);
    setSubmitError(null);
    setGradingError(null);
    waitStartedAtRef.current = Date.now();
    setElapsedSeconds(0);
    setPhase('pending');

    try {
      const response = await fetch(`/api/lessons/${lesson.id}/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const payload = (await response.json()) as {
        error?: string;
        grading?: { status?: string; error?: string | null };
      };

      if (!response.ok) {
        setPhase('failed');
        setGradingError(
          payload.error ??
            payload.grading?.error ??
            'Grading failed — your answer is saved. You can retry.'
        );
        return;
      }

      if (payload.grading?.status === 'completed') {
        setPhase('completed');
        setGradingError(null);
        router.refresh();
        return;
      }

      if (payload.grading?.status === 'failed') {
        setPhase('failed');
        setGradingError(
          payload.grading.error ??
            'Grading failed — your answer is saved. You can retry.'
        );
        return;
      }

      // queued (background worker) or unknown — poll /status for completion.
      setPhase('pending');
    } catch (error) {
      setPhase('failed');
      setGradingError(
        error instanceof Error
          ? error.message
          : 'Grading failed — your answer is saved. You can retry.'
      );
    } finally {
      setIsRetrying(false);
    }
  }

  const formLocked =
    isSubmitting || isRetrying || phase === 'pending' || phase === 'completed';
  const showPending = phase === 'pending';
  const showFailed = phase === 'failed';
  const showCompleted = phase === 'completed';

  return (
    <article className={cn('space-y-6', className)}>
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="capitalize">
            {lesson.tier} tier
          </Badge>
          <Badge variant="outline">Conceptual</Badge>
          {lesson.dcwf_code ? (
            <Badge variant="outline">{lesson.dcwf_code}</Badge>
          ) : null}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {lesson.title}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={scrollToExercise}>
            {started ? 'Continue exercise' : 'Start scenario'}
          </Button>
          <p className="text-sm text-muted-foreground">
            Read the brief, then draft and submit your memo below.
          </p>
        </div>
      </header>

      {objectives.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Learning objectives</CardTitle>
            <CardDescription>
              By the end of this lesson, you should be able to:
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-sm text-foreground">
              {objectives.map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scenario</CardTitle>
        </CardHeader>
        <CardContent>
          <div id="lesson-content" tabIndex={-1} className="outline-none">
            <LessonContent content={markdown} />
          </div>
        </CardContent>
      </Card>

      <Card id="lesson-exercise">
        <CardHeader>
          <CardTitle className="text-base">Your memo</CardTitle>
          <CardDescription>
            Draft the orientation memo asked for in the scenario. Minimum{' '}
            {CONCEPTUAL_MIN_MEMO_LENGTH} characters.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="conceptual-memo">Memo</Label>
              <Textarea
                id="conceptual-memo"
                rows={10}
                value={memo}
                onChange={(event) => {
                  setMemo(event.target.value);
                  if (memoError) setMemoError(null);
                }}
                placeholder="Write your one-page orientation memo…"
                aria-invalid={Boolean(memoError)}
                disabled={formLocked}
                readOnly={showCompleted}
              />
              {memoError ? (
                <p className="text-sm text-destructive">{memoError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {memo.trim().length}/{CONCEPTUAL_MIN_MEMO_LENGTH} minimum
                  characters
                </p>
              )}
            </div>

            {submitError ? (
              <p className="text-sm text-destructive" role="alert">
                {submitError}
              </p>
            ) : null}

            {showPending ? (
              <div
                role="status"
                className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm"
              >
                <LoaderCircle
                  className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-medium text-foreground">
                    Grading in progress
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    Memo submitted. Results will appear here once grading
                    completes. Elapsed: {formatElapsed(elapsedSeconds)}
                  </p>
                </div>
              </div>
            ) : null}

            {showFailed ? (
              <div
                role="alert"
                className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-destructive">
                    Grading failed — your answer is saved
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {gradingError ??
                      'Grading failed — your answer is saved. You can retry.'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void handleRetryGrading();
                  }}
                  disabled={isRetrying}
                >
                  {isRetrying ? 'Retrying…' : 'Retry grading'}
                </Button>
              </div>
            ) : null}

            {showCompleted ? (
              <p className="text-sm text-foreground" role="status">
                Memo graded. Feedback appears above when available.
              </p>
            ) : null}

            {phase === 'not_submitted' || phase === 'failed' ? (
              <Button type="submit" disabled={isSubmitting || isRetrying}>
                {isSubmitting
                  ? 'Submitting…'
                  : phase === 'failed'
                    ? 'Resubmit memo'
                    : 'Submit memo'}
              </Button>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </article>
  );
}
