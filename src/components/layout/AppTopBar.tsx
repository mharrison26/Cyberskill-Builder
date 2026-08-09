'use client';

import Link from 'next/link';
import { LogOut, Menu, User } from 'lucide-react';
import { useTransition } from 'react';

import { signOut } from '@/app/(auth)/actions';

import { AppSidebar } from '@/components/layout/AppSidebar';
import { OrgSwitcher } from '@/components/layout/OrgSwitcher';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
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

type AppTopBarProps = {
  user: AppShellUser;
  activeTrackSlug?: string;
  activeTrackName?: string;
  trackLessons?: SidebarLesson[];
  enrollments?: SidebarTrack[];
  workspaces?: WorkspaceOption[];
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function AppTopBar({
  user,
  activeTrackSlug,
  activeTrackName,
  trackLessons = [],
  enrollments = [],
  workspaces = [],
}: AppTopBarProps) {
  const [isSigningOut, startSignOut] = useTransition();

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

        <div className="hidden min-w-0 md:block">
          <OrgSwitcher workspaces={workspaces} />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="md:hidden">
          <OrgSwitcher workspaces={workspaces} />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className="gap-2 px-2"
                aria-label="User menu"
              />
            }
          >
            <Avatar className="size-7">
              <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <span className="hidden text-sm font-medium sm:inline">
              {user.name}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span>{user.name}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {user.email}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/portfolio" />}>
              <User className="size-4" aria-hidden="true" />
              My Portfolio
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={isSigningOut}
              onClick={() => startSignOut(() => signOut())}
            >
              <LogOut className="size-4" aria-hidden="true" />
              {isSigningOut ? 'Signing out…' : 'Sign out'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
