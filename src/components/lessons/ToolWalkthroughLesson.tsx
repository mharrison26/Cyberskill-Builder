'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LessonContent } from '@/components/LessonContent';
import { TOOL_WALKTHROUGH_MIN_REFLECTION_LENGTH } from '@/lib/lessons/toolWalkthroughValidation';
import type { Lesson } from '@/types';
import { cn } from '@/lib/utils';

const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

type ToolWalkthroughLessonProps = {
  lesson: Lesson;
  className?: string;
};

type FormErrors = {
  file?: string;
  externalReference?: string;
  reflection?: string;
};

function parseObjectives(text: string | null): string[] {
  if (!text?.trim()) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);
}

function isAcceptedImage(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(
    file.type as (typeof ACCEPTED_IMAGE_TYPES)[number]
  );
}

export function ToolWalkthroughLesson({
  lesson,
  className,
}: ToolWalkthroughLessonProps) {
  const objectives = parseObjectives(lesson.learning_objectives);
  const scenarioBrief =
    typeof lesson.content?.scenarioBrief === 'string' &&
    lesson.content.scenarioBrief.trim()
      ? lesson.content.scenarioBrief.trim()
      : null;
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [externalReference, setExternalReference] = useState('');
  const [reflection, setReflection] = useState('');
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

    if (!selectedFile) {
      nextErrors.file = 'An image file is required.';
    } else if (!isAcceptedImage(selectedFile)) {
      nextErrors.file = 'File must be JPEG, PNG, WebP, or GIF.';
    } else if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      nextErrors.file = 'File must be 5 MB or smaller.';
    }

    const trimmedReference = externalReference.trim();
    if (!trimmedReference) {
      nextErrors.externalReference =
        'External reference is required (e.g. risk register ID or URL).';
    }

    const trimmedReflection = reflection.trim();
    if (!trimmedReflection) {
      nextErrors.reflection = 'Reflection is required.';
    } else if (
      trimmedReflection.length < TOOL_WALKTHROUGH_MIN_REFLECTION_LENGTH
    ) {
      nextErrors.reflection = `Reflection must be at least ${TOOL_WALKTHROUGH_MIN_REFLECTION_LENGTH} characters.`;
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setSubmitSuccess(false);
    setSubmitError(null);
    if (errors.file) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.file;
        return next;
      });
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(false);

    if (!validate() || !selectedFile) {
      return;
    }

    setIsSubmitting(true);

    try {
      const uploadFormData = new FormData();
      uploadFormData.append('lessonId', lesson.id);
      uploadFormData.append('file', selectedFile);

      const uploadResponse = await fetch('/api/lessons/upload', {
        method: 'POST',
        body: uploadFormData,
      });

      const uploadPayload = (await uploadResponse.json()) as {
        error?: string;
        storagePath?: string;
        uploadedAt?: string;
      };

      if (!uploadResponse.ok) {
        throw new Error(
          uploadPayload.error ?? 'Failed to upload evidence file.'
        );
      }

      const storagePath = uploadPayload.storagePath;
      const uploadedAt = uploadPayload.uploadedAt ?? new Date().toISOString();

      if (!storagePath) {
        throw new Error('Upload succeeded but storage path was missing.');
      }

      const response = await fetch(`/api/lessons/${lesson.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'tool_walkthrough',
          storagePath,
          externalReference: externalReference.trim(),
          reflection: reflection.trim(),
          uploadedAt,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        success?: boolean;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? 'Failed to save walkthrough submission.'
        );
      }

      setSubmitSuccess(true);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Something went wrong while submitting your walkthrough.'
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
          <Badge variant="outline">Tool walkthrough</Badge>
          {lesson.dcwf_code ? (
            <Badge variant="outline">{lesson.dcwf_code}</Badge>
          ) : null}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {lesson.title}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={scrollToExercise}>
            Start scenario
          </Button>
          <p className="text-sm text-muted-foreground">
            Upload evidence and submit your field-mapping reflection below.
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
            <CardDescription>
              Complete the walkthrough using this exact brief.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div id="lesson-content" tabIndex={-1} className="outline-none">
              <LessonContent content={scenarioBrief} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div
        id="lesson-exercise"
        tabIndex={-1}
        className="outline-none"
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload evidence</CardTitle>
              <CardDescription>
                Attach a screenshot from the tool you used during this
                walkthrough (JPEG, PNG, WebP, or GIF, up to 5 MB).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="walkthrough-upload">Evidence image</Label>
                <p
                  id="walkthrough-upload-hint"
                  className="text-xs text-muted-foreground"
                >
                  Upload a screenshot or export showing your work in the tool.
                </p>
                <Input
                  id="walkthrough-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
                  onChange={handleFileChange}
                  aria-describedby={`walkthrough-upload-hint${errors.file ? ' walkthrough-upload-error' : ''}`}
                  aria-invalid={errors.file ? true : undefined}
                  disabled={isSubmitting}
                />
                {errors.file ? (
                  <p
                    id="walkthrough-upload-error"
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {errors.file}
                  </p>
                ) : null}
              </div>
              {selectedFile ? (
                <p className="text-sm text-muted-foreground">
                  Selected:{' '}
                  <span className="font-medium text-foreground">
                    {selectedFile.name}
                  </span>{' '}
                  ({Math.round(selectedFile.size / 1024)} KB)
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">External reference</CardTitle>
              <CardDescription>
                Link or ID for the record you created (e.g. SimpleRisk risk
                register entry or URL).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label htmlFor="walkthrough-external-reference">
                Reference ID or URL
              </Label>
              <Input
                id="walkthrough-external-reference"
                type="text"
                value={externalReference}
                onChange={(event) => {
                  setExternalReference(event.target.value);
                  setSubmitSuccess(false);
                  setSubmitError(null);
                  if (errors.externalReference) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.externalReference;
                      return next;
                    });
                  }
                }}
                placeholder="RISK-123 or https://..."
                aria-invalid={errors.externalReference ? true : undefined}
                aria-describedby={
                  errors.externalReference
                    ? 'walkthrough-external-reference-error'
                    : undefined
                }
                disabled={isSubmitting}
              />
              {errors.externalReference ? (
                <p
                  id="walkthrough-external-reference-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.externalReference}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reflection</CardTitle>
              <CardDescription>
                Summarize what you completed in the tool and any challenges you
                encountered.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label htmlFor="walkthrough-reflection">Reflection</Label>
              <Textarea
                id="walkthrough-reflection"
                value={reflection}
                onChange={(event) => {
                  setReflection(event.target.value);
                  setSubmitSuccess(false);
                  setSubmitError(null);
                  if (errors.reflection) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.reflection;
                      return next;
                    });
                  }
                }}
                rows={6}
                placeholder="Describe the steps you took and what you observed..."
                aria-invalid={errors.reflection ? true : undefined}
                aria-describedby={
                  errors.reflection ? 'walkthrough-reflection-error' : undefined
                }
                disabled={isSubmitting}
              />
              {errors.reflection ? (
                <p
                  id="walkthrough-reflection-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.reflection}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {submitError ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {submitError}
            </p>
          ) : null}

          {submitSuccess ? (
            <p
              role="status"
              className="rounded-md border border-status-satisfied-foreground/20 bg-status-satisfied px-4 py-3 text-sm text-status-satisfied-foreground"
            >
              Walkthrough submitted successfully. It will be reviewed by an
              assessor.
            </p>
          ) : null}

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Submit walkthrough'}
          </Button>
        </form>
      </div>
    </article>
  );
}
