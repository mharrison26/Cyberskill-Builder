import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Matches Queue Volume / Systems / SLA overview stat cards. */
export function SkeletonStatCard({
  variant = 'metric',
  className,
}: {
  variant?: 'metric' | 'sparkline' | 'list';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-[5.5rem] flex-col justify-between rounded-md border border-border bg-surface px-3 py-3 shadow-xs',
        className
      )}
      aria-hidden="true"
    >
      <div className="flex items-baseline justify-between gap-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-8" />
      </div>

      {variant === 'sparkline' ? (
        <div className="mt-2 flex items-end justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-6 w-10" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-9 w-40 rounded" />
        </div>
      ) : null}

      {variant === 'metric' ? (
        <div className="mt-2 space-y-2">
          <Skeleton className="h-6 w-14" />
          <Skeleton className="h-3 w-36" />
        </div>
      ) : null}

      {variant === 'list' ? (
        <ul className="mt-2 space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <li key={index} className="flex items-center justify-between gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-12 rounded-md" />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Matches LessonCard layout (type row, title, tier, CTA). */
export function SkeletonLessonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 shadow-xs',
        className
      )}
      aria-hidden="true"
    >
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-5 w-48 max-w-full" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-4 w-24" />
    </div>
  );
}

export function DashboardLoadingSkeleton() {
  return (
    <div
      className="mx-auto max-w-5xl space-y-5"
      role="status"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <header className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </header>

      <section
        aria-label="Operations overview"
        className="grid gap-3 sm:grid-cols-3"
      >
        <SkeletonStatCard variant="sparkline" />
        <SkeletonStatCard variant="list" />
        <SkeletonStatCard variant="metric" />
      </section>

      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full max-w-md rounded-md" />
        </div>

        <section className="space-y-3">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="mb-2 h-3 w-16" />
          <div className="grid gap-3 sm:grid-cols-2">
            <SkeletonLessonCard />
            <SkeletonLessonCard />
            <SkeletonLessonCard />
            <SkeletonLessonCard />
          </div>
        </section>
      </div>
    </div>
  );
}
