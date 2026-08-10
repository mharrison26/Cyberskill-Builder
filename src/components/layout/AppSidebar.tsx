'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Layers,
  Monitor,
  Settings,
  Shield,
  Ticket,
} from 'lucide-react';

import { Eyebrow } from '@/components/ui/eyebrow';
import { Separator } from '@/components/ui/separator';
import type { SidebarLesson, SidebarTrack } from '@/lib/auth/appShell';
import { cn } from '@/lib/utils';

type AppSidebarProps = {
  isAdmin?: boolean;
  activeTrackSlug?: string;
  activeTrackName?: string;
  trackLessons?: SidebarLesson[];
  enrollments?: SidebarTrack[];
  className?: string;
  onNavigate?: () => void;
};

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/catalog', label: 'Control Catalog', icon: Shield },
  { href: '/portfolio', label: 'My Portfolio', icon: ClipboardList },
];

const ADMIN_ITEMS = [
  { href: '/admin/tracks', label: 'Tracks', icon: Layers },
  { href: '/admin/lessons', label: 'Lessons', icon: BookOpen },
  { href: '/admin/tickets', label: 'Tickets', icon: Ticket },
  { href: '/admin/grading', label: 'Grading Queue', icon: GraduationCap },
  { href: '/admin', label: 'Admin Home', icon: Settings },
];

const navItemBase =
  'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-hover hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar [&_svg]:text-current';

const navItemActive =
  'bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-primary';

export function AppSidebar({
  isAdmin = false,
  activeTrackSlug,
  activeTrackName,
  trackLessons = [],
  enrollments = [],
  className,
  onNavigate,
}: AppSidebarProps) {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside
      className={cn(
        'flex h-full flex-col bg-sidebar text-sidebar-foreground',
        className
      )}
      aria-label="Main navigation"
    >
      <div className="px-4 py-5">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="rounded-sm text-base font-semibold text-primary transition-hover hover:text-primary/80 focus:outline-none focus-visible:text-primary/80 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
        >
          CyberSkill Builder
        </Link>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        <ul className="space-y-1" role="list">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    navItemBase,
                    'font-medium',
                    active && navItemActive
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {enrollments.length > 0 ? (
          <div>
            <Eyebrow as="h2" className="mb-2 px-3 text-sidebar-foreground/65">
              Track consoles
            </Eyebrow>
            <ul className="space-y-1" role="list">
              {enrollments.map((track) => {
                const href = `/tracks/${track.slug}/console`;
                const active = isActive(href);
                return (
                  <li key={track.slug}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(navItemBase, active && navItemActive)}
                    >
                      <Monitor className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{track.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {activeTrackSlug && trackLessons.length > 0 ? (
          <div>
            <Eyebrow as="h2" className="mb-2 px-3 text-sidebar-foreground/65">
              {activeTrackName ?? 'Current Track'}
            </Eyebrow>
            <ul className="space-y-1" role="list">
              {trackLessons.map((lesson) => {
                const href = `/tracks/${activeTrackSlug}/lessons/${lesson.id}`;
                const active = pathname === href;
                return (
                  <li key={lesson.id}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(navItemBase, active && navItemActive)}
                    >
                      <span className="line-clamp-2">{lesson.title}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {isAdmin ? (
          <>
            <Separator />
            <div>
              <Eyebrow as="h2" className="mb-2 px-3 text-sidebar-foreground/65">
                Admin
              </Eyebrow>
              <ul className="space-y-1" role="list">
                {ADMIN_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          navItemBase,
                          'font-medium',
                          active && navItemActive
                        )}
                      >
                        <Icon className="size-4 shrink-0" aria-hidden="true" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        ) : null}
      </nav>
    </aside>
  );
}
