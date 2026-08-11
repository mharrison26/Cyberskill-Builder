'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/layout/PageContainers';

type TicketRouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Recoverable boundary for ticket workbench RSC failures (e.g. missing catalog
 * data or a nullable field throw). Avoids the global black-screen error page.
 */
export default function TicketRouteError({
  error,
  reset,
}: TicketRouteErrorProps) {
  useEffect(() => {
    console.error('[ticket route]', error);
  }, [error]);

  return (
    <PageShell width="default">
      <div
        role="alert"
        className="mx-auto max-w-lg space-y-4 rounded-xl border border-border bg-surface p-6 shadow-xs"
      >
        <div className="space-y-2">
          <h1 className="text-h2 font-heading">Could not open this ticket</h1>
          <p className="text-body text-muted-foreground">
            Something went wrong while loading the workbench. Your progress is
            safe — try again, or return to the track console.
          </p>
          {error.digest ? (
            <p className="font-mono text-meta text-muted-foreground">
              Ref: {error.digest}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={reset}>
            Try again
          </Button>
          <Button render={<Link href="/tracks/grc/console" />} variant="outline">
            Back to GRC console
          </Button>
          <Button render={<Link href="/dashboard" />} variant="ghost">
            Dashboard
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
