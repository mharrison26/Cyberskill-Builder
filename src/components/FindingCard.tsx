import { DownloadOscalJsonButton } from '@/components/DownloadOscalJsonButton';
import { StatusBadge } from '@/components/StatusBadge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { OscalFindingRow } from '@/lib/oscal/toAssessmentFinding';
import type { FindingState } from '@/types';
import { cn } from '@/lib/utils';

type FindingCardProps = {
  controlId: string;
  findingState: FindingState;
  dcwfCode: string;
  narrative: string;
  oscalFinding?: OscalFindingRow;
  className?: string;
};

export function FindingCard({
  controlId,
  findingState,
  dcwfCode,
  narrative,
  oscalFinding,
  className,
}: FindingCardProps) {
  const truncated =
    narrative.length > 160 ? `${narrative.slice(0, 157)}…` : narrative;

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="font-mono text-base">{controlId}</CardTitle>
          <StatusBadge status={findingState} />
        </div>
        <CardDescription className="font-mono text-xs">
          DCWF: {dcwfCode}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {truncated}
        </p>
        {oscalFinding ? (
          <DownloadOscalJsonButton finding={oscalFinding} />
        ) : null}
      </CardContent>
    </Card>
  );
}
