'use client';

import { useEffect, useId, useState } from 'react';

import { Eyebrow } from '@/components/ui/eyebrow';
import { StatusDot } from '@/components/ui/status-dot';
import type { QueueVolumePoint } from '@/lib/dashboard/queueVolume';
import { cn } from '@/lib/utils';

type QueueVolumeSparklineProps = {
  series: QueueVolumePoint[];
  className?: string;
};

type SparkPaths = {
  line: string;
  area: string;
  max: number;
};

/** Flat zero baseline with a short band for a subtle under-fill. */
function buildEmptyBaseline(width: number, height: number): SparkPaths {
  const y = height - 4;
  const line = `M 0 ${y.toFixed(2)} L ${width.toFixed(2)} ${y.toFixed(2)}`;
  const area = `${line} L ${width.toFixed(2)} ${height} L 0 ${height} Z`;
  return { line, area, max: 0 };
}

function buildPath(
  series: QueueVolumePoint[],
  width: number,
  height: number
): SparkPaths {
  if (series.length === 0) {
    return buildEmptyBaseline(width, height);
  }

  const max = Math.max(1, ...series.map((p) => p.total));
  const padY = 2;
  const usableH = height - padY * 2;
  const step = series.length === 1 ? 0 : width / Math.max(1, series.length - 1);

  const points = series.map((point, index) => {
    const x = series.length === 1 ? width / 2 : index * step;
    const y = padY + usableH - (point.total / max) * usableH;
    return { x, y };
  });

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');

  const area = `${line} L ${points[points.length - 1].x.toFixed(2)} ${height} L ${points[0].x.toFixed(2)} ${height} Z`;

  return { line, area, max };
}

export function QueueVolumeSparkline({
  series,
  className,
}: QueueVolumeSparklineProps) {
  const gradientId = useId();
  const [drawn, setDrawn] = useState(false);
  const width = 160;
  const height = 36;
  const periodTotal = series.reduce((sum, p) => sum + p.total, 0);
  const isEmpty = periodTotal === 0;
  const { line, area, max } = isEmpty
    ? buildEmptyBaseline(width, height)
    : buildPath(series, width, height);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className={cn(
        'flex min-h-[5.5rem] flex-col justify-between rounded-md border border-border bg-surface px-3 py-3 text-surface-foreground shadow-xs transition-hover hover:shadow-sm',
        className
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <Eyebrow>Queue volume</Eyebrow>
        <Eyebrow as="span" className="tabular-nums">
          14d
        </Eyebrow>
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <StatusDot
              className={isEmpty ? 'bg-muted-foreground/45' : 'bg-emerald-700'}
            />
            <p className="font-mono text-xl font-semibold tabular-nums leading-none tracking-tight text-foreground">
              {periodTotal}
            </p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">opens + resolves</p>
        </div>

        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label={
            isEmpty
              ? 'Ticket activity sparkline, no opens or resolves in the last 14 days'
              : `Ticket activity sparkline, ${periodTotal} events over 14 days, peak ${max} per day`
          }
          className="shrink-0 text-primary"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="currentColor"
                stopOpacity={isEmpty ? 0.1 : 0.22}
              />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
          <path
            d={line}
            fill="none"
            stroke="currentColor"
            strokeOpacity={isEmpty ? 0.45 : 1}
            strokeWidth="1.75"
            strokeLinejoin="round"
            strokeLinecap="round"
            pathLength={1}
            style={
              isEmpty
                ? undefined
                : {
                    strokeDasharray: 1,
                    strokeDashoffset: drawn ? 0 : 1,
                    transition: 'stroke-dashoffset 700ms ease-out',
                  }
            }
          />
        </svg>
      </div>

      {isEmpty ? (
        <p className="mt-2 text-xs leading-snug text-muted-foreground">
          No ticket activity yet — resolve tickets to fill this chart.
        </p>
      ) : null}
    </div>
  );
}
