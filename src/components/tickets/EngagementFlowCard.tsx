import Link from 'next/link';

import { TicketStatusBadge } from '@/components/tickets/TicketStatusBadge';
import { Badge } from '@/components/ui/badge';
import { Eyebrow } from '@/components/ui/eyebrow';
import { StatusDot } from '@/components/ui/status-dot';
import {
  formatEngagementScopeLines,
  type EngagementFlowView,
} from '@/lib/tickets/engagement';
import { cn } from '@/lib/utils';

type EngagementFlowCardProps = {
  flow: EngagementFlowView;
  className?: string;
};

export function EngagementFlowCard({
  flow,
  className,
}: EngagementFlowCardProps) {
  const scopeLines = formatEngagementScopeLines(flow.engagement.scope);
  const progressPct =
    flow.totalCount === 0
      ? 0
      : Math.round((flow.resolvedCount / flow.totalCount) * 100);

  return (
    <section
      aria-labelledby={`engagement-${flow.engagement.id}-heading`}
      className={cn(
        'space-y-4 rounded-lg border border-border bg-surface px-5 py-5 text-surface-foreground shadow-xs',
        className
      )}
      data-engagement-id={flow.engagement.id}
    >
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Eyebrow as="span">Engagement</Eyebrow>
          <Badge
            variant="outline"
            className="h-5 gap-1.5 rounded-md px-2 py-0 font-mono text-[10px] font-medium uppercase tracking-wider tabular-nums"
          >
            <StatusDot
              className={
                progressPct >= 100
                  ? 'bg-emerald-700'
                  : progressPct > 0
                    ? 'bg-amber-700'
                    : 'bg-muted-foreground/45'
              }
              pulse={progressPct > 0 && progressPct < 100}
            />
            <span>
              {flow.resolvedCount}/{flow.totalCount} resolved
            </span>
          </Badge>
        </div>
        <h2
          id={`engagement-${flow.engagement.id}-heading`}
          className="text-lg font-semibold"
        >
          {flow.engagement.title}
        </h2>
        {scopeLines.length > 0 ? (
          <ul className="space-y-0.5 text-sm text-muted-foreground">
            {scopeLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
      </header>

      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPct}
        aria-label={`${flow.engagement.title} progress`}
      >
        <div
          className="h-full bg-foreground/80 transition-[width]"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <ol className="space-y-2">
        {flow.stages.map((stage) => {
          const locked = !stage.unlocked;
          const content = (
            <div
              className={cn(
                'flex flex-wrap items-start justify-between gap-3 rounded-md border px-3 py-3 text-sm',
                locked
                  ? 'border-border/60 bg-muted/40 text-muted-foreground'
                  : 'border-border bg-background hover:bg-muted/30',
                stage.stage === flow.currentStage &&
                  stage.unlocked &&
                  'ring-1 ring-foreground/20'
              )}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Stage {stage.stage}</span>
                  <span className="capitalize text-muted-foreground">
                    {stage.ticket.ticket_type.replace(/_/g, ' ')}
                  </span>
                  {locked ? (
                    <Badge
                      variant="outline"
                      className="h-5 gap-1.5 rounded-md px-2 py-0 font-mono text-[10px] font-medium uppercase tracking-wider"
                    >
                      <StatusDot className="bg-muted-foreground/45" />
                      Locked
                    </Badge>
                  ) : null}
                </div>
                <p className="line-clamp-2 text-foreground/90">
                  {stage.ticket.scenario_brief}
                </p>
              </div>
              <TicketStatusBadge status={stage.status} />
            </div>
          );

          return (
            <li key={stage.ticket.id}>
              {locked ? (
                <div aria-disabled="true">{content}</div>
              ) : (
                <Link href={stage.href} className="block">
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
