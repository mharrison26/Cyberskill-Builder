import {
  BadgeCheck,
  CheckCircle2,
  CircleDashed,
  LoaderCircle,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  getTicketStatusColorClass,
  normalizeTicketStatus,
  TICKET_STATUS_LABELS,
} from '@/lib/tickets/status';
import type { TicketProgressStatus } from '@/types';
import { cn } from '@/lib/utils';

const STATUS_ICONS: Record<TicketProgressStatus, LucideIcon> = {
  new: CircleDashed,
  in_progress: LoaderCircle,
  resolved: CheckCircle2,
  reviewed: BadgeCheck,
};

type TicketStatusBadgeProps = {
  status: string | null | undefined;
  className?: string;
  showIcon?: boolean;
};

export function TicketStatusBadge({
  status,
  className,
  showIcon = true,
}: TicketStatusBadgeProps) {
  const normalized = normalizeTicketStatus(status);
  const Icon = STATUS_ICONS[normalized];
  const label = TICKET_STATUS_LABELS[normalized];

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5 font-normal',
        getTicketStatusColorClass(normalized),
        className
      )}
    >
      {showIcon ? (
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      ) : null}
      <span>{label}</span>
    </Badge>
  );
}
