import { Badge } from '@/components/ui/badge';
import { StatusDot } from '@/components/ui/status-dot';
import { cn } from '@/lib/utils';

type SeverityBadgeProps = {
  /** Finding risk severity. Null/empty renders as Unrated (never throws). */
  severity: string | null | undefined;
  className?: string;
};

function severityTone(severity: string): {
  badge: string;
  dot: string;
  pulse: boolean;
  label: string;
} {
  const key = severity.trim().toLowerCase();
  switch (key) {
    case 'critical':
      return {
        badge:
          'border-status-blocked-foreground/20 bg-status-blocked text-status-blocked-foreground',
        dot: 'bg-status-blocked-foreground',
        pulse: true,
        label: 'Critical',
      };
    case 'high':
      return {
        badge:
          'border-status-blocked-foreground/20 bg-status-blocked text-status-blocked-foreground',
        dot: 'bg-status-blocked-foreground',
        pulse: false,
        label: 'High',
      };
    case 'medium':
    case 'moderate':
      return {
        badge:
          'border-status-insufficient-foreground/20 bg-status-insufficient text-status-insufficient-foreground',
        dot: 'bg-status-insufficient-foreground',
        pulse: false,
        label: key === 'moderate' ? 'Moderate' : 'Medium',
      };
    case 'low':
      return {
        badge:
          'border-status-not-started-foreground/20 bg-status-not-started text-status-not-started-foreground',
        dot: 'bg-status-not-started-foreground',
        pulse: false,
        label: 'Low',
      };
    default: {
      // Explicit Unrated — do not invent a medium severity for missing data.
      const label =
        key.length > 0 ? key.charAt(0).toUpperCase() + key.slice(1) : 'Unrated';
      return {
        badge:
          'border-status-not-started-foreground/20 bg-status-not-started text-status-not-started-foreground',
        dot: 'bg-status-not-started-foreground',
        pulse: false,
        label,
      };
    }
  }
}

/** Severity indicator with icon + text (never colour alone). */
export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const tone = severityTone(severity ?? '');

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
      <span>{tone.label}</span>
    </Badge>
  );
}
