import { TriangleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function LegalDraftBanner() {
  return (
    <Alert
      variant="destructive"
      className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-50"
    >
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>DRAFT — Not legal advice</AlertTitle>
      <AlertDescription className="text-amber-900/90 dark:text-amber-100/90">
        This document is placeholder content for development purposes only.
        Review and approval by qualified legal counsel is required before
        production launch.
      </AlertDescription>
    </Alert>
  );
}
