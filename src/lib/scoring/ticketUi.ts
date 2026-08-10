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

/**
 * Sysadmin infra design capstone (SA-07 / PI-07) — design decision doc + tradeoff Q&A.
 */
export const INFRA_DESIGN_DOC_MIN_BODY_LENGTH = 400;
export const INFRA_DESIGN_DOC_MIN_TITLE_LENGTH = 8;
export const INFRA_DESIGN_FOLLOWUP_MIN_ANSWER_LENGTH = 40;

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

/** Backup / disaster recovery plan minimum field length. */
export const BACKUP_DR_PLAN_MIN_FIELD_LENGTH = 40;

/** Angry-customer email reply (de-escalation) minimum body length. */
export const CUSTOMER_REPLY_MIN_REPLY_LENGTH = 120;

export const ASSESSMENT_PROCEDURES_MIN_FIELD_LENGTH = 40;

/** CCCER audit-exception narrative fields (Condition…Recommendation). */
export const CCCER_MIN_FIELD_LENGTH = 40;

/** Structured audit workpaper narrative field minimum length. */
export const AUDIT_WORKPAPER_MIN_FIELD_LENGTH = 40;
/** Preparer / reviewer identity minimum length (non-trivial name). */
export const AUDIT_WORKPAPER_MIN_IDENTITY_LENGTH = 2;

/** Sampling methodology narrative fields (sample selection + risk additions). */
export const SAMPLING_METHODOLOGY_MIN_FIELD_LENGTH = 80;

/** Capstone risk-based annual audit plan (from risk register). */
export const RISK_BASED_AUDIT_PLAN_DEFAULT_CAPACITY = 5;
export const RISK_BASED_AUDIT_PLAN_MIN_JUSTIFICATION_LENGTH = 60;
export const RISK_BASED_AUDIT_PLAN_MIN_CAPACITY_NOTES_LENGTH = 40;

/** PI-02 audit planning memo section minimum length. */
export const AUDIT_PLANNING_MEMO_MIN_FIELD_LENGTH = 40;

/** PI-02 process control test notes minimum length. */
export const PROCESS_CONTROL_TEST_MIN_NOTES_LENGTH = 40;

/** PI-02 findings summary section minimum length. */
export const FINDINGS_SUMMARY_MIN_FIELD_LENGTH = 40;

/**
 * AUD-07 audit-committee brief (flagship) — executive summary + AC questions.
 */
export const AUDIT_COMMITTEE_BRIEF_MIN_SUMMARY_LENGTH = 200;
export const AUDIT_COMMITTEE_BRIEF_QUESTION_MIN = 4;
export const AUDIT_COMMITTEE_BRIEF_QUESTION_MAX = 5;

/** ISSO incident notification draft completeness gate (length only). */
export const INCIDENT_NOTIFICATION_MIN_DRAFT_LENGTH = 120;

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

/** ISSM-07 one-year security strategy capstone (flagship) field gates. */
export const SECURITY_STRATEGY_CAPSTONE_MIN_SECTION_LENGTH = 120;
export const SECURITY_STRATEGY_CAPSTONE_DEFAULT_MIN_MEMO_LENGTH = 600;
export const SECURITY_STRATEGY_CAPSTONE_DEFAULT_MIN_PRIORITIES = 3;
export const SECURITY_STRATEGY_CAPSTONE_DEFAULT_MIN_OUTCOMES = 3;
export const SECURITY_STRATEGY_CAPSTONE_REQUIRED_SECTION_KEYS = [
  'priorities',
  'resourcing',
  'expected_outcomes',
] as const;

/** Continuous auditing design (single control area) field minimums. */
export const CONTINUOUS_AUDITING_MIN_FIELD_LENGTH = 40;
export const CONTINUOUS_AUDITING_MIN_EXCEPTION_LENGTH = 80;
export const CONTINUOUS_AUDITING_MIN_OPTIONAL_LENGTH = 20;

export const CONTINUOUS_AUDITING_FREQUENCIES = [
  'Daily',
  'Weekly',
  'Monthly',
  'Quarterly',
  'Event-triggered',
  'Other (describe in rationale)',
] as const;

