'use client';

import { cn } from '@/lib/utils';

type MockSandboxSurfaceProps = {
  hostname?: string;
  /** Dominant terminal (sysadmin) vs editor+terminal layout. */
  layout?: 'terminal' | 'editor';
  className?: string;
};

/**
 * Visual stand-in for sandbox / WebContainer surfaces on mock consoles.
 * Live ticket workbenches still mount the real CodeSandbox / Fly terminal.
 */
export function MockSandboxSurface({
  hostname = 'sandbox.local',
  layout = 'terminal',
  className,
}: MockSandboxSurfaceProps) {
  return (
    <div
      className={cn(
        'flex min-h-[20rem] flex-col overflow-hidden rounded-md border border-border bg-terminal font-mono text-xs text-terminal-foreground',
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-terminal-foreground/10 px-3 py-2 text-[11px] text-terminal-muted">
        <span className="size-2 rounded-full bg-status-blocked-foreground/80" />
        <span className="size-2 rounded-full bg-status-insufficient-foreground/80" />
        <span className="size-2 rounded-full bg-status-satisfied-foreground/80" />
        <span className="ml-2 truncate">{hostname}</span>
        <span className="ml-auto text-terminal-muted/70">
          {layout === 'editor'
            ? 'WebContainer (mock)'
            : 'Incident shell (mock)'}
        </span>
      </div>

      {layout === 'editor' ? (
        <div className="grid min-h-0 flex-1 md:grid-cols-[9rem_minmax(0,1fr)]">
          <aside className="border-r border-terminal-foreground/10 bg-black/30 p-2 text-terminal-muted">
            <p className="mb-2 text-[10px] uppercase tracking-wide">Files</p>
            <ul className="space-y-1">
              <li className="text-primary">main.py</li>
              <li>tests/test_sla.py</li>
              <li>requirements.txt</li>
            </ul>
          </aside>
          <div className="flex min-h-0 flex-col">
            <pre className="flex-1 overflow-auto p-3 leading-relaxed text-terminal-accent">
              {`def remaining_ms(sla_minutes: int, started_at: float, now: float) -> int:
    deadline = started_at + sla_minutes * 60_000
    return int(deadline - now)

# TODO: handle timezone-aware started_at
`}
            </pre>
            <div className="border-t border-terminal-foreground/10 bg-black/40 p-3 text-terminal-foreground/80">
              <p>$ pytest -q</p>
              <p className="text-status-satisfied-foreground">
                ..... 5 passed in 0.12s
              </p>
              <p className="mt-1 text-terminal-muted/70">
                sparky@webcontainer:~$ <span className="animate-pulse">▌</span>
              </p>
            </div>
          </div>
        </div>
      ) : (
        <pre className="flex-1 overflow-auto p-3 leading-relaxed">
          {`connected: ${hostname}
$ df -h /
Filesystem      Size  Used Avail Use% Mounted on
/dev/mapper/root  98G   91G  7.1G  93% /

$ journalctl -u app-db --since "10 min ago" | tail -n 5
Aug 09 12:01:04 app-db-03 postgres[8821]: CHECKPOINT starting
Aug 09 12:02:11 app-db-03 kernel: EXT4-fs warning: error count

root@${hostname.split('.')[0]}:~# `}
          <span className="animate-pulse">▌</span>
        </pre>
      )}
    </div>
  );
}
