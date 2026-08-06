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
import type { LessonType, ProgressStatus } from '@/types';
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

type LessonCardProps = {
  id: string;
  title: string;
  status: ProgressStatus;
  lessonType: LessonType;
  tier: string;
  href: string;
  className?: string;
};

export function LessonCard({
  title,
  status,
  lessonType,
  tier,
  href,
  className,
}: LessonCardProps) {
  const typeConfig = LESSON_TYPE_CONFIG[lessonType];
  const TypeIcon = typeConfig.icon;

  return (
    <Card
      className={cn('transition-colors hover:border-primary/40', className)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TypeIcon className="size-4 shrink-0" aria-hidden="true" />
            <span className="text-xs font-medium uppercase tracking-wide">
              {typeConfig.label}
            </span>
          </div>
          <StatusBadge status={status} />
        </div>
        <CardTitle className="text-base leading-snug">
          <Link
            href={href}
            className="hover:text-primary focus:outline-none focus-visible:underline"
          >
            {title}
          </Link>
        </CardTitle>
        <CardDescription className="capitalize">{tier} tier</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <Link
          href={href}
          className="text-sm font-medium text-primary hover:underline focus:outline-none focus-visible:underline"
        >
          Open lesson
        </Link>
      </CardContent>
    </Card>
  );
}
