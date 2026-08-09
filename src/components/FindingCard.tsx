'use client';

import { useState } from 'react';

import { DefensePlayback } from '@/components/DefensePlayback';
import {
  DefenseRecorder,
  type DefensePromptQuestion,
  type DefenseRecordingResult,
} from '@/components/DefenseRecorder';
import { DownloadOscalJsonButton } from '@/components/DownloadOscalJsonButton';
import { togglePortfolioItemPublic } from '@/components/portfolio/actions';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { formatDcwfLabel } from '@/lib/dcwf/formatDcwfLabel';
import type { OscalFindingRow } from '@/lib/oscal/toAssessmentFinding';
import type { FindingState, MockDefenseRecording } from '@/types';
import { cn } from '@/lib/utils';

type FindingCardProps = {
  id?: string;
  controlId: string;
  findingState: FindingState;
  dcwfCode: string;
  /** Full work role title from work_role_codes (preferred). */
  dcwfTitle?: string | null;
  narrative: string;
  oscalFinding?: OscalFindingRow;
  /** Ledger timestamp (ISO). */
  createdAt?: string | null;
  isPublic?: boolean;
  onPublicChange?: (isPublic: boolean) => void;
  defense?: MockDefenseRecording | null;
  /** Show recorder when no defense is on file yet (private portfolio). */
  allowRecordDefense?: boolean;
  trackId?: string | null;
  relatedFindingId?: string | null;
  promptQuestions?: DefensePromptQuestion[];
  className?: string;
};

function formatLedgerTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export function FindingCard({
  id,
  controlId,
  findingState,
  dcwfCode,
  dcwfTitle,
  narrative,
  oscalFinding,
  createdAt,
  isPublic = false,
  onPublicChange,
  defense = null,
  allowRecordDefense = false,
  trackId = null,
  relatedFindingId = null,
  promptQuestions = [],
  className,
}: FindingCardProps) {
  const [localPublic, setLocalPublic] = useState(isPublic);
  const [localDefense, setLocalDefense] = useState<MockDefenseRecording | null>(
    defense
  );
  const [toggleError, setToggleError] = useState<string | null>(null);
  const dcwfLabel = formatDcwfLabel(dcwfCode, dcwfTitle);
  const artifactId = id ?? controlId;
  const publicToggleId = `finding-ledger-public-${artifactId}`;
  const canPersistPublic = Boolean(
    id &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id
    )
  );

  async function handlePublicChange(next: boolean) {
    const previous = localPublic;
    setLocalPublic(next);
    setToggleError(null);
    onPublicChange?.(next);

    if (!canPersistPublic) return;

    const result = await togglePortfolioItemPublic(id!, next);
    if (result.error) {
      setLocalPublic(previous);
      setToggleError(result.error);
    }
  }

  function handleDefenseSubmitted(result: DefenseRecordingResult) {
    setLocalDefense({
      id: result.id,
      url: result.url,
      mediaType: result.mediaType,
      durationSeconds: result.durationSeconds,
      isPublic: result.isPublic,
      createdAt: new Date().toISOString(),
    });
  }

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="font-mono text-base">{controlId}</CardTitle>
            {createdAt ? (
              <time
                dateTime={createdAt}
                className="block font-mono text-xs tabular-nums text-muted-foreground"
              >
                Recorded {formatLedgerTimestamp(createdAt)}
              </time>
            ) : null}
          </div>
          <StatusBadge status={findingState} />
        </div>
        {dcwfLabel ? (
          <Badge
            variant="outline"
            className="w-fit border-primary/30 bg-primary/5 px-2.5 py-1 font-mono text-sm font-semibold text-primary"
          >
            DCWF / 8570 · {dcwfLabel}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {narrative}
        </p>

        {oscalFinding ? (
          <DownloadOscalJsonButton
            finding={oscalFinding}
            className="w-full sm:w-auto"
          />
        ) : null}

        {localDefense ? (
          <DefensePlayback
            recording={localDefense}
            persistVisibility
            showVisibilityToggle={allowRecordDefense}
            onPublicChange={(next) =>
              setLocalDefense((prev) =>
                prev ? { ...prev, isPublic: next } : prev
              )
            }
          />
        ) : allowRecordDefense ? (
          <DefenseRecorder
            artifactId={artifactId}
            trackId={trackId}
            relatedFindingId={relatedFindingId}
            promptQuestions={promptQuestions}
            onSubmitted={handleDefenseSubmitted}
          />
        ) : null}
      </CardContent>
      {onPublicChange !== undefined || allowRecordDefense ? (
        <CardFooter className="border-t border-border pt-4">
          <div className="flex w-full items-start justify-between gap-4">
            <div className="space-y-1">
              <Label
                htmlFor={publicToggleId}
                className="text-sm font-medium text-foreground"
              >
                Public portfolio
              </Label>
              <p className="text-xs text-muted-foreground">
                Make this finding visible on your public portfolio page
              </p>
            </div>
            <Switch
              id={publicToggleId}
              checked={localPublic}
              onCheckedChange={(next) => void handlePublicChange(next)}
            />
          </div>
          {toggleError ? (
            <p role="alert" className="mt-2 w-full text-sm text-destructive">
              {toggleError}
            </p>
          ) : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}
