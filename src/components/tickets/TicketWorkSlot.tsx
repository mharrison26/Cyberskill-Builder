import { CodeSandbox } from '@/components/CodeSandbox';
import { MockDirectoryPanel } from '@/components/MockDirectoryPanel';
import { AoReviewTicket } from '@/components/tickets/AoReviewTicket';
import { AssessmentProceduresTicket } from '@/components/tickets/AssessmentProceduresTicket';
import { AuthorizationPackageTicket } from '@/components/tickets/AuthorizationPackageTicket';
import { CmmcGapAnalysisTicket } from '@/components/tickets/CmmcGapAnalysisTicket';
import { ConMonStrategyTicket } from '@/components/tickets/ConMonStrategyTicket';
import { ControlMappingWorkArea } from '@/components/tickets/ControlMappingWorkArea';
import { CoachingFeedbackTicket } from '@/components/tickets/CoachingFeedbackTicket';
import { CustomerReplyTicket } from '@/components/tickets/CustomerReplyTicket';
import { HelpdeskCapstoneTicket } from '@/components/tickets/HelpdeskCapstoneTicket';
import { KbWriteupTicket } from '@/components/tickets/KbWriteupTicket';
import { KpiReportTicket } from '@/components/tickets/KpiReportTicket';
import { NetworkDiagnosticsTicket } from '@/components/tickets/NetworkDiagnosticsTicket';
import { OscalSspForm } from '@/components/tickets/OscalSspForm';
import { P1StatusUpdatesTicket } from '@/components/tickets/P1StatusUpdatesTicket';
import { PoamTicketWork } from '@/components/tickets/PoamTicketWork';
import { SecMaterialityTicket } from '@/components/tickets/SecMaterialityTicket';
import { SlaEscalationTicket } from '@/components/tickets/SlaEscalationTicket';
import { SlaQueueSimTicket } from '@/components/tickets/SlaQueueSimTicket';
import { ToolWalkthroughTicket } from '@/components/tickets/ToolWalkthroughTicket';
import { TriageTicket } from '@/components/tickets/TriageTicket';
import {
  isAoReviewTicketType,
  isAuthorizationPackageTicketType,
} from '@/lib/capstone/ticketCodes';
import { isHelpdeskCapstoneTicketType } from '@/lib/helpdesk/ticketCodes';
import { isSlaQueueSimTicketType } from '@/lib/scoring/slaQueueSim';
import {
  isKpiReportTicketType,
  isNetworkDiagnosticsTicketType,
  isP1StatusUpdatesTicketType,
  isPoamTicketType,
  isSlaEscalationTicketType,
} from '@/lib/scoring/ticketUi';
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

/** WebContainer script lab: clear spooler / restart service (distinct from static network_diagnostics). */
export function isScriptRemediationTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (
    base === 'script_remediation' ||
    base === 'spooler_fix' ||
    base === 'sandbox_script' ||
    base === 'service_restart'
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

export function isTriageTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return base === 'triage' || base === 'ticket_triage' || base === 'helpdesk_triage';
}

export function isMockDirectoryTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (
    base === 'mock_directory' ||
    base === 'directory_reset' ||
    base === 'account_unlock'
  );
}

export function isKbWriteupTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (
    base === 'kb_writeup' ||
    base === 'helpdesk_kb' ||
    base === 'resolution_writeup'
  );
}

export function isCustomerReplyTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (
    base === 'customer_reply' ||
    base === 'deescalation_reply' ||
    base === 'angry_email'
  );
}

export function isCoachingFeedbackTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (
    base === 'coaching_feedback' ||
    base === 'peer_coaching' ||
    base === 'junior_notes_review'
  );
}

/**
 * Extension point for ticket-type-specific work UIs.
 * Scripting / Python / oscal_generator (capstone_oscal) tickets mount CodeSandbox.
 * script_remediation (spooler_fix / sandbox_script / service_restart) also mounts CodeSandbox;
 * scoring composes config-diff state checks + RAG script-quality feedback.
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
 * triage tickets mount the inbound priority + category form.
 * mock_directory tickets mount the simulated directory unlock/reset console.
 * sla_escalation tickets mount the escalate-or-resolve policy decision form.
 * kb_writeup tickets mount the post-resolution KB article form (HD-03).
 * helpdesk_capstone tickets mount the mini KB + onboarding process doc (HD-07 / PI-07).
 * kpi_report tickets mount CSV KPI analysis (manual form or script sandbox) (HD-05).
 * customer_reply tickets mount the angry-email de-escalation reply form.
 * coaching_feedback tickets mount the junior-notes peer coaching form.
 * network_diagnostics tickets mount static command output + multi-step diagnosis (PI-04).
 * sla_queue_sim tickets mount the timed multi-ticket queue with SLA timers (PI-09).
 * p1_status_updates tickets mount simulated-clock stakeholder status cadence (distinct from PI-09).
 */
export function TicketWorkSlot({
  ticket,
  readOnly = false,
  className,
}: TicketWorkSlotProps) {
  if (
    isScriptingTicketType(ticket.ticket_type) ||
    isScriptRemediationTicketType(ticket.ticket_type) ||
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

  if (isTriageTicketType(ticket.ticket_type)) {
    return (
      <TriageTicket
        ticket={ticket}
        readOnly={readOnly}
        className={className}
      />
    );
  }

  if (isMockDirectoryTicketType(ticket.ticket_type)) {
    return (
      <MockDirectoryPanel
        ticket={ticket}
        readOnly={readOnly}
        className={className}
      />
    );
  }

  if (isSlaEscalationTicketType(ticket.ticket_type)) {
    return (
      <SlaEscalationTicket
        ticket={ticket}
        readOnly={readOnly}
        className={className}
      />
    );
  }

  if (isKbWriteupTicketType(ticket.ticket_type)) {
    return (
      <KbWriteupTicket
        ticket={ticket}
        readOnly={readOnly}
        className={className}
      />
    );
  }

  if (isKpiReportTicketType(ticket.ticket_type)) {
    return (
      <KpiReportTicket
        ticket={ticket}
        readOnly={readOnly}
        className={className}
      />
    );
  }

  if (isHelpdeskCapstoneTicketType(ticket.ticket_type)) {
    return (
      <HelpdeskCapstoneTicket
        ticket={ticket}
        readOnly={readOnly}
        className={className}
      />
    );
  }

  if (isCustomerReplyTicketType(ticket.ticket_type)) {
    return (
      <CustomerReplyTicket
        ticket={ticket}
        readOnly={readOnly}
        className={className}
      />
    );
  }

  if (isCoachingFeedbackTicketType(ticket.ticket_type)) {
    return (
      <CoachingFeedbackTicket
        ticket={ticket}
        readOnly={readOnly}
        className={className}
      />
    );
  }

  if (isNetworkDiagnosticsTicketType(ticket.ticket_type)) {
    return (
      <NetworkDiagnosticsTicket
        ticket={ticket}
        readOnly={readOnly}
        className={className}
      />
    );
  }

  if (isSlaQueueSimTicketType(ticket.ticket_type)) {
    return (
      <SlaQueueSimTicket
        ticket={ticket}
        readOnly={readOnly}
        className={className}
      />
    );
  }

  if (isP1StatusUpdatesTicketType(ticket.ticket_type)) {
    return (
      <P1StatusUpdatesTicket
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
