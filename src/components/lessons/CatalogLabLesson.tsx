'use client';

import Link from 'next/link';
import { useState } from 'react';

import { LessonContent } from '@/components/LessonContent';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CATALOG_LAB_MIN_EXPLANATION_LENGTH } from '@/lib/lessons/catalogLabValidation';
import type { Lesson } from '@/types';
import { cn } from '@/lib/utils';

type CatalogLabLessonProps = {
  lesson: Lesson;
  content?: string | null;
  catalogHref?: string;
  className?: string;
};

type FormErrors = {
  controlIds?: string;
  explanation?: string;
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
  scenarioBrief: string | null,
  objectives: string[]
): string | null {
  if (content?.trim()) return content.trim();
  if (scenarioBrief?.trim()) {
    return `## Scenario\n\n${scenarioBrief.trim()}`;
  }
  if (objectives.length === 0) return null;
  return objectives.map((objective) => `- ${objective}`).join('\n');
}

function parseIdField(value: string): string[] {
  return value
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function CatalogLabLesson({
  lesson,
  content,
  catalogHref = '/tracks/grc/catalog',
  className,
}: CatalogLabLessonProps) {
  const objectives = parseObjectives(lesson.learning_objectives);
  const scenarioBrief =
    typeof lesson.content?.scenarioBrief === 'string' &&
    lesson.content.scenarioBrief.trim()
      ? lesson.content.scenarioBrief.trim()
      : null;
  const markdown = resolveLessonMarkdown(content, scenarioBrief, objectives);

  const [controlIdsText, setControlIdsText] = useState('');
  const [adjacentAcText, setAdjacentAcText] = useState('');
  const [explanation, setExplanation] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function scrollToExercise() {
    document
      .getElementById('lesson-exercise')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    const controlIds = parseIdField(controlIdsText);
    if (controlIds.length === 0) {
      nextErrors.controlIds =
        'List IA-family control IDs from the catalog (comma or newline separated).';
    }

    const trimmedExplanation = explanation.trim();
    if (!trimmedExplanation) {
      nextErrors.explanation = 'Explanation is required.';
    } else if (trimmedExplanation.length < CATALOG_LAB_MIN_EXPLANATION_LENGTH) {
      nextErrors.explanation = `Explanation must be at least ${CATALOG_LAB_MIN_EXPLANATION_LENGTH} characters.`;
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(false);

    if (!validate()) return;

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/lessons/${lesson.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'catalog_lab',
          controlIds: parseIdField(controlIdsText),
          adjacentAcControls: parseIdField(adjacentAcText),
          explanation: explanation.trim(),
          submittedAt: new Date().toISOString(),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        success?: boolean;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to save catalog lab submission.');
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
          <Badge variant="outline">Catalog lab</Badge>
          {lesson.dcwf_code ? (
            <Badge variant="outline">{lesson.dcwf_code}</Badge>
          ) : null}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{lesson.title}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={scrollToExercise}>
            Start scenario
          </Button>
          <p className="text-sm text-muted-foreground">
            Open the catalog, build your shortlist, then submit below.
          </p>
        </div>
      </header>

      {objectives.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Learning objectives</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              {objectives.map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {markdown ? (
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
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Control catalog</CardTitle>
          <CardDescription>
            Use the live NIST SP 800-53 catalog browser — do not memorize. Open
            it in another tab, filter the IA family, then paste your shortlist
            below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href={catalogHref}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            Open control catalog
          </Link>
        </CardContent>
      </Card>

      <Card id="lesson-exercise">
        <CardHeader>
          <CardTitle className="text-base">Your submission</CardTitle>
          <CardDescription>
            List every IA-family control ID for the shortlist. Separately note
            authentication-adjacent AC controls (e.g. AC-7) and explain why they
            are adjacent but not IA — including why AC-2 must not be cited as IA.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="catalog-lab-control-ids">
                IA-family control IDs
              </Label>
              <Textarea
                id="catalog-lab-control-ids"
                rows={5}
                value={controlIdsText}
                onChange={(event) => {
                  setControlIdsText(event.target.value);
                  setSubmitSuccess(false);
                }}
                placeholder="ia-1, ia-2, ia-3, …"
                aria-invalid={Boolean(errors.controlIds)}
                disabled={isSubmitting}
              />
              {errors.controlIds ? (
                <p className="text-sm text-destructive">{errors.controlIds}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Comma or newline separated. Use the catalog — include base IA
                  controls (ia-1 through ia-13).
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="catalog-lab-adjacent-ac">
                Authentication-adjacent AC controls
              </Label>
              <Textarea
                id="catalog-lab-adjacent-ac"
                rows={3}
                value={adjacentAcText}
                onChange={(event) => {
                  setAdjacentAcText(event.target.value);
                  setSubmitSuccess(false);
                }}
                placeholder="ac-7"
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Optional but graded — e.g. AC-7 (unsuccessful logon attempts).
                Keep AC-2 out of the IA list.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="catalog-lab-explanation">Explanation</Label>
              <Textarea
                id="catalog-lab-explanation"
                rows={6}
                value={explanation}
                onChange={(event) => {
                  setExplanation(event.target.value);
                  setSubmitSuccess(false);
                }}
                placeholder="Explain how you scoped the IA family and why authentication-adjacent AC controls (and AC-2 vs IA-5) are distinct…"
                aria-invalid={Boolean(errors.explanation)}
                disabled={isSubmitting}
              />
              {errors.explanation ? (
                <p className="text-sm text-destructive">{errors.explanation}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Minimum {CATALOG_LAB_MIN_EXPLANATION_LENGTH} characters.
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
                Submission saved. You can continue once grading completes.
              </p>
            ) : null}

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting…' : 'Submit catalog lab'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </article>
  );
}
