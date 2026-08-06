import { StatusBadge } from '@/components/StatusBadge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { FindingState } from '@/types';
import { cn } from '@/lib/utils';

type FindingCardProps = {
  controlId: string;
  findingState: FindingState;
  dcwfCode: string;
  narrative: string;
  className?: string;
};

export function FindingCard({
  controlId,
  findingState,
  dcwfCode,
  narrative,
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
      <CardContent>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {truncated}
        </p>
      </CardContent>
    </Card>
  );
}
