'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';

import { switchWorkspace } from '@/components/layout/actions';
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
import type { WorkspaceOption } from '@/lib/tenants/workspaces';
import { cn } from '@/lib/utils';

type OrgSwitcherProps = {
  workspaces: WorkspaceOption[];
  className?: string;
};

/**
 * Org / workspace switcher. Lists tenant memberships; switching updates
 * users.tenant_id. Ready for multi-seat / SSO-provisioned orgs.
 */
export function OrgSwitcher({ workspaces, className }: OrgSwitcherProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const active =
    workspaces.find((workspace) => workspace.isActive) ?? workspaces[0];

  if (!active) {
    return (
      <div
        className={cn(
          'inline-flex h-9 max-w-[14rem] items-center gap-2 rounded-md border border-transparent px-2.5 text-sm text-muted-foreground',
          className
        )}
      >
        <Building2 className="size-4 shrink-0 opacity-60" />
        <span className="truncate">Personal workspace</span>
      </div>
    );
  }

  function handleSelect(tenantId: string) {
    if (tenantId === active?.tenantId) return;
    setError(null);
    startTransition(async () => {
      const result = await switchWorkspace(tenantId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className={cn('min-w-0', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className="h-9 max-w-[16rem] gap-2 px-2.5"
              aria-label="Switch workspace"
              disabled={isPending}
            />
          }
        >
          <Building2
            className="size-4 shrink-0 opacity-70"
            aria-hidden="true"
          />
          <span className="truncate text-sm font-medium">{active.name}</span>
          <ChevronDown
            className="size-3.5 shrink-0 opacity-50"
            aria-hidden="true"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {workspaces.map((workspace) => (
              <DropdownMenuItem
                key={workspace.tenantId}
                disabled={isPending}
                onClick={() => handleSelect(workspace.tenantId)}
                className="flex items-start justify-between gap-2"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {workspace.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {workspace.tenantKind}
                    {workspace.role ? ` · ${workspace.role}` : ''}
                  </span>
                </span>
                {workspace.isActive ? (
                  <Check
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              disabled
              className="text-xs text-muted-foreground"
            >
              SSO-provisioned orgs appear here after enterprise setup
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
