'use client';

import { StatusDot } from '@/components/ui/status-dot';
import {
  computeSlaCompliancePercent,
  type SlaResolutionInput,
} from '@/lib/tickets/sla';
import { cn } from '@/lib/utils';

type SlaComplianceStatProps = {
  items: SlaResolutionInput[];
  className?: string;
};

function slaDotClass(percent: number): string {
  if (percent >= 90) return 'bg-emerald-700';
  if (percent >= 70) return 'bg-amber-700';
  return 'bg-status-blocked-foreground';
}

/**
 * Client-side % of resolved tickets completed within SLA.
 * Empty state when there are no countable resolved tickets.
 */
export function SlaComplianceStat({
  items,
  className,
}: SlaComplianceStatProps) {
  const percent = computeSlaCompliancePercent(items);

  return (
    <div
      className={cn(
        'inline-flex flex-col gap-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-surface-foreground shadow-xs',
        className
      )}
    >
      {percent === null ? (
        <>
          <div className="flex items-center gap-2">
            <StatusDot className="bg-muted-foreground/45" />
            <span className="font-mono text-xl font-semibold tabular-nums leading-none tracking-tight text-muted-foreground">
              —
            </span>
          </div>
          <p className="max-w-[14rem] text-xs leading-snug text-muted-foreground">
            Complete your first ticket to see SLA compliance
          </p>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <StatusDot
              className={slaDotClass(percent)}
              pulse={percent < 90}
            />
            <span className="font-mono text-xl font-semibold tabular-nums leading-none tracking-tight text-foreground">
              {percent}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground">resolved within window</p>
        </>
      )}
    </div>
  );
}
