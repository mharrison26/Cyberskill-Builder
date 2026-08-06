import { DownloadOscalJsonButton } from '@/components/DownloadOscalJsonButton';
import { PublicPortfolioToggle } from '@/components/grading/PublicPortfolioToggle';
import { StatusBadge } from '@/components/StatusBadge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { normalizeFindingState } from '@/lib/status';
import type { OscalObservation } from '@/lib/oscal/toAssessmentFinding';
import { cn } from '@/lib/utils';

export type GradingResultProps = {
  finding: {
    id: string;
    finding_state: string;
    observation: OscalObservation | null;
    control_id: string;
    student_narrative?: string | null;
    dcwf_code?: string | null;
    created_at?: string;
  };
  findingId?: string;
  isPublic?: boolean;
  canToggle?: boolean;
  className?: string;
};

type GradingSectionProps = {
  title: string;
  content?: string;
};

function GradingSection({ title, content }: GradingSectionProps) {
  return (
    <section aria-labelledby={`grading-${title.toLowerCase()}`}>
      <h3
        id={`grading-${title.toLowerCase()}`}
        className="text-sm font-semibold text-foreground"
      >
        {title}
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {content?.trim() || 'Not provided.'}
      </p>
    </section>
  );
}

export function GradingResult({
  finding,
  findingId,
  isPublic = false,
  canToggle = false,
  className,
}: GradingResultProps) {
  const badgeStatus = normalizeFindingState(finding.finding_state);
  const observation = finding.observation ?? {};

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-lg">Assessment outcome</CardTitle>
            {finding.created_at ? (
              <CardDescription>
                Graded{' '}
                {new Date(finding.created_at).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </CardDescription>
            ) : null}
          </div>
          <StatusBadge status={badgeStatus} />
        </div>
        {(finding.control_id || finding.dcwf_code) && (
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
            {finding.control_id ? (
              <div>
                <dt className="sr-only">Control ID</dt>
                <dd>
                  <span className="font-medium text-muted-foreground">
                    Control:{' '}
                  </span>
                  <span className="font-mono text-foreground">
                    {finding.control_id}
                  </span>
                </dd>
              </div>
            ) : null}
            {finding.dcwf_code ? (
              <div>
                <dt className="sr-only">DCWF code</dt>
                <dd>
                  <span className="font-medium text-muted-foreground">
                    DCWF:{' '}
                  </span>
                  <span className="font-mono text-foreground">
                    {finding.dcwf_code}
                  </span>
                </dd>
              </div>
            ) : null}
          </dl>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {findingId ? (
          <PublicPortfolioToggle
            findingId={findingId}
            isPublic={isPublic}
            canToggle={canToggle}
          />
        ) : null}
        <GradingSection title="Feedback" content={observation.feedback} />
        <GradingSection title="Strengths" content={observation.strengths} />
        <GradingSection title="Gaps" content={observation.gaps} />
        <DownloadOscalJsonButton
          finding={{
            id: finding.id,
            control_id: finding.control_id,
            finding_state: finding.finding_state,
            student_narrative: finding.student_narrative,
            observation: finding.observation,
          }}
        />
      </CardContent>
    </Card>
  );
}
