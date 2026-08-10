'use client';

import { useState } from 'react';

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
import { CONCEPTUAL_MIN_MEMO_LENGTH } from '@/lib/lessons/conceptualValidation';
import type { Lesson } from '@/types';
import { cn } from '@/lib/utils';

type ConceptualLessonProps = {
  lesson: Lesson;
  content?: string | null;
  className?: string;
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

export function ConceptualLesson({
  lesson,
  content,
  className,
}: ConceptualLessonProps) {
  const objectives = parseObjectives(lesson.learning_objectives);
  const scenarioBrief =
    typeof lesson.content?.scenarioBrief === 'string' &&
    lesson.content.scenarioBrief.trim()
      ? lesson.content.scenarioBrief.trim()
      : null;
  const markdown =
    resolveLessonMarkdown(content, scenarioBrief, objectives) ??
    SAMPLE_MARKDOWN;

  const [started, setStarted] = useState(false);
  const [memo, setMemo] = useState('');
  const [memoError, setMemoError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    setSubmitError(null);
    setSubmitSuccess(false);

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
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to save memo submission.');
      }

      setSubmitSuccess(true);
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
                  setSubmitSuccess(false);
                  if (memoError) setMemoError(null);
                }}
                placeholder="Write your one-page orientation memo…"
                aria-invalid={Boolean(memoError)}
                disabled={isSubmitting}
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

            {submitSuccess ? (
              <p className="text-sm text-foreground" role="status">
                Memo submitted. Results will appear here once grading completes.
              </p>
            ) : null}

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting…' : 'Submit memo'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </article>
  );
}