export type ContinuousAuditingFrequency =
  (typeof CONTINUOUS_AUDITING_FREQUENCIES)[number];

/** Policy section draft (acceptable use / access control) minimum length. */
export const POLICY_SECTION_DRAFT_MIN_LENGTH = 400;

/**
 * Board findings summary — one-page translation of technical GRC/ISSO findings.
 */
export const BOARD_FINDINGS_SUMMARY_MIN_LENGTH = 350;
export const BOARD_FINDINGS_SUMMARY_MAX_LENGTH = 900;
export const BOARD_FINDINGS_MIN_ASK_STATEMENT_LENGTH = 20;
export const BOARD_FINDINGS_ASK_TYPES = [
  'budget',
  'decision',
  'awareness',
] as const;
export type BoardFindingsAskType = (typeof BOARD_FINDINGS_ASK_TYPES)[number];

export function isBoardFindingsSummaryTicketType(ticketType: string): boolean {
  const t = ticketType.trim().toLowerCase();
  const base = t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
  return (
    base === 'board_findings_summary' ||
    base === 'board_level_summary' ||
    base === 'technical_to_board_brief'
  );
}

export function isPolicySectionDraftTicketType(ticketType: string): boolean {
  const t = ticketType.trim().toLowerCase();
  const base = t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
  return (
    base === 'policy_section_draft' ||
    base === 'policy_draft' ||
    base === 'draft_policy_section'
  );
}

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

/** FIPS 199 potential impact levels for security categorization tickets. */
export const FIPS_199_IMPACT_LEVELS = ['low', 'moderate', 'high'] as const;

export type Fips199ImpactLevel = (typeof FIPS_199_IMPACT_LEVELS)[number];

export const FIPS_199_IMPACT_LEVEL_LABELS: Record<Fips199ImpactLevel, string> =
  {
    low: 'Low',
    moderate: 'Moderate',
    high: 'High',
  };

export const FIPS_199_SECURITY_OBJECTIVES = [
  'confidentiality',
  'integrity',
  'availability',
] as const;

export type Fips199SecurityObjective =
  (typeof FIPS_199_SECURITY_OBJECTIVES)[number];

export const FIPS_199_SECURITY_OBJECTIVE_LABELS: Record<
  Fips199SecurityObjective,
  string
> = {
  confidentiality: 'Confidentiality',
  integrity: 'Integrity',
  availability: 'Availability',
};

export const FIPS_199_MIN_JUSTIFICATION_LENGTH = 80;

export function isFips199ImpactLevel(
  value: string
): value is Fips199ImpactLevel {
  return (FIPS_199_IMPACT_LEVELS as readonly string[]).includes(value);
}

export function isFips199ImpactCategorizationTicketType(
  ticketType: string
): boolean {
  const t = ticketType.trim().toLowerCase();
  const base = t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
  return (
    base === 'fips_199_impact_categorization' ||
    base === 'impact_categorization' ||
    base === 'security_categorization'
  );
}

/** Vendor / third-party risk ratings (SP 800-161 C-SCRM oriented). */
export const VENDOR_RISK_RATING_LEVELS = [
  'low',
  'moderate',
  'high',
  'critical',
] as const;

export type VendorRiskRatingLevel = (typeof VENDOR_RISK_RATING_LEVELS)[number];

export const VENDOR_RISK_RATING_LEVEL_LABELS: Record<
  VendorRiskRatingLevel,
  string
> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  critical: 'Critical',
};

export const VENDOR_RISK_MIN_JUSTIFICATION_LENGTH = 200;

export function isVendorRiskRatingLevel(
  value: string
): value is VendorRiskRatingLevel {
  return (VENDOR_RISK_RATING_LEVELS as readonly string[]).includes(value);
}

export function isVendorRiskRatingTicketType(ticketType: string): boolean {
  const t = ticketType.trim().toLowerCase();
  const base = t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
  return (
    base === 'vendor_risk_rating' ||
    base === 'third_party_risk_rating' ||
    base === 'scrm_vendor_assessment'
  );
}

