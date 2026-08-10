'use client';

import Link from 'next/link';
import { LogOut, Menu, Settings, User } from 'lucide-react';
import { Suspense, useEffect, useState, useTransition } from 'react';

import { signOut } from '@/app/(auth)/actions';

import { AppBreadcrumb } from '@/components/layout/AppBreadcrumb';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { OrgSwitcher } from '@/components/layout/OrgSwitcher';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type {
  AppShellUser,
  SidebarLesson,
  SidebarTrack,
} from '@/lib/auth/appShell';
import type { WorkspaceOption } from '@/lib/tenants/workspaces';
import { getAvatarInitials } from '@/lib/users/displayName';

type AppTopBarProps = {
  user: AppShellUser;
  activeTrackSlug?: string;
  activeTrackName?: string;
  trackLessons?: SidebarLesson[];
  enrollments?: SidebarTrack[];
  workspaces?: WorkspaceOption[];
};

export function AppTopBar({
  user,
  activeTrackSlug,
  activeTrackName,
  trackLessons = [],
  enrollments = [],
  workspaces = [],
}: AppTopBarProps) {
  const [isSigningOut, startSignOut] = useTransition();
  // Base UI Avatar.Fallback can differ between SSR and first client paint;
  // gate initials so the trigger markup hydrates consistently.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const initials = getAvatarInitials(user.name);

  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Sheet>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open navigation menu"
              />
            }
          >
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <AppSidebar
              isAdmin={user.isAdmin}
              activeTrackSlug={activeTrackSlug}
              activeTrackName={activeTrackName}
              trackLessons={trackLessons}
              enrollments={enrollments}
            />
          </SheetContent>
        </Sheet>
        <p className="truncate text-sm text-muted-foreground md:hidden">
          CyberSkill Builder
        </p>

        <div className="hidden min-w-0 items-center gap-1 md:flex">
          <OrgSwitcher workspaces={workspaces} />
          <Suspense fallback={null}>
            <AppBreadcrumb enrollments={enrollments} />
          </Suspense>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="md:hidden">
          <OrgSwitcher workspaces={workspaces} />
        </div>
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className="gap-2 px-2 transition-hover hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="User menu"
              />
            }
          >
            <Avatar className="size-7 transition-hover group-hover/button:opacity-90 group-aria-expanded/button:ring-2 group-aria-expanded/button:ring-ring/50">
              {mounted ? (
                <AvatarFallback
                  delay={0}
                  className="bg-primary text-xs text-primary-foreground"
                >
                  {initials}
                </AvatarFallback>
              ) : (
                <span className="flex size-full items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                  {initials}
                </span>
              )}
            </Avatar>
            {user.name ? (
              <span className="hidden text-sm font-medium sm:inline">
                {user.name}
              </span>
            ) : null}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  {user.name ? (
                    <span>{user.name}</span>
                  ) : (
                    <span className="font-normal text-muted-foreground">
                      Preferred name not set
                    </span>
                  )}
                  <span className="text-xs font-normal text-muted-foreground">
                    {user.email}
                  </span>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link href="/account" />}>
                <Settings className="size-4" aria-hidden="true" />
                {user.name ? 'Account Settings' : 'Set preferred name'}
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/portfolio" />}>
                <User className="size-4" aria-hidden="true" />
                My Portfolio
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                disabled={isSigningOut}
                onClick={() => startSignOut(() => signOut())}
              >
                <LogOut className="size-4" aria-hidden="true" />
                {isSigningOut ? 'Signing out…' : 'Sign Out'}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
