import Link from 'next/link';

import { cn } from '@/lib/utils';

export type TrackModuleTab = {
  id: string;
  slug: string;
  name: string;
  hasTickets: boolean;
};

type TrackModuleTabsProps = {
  tracks: TrackModuleTab[];
  activeSlug: string | null;
  className?: string;
};

export function TrackModuleTabs({
  tracks,
  activeSlug,
  className,
}: TrackModuleTabsProps) {
  if (tracks.length === 0) return null;

  const activeTrack = activeSlug
    ? tracks.find((track) => track.slug === activeSlug)
    : null;

  return (
    <div className={cn('space-y-2', className)}>
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
        <ModuleTab href="/dashboard" active={!activeSlug} label="ALL" />
        {tracks.map((track) => (
          <ModuleTab
            key={track.id}
            href={`/dashboard?track=${encodeURIComponent(track.slug)}`}
            active={activeSlug === track.slug}
            label={track.slug}
            title={track.name}
          />
        ))}
      </nav>
    </div>
  );
}

function ModuleTab({
  href,
  active,
  label,
  title,
}: {
  href: string;
  active: boolean;
  label: string;
  title?: string;
}) {
  return (
    <Link
      href={href}
      title={title}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded px-2.5 py-1.5 uppercase tracking-wide transition-colors',
        active
          ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
          : 'text-muted-foreground hover:bg-card/70 hover:text-foreground'
      )}
    >
      {label}
    </Link>
  );
}
