import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import {
  formatEngagementScopeLines,
  type EngagementFlowView,
} from '@/lib/tickets/engagement';
import { cn } from '@/lib/utils';

type EngagementStageNavProps = {
  flow: EngagementFlowView;
  currentTicketId: string;
  className?: string;
};

export function EngagementStageNav({
  flow,
  currentTicketId,
  className,
}: EngagementStageNavProps) {
  const scopeLines = formatEngagementScopeLines(flow.engagement.scope);
  const current = flow.stages.find((s) => s.ticket.id === currentTicketId);

  return (
    <section
      aria-labelledby="engagement-stage-nav-heading"
      className={cn(
        'space-y-3 rounded-lg border border-border bg-muted/30 px-4 py-4',
        className
      )}
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Engagement</Badge>
          {current ? (
            <Badge variant="outline">
              Stage {current.stage} of {flow.totalCount}
            </Badge>
          ) : null}
          <Badge variant="outline">
            {flow.resolvedCount}/{flow.totalCount} resolved
          </Badge>
        </div>
        <h2
          id="engagement-stage-nav-heading"
          className="text-base font-semibold"
        >
          {flow.engagement.title}
        </h2>
        {scopeLines.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            {scopeLines.slice(0, 3).join(' · ')}
          </p>
        ) : null}
      </div>

      <nav aria-label="Engagement stages">
        <ol className="flex flex-wrap gap-2">
          {flow.stages.map((stage) => {
            const isCurrent = stage.ticket.id === currentTicketId;
            const locked = !stage.unlocked;
            const label = `Stage ${stage.stage}`;

            if (locked) {
              return (
                <li key={stage.ticket.id}>
                  <span
                    className="inline-flex items-center rounded-md border border-border/60 bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                    title="Complete the previous stage to unlock"
                  >
                    {label} · locked
                  </span>
                </li>
              );
            }

            return (
              <li key={stage.ticket.id}>
                <Link
                  href={stage.href}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={cn(
                    'inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium',
                    isCurrent
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-background text-foreground hover:bg-muted'
                  )}
                  title={stage.ticket.scenario_brief}
                >
                  {label}
                  {stage.status === 'resolved' ? ' · done' : ''}
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>
    </section>
  );
}
