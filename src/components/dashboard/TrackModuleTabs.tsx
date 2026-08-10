'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { resolveTrackFilter } from '@/lib/dashboard/resolveTrackFilter';
import { cn } from '@/lib/utils';

export type TrackModuleTab = {
  id: string;
  slug: string;
  name: string;
  hasTickets: boolean;
};

type TrackModuleTabsProps = {
  tracks: TrackModuleTab[];
  /** Server-resolved active slug from `?track=` (null = ALL). */
  activeSlug: string | null;
  className?: string;
  children?: ReactNode;
};

const TrackFilterContext = createContext<string | null>(null);

export function useDashboardTrackFilter(): string | null {
  return useContext(TrackFilterContext);
}

/**
 * Module-select pills + client filter context.
 * Syncs selection to `?track=` so the dashboard can deep-link a track.
 */
export function TrackModuleTabs({
  tracks,
  activeSlug: initialActiveSlug,
  className,
  children,
}: TrackModuleTabsProps) {
  const router = useRouter();
  const [activeSlug, setActiveSlug] = useState<string | null>(initialActiveSlug);

  useEffect(() => {
    setActiveSlug(initialActiveSlug);
  }, [initialActiveSlug]);

  const selectTrack = useCallback(
    (slug: string | null) => {
      const enrolledSlugs = tracks.map((track) => track.slug);
      const next = resolveTrackFilter(slug, enrolledSlugs);
      setActiveSlug(next);
      const href = next
        ? `/dashboard?track=${encodeURIComponent(next)}`
        : '/dashboard';
      router.push(href, { scroll: false });
    },
    [router, tracks]
  );

  if (tracks.length === 0) return null;

  const activeTrack = activeSlug
    ? tracks.find((track) => track.slug === activeSlug)
    : null;

  return (
    <TrackFilterContext.Provider value={activeSlug}>
      <div className={cn('space-y-4', className)}>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Module select
            </p>
            {activeTrack?.hasTickets ? (
              <Link
                href={`/tracks/${activeTrack.slug}/console`}
                className="font-mono text-[11px] text-primary underline-offset-2 hover:underline"
              >
                open console →
              </Link>
            ) : null}
          </div>

          <nav
            aria-label="Enrolled track modules"
            className="flex flex-wrap gap-1 rounded-md border border-border bg-secondary/60 p-1 font-mono text-xs"
          >
            <ModuleTab
              active={!activeSlug}
              label="ALL"
              onSelect={() => selectTrack(null)}
            />
            {tracks.map((track) => (
              <ModuleTab
                key={track.id}
                active={activeSlug === track.slug}
                label={track.slug}
                title={track.name}
                onSelect={() => selectTrack(track.slug)}
              />
            ))}
          </nav>
        </div>
        {children ? <div className="space-y-5">{children}</div> : null}
      </div>
    </TrackFilterContext.Provider>
  );
}

/** Hides a track section when a different track filter is active. */
export function FilteredTrackSection({
  trackSlug,
  children,
}: {
  trackSlug: string;
  children: ReactNode;
}) {
  const activeSlug = useDashboardTrackFilter();
  if (activeSlug && activeSlug !== trackSlug) return null;
  return <>{children}</>;
}

function ModuleTab({
  active,
  label,
  title,
  onSelect,
}: {
  active: boolean;
  label: string;
  title?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        'rounded px-2.5 py-1.5 uppercase tracking-wide transition-colors',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-card/70 hover:text-foreground'
      )}
    >
      {label}
    </button>
  );
}
