/**
 * Client-safe ticket UI constants and pure helpers.
 * Keep this module free of server-only imports (next/headers, fs, Supabase server).
 */

/** ITSM-style priority levels for triage tickets. */
export const TRIAGE_PRIORITIES = ['P1', 'P2', 'P3', 'P4'] as const;

export type TriagePriority = (typeof TRIAGE_PRIORITIES)[number];

export const TRIAGE_PRIORITY_LABELS: Record<TriagePriority, string> = {
  P1: 'P1 — Critical (immediate response)',
  P2: 'P2 — High (urgent, same business day)',
  P3: 'P3 — Medium (normal queue)',
  P4: 'P4 — Low (when capacity allows)',
};

/** Impact / urgency axes used by the priority rubric. */
export const TRIAGE_IMPACT_LEVELS = ['high', 'medium', 'low'] as const;
export type TriageImpactLevel = (typeof TRIAGE_IMPACT_LEVELS)[number];

export const TRIAGE_URGENCY_LEVELS = ['high', 'medium', 'low'] as const;
export type TriageUrgencyLevel = (typeof TRIAGE_URGENCY_LEVELS)[number];

/**
 * Default impact × urgency → priority matrix (ITIL-style).
 * Rows = impact, columns = urgency.
 */
export const DEFAULT_TRIAGE_PRIORITY_MATRIX: Record<
  TriageImpactLevel,
  Record<TriageUrgencyLevel, TriagePriority>
> = {
  high: { high: 'P1', medium: 'P2', low: 'P3' },
  medium: { high: 'P2', medium: 'P3', low: 'P4' },
  low: { high: 'P3', medium: 'P4', low: 'P4' },
};

export const TRIAGE_CATEGORIES = [
  'access',
  'hardware',
  'software',
  'network',
  'email',
  'security',
  'account',
  'how_to',
  'other',
] as const;

export type TriageCategory = (typeof TRIAGE_CATEGORIES)[number];

export const TRIAGE_CATEGORY_LABELS: Record<TriageCategory, string> = {
  access: 'Access / permissions',
  hardware: 'Hardware',
  software: 'Software / application',
  network: 'Network / connectivity',
  email: 'Email / messaging',
  security: 'Security incident',
  account: 'Account / identity',
  how_to: 'How-to / guidance',
  other: 'Other',
};

export function isTriagePriority(value: string): value is TriagePriority {
  return (TRIAGE_PRIORITIES as readonly string[]).includes(value);
}

export function isTriageCategory(value: string): value is TriageCategory {
  return (TRIAGE_CATEGORIES as readonly string[]).includes(value);
}

export function isTriageImpactLevel(value: string): value is TriageImpactLevel {
  return (TRIAGE_IMPACT_LEVELS as readonly string[]).includes(value);
}

export function isTriageUrgencyLevel(
  value: string
): value is TriageUrgencyLevel {
  return (TRIAGE_URGENCY_LEVELS as readonly string[]).includes(value);
}

export const AO_REVIEW_MIN_ANSWER_LENGTH = 40;

/** Post-resolution KB write-up (HD-03) minimum field length. */
export const KB_WRITEUP_MIN_FIELD_LENGTH = 40;

/** Helpdesk KPI report (HD-05) minimum written-report length. */
export const KPI_REPORT_MIN_REPORT_LENGTH = 80;

export function isKpiReportTicketType(ticketType: string): boolean {
  const t = ticketType.trim().toLowerCase();
  const base = t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
  return (
    base === 'kpi_report' ||
    base === 'ticket_metrics' ||
    base === 'helpdesk_kpis' ||
    base === 'csv_kpi_analysis'
  );
}

/**
 * Helpdesk capstone (HD-07 / PI-07) process document — new-hire onboarding checklist.
 * Structured sections + min lengths (deterministic); optional RAG can layer later.
 */
export const HELPDESK_PROCESS_DOC_MIN_SECTION_LENGTH = 40;
export const HELPDESK_PROCESS_DOC_MIN_TITLE_LENGTH = 8;

export const HELPDESK_PROCESS_DOC_SECTION_KEYS = [
  'purpose',
  'day_one',
  'first_week',
  'tools_access',
  'escalation_path',
  'kb_usage',
] as const;

export type HelpdeskProcessDocSectionKey =
  (typeof HELPDESK_PROCESS_DOC_SECTION_KEYS)[number];

export const HELPDESK_PROCESS_DOC_SECTION_LABELS: Record<
  HelpdeskProcessDocSectionKey,
  string
> = {
  purpose: 'Purpose — why this onboarding checklist exists',
  day_one: 'Day one — first-shift checklist',
  first_week: 'First week — milestones and shadowing',
  tools_access: 'Tools & access — systems every new hire needs',
  escalation_path: 'Escalation path — when and how to escalate',
  kb_usage: 'Knowledge base — how to use compiled KB articles',
};

/** Junior-notes coaching feedback minimum field length. */
export const COACHING_FEEDBACK_MIN_FIELD_LENGTH = 40;

/** Angry-customer email reply (de-escalation) minimum body length. */
export const CUSTOMER_REPLY_MIN_REPLY_LENGTH = 120;

