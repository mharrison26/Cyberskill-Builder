import {
  Ban,
  CheckCircle2,
  CircleDashed,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  getStatusColorClass,
  normalizeStatus,
  STATUS_DESCRIPTIONS,
  STATUS_LABELS,
  type StatusKey,
} from '@/lib/status';
import { cn } from '@/lib/utils';

const STATUS_ICONS: Record<StatusKey, LucideIcon> = {
  satisfied: CheckCircle2,
  insufficient_evidence: AlertTriangle,
  not_satisfied: Ban,
  not_started: CircleDashed,
};

type StatusBadgeProps = {
  status: string;
  className?: string;
  showIcon?: boolean;
};

export function StatusBadge({
  status,
  className,
  showIcon = true,
}: StatusBadgeProps) {
  const normalized = normalizeStatus(status);
  const Icon = STATUS_ICONS[normalized];
  const label = STATUS_LABELS[normalized];
  const description = STATUS_DESCRIPTIONS[normalized];

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5 font-normal',
        getStatusColorClass(normalized),
        className
      )}
      title={description}
    >
      {showIcon ? (
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      ) : null}
      <span>{label}</span>
    </Badge>
  );
}
