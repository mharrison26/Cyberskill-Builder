import { CodeSandbox } from '@/components/CodeSandbox';
import { AoReviewTicket } from '@/components/tickets/AoReviewTicket';
import { AssessmentProceduresTicket } from '@/components/tickets/AssessmentProceduresTicket';
import { AuthorizationPackageTicket } from '@/components/tickets/AuthorizationPackageTicket';
import { CmmcGapAnalysisTicket } from '@/components/tickets/CmmcGapAnalysisTicket';
import { ConMonStrategyTicket } from '@/components/tickets/ConMonStrategyTicket';
import { ControlMappingWorkArea } from '@/components/tickets/ControlMappingWorkArea';
import { OscalSspForm } from '@/components/tickets/OscalSspForm';
import { PoamTicketWork } from '@/components/tickets/PoamTicketWork';
import { SecMaterialityTicket } from '@/components/tickets/SecMaterialityTicket';
import { ToolWalkthroughTicket } from '@/components/tickets/ToolWalkthroughTicket';
import {
  isAoReviewTicketType,
  isAuthorizationPackageTicketType,
} from '@/lib/capstone/ticketCodes';
import { isPoamTicketType } from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type TicketWorkSlotProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
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
    base === 'shell' ||
    base === 'oscal_generator' ||
    base === 'capstone_oscal'
  );
}

export function isConfigRemediationTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return base === 'config_remediation' || base === 'config_diff';
}

export function isToolWalkthroughTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (
    base === 'tool_walkthrough' ||
    base === 'simplerisk' ||
    base === 'simplerisk_walkthrough'
  );
}

export function isControlMappingTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return base === 'control_mapping';
}

export function isOscalSspTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return base === 'oscal_ssp' || base === 'ssp';
}

export function isAssessmentProceduresTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (
    base === 'assessment_procedures' ||
    base === 'sp800_53a' ||
    base === 'sp_800_53a'
  );
}

export function isSecMaterialityTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return base === 'sec_materiality' || base === 'sec_cyber_materiality';
}

export function isConMonStrategyTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return base === 'conmon_strategy' || base === 'continuous_monitoring';
}

export function isCmmcGapAnalysisTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return base === 'cmmc_gap_analysis' || base === 'cmmc_l2_gap';
}

/**
 * Extension point for ticket-type-specific work UIs.
 * Scripting / Python / oscal_generator (capstone_oscal) tickets mount CodeSandbox.
 * Tool walkthrough tickets mount the SimpleRisk submission form.
 * control_mapping tickets mount the framework crosswalk work area.
 * oscal_ssp tickets mount the NIST 800-171 Rev 3 SSP form.
 * assessment_procedures tickets mount Examine/Interview/Test drafting.
 * poam tickets mount the POA&M drafting form over prior findings.
 * sec_materiality tickets mount the Form 8-K Item 1.05 memo form.
 * conmon_strategy tickets mount the SP 800-137 continuous monitoring memo form.
 * cmmc_gap_analysis tickets mount the CMMC L2 practice scoring / gap form.
 * authorization_package tickets mount the compiled GRC-03/04/09 package view.
 * ao_review tickets mount the Authorizing Official risk-acceptance Q&A.
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

  if (isToolWalkthroughTicketType(ticket.ticket_type)) {
    return (
      <ToolWalkthroughTicket
        ticket={ticket}
        readOnly={readOnly}
        className={className}
      />
    );
  }

  if (isControlMappingTicketType(ticket.ticket_type)) {
    return (
      <ControlMappingWorkArea
        ticket={ticket}
        readOnly={readOnly}
        className={className}
      />
    );
  }

  if (isOscalSspTicketType(ticket.ticket_type)) {
    return (
      <OscalSspForm ticket={ticket} readOnly={readOnly} className={className} />
    );
  }

  if (isAssessmentProceduresTicketType(ticket.ticket_type)) {
    return (
      <AssessmentProceduresTicket
        ticket={ticket}
        readOnly={readOnly}
        className={className}
      />
    );
  }

  if (isPoamTicketType(ticket.ticket_type)) {
    return (
      <PoamTicketWork
        ticketId={ticket.id}
        initialState={ticket.initial_state as Record<string, unknown>}
        readOnly={readOnly}
        className={className}
      />
    );
  }

  if (isSecMaterialityTicketType(ticket.ticket_type)) {
    return (
      <SecMaterialityTicket
        ticket={ticket}
        readOnly={readOnly}
        className={className}
      />
    );
  }

  if (isConMonStrategyTicketType(ticket.ticket_type)) {
    return (
      <ConMonStrategyTicket
        ticket={ticket}
        readOnly={readOnly}
        className={className}
      />
    );
  }

  if (isCmmcGapAnalysisTicketType(ticket.ticket_type)) {
    return (
      <CmmcGapAnalysisTicket
        ticket={ticket}
        readOnly={readOnly}
        className={className}
      />
    );
  }

  if (isAuthorizationPackageTicketType(ticket.ticket_type)) {
    return (
      <AuthorizationPackageTicket
        ticket={ticket}
        readOnly={readOnly}
        className={className}
      />
    );
  }

  if (isAoReviewTicketType(ticket.ticket_type)) {
    return (
      <AoReviewTicket
        ticket={ticket}
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
