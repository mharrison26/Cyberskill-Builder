'use client';

import { useState } from 'react';
import { Mic, Video } from 'lucide-react';

import { toggleDefensePublic } from '@/components/portfolio/actions';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { MockDefenseRecording } from '@/types';
import { cn } from '@/lib/utils';

export type DefensePlaybackProps = {
  recording: MockDefenseRecording;
  /** When set, shows a public/private toggle matching finding visibility. */
  onPublicChange?: (isPublic: boolean) => void;
  /** Persist visibility to defense_recordings when id looks real. */
  persistVisibility?: boolean;
  /** Hide the toggle (e.g. public portfolio view). */
  showVisibilityToggle?: boolean;
  className?: string;
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Playback for a submitted verbal defense, embedded on the portfolio card
 * it answers (not a separate tab).
 */
export function DefensePlayback({
  recording,
  onPublicChange,
  persistVisibility = false,
  showVisibilityToggle = Boolean(onPublicChange) || persistVisibility,
  className,
}: DefensePlaybackProps) {
  const [isPublic, setIsPublic] = useState(recording.isPublic);
  const [error, setError] = useState<string | null>(null);
  const toggleId = `defense-playback-public-${recording.id}`;
  const hasMedia = Boolean(recording.url);

  async function handlePublicChange(next: boolean) {
    const previous = isPublic;
    setIsPublic(next);
    setError(null);
    onPublicChange?.(next);

    if (!persistVisibility) return;
    if (recording.id.startsWith('defense-local-')) return;

    const result = await toggleDefensePublic(recording.id, next);
    if (result.error) {
      setIsPublic(previous);
      setError(result.error);
    }
  }

  const Icon = recording.mediaType === 'video' ? Video : Mic;

  return (
    <div
      className={cn(
        'space-y-3 rounded-md border border-border bg-muted/20 p-3',
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-medium">
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          Verbal defense
          <span className="font-mono text-xs font-normal text-muted-foreground">
            · {formatDuration(recording.durationSeconds)}
          </span>
        </p>
        <time
          dateTime={recording.createdAt}
          className="font-mono text-xs tabular-nums text-muted-foreground"
        >
          {formatTimestamp(recording.createdAt)}
        </time>
      </div>

      {hasMedia ? (
        recording.mediaType === 'video' ? (
          <video
            controls
            src={recording.url}
            className="aspect-video w-full rounded-md border border-border bg-black"
          />
        ) : (
          <audio controls src={recording.url} className="w-full" />
        )
      ) : (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
          Defense on file ({recording.mediaType},{' '}
          {formatDuration(recording.durationSeconds)}) — media preview
          unavailable in this mock dataset.
        </p>
      )}

      {showVisibilityToggle ? (
        <div className="flex items-start justify-between gap-4 pt-1">
          <div className="space-y-0.5">
            <Label
              htmlFor={toggleId}
              className="text-sm font-medium text-foreground"
            >
              Public portfolio
            </Label>
            <p className="text-xs text-muted-foreground">
              Make this defense visible on your public portfolio page
            </p>
          </div>
          <Switch
            id={toggleId}
            checked={isPublic}
            onCheckedChange={(next) => void handlePublicChange(next)}
          />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
