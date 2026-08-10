import * as React from 'react';

import { cn } from '@/lib/utils';

type EyebrowElement = 'p' | 'h2' | 'h3' | 'h4' | 'span';

type EyebrowProps<T extends EyebrowElement = 'p'> = {
  as?: T;
} & React.ComponentPropsWithoutRef<T>;

/**
 * Small uppercase section / metric label (eyebrow).
 * Letter-spacing is fixed at 0.05em (Tailwind `tracking-wider`).
 */
function Eyebrow<T extends EyebrowElement = 'p'>({
  as,
  className,
  ...props
}: EyebrowProps<T>) {
  const Comp = as ?? 'p';

  return (
    <Comp
      data-slot="eyebrow"
      className={cn(
        'font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground',
        className
      )}
      {...props}
    />
  );
}

export { Eyebrow };
