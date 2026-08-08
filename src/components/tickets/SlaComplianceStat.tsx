'use client';

import {
  computeSlaCompliancePercent,
  type SlaResolutionInput,
} from '@/lib/tickets/sla';
import { cn } from '@/lib/utils';

type SlaComplianceStatProps = {
  items: SlaResolutionInput[];
  className?: string;
};

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
        'inline-flex flex-col gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm',
        className
      )}
    >
      <span className="text-muted-foreground">Resolved within SLA</span>
      {percent === null ? (
        <span className="font-mono text-xl font-semibold tabular-nums leading-none text-muted-foreground">
          —
        </span>
      ) : (
        <span className="font-mono text-xl font-semibold tabular-nums leading-none tracking-tight text-foreground">
          {percent}%
        </span>
      )}
    </div>
  );
}
