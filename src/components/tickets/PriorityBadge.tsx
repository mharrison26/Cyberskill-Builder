import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type PriorityBadgeProps = {
  difficulty: string;
  className?: string;
};

function priorityTone(difficulty: string): string {
  const key = difficulty.trim().toLowerCase();
  switch (key) {
    case 'critical':
    case 'high':
    case 'p1':
      return 'border-status-blocked-foreground/20 bg-status-blocked text-status-blocked-foreground';
    case 'medium':
    case 'moderate':
    case 'p2':
      return 'border-status-insufficient-foreground/20 bg-status-insufficient text-status-insufficient-foreground';
    case 'low':
    case 'p3':
    default:
      return 'border-status-not-started-foreground/20 bg-status-not-started text-status-not-started-foreground';
  }
}

export function PriorityBadge({ difficulty, className }: PriorityBadgeProps) {
  const label = difficulty.trim() || 'Unknown';

  return (
    <Badge
      variant="outline"
      className={cn('capitalize font-normal', priorityTone(label), className)}
    >
      {label}
    </Badge>
  );
}
