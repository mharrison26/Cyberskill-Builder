import { Badge } from '@/components/ui/badge';
import { StatusDot } from '@/components/ui/status-dot';
import { cn } from '@/lib/utils';

type PriorityBadgeProps = {
  difficulty: string;
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
          'border-status-blocked-foreground/20 bg-status-blocked text-status-blocked-foreground',
        dot: 'bg-status-blocked-foreground',
        pulse: true,
      };
    case 'medium':
    case 'moderate':
    case 'p2':
      return {
        badge:
          'border-status-insufficient-foreground/20 bg-status-insufficient text-status-insufficient-foreground',
        dot: 'bg-status-insufficient-foreground',
        pulse: false,
      };
    case 'low':
    case 'p3':
    case 'p4':
    default:
      return {
        badge:
          'border-status-not-started-foreground/20 bg-status-not-started text-status-not-started-foreground',
        dot: 'bg-status-not-started-foreground',
        pulse: false,
      };
  }
}

export function PriorityBadge({ difficulty, className }: PriorityBadgeProps) {
  const label = difficulty.trim() || 'Unknown';
  const tone = priorityTone(label);

  return (
    <Badge
      variant="outline"
      className={cn(
        'h-5 gap-1.5 rounded-md px-2 py-0 font-mono text-[10px] font-medium uppercase tracking-wider',
        tone.badge,
        className
      )}
    >
      <StatusDot className={tone.dot} pulse={tone.pulse} />
      <span>{label}</span>
    </Badge>
  );
}
