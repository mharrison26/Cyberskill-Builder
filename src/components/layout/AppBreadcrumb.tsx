'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

import type { SidebarTrack } from '@/lib/auth/appShell';
import { cn } from '@/lib/utils';

type Crumb = {
  label: string;
  href?: string;
};

type AppBreadcrumbProps = {
  enrollments?: SidebarTrack[];
  className?: string;
};

function trackLabel(track: SidebarTrack): string {
  const slug = track.slug.trim();
  if (slug.length > 0 && slug.length <= 8) {
    return slug.toUpperCase();
  }
  return track.name;
}

function buildCrumbs(
  pathname: string,
  trackParam: string | null,
  enrollments: SidebarTrack[]
): Crumb[] {
  const crumbs: Crumb[] = [];

  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
    crumbs.push({ label: 'Dashboard', href: '/dashboard' });

    const slug = trackParam?.trim() ?? '';
    if (slug) {
      const match = enrollments.find((track) => track.slug === slug);
      if (match) {
        crumbs.push({
          label: trackLabel(match),
          href: `/dashboard?track=${encodeURIComponent(match.slug)}`,
        });
      }
    }
    return crumbs;
  }

  const trackMatch = pathname.match(/^\/tracks\/([^/]+)(\/.*)?$/);
  if (trackMatch) {
    const slug = decodeURIComponent(trackMatch[1]);
    const match =
      enrollments.find((track) => track.slug === slug) ??
      ({ slug, name: slug, hasTickets: false } satisfies SidebarTrack);

    crumbs.push({ label: 'Dashboard', href: '/dashboard' });
    crumbs.push({
      label: trackLabel(match),
      href: `/dashboard?track=${encodeURIComponent(match.slug)}`,
    });
    return crumbs;
  }

  if (pathname.startsWith('/account')) {
    return [{ label: 'Dashboard', href: '/dashboard' }, { label: 'Account' }];
  }

  if (pathname.startsWith('/portfolio')) {
    return [{ label: 'Dashboard', href: '/dashboard' }, { label: 'Portfolio' }];
  }

  return crumbs;
}

/**
 * Path depth after the workspace switcher, e.g. Dashboard › GRC.
 */
export function AppBreadcrumb({
  enrollments = [],
  className,
}: AppBreadcrumbProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const crumbs = buildCrumbs(pathname, searchParams.get('track'), enrollments);

  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        'flex min-w-0 items-center gap-1 text-sm text-muted-foreground',
        className
      )}
    >
      <ChevronRight
        className="size-3.5 shrink-0 opacity-50"
        aria-hidden="true"
      />
      <ol className="flex min-w-0 items-center gap-1">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li
              key={`${crumb.label}-${index}`}
              className="flex min-w-0 items-center gap-1"
            >
              {index > 0 ? (
                <ChevronRight
                  className="size-3.5 shrink-0 opacity-50"
                  aria-hidden="true"
                />
              ) : null}
              {isLast || !crumb.href ? (
                <span
                  className={cn(
                    'truncate',
                    isLast && 'font-medium text-foreground'
                  )}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="truncate transition-colors hover:text-foreground"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