/** ISSO→ISSM cross-system escalation decisions. */
export const ISSM_ESCALATION_DECISIONS = [
  'escalate',
  'handle_at_isso',
] as const;

export type IssmEscalationDecision = (typeof ISSM_ESCALATION_DECISIONS)[number];

export const ISSM_ESCALATION_DECISION_LABELS: Record<
  IssmEscalationDecision,
  string
> = {
  escalate: 'Escalate to ISSM',
  handle_at_isso: 'Handle at ISSO level',
};

export const ISSM_ESCALATION_MIN_MEMO_LENGTH = 120;

export function isIssmEscalationDecision(
  value: string
): value is IssmEscalationDecision {
  return (ISSM_ESCALATION_DECISIONS as readonly string[]).includes(value);
}

export function isIssmEscalationTicketType(ticketType: string): boolean {
  const t = ticketType.trim().toLowerCase();
  const base = t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
  return (
    base === 'issm_escalation' ||
    base === 'cross_system_escalation' ||
    base === 'isso_to_issm_escalation'
  );
}

/** ISSM / program FY security budget allocation under a fixed ceiling. */
export const SECURITY_BUDGET_ALLOCATION_TICKET_TYPES = [
  'security_budget_allocation',
  'budget_allocation',
  'risk_based_budget',
] as const;

export type SecurityBudgetAllocationTicketTypeUi =
  (typeof SECURITY_BUDGET_ALLOCATION_TICKET_TYPES)[number];

export const SECURITY_BUDGET_ALLOCATION_DEFAULT_BUDGET = 250_000;
export const SECURITY_BUDGET_ALLOCATION_MIN_JUSTIFICATION_LENGTH = 250;

export function isSecurityBudgetAllocationTicketType(
  ticketType: string
): boolean {
  const t = ticketType.trim().toLowerCase();
  const base = t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
  return (
    base === 'security_budget_allocation' ||
    base === 'budget_allocation' ||
    base === 'risk_based_budget'
  );
}

/**
 * Leadership program-metrics brief (ISSO/ISSM program oversight).
 * Distinct from helpdesk kpi_report (ticket-resolution CSV KPIs).
 */
export const PROGRAM_METRICS_BRIEF_TICKET_TYPES = [
  'program_metrics_brief',
  'leadership_metrics',
  'isso_program_metrics',
] as const;

export type ProgramMetricsBriefTicketType =
  (typeof PROGRAM_METRICS_BRIEF_TICKET_TYPES)[number];

export const PROGRAM_METRICS_BRIEF_DEFAULT_MIN_SELECTED = 2;
export const PROGRAM_METRICS_BRIEF_DEFAULT_MAX_SELECTED = 3;
export const PROGRAM_METRICS_BRIEF_DEFAULT_MIN_RATIONALE_LENGTH = 120;

export function isProgramMetricsBriefTicketType(ticketType: string): boolean {
  const t = ticketType.trim().toLowerCase();
  const base = t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
  return (PROGRAM_METRICS_BRIEF_TICKET_TYPES as readonly string[]).includes(
    base
  );
}

/** Binary adequacy judgments for control implementation statement review. */
export const CONTROL_IMPLEMENTATION_ADEQUACY_JUDGMENTS = [
  'adequate',
  'inadequate',
] as const;

export type ControlImplementationAdequacyJudgment =
  (typeof CONTROL_IMPLEMENTATION_ADEQUACY_JUDGMENTS)[number];

export const CONTROL_IMPLEMENTATION_ADEQUACY_JUDGMENT_LABELS: Record<
  ControlImplementationAdequacyJudgment,
  string
> = {
  adequate: 'Adequate',
  inadequate: 'Inadequate',
};

export const CONTROL_IMPLEMENTATION_ADEQUACY_MIN_JUSTIFICATION_LENGTH = 80;

export function isControlImplementationAdequacyJudgment(
  value: string
): value is ControlImplementationAdequacyJudgment {
  return (
    CONTROL_IMPLEMENTATION_ADEQUACY_JUDGMENTS as readonly string[]
  ).includes(value);
}

