import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type OverdueBadgeProps = {
  className?: string;
};

/** Visual flag when a ticket has breached its SLA. Does not block submission. */
export function OverdueBadge({ className }: OverdueBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'font-normal border-status-blocked-foreground/20 bg-status-blocked text-status-blocked-foreground',
        className
      )}
    >
      Overdue
    </Badge>
  );
}
