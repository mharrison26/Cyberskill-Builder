import { Badge } from '@/components/ui/badge';
import { StatusDot } from '@/components/ui/status-dot';
import { cn } from '@/lib/utils';

type PriorityBadgeProps = {
  /** Lesson/training difficulty — never finding severity. Nullable-safe. */
  difficulty: string | null | undefined;
  className?: string;
};

function priorityTone(difficulty: string): {
  badge: string;
  dot: string;
  pulse: boolean;
} {
  const key = difficulty.trim().toLowerCase();
  switch (key) {
    case 'critical':
    case 'high':
    case 'p1':
      return {
        badge:
          'border-danger-soft-foreground/20 bg-danger-soft text-danger-soft-foreground',
        dot: 'bg-danger-soft-foreground',
        pulse: true,
      };
    case 'medium':
    case 'moderate':
    case 'p2':
      return {
        badge:
          'border-warning-soft-foreground/20 bg-warning-soft text-warning-soft-foreground',
        dot: 'bg-warning-soft-foreground',
        pulse: false,
      };
    case 'low':
    case 'p3':
    case 'p4':
    default:
      return {
        badge:
          'border-neutral-soft-foreground/20 bg-neutral-soft text-neutral-soft-foreground',
        dot: 'bg-neutral-soft-foreground',
        pulse: false,
      };
  }
}

export function PriorityBadge({ difficulty, className }: PriorityBadgeProps) {
  const label = (difficulty ?? '').trim() || 'Unknown';
  const tone = priorityTone(label);

  return (
    <Badge
      variant="outline"
      className={cn(
        'h-5 gap-1.5 rounded-md px-2 py-0 font-mono text-overline uppercase',
        tone.badge,
        className
      )}
    >
      <StatusDot className={tone.dot} pulse={tone.pulse} />
      <span>{label}</span>
    </Badge>
  );
}