export const ASSESSMENT_PROCEDURES_MIN_FIELD_LENGTH = 40;

export const TOOL_WALKTHROUGH_MIN_JUSTIFICATION_LENGTH = 80;

export const CMMC_GAP_ANALYSIS_MIN_LENGTH = 120;

export const CMMC_PRACTICE_SCORE_VALUES = [
  'met',
  'partial',
  'not_met',
] as const;

export type CmmcPracticeScoreValue =
  (typeof CMMC_PRACTICE_SCORE_VALUES)[number];

export const CONMON_STRATEGY_MIN_FIELD_LENGTH = 40;
export const CONMON_STRATEGY_MIN_ESCALATION_LENGTH = 80;

export const DEFAULT_CONMON_CONTROL_FAMILIES = [
  'AC',
  'AU',
  'CA',
  'CM',
  'IA',
  'RA',
  'SC',
  'SI',
] as const;

export const CONMON_TOOLS = ['DefectDojo', 'CloudSploit', 'Scuba'] as const;

export type ConMonToolName = (typeof CONMON_TOOLS)[number];

export const SEC_MATERIALITY_MIN_FACTOR_LENGTH = 40;
export const SEC_MATERIALITY_MIN_RATIONALE_LENGTH = 60;

export const SEC_MATERIALITY_FACTOR_KEYS = [
  'nature_scope',
  'data_compromise',
  'operational_impact',
  'financial_impact',
  'reputational_legal',
  'reasonable_investor',
] as const;

export type SecMaterialityFactorKey =
  (typeof SEC_MATERIALITY_FACTOR_KEYS)[number];

export const SEC_MATERIALITY_FACTOR_LABELS: Record<
  SecMaterialityFactorKey,
  string
> = {
  nature_scope: 'Nature, scope, and systems affected',
  data_compromise: 'Data compromised and individuals affected',
  operational_impact: 'Operational and service impact',
  financial_impact: 'Financial condition and results of operations',
  reputational_legal: 'Reputational harm, litigation, and regulatory risk',
  reasonable_investor: 'Reasonable-investor materiality analysis',
};

export type SecMaterialityDetermination = 'material' | 'not_material';

/** Simulated directory / helpdesk admin panel actions. */
export const MOCK_DIRECTORY_ACTION_TYPES = [
  'search',
  'verify_identity',
  'unlock',
  'reset_password',
] as const;

export type MockDirectoryActionType =
  (typeof MOCK_DIRECTORY_ACTION_TYPES)[number];

export type MockDirectoryUserStatus = 'active' | 'locked' | 'disabled';

export type MockDirectoryUser = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  department?: string;
  status: MockDirectoryUserStatus;
  /** Challenge shown before password reset when present. */
  identityQuestion?: string;
  /** Expected answer (compared case-insensitively; trimmed). */
  identityAnswer?: string;
};

export type MockDirectoryLoggedAction = {
  type: MockDirectoryActionType;
  userId?: string;
  query?: string;
  /** Present on verify_identity; scorer requires true when that action is required. */
  correct?: boolean;
  at: string;
};

export function isMockDirectoryActionType(
  value: string
): value is MockDirectoryActionType {
  return (MOCK_DIRECTORY_ACTION_TYPES as readonly string[]).includes(value);
}

/** Escalate-or-resolve decisions for SLA / escalation policy tickets. */
export const SLA_ESCALATION_DECISIONS = ['escalate', 'resolve'] as const;

export type SlaEscalationDecision = (typeof SLA_ESCALATION_DECISIONS)[number];

export const SLA_ESCALATION_DECISION_LABELS: Record<
  SlaEscalationDecision,
  string
> = {
  escalate: 'Escalate',
  resolve: 'Resolve at Tier 1',
};

export const SLA_ESCALATION_MIN_JUSTIFICATION_LENGTH = 80;

export function isSlaEscalationDecision(
  value: string
): value is SlaEscalationDecision {
  return (SLA_ESCALATION_DECISIONS as readonly string[]).includes(value);
}

export function isSlaEscalationTicketType(ticketType: string): boolean {
  const t = ticketType.trim().toLowerCase();
  const base = t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
  return (
    base === 'sla_escalation' ||
    base === 'escalate_or_resolve' ||
    base === 'escalation_decision'
  );
}

/**
 * Network diagnostics (PI-04): root-cause fault types for static
 * ipconfig / ping / traceroute output tickets.
 */
export const NETWORK_FAULT_TYPES = [
  'wrong_default_gateway',
  'dhcp_apipa',
  'dns_failure',
  'subnet_mask_mismatch',
  'upstream_routing_failure',
  'local_firewall_block',
  'nic_link_down',
] as const;

export type NetworkFaultType = (typeof NETWORK_FAULT_TYPES)[number];

export const NETWORK_FAULT_TYPE_LABELS: Record<NetworkFaultType, string> = {
  wrong_default_gateway: 'Wrong default gateway',
  dhcp_apipa: 'DHCP failure (APIPA / no lease)',
  dns_failure: 'DNS misconfiguration',
  subnet_mask_mismatch: 'Subnet mask mismatch',
  upstream_routing_failure: 'Upstream routing failure',
  local_firewall_block: 'Local firewall blocking traffic',
  nic_link_down: 'NIC / link down',
};