export function isControlImplementationAdequacyTicketType(
  ticketType: string
): boolean {
  const t = ticketType.trim().toLowerCase();
  const base = t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
  return (
    base === 'control_implementation_adequacy' ||
    base === 'implementation_statement_review' ||
    base === 'control_statement_adequacy'
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
 * Network topology fault: diagram + static diagnostics; student identifies
 * misconfigured device/subnet (deterministic) and justifies with subnetting/TCP-IP (RAG).
 */
export const NETWORK_TOPOLOGY_FAULT_MIN_JUSTIFICATION_LENGTH = 80;

export function isNetworkTopologyFaultTicketType(ticketType: string): boolean {
  const t = ticketType.trim().toLowerCase();
  const base = t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
  return (
    base === 'network_topology_fault' ||
    base === 'subnet_fault_diagnosis' ||
    base === 'topology_misconfig' ||
    base === 'network_fault_location'
  );
}

/**
 * PI-04 WebContainer lab: navigate a seeded filesystem, inspect modes with
 * `ls -l`, answer short questions graded deterministically.
 */
export function isFsPermissionsLabTicketType(ticketType: string): boolean {
  const t = ticketType.trim().toLowerCase();
  const base = t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
  return (
    base === 'fs_permissions_lab' ||
    base === 'sandbox_permissions' ||
    base === 'ls_permissions' ||
    base === 'permissions_explore'
  );
}

/**
 * Config fault diagnosis: student reads a static named.conf / dhcpd.conf
 * snippet, identifies the misconfigured line, and explains the impact.
 * Primary grade is deterministic line match against expected_state.
 */
export const CONFIG_FAULT_DIAGNOSIS_MIN_IMPACT_LENGTH = 40;

export function isConfigFaultDiagnosisTicketType(ticketType: string): boolean {
  const t = ticketType.trim().toLowerCase();
  const base = t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
  return (
    base === 'config_fault_diagnosis' ||
    base === 'named_conf_fault' ||
    base === 'dns_config_fault' ||
    base === 'config_line_diagnosis'
  );
}

/**
 * CIS Benchmark-derived Linux hardening on a Fly ephemeral sandbox (PI-05).
 * Graded with config-diff rules against captured guest filesystem state (PI-06).
 */
export type CisHardeningChecklistItem = {
  id: string;
  title: string;
  description?: string;
  hint?: string;
};

export function isCisHardeningTicketType(ticketType: string): boolean {
  const t = ticketType.trim().toLowerCase();
  const base = t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
  return (
    base === 'cis_hardening' ||
    base === 'linux_hardening' ||
    base === 'sysadmin_hardening'
  );
}

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

/** WebContainer script lab: spooler fix or fixture-based scripting lab. */
export function isScriptRemediationTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (
    base === 'script_remediation' ||
    base === 'spooler_fix' ||
    base === 'sandbox_script' ||
    base === 'service_restart' ||
    base === 'scripting_lab' ||
    base === 'script_fixtures'
  );
}

export function parseCisHardeningChecklist(
  initialState: Record<string, unknown> | null | undefined
): CisHardeningChecklistItem[] {
  if (!initialState) return [];
  const raw = initialState.checklist;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry): CisHardeningChecklistItem | null => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const id =
        typeof record.id === 'string'
          ? record.id.trim()
          : typeof record.key === 'string'
            ? record.key.trim()
            : '';
      const title =
        typeof record.title === 'string'
          ? record.title.trim()
          : typeof record.label === 'string'
            ? record.label.trim()
            : '';
      if (!id || !title) return null;
      return {
        id,
        title,
        description:
          typeof record.description === 'string'
            ? record.description.trim()
            : typeof record.detail === 'string'
              ? record.detail.trim()
              : undefined,
        hint: typeof record.hint === 'string' ? record.hint.trim() : undefined,
      };
    })
    .filter((item): item is CisHardeningChecklistItem => item !== null);
}

/**
 * Sysadmin outage / incident-response capstone (Fly PI-05 + config-diff PI-06
 * + RAG report). Distinct from cis_hardening (hardening checklist only) and
 * from p1_status_updates (comms cadence without live remediation).
 */
