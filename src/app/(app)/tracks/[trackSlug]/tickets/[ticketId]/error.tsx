'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
    <div className="mx-auto w-full max-w-7xl py-8">
      <div
        role="alert"
        className="mx-auto max-w-lg space-y-4 rounded-xl border border-border bg-card p-6"
      >
        <div className="space-y-2">
          <h1 className="text-lg font-semibold tracking-tight">
            Could not open this ticket
          </h1>
          <p className="text-sm text-muted-foreground">
            Something went wrong while loading the workbench. Your progress is
            safe — try again, or return to the track console.
          </p>
          {error.digest ? (
            <p className="font-mono text-xs text-muted-foreground">
              Ref: {error.digest}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={reset}>
            Try again
          </Button>
          <Link
            href="/tracks/grc/console"
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            Back to GRC console
          </Link>
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: 'ghost' }))}
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
