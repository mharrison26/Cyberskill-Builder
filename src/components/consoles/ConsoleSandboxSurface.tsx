'use client';

import { CodeSandbox } from '@/components/CodeSandbox';
import { MockSandboxSurface } from '@/components/consoles/MockSandboxSurface';
import { FlySandboxTicket } from '@/components/tickets/FlySandboxTicket';
import {
  initialStateToFiles,
  isScriptRemediationTicketType,
  isScriptingTicketType,
} from '@/components/tickets/TicketWorkSlot';
import { isCisHardeningTicketType } from '@/lib/scoring/ticketUi';
import type { MockTrackTicket } from '@/types';

type ConsoleSandboxSurfaceProps = {
  ticket: MockTrackTicket;
  /** Dominant terminal (sysadmin) vs editor+terminal (python). */
  preferredLayout?: 'terminal' | 'editor';
  className?: string;
};

/**
 * Prefer live CodeSandbox / Fly sandbox when the console ticket is from
 * Supabase and matches a sandbox ticket type; otherwise show mock chrome.
 */
export function ConsoleSandboxSurface({
  ticket,
  preferredLayout = 'terminal',
  className,
}: ConsoleSandboxSurfaceProps) {
  const isLive = ticket.source === 'live';
  const initialState = ticket.initialState ?? {};
  const expectedState = ticket.expectedState ?? {};

  if (isLive && isCisHardeningTicketType(ticket.ticketType)) {
    return (
      <FlySandboxTicket
        ticket={{
          id: ticket.id,
          ticket_type: ticket.ticketType,
          initial_state: initialState,
          expected_state: expectedState,
        }}
        className={className}
      />
    );
  }

  if (
    isLive &&
    (isScriptingTicketType(ticket.ticketType) ||
      isScriptRemediationTicketType(ticket.ticketType) ||
      preferredLayout === 'editor')
  ) {
    const files = initialStateToFiles(initialState);
    if (Object.keys(files).length > 0 || preferredLayout === 'editor') {
      const seed =
        Object.keys(files).length > 0
          ? files
          : {
              'main.py':
                '# Live ticket — open the workbench if the lab FS is empty.\nprint("ready")\n',
            };
      return (
        <CodeSandbox
          ticketId={ticket.id}
          initialState={seed}
          showFileBrowser
          showSubmit={false}
          className={className}
        />
      );
    }
  }

  return (
    <MockSandboxSurface
      hostname={ticket.hostname ?? `ticket-${ticket.id.slice(0, 8)}`}
      layout={preferredLayout}
      className={className}
    />
  );
}