export const OUTAGE_CAPSTONE_MIN_REPORT_FIELD_LENGTH = 60;

export type OutageDiagnosisChecklistItem = CisHardeningChecklistItem;

export function isOutageCapstoneTicketType(ticketType: string): boolean {
  const t = ticketType.trim().toLowerCase();
  const base = t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
  return (
    base === 'outage_capstone' ||
    base === 'incident_response_capstone' ||
    base === 'sysadmin_outage_capstone'
  );
}

/** Diagnosis hints for outage capstone (same checklist shape as CIS hardening). */
export function parseOutageDiagnosisChecklist(
  initialState: Record<string, unknown> | null | undefined
): OutageDiagnosisChecklistItem[] {
  return parseCisHardeningChecklist(initialState);
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

/**
 * Monitoring / alert configuration: student defines alert rules
 * (type + threshold + routing) for a described system. Scored
 * deterministically against a required-alert rubric.
 */
export const MONITORING_ALERT_TYPES = [
  'disk_space',
  'service_down',
  'high_error_rate',
  'high_latency',
  'cpu_saturation',
] as const;

export type MonitoringAlertType = (typeof MONITORING_ALERT_TYPES)[number];

export const MONITORING_ALERT_TYPE_LABELS: Record<MonitoringAlertType, string> =
  {
    disk_space: 'Disk space (usage %)',
    service_down: 'Service down (failed health checks)',
    high_error_rate: 'High error rate (5xx %)',
    high_latency: 'High latency (p99 ms)',
    cpu_saturation: 'CPU saturation (%)',
  };

/** Short hint shown next to the threshold input for each alert type. */
export const MONITORING_ALERT_THRESHOLD_HINTS: Record<
  MonitoringAlertType,
  string
> = {
  disk_space: 'Alert when disk used % exceeds this value',
  service_down: 'Alert after this many consecutive failed health checks',
  high_error_rate: 'Alert when HTTP 5xx error rate % exceeds this value',
  high_latency: 'Alert when p99 latency (ms) exceeds this value',
  cpu_saturation: 'Alert when CPU usage % exceeds this value',
};

export const MONITORING_ALERT_ROUTES = [
  'pagerduty',
  'email_oncall',
  'slack_ops',
  'ticket_queue',
] as const;

export type MonitoringAlertRoute = (typeof MONITORING_ALERT_ROUTES)[number];

export const MONITORING_ALERT_ROUTE_LABELS: Record<
  MonitoringAlertRoute,
  string
> = {
  pagerduty: 'PagerDuty (page on-call)',
  email_oncall: 'Email on-call rotation',
  slack_ops: 'Slack #ops channel',
  ticket_queue: 'Create ticket in queue (no page)',
};

export function isMonitoringAlertType(
  value: string
): value is MonitoringAlertType {
  return (MONITORING_ALERT_TYPES as readonly string[]).includes(value);
}

export function isMonitoringAlertRoute(
  value: string
): value is MonitoringAlertRoute {
  return (MONITORING_ALERT_ROUTES as readonly string[]).includes(value);
}

export function isMonitoringConfigTicketType(ticketType: string): boolean {
  const t = ticketType.trim().toLowerCase();
  const base = t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
  return (
    base === 'monitoring_config' ||
    base === 'alert_config' ||
    base === 'monitoring_alerts'
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

/**
 * Mid-remediation POA&M status update (on track / delayed / closed).
 * Aligns with lifecycle vocab: ongoing → on_track, completed → closed.
 */
export const POAM_STATUS_UPDATE_STATUSES = [
  'on_track',
  'delayed',
  'closed',
] as const;

export type PoamStatusUpdateStatus =
  (typeof POAM_STATUS_UPDATE_STATUSES)[number];

export const POAM_STATUS_UPDATE_STATUS_LABELS: Record<
  PoamStatusUpdateStatus,
  string
> = {
  on_track: 'On track (ongoing)',
  delayed: 'Delayed',
  closed: 'Closed (completed)',
};

export const POAM_STATUS_UPDATE_MIN_JUSTIFICATION_LENGTH = 80;

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
