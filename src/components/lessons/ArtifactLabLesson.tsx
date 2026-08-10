'use client';

import { useState } from 'react';

import { CCCERForm } from '@/components/CCCERForm';
import { EvidenceCodeBlock } from '@/components/EvidenceCodeBlock';
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
import type { CCCERValues, Lesson } from '@/types';
import { cn } from '@/lib/utils';

type ArtifactLabLessonProps = {
  lesson: Lesson;
  evidenceArtifact?: string | null;
  className?: string;
};

const PLACEHOLDER_EVIDENCE = JSON.stringify(
  {
    uuid: '00000000-0000-4000-8000-000000000001',
    title: 'Sample OSCAL assessment result',
    description:
      'Placeholder evidence artifact for this lab. Replace with live catalog data in production.',
    status: 'partial',
    result: {
      control_id: 'ac-1',
      finding: 'insufficient_evidence',
      observations: [
        {
          description:
            'Policy document exists but lacks annual review date and responsible role assignment.',
          methods: ['EXAMINE'],
        },
      ],
    },
  },
  null,
  2
);

function parseObjectives(text: string | null): string[] {
  if (!text?.trim()) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);
}

function resolveEvidenceArtifact(
  evidenceArtifact: string | null | undefined
): string {
  if (evidenceArtifact?.trim()) {
    return evidenceArtifact.trim();
  }
  return PLACEHOLDER_EVIDENCE;
}

export function ArtifactLabLesson({
  lesson,
  evidenceArtifact,
  className,
}: ArtifactLabLessonProps) {
  const objectives = parseObjectives(lesson.learning_objectives);
  const scenarioBrief =
    typeof lesson.content?.scenarioBrief === 'string' &&
    lesson.content.scenarioBrief.trim()
      ? lesson.content.scenarioBrief.trim()
      : null;
  const evidenceCode = resolveEvidenceArtifact(evidenceArtifact);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  function scrollToExercise() {
    document
      .getElementById('lesson-exercise')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleSubmit(values: CCCERValues) {
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      const response = await fetch(`/api/lessons/${lesson.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const payload = (await response.json()) as {
        error?: string;
        success?: boolean;
      };

      if (!response.ok) {
        setSubmitError(payload.error ?? 'Submission failed. Please try again.');
        return;
      }

      setSubmitSuccess(true);
    } catch {
      setSubmitError('Network error. Check your connection and try again.');
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
          <Badge variant="outline">Artifact lab</Badge>
          {lesson.dcwf_code ? (
            <Badge variant="outline">DCWF {lesson.dcwf_code}</Badge>
          ) : null}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {lesson.title}
        </h1>
        {lesson.dcwf_code ? (
          <p className="text-sm text-muted-foreground">
            Work role alignment:{' '}
            <span className="font-mono font-medium text-foreground">
              {lesson.dcwf_code}
            </span>
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={scrollToExercise}>
            Start scenario
          </Button>
          <p className="text-sm text-muted-foreground">
            Review the evidence, then document your CCCER finding below.
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

      {scenarioBrief ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scenario</CardTitle>
          </CardHeader>
          <CardContent>
            <div id="lesson-content" tabIndex={-1} className="outline-none">
              <LessonContent content={scenarioBrief} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div id="lesson-exercise" tabIndex={-1} className="space-y-6 outline-none">
        <EvidenceCodeBlock
          code={evidenceCode}
          language="json"
          title="Evidence artifact"
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your finding</CardTitle>
            <CardDescription>
              Analyze the evidence above and document your assessment using
              CCCER.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CCCERForm
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              submitError={submitError}
              submitSuccess={submitSuccess}
            />
          </CardContent>
        </Card>
      </div>
    </article>
  );
}