/** Next diagnostic step choices after identifying the fault. */
export const NETWORK_NEXT_DIAGNOSTIC_STEPS = [
  'verify_gateway_with_peer',
  'renew_dhcp_lease',
  'test_dns_servers',
  'check_firewall_rules',
  'inspect_upstream_hop',
  'check_physical_link',
  'capture_packets',
] as const;

export type NetworkNextDiagnosticStep =
  (typeof NETWORK_NEXT_DIAGNOSTIC_STEPS)[number];

export const NETWORK_NEXT_DIAGNOSTIC_STEP_LABELS: Record<
  NetworkNextDiagnosticStep,
  string
> = {
  verify_gateway_with_peer:
    'Confirm the correct gateway for this subnet (DHCP scope or working peer)',
  renew_dhcp_lease: 'Release/renew the DHCP lease and re-check addressing',
  test_dns_servers: 'Test name resolution against configured DNS servers',
  check_firewall_rules: 'Review local firewall rules for blocked traffic',
  inspect_upstream_hop: 'Inspect the failing upstream hop / path with NOC',
  check_physical_link: 'Check cable, NIC link lights, and switch port status',
  capture_packets: 'Capture packets to see where traffic is dropped',
};

export function isNetworkFaultType(value: string): value is NetworkFaultType {
  return (NETWORK_FAULT_TYPES as readonly string[]).includes(value);
}

export function isNetworkNextDiagnosticStep(
  value: string
): value is NetworkNextDiagnosticStep {
  return (NETWORK_NEXT_DIAGNOSTIC_STEPS as readonly string[]).includes(value);
}

export function isNetworkDiagnosticsTicketType(ticketType: string): boolean {
  const t = ticketType.trim().toLowerCase();
  const base = t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
  return (
    base === 'network_diagnostics' ||
    base === 'pi04' ||
    base === 'traceroute_fault' ||
    base === 'command_output_diagnosis'
  );
}

/**
 * P1 outage stakeholder status updates (simulated clock + mock channel).
 * Distinct from SLA queue simulation (PI-09): this scores cadence + content
 * of incident status posts, not queue/SLA handling.
 */
export const P1_STATUS_UPDATES_MIN_FIELD_LENGTH = 20;
export const P1_STATUS_UPDATES_DEFAULT_TOLERANCE_MINUTES = 5;
export const P1_STATUS_UPDATES_DEFAULT_ADVANCE_STEPS = [5, 15, 30] as const;

export function isP1StatusUpdatesTicketType(ticketType: string): boolean {
  const t = ticketType.trim().toLowerCase();
  const base = t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
  return (
    base === 'p1_status_updates' ||
    base === 'incident_status_cadence' ||
    base === 'stakeholder_updates' ||
    base === 'outage_comms'
  );
}

/** Format simulated incident minutes as T+HH:MM. */
export function formatSimClock(simMinutes: number): string {
  const total = Math.max(0, Math.floor(simMinutes));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `T+${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export const POAM_STATUSES = [
  'open',
  'ongoing',
  'completed',
  'delayed',
  'risk_accepted',
] as const;

export type PoamStatus = (typeof POAM_STATUSES)[number];

export const POAM_MIN_WEAKNESS_LENGTH = 20;
export const POAM_MIN_MILESTONE_LENGTH = 20;

export type PoamPriorFinding = {
  id: string;
  controlId?: string;
  title?: string;
  summary: string;
  findingState?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isPoamTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return base === 'poam' || base === 'poam_draft';
}

export function isPoamStatus(value: string): value is PoamStatus {
  return (POAM_STATUSES as readonly string[]).includes(value);
}

export function parsePriorFindings(
  initialState: Record<string, unknown> | null | undefined
): PoamPriorFinding[] {
  if (!isPlainObject(initialState)) {
    return [];
  }

  const raw =
    initialState.prior_findings ??
    initialState.priorFindings ??
    initialState.findings;

  if (!Array.isArray(raw)) {
    return [];
  }

  const findings: PoamPriorFinding[] = [];

  for (const item of raw) {
    if (!isPlainObject(item)) continue;
    const id =
      typeof item.id === 'string'
        ? item.id.trim()
        : typeof item.finding_id === 'string'
          ? item.finding_id.trim()
          : '';
    if (!id) continue;

    const summary =
      typeof item.summary === 'string'
        ? item.summary.trim()
        : typeof item.description === 'string'
          ? item.description.trim()
          : typeof item.observation === 'string'
            ? item.observation.trim()
            : '';

    findings.push({
      id,
      controlId:
        typeof item.control_id === 'string'
          ? item.control_id
          : typeof item.controlId === 'string'
            ? item.controlId
            : undefined,
      title: typeof item.title === 'string' ? item.title : undefined,
      summary,
      findingState:
        typeof item.finding_state === 'string'
          ? item.finding_state
          : typeof item.findingState === 'string'
            ? item.findingState
            : undefined,
    });
  }

  return findings;
}
