import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type SkipLinkProps = {
  href?: string;
  className?: string;
  children?: ReactNode;
};

export function SkipLink({
  href = '#content',
  className,
  children = 'Skip to main content',
}: SkipLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        'sr-only-focusable fixed left-4 top-4 z-[100] rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        className
      )}
    >
      {children}
    </Link>
  );
}
