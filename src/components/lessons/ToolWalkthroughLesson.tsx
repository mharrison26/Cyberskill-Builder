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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Lesson } from '@/types';
import { cn } from '@/lib/utils';

type ToolWalkthroughLessonProps = {
  lesson: Lesson;
  className?: string;
};

function parseObjectives(text: string | null): string[] {
  if (!text?.trim()) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);
}

export function ToolWalkthroughLesson({
  lesson,
  className,
}: ToolWalkthroughLessonProps) {
  const objectives = parseObjectives(lesson.learning_objectives);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [reflection, setReflection] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setSubmitted(false);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
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

      <div id="lesson-content" tabIndex={-1} className="outline-none">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload evidence</CardTitle>
              <CardDescription>
                Attach a screenshot or export from the tool you used during this
                walkthrough.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="walkthrough-upload">Evidence file</Label>
                <input
                  id="walkthrough-upload"
                  type="file"
                  accept=".png,.jpg,.jpeg,.pdf,.csv,.json"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
                />
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
              <CardTitle className="text-base">Reflection</CardTitle>
              <CardDescription>
                Summarize what you completed in the tool and any challenges you
                encountered.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label htmlFor="walkthrough-reflection" className="sr-only">
                Reflection
              </Label>
              <Textarea
                id="walkthrough-reflection"
                value={reflection}
                onChange={(event) => {
                  setReflection(event.target.value);
                  setSubmitted(false);
                }}
                rows={6}
                placeholder="Describe the steps you took and what you observed..."
              />
            </CardContent>
          </Card>

          {submitted ? (
            <p
              role="status"
              className="rounded-md border border-status-satisfied-foreground/20 bg-status-satisfied px-4 py-3 text-sm text-status-satisfied-foreground"
            >
              Walkthrough saved locally. Upload and reflection will sync when
              backend submission is enabled.
            </p>
          ) : null}

          <Button type="submit">Save walkthrough</Button>
        </form>
      </div>
    </article>
  );
}
