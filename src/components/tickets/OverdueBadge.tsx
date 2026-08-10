import { Badge } from '@/components/ui/badge';
import { StatusDot } from '@/components/ui/status-dot';
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
        'h-5 gap-1.5 rounded-md px-2 py-0 font-mono text-[10px] font-medium uppercase tracking-wider border-status-blocked-foreground/20 bg-status-blocked text-status-blocked-foreground',
        className
      )}
    >
      <StatusDot className="bg-status-blocked-foreground" pulse />
      <span>Overdue</span>
    </Badge>
  );
}
