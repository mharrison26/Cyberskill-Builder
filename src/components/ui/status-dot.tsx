import { cn } from '@/lib/utils';

type StatusDotProps = {
  className?: string;
  /** Soft pulse for degraded / attention states */
  pulse?: boolean;
};

/**
 * 8px status indicator used with a label (dot-plus-label).
 * Matches Systems panel health dots.
 */
function StatusDot({ className, pulse = false }: StatusDotProps) {
  return (
    <span
      data-slot="status-dot"
      className={cn(
        'size-2 shrink-0 rounded-full',
        pulse && 'animate-pulse',
        className
      )}
      aria-hidden="true"
    />
  );
}

export { StatusDot };
