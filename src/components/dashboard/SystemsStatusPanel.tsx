import type { SystemStatusRow } from '@/lib/dashboard/systemsStatus';
import { cn } from '@/lib/utils';

type SystemsStatusPanelProps = {
  systems: SystemStatusRow[];
  className?: string;
};

const HEALTH_LABEL: Record<SystemStatusRow['health'], string> = {
  operational: 'OK',
  degraded: 'DEG',
  maintenance: 'MNT',
};

const HEALTH_DOT: Record<SystemStatusRow['health'], string> = {
  operational: 'bg-emerald-700',
  degraded: 'bg-amber-700',
  maintenance: 'bg-slate-500',
};

export function SystemsStatusPanel({
  systems,
  className,
}: SystemsStatusPanelProps) {
  return (
    <div
      className={cn(
        'flex min-h-[5.5rem] flex-col rounded-md border border-border bg-card px-3 py-2.5 shadow-sm transition-shadow hover:shadow-md',
        className
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Systems
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">sim</p>
      </div>

      <ul className="mt-2 space-y-1" aria-label="Training systems status">
        {systems.map((system) => (
          <li
            key={system.id}
            className="flex items-center justify-between gap-2 font-mono text-[11px]"
          >
            <span className="flex min-w-0 items-center gap-1.5 text-foreground">
              <span
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  HEALTH_DOT[system.health],
                  system.health !== 'operational' && 'animate-pulse'
                )}
                aria-hidden="true"
              />
              <span className="truncate">{system.label}</span>
            </span>
            <span
              className={cn(
                'shrink-0 tabular-nums',
                system.health === 'operational'
                  ? 'text-emerald-800 dark:text-emerald-400'
                  : system.health === 'degraded'
                    ? 'text-amber-800 dark:text-amber-400'
                    : 'text-muted-foreground'
              )}
            >
              {HEALTH_LABEL[system.health]}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
        Training atmosphere only — not live production monitoring.
      </p>
    </div>
  );
}
