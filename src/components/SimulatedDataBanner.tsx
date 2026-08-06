'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Info, X } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'csb-simulated-banner-dismissed';

type SimulatedDataBannerProps = {
  trackName?: string;
};

export function SimulatedDataBanner({ trackName }: SimulatedDataBannerProps) {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(sessionStorage.getItem(STORAGE_KEY) === 'true');
  }, []);

  useEffect(() => {
    setDismissed(false);
    sessionStorage.removeItem(STORAGE_KEY);
  }, [pathname]);

  function handleDismiss() {
    setDismissed(true);
    sessionStorage.setItem(STORAGE_KEY, 'true');
  }

  if (dismissed) return null;

  return (
    <Alert className="border-accent/30 bg-secondary">
      <Info className="size-4 text-accent" aria-hidden="true" />
      <AlertTitle>Simulated training environment</AlertTitle>
      <AlertDescription className="flex items-start justify-between gap-4">
        <span>
          {trackName
            ? `The ${trackName} track uses mock evidence and simulated controls for training purposes. No real system data is displayed.`
            : 'This page displays mock data for training purposes. No real system or personnel data is shown.'}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={handleDismiss}
          aria-label="Dismiss simulated data notice"
          className="shrink-0"
        >
          <X className="size-4" />
        </Button>
      </AlertDescription>
    </Alert>
  );
}
