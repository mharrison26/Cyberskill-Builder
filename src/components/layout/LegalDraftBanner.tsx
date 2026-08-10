import { TriangleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function LegalDraftBanner() {
  return (
    <Alert className="border-status-insufficient-foreground/25 bg-status-insufficient text-status-insufficient-foreground">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>DRAFT — Not legal advice</AlertTitle>
      <AlertDescription className="text-status-insufficient-foreground/90">
        This document is placeholder content for development purposes only.
        Review and approval by qualified legal counsel is required before
        production launch.
      </AlertDescription>
    </Alert>
  );
}
