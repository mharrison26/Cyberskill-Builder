'use client';

import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { downloadOscalJson } from '@/lib/oscal/downloadOscalJson';
import type { OscalFindingRow } from '@/lib/oscal/toAssessmentFinding';
import { cn } from '@/lib/utils';

type DownloadOscalJsonButtonProps = {
  finding: OscalFindingRow;
  className?: string;
};

export function DownloadOscalJsonButton({
  finding,
  className,
}: DownloadOscalJsonButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(className)}
      aria-label="Download OSCAL JSON"
      onClick={() => downloadOscalJson(finding)}
    >
      <Download aria-hidden="true" />
      Download OSCAL JSON
    </Button>
  );
}
