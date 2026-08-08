import { CodeSandbox } from '@/components/CodeSandbox';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type TicketWorkSlotProps = {
  ticket: Pick<Ticket, 'id' | 'ticket_type' | 'initial_state'>;
  /** Disable sandbox submit / edits (admin preview). */
  readOnly?: boolean;
  className?: string;
};

/** Normalize ticket.initial_state into a flat path → contents map for CodeSandbox. */
export function initialStateToFiles(
  initialState: Record<string, unknown>
): Record<string, string> {
  const nested = initialState.files;
  const source =
    typeof nested === 'object' && nested !== null && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : initialState;

  const files: Record<string, string> = {};
  for (const [path, value] of Object.entries(source)) {
    if (
      path === 'files' ||
      path === 'expected_config' ||
      path === 'expected_state' ||
      path === 'rules'
    ) {
      continue;
    }
    if (typeof value === 'string') {
      files[path] = value;
    }
  }
  return files;
}

function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isScriptingTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (
    base === 'scripting' ||
    base === 'python' ||
    base === 'python_lab' ||
    base === 'shell'
  );
}

export function isConfigRemediationTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return base === 'config_remediation' || base === 'config_diff';
}

/**
 * Extension point for ticket-type-specific work UIs.
 * Scripting / Python tickets mount the client-side WebContainer CodeSandbox.
 */
export function TicketWorkSlot({
  ticket,
  readOnly = false,
  className,
}: TicketWorkSlotProps) {
  if (
    isScriptingTicketType(ticket.ticket_type) ||
    isConfigRemediationTicketType(ticket.ticket_type)
  ) {
    const files = initialStateToFiles(
      ticket.initial_state as Record<string, unknown>
    );

    return (
      <CodeSandbox
        ticketId={ticket.id}
        initialState={files}
        readOnly={readOnly}
        className={className}
      />
    );
  }

  return (
    <section
      aria-labelledby="ticket-work-heading"
      className={cn(
        'rounded-lg border border-dashed border-border bg-muted/30 px-5 py-8',
        className
      )}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <h2 id="ticket-work-heading" className="text-base font-semibold">
        Work area
      </h2>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        Ticket-type-specific tools for{' '}
        <span className="font-medium text-foreground">
          {ticket.ticket_type.replace(/_/g, ' ')}
        </span>{' '}
        will appear here. This shell stays generic across all ticket types.
      </p>
    </section>
  );
}
