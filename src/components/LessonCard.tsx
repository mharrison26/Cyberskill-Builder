import Link from 'next/link';
import { BookOpen, FlaskConical, MonitorPlay } from 'lucide-react';

import { StatusBadge } from '@/components/StatusBadge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import type { StatusKey } from '@/lib/status';
import type { LessonType } from '@/types';
import { cn } from '@/lib/utils';

const LESSON_TYPE_CONFIG: Record<
  LessonType,
  { label: string; icon: typeof BookOpen }
> = {
  conceptual: { label: 'Conceptual', icon: BookOpen },
  catalog_lab: { label: 'Catalog Lab', icon: BookOpen },
  artifact_lab: { label: 'Artifact Lab', icon: FlaskConical },
  tool_walkthrough: { label: 'Tool Walkthrough', icon: MonitorPlay },
};

/** Canonical lesson detail path for a track + lesson id. */
export function lessonDetailHref(trackSlug: string, lessonId: string): string {
  return `/tracks/${trackSlug}/lessons/${lessonId}`;
}

type LessonCardProps = {
  id: string;
  trackSlug: string;
  title: string;
  status: StatusKey;
  lessonType: LessonType;
  tier: string;
  className?: string;
};

export function LessonCard({
  id,
  trackSlug,
  title,
  status,
  lessonType,
  tier,
  className,
}: LessonCardProps) {
  const typeConfig = LESSON_TYPE_CONFIG[lessonType];
  const TypeIcon = typeConfig.icon;
  const href = lessonDetailHref(trackSlug, id);

  return (
    <Card
      className={cn(
        'transition-hover hover:border-accent/50 hover:shadow-sm focus-within:border-accent/50 focus-within:shadow-sm',
        className
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TypeIcon className="size-4 shrink-0" aria-hidden="true" />
            <Eyebrow as="span">{typeConfig.label}</Eyebrow>
          </div>
          <StatusBadge status={status} />
        </div>
        <CardTitle className="text-base leading-snug">
          <Link
            href={href}
            className="rounded-sm transition-hover hover:text-primary focus:outline-none focus-visible:text-primary"
          >
            {title}
          </Link>
        </CardTitle>
        <CardDescription className="capitalize">{tier} tier</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <Link
          href={href}
          className="rounded-sm text-sm font-medium text-primary transition-hover hover:underline focus:outline-none focus-visible:underline"
        >
          Open lesson
        </Link>
      </CardContent>
    </Card>
  );
}
