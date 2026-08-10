import { Badge } from '@/components/ui/badge';
import { StatusDot } from '@/components/ui/status-dot';
import {
  getTicketStatusColorClass,
  normalizeTicketStatus,
  TICKET_STATUS_LABELS,
} from '@/lib/tickets/status';
import type { TicketProgressStatus } from '@/types';
import { cn } from '@/lib/utils';

const TICKET_STATUS_DOT: Record<TicketProgressStatus, string> = {
  new: 'bg-status-not-started-foreground',
  in_progress: 'bg-status-insufficient-foreground',
  resolved: 'bg-status-satisfied-foreground',
  reviewed: 'bg-status-satisfied-foreground',
};

type TicketStatusBadgeProps = {
  status: string | null | undefined;
  className?: string;
  /** When false, renders label only (no status dot). */
  showIcon?: boolean;
};

export function TicketStatusBadge({
  status,
  className,
  showIcon = true,
}: TicketStatusBadgeProps) {
  const normalized = normalizeTicketStatus(status);
  const label = TICKET_STATUS_LABELS[normalized];

  return (
    <Badge
      variant="outline"
      className={cn(
        'h-5 gap-1.5 rounded-md px-2 py-0 font-mono text-[10px] font-medium uppercase tracking-wider',
        getTicketStatusColorClass(normalized),
        className
      )}
    >
      {showIcon ? (
        <StatusDot
          className={TICKET_STATUS_DOT[normalized]}
          pulse={normalized === 'in_progress'}
        />
      ) : null}
      <span>{label}</span>
    </Badge>
  );
}
