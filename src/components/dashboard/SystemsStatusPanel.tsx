import { Eyebrow } from '@/components/ui/eyebrow';
import { StatusDot } from '@/components/ui/status-dot';
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
  operational: 'bg-status-satisfied-foreground',
  degraded: 'bg-status-insufficient-foreground',
  maintenance: 'bg-status-not-started-foreground',
};

const HEALTH_BADGE: Record<SystemStatusRow['health'], string> = {
  operational:
    'border-status-satisfied-foreground/20 bg-status-satisfied text-status-satisfied-foreground',
  degraded:
    'border-status-insufficient-foreground/20 bg-status-insufficient text-status-insufficient-foreground',
  maintenance:
    'border-status-not-started-foreground/20 bg-status-not-started text-status-not-started-foreground',
};

export function SystemsStatusPanel({
  systems,
  className,
}: SystemsStatusPanelProps) {
  return (
    <div
      className={cn(
        'flex min-h-[5.5rem] flex-col rounded-md border border-border bg-surface px-3 py-3 text-surface-foreground shadow-xs transition-hover hover:shadow-sm',
        className
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <Eyebrow>Systems</Eyebrow>
        <Eyebrow as="span">sim</Eyebrow>
      </div>

      <ul className="mt-2 space-y-1" aria-label="Training systems status">
        {systems.map((system) => (
          <li
            key={system.id}
            className="flex items-center justify-between gap-2 font-mono text-xs"
          >
            <span className="min-w-0 truncate text-foreground">
              {system.label}
            </span>
            <span
              className={cn(
                'inline-flex h-5 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[10px] font-medium uppercase tracking-wider tabular-nums',
                HEALTH_BADGE[system.health]
              )}
            >
              <StatusDot
                className={HEALTH_DOT[system.health]}
                pulse={system.health !== 'operational'}
              />
              {HEALTH_LABEL[system.health]}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-xs leading-snug text-muted-foreground">
        Training atmosphere only — not live production monitoring.
      </p>
    </div>
  );
}
