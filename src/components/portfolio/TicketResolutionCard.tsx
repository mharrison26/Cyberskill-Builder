import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatDcwfLabel } from '@/lib/dcwf/formatDcwfLabel';
import { getTicketStatusColorClass } from '@/lib/tickets/status';
import type { PortfolioScoreStatus } from '@/types';
import { cn } from '@/lib/utils';

const SCORE_STATUS_LABELS: Record<PortfolioScoreStatus, string> = {
  resolved: 'Resolved',
  needs_revision: 'Needs revision',
};

type TicketResolutionCardProps = {
  title: string;
  scoreStatus: PortfolioScoreStatus | string | null;
  dcwfCode: string;
  /** Full work role title from work_role_codes (preferred). */
  dcwfTitle?: string | null;
  narrative: string;
  tier?: string | null;
  ticketType?: string | null;
  /** Track flagship capstone (AO review). */
  isFlagship?: boolean;
  className?: string;
};

function normalizeScoreStatus(
  status: string | null | undefined
): PortfolioScoreStatus | null {
  if (status === 'resolved' || status === 'needs_revision') {
    return status;
  }
  return null;
}

export function TicketResolutionCard({
  title,
  scoreStatus,
  dcwfCode,
  dcwfTitle,
  narrative,
  tier,
  ticketType,
  isFlagship = false,
  className,
}: TicketResolutionCardProps) {
  const truncated =
    narrative.length > 160 ? `${narrative.slice(0, 157)}…` : narrative;
  const normalized = normalizeScoreStatus(scoreStatus);
  const badgeTone =
    normalized === 'resolved'
      ? getTicketStatusColorClass('resolved')
      : getTicketStatusColorClass('in_progress');
  const dcwfLabel = formatDcwfLabel(dcwfCode, dcwfTitle);

  return (
    <Card
      className={cn(
        isFlagship && 'border-foreground/40 sm:col-span-2',
        className
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{title}</CardTitle>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {isFlagship ? (
              <Badge variant="default" className="font-normal">
                Flagship
              </Badge>
            ) : null}
            {normalized ? (
              <Badge
                variant="outline"
                className={cn('font-normal', badgeTone)}
              >
                {SCORE_STATUS_LABELS[normalized]}
              </Badge>
            ) : null}
          </div>
        </div>
        <CardDescription className="text-xs">
          {[
            dcwfLabel ? `DCWF: ${dcwfLabel}` : null,
            tier ? `Tier ${tier}` : null,
            ticketType ? ticketType : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {truncated}
        </p>
      </CardContent>
    </Card>
  );
}
