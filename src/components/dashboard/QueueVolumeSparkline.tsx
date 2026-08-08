'use client';

import { useEffect, useId, useState } from 'react';

import type { QueueVolumePoint } from '@/lib/dashboard/queueVolume';
import { cn } from '@/lib/utils';

type QueueVolumeSparklineProps = {
  series: QueueVolumePoint[];
  className?: string;
};

function buildPath(series: QueueVolumePoint[], width: number, height: number) {
  if (series.length === 0) {
    return { line: '', area: '', max: 0 };
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
  const { line, area, max } = buildPath(series, width, height);
  const periodTotal = series.reduce((sum, p) => sum + p.total, 0);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className={cn(
        'flex min-h-[5.5rem] flex-col justify-between rounded-md border border-border bg-card px-3 py-2.5',
        className
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Queue volume
        </p>
        <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
          14d
        </p>
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xl font-semibold tabular-nums leading-none tracking-tight">
            {periodTotal}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            opens + resolves
          </p>
        </div>

        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label={`Ticket activity sparkline, ${periodTotal} events over 14 days, peak ${max} per day`}
          className="shrink-0 text-primary"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {periodTotal > 0 ? (
            <>
              <path d={area} fill={`url(#${gradientId})`} />
              <path
                d={line}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
                strokeLinecap="round"
                pathLength={1}
                style={{
                  strokeDasharray: 1,
                  strokeDashoffset: drawn ? 0 : 1,
                  transition: 'stroke-dashoffset 700ms ease-out',
                }}
              />
            </>
          ) : (
            <path
              d={`M 0 ${height - 2} L ${width} ${height - 2}`}
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.25"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}
        </svg>
      </div>
    </div>
  );
}
