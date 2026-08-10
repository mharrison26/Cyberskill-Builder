import { Badge } from '@/components/ui/badge';
import { StatusDot } from '@/components/ui/status-dot';
import {
  getStatusColorClass,
  getStatusDotClass,
  normalizeStatus,
  STATUS_DESCRIPTIONS,
  STATUS_LABELS,
} from '@/lib/status';
import { cn } from '@/lib/utils';

type StatusBadgeProps = {
  status: string;
  className?: string;
  /** When false, renders label only (no status dot). */
  showIcon?: boolean;
};

export function StatusBadge({
  status,
  className,
  showIcon = true,
}: StatusBadgeProps) {
  const normalized = normalizeStatus(status);
  const label = STATUS_LABELS[normalized];
  const description = STATUS_DESCRIPTIONS[normalized];
  const pulse =
    normalized === 'in_progress' || normalized === 'insufficient_evidence';

  return (
    <Badge
      variant="outline"
      className={cn(
        'h-5 gap-1.5 rounded-md px-2 py-0 font-mono text-[10px] font-medium uppercase tracking-wider',
        getStatusColorClass(normalized),
        className
      )}
      title={description}
    >
      {showIcon ? (
        <StatusDot className={getStatusDotClass(normalized)} pulse={pulse} />
      ) : null}
      <span>{label}</span>
    </Badge>
  );
}
