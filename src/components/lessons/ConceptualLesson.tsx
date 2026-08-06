'use client';

import { LessonContent } from '@/components/LessonContent';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  objectives: string[]
): string | null {
  if (content?.trim()) {
    return content.trim();
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
  const markdown =
    resolveLessonMarkdown(content, objectives) ?? SAMPLE_MARKDOWN;

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
          <CardTitle className="text-base">Lesson content</CardTitle>
        </CardHeader>
        <CardContent>
          <div id="lesson-content" tabIndex={-1} className="outline-none">
            <LessonContent content={markdown} />
          </div>
        </CardContent>
      </Card>
    </article>
  );
}
