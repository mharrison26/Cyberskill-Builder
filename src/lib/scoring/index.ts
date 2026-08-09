import type { Ticket } from '@/types';
import { aoReviewTicketScorer } from '@/lib/scoring/aoReview';
import { assessmentProceduresTicketScorer } from '@/lib/scoring/assessmentProcedures';
import { auditPlanningMemoTicketScorer } from '@/lib/scoring/auditPlanningMemo';
import { auditCommitteeBriefTicketScorer } from '@/lib/scoring/auditCommitteeBrief';
import { auditWorkpaperTicketScorer } from '@/lib/scoring/auditWorkpaper';
import { authorizationPackageTicketScorer } from '@/lib/scoring/authorizationPackage';
import { securityAssessmentReportTicketScorer } from '@/lib/scoring/securityAssessmentReport';
import { findingsSummaryTicketScorer } from '@/lib/scoring/findingsSummary';
import { fips199ImpactCategorizationTicketScorer } from '@/lib/scoring/fips199ImpactCategorization';
import { backupDrPlanTicketScorer } from '@/lib/scoring/backupDrPlan';
import {
  cccerTicketScorer,
  scoreCccerCompleteness,
} from '@/lib/scoring/cccer';
import { cmmcGapAnalysisTicketScorer } from '@/lib/scoring/cmmcGapAnalysis';
import { configDiffTicketScorer } from '@/lib/scoring/configDiff';
import { configFaultDiagnosisTicketScorer } from '@/lib/scoring/configFaultDiagnosis';
import { conmonStrategyTicketScorer } from '@/lib/scoring/conmonStrategy';
import { continuousAuditingTicketScorer } from '@/lib/scoring/continuousAuditing';
import { controlImplementationAdequacyTicketScorer } from '@/lib/scoring/controlImplementationAdequacy';
import { controlMappingTicketScorer } from '@/lib/scoring/controlMapping';
import { coachingFeedbackTicketScorer } from '@/lib/scoring/coachingFeedback';
import { customerReplyTicketScorer } from '@/lib/scoring/customerReply';
import { helpdeskCapstoneTicketScorer } from '@/lib/scoring/helpdeskCapstone';
import { infraDesignCapstoneTicketScorer } from '@/lib/scoring/infraDesignCapstone';
import { incidentNotificationTicketScorer } from '@/lib/scoring/incidentNotification';
import { itgcAccessRevocationTicketScorer } from '@/lib/scoring/itgcAccessRevocation';
import { kbWriteupTicketScorer } from '@/lib/scoring/kbWriteup';
import { kpiReportTicketScorer } from '@/lib/scoring/kpiReport';
import { mockDirectoryTicketScorer } from '@/lib/scoring/mockDirectory';
import { monitoringConfigTicketScorer } from '@/lib/scoring/monitoringConfig';
import { fsPermissionsLabTicketScorer } from '@/lib/scoring/fsPermissionsLab';
import { networkDiagnosticsTicketScorer } from '@/lib/scoring/networkDiagnostics';
import { networkTopologyFaultTicketScorer } from '@/lib/scoring/networkTopologyFault';
import { oscalGeneratorTicketScorer } from '@/lib/scoring/oscalGenerator';
import { oscalSspTicketScorer } from '@/lib/scoring/oscalSsp';
import { p1StatusUpdatesTicketScorer } from '@/lib/scoring/p1StatusUpdates';
import { poamTicketScorer } from '@/lib/scoring/poam';
import { poamStatusUpdateTicketScorer } from '@/lib/scoring/poamStatusUpdate';
import { processControlTestTicketScorer } from '@/lib/scoring/processControlTest';
import { riskBasedAuditPlanTicketScorer } from '@/lib/scoring/riskBasedAuditPlan';
import { samplingMethodologyTicketScorer } from '@/lib/scoring/samplingMethodology';
import { secMaterialityTicketScorer } from '@/lib/scoring/secMateriality';
import { iacLabTicketScorer } from '@/lib/scoring/iacLab';
import { outageCapstoneTicketScorer } from '@/lib/scoring/outageCapstone';
import { scriptRemediationTicketScorer } from '@/lib/scoring/scriptRemediation';
import { issmEscalationTicketScorer } from '@/lib/scoring/issmEscalation';
import { slaEscalationTicketScorer } from '@/lib/scoring/slaEscalation';
import { slaQueueSimTicketScorer } from '@/lib/scoring/slaQueueSim';
import { soc2ChangeManagementTestTicketScorer } from '@/lib/scoring/soc2ChangeManagementTest';
import { sspGapReviewTicketScorer } from '@/lib/scoring/sspGapReview';
import { toolWalkthroughTicketScorer } from '@/lib/scoring/toolWalkthrough';
import { transactionAnomalyTicketScorer } from '@/lib/scoring/transactionAnomaly';
import { triageTicketScorer } from '@/lib/scoring/triage';
import { crossSystemPoamPriorityTicketScorer } from '@/lib/scoring/crossSystemPoamPriority';
import { vulnPrioritizationTicketScorer } from '@/lib/scoring/vulnPrioritization';

/**
 * Pluggable ticket scoring.
 *
 * Tracks register a scorer per `ticket.ticket_type`:
 *
 *   import { registerTicketScorer } from '@/lib/scoring';
 *   registerTicketScorer('my_track.config_diff', myScorer);
 *
 * Builtin scorers (config_remediation / config_diff, cccer, hybrid,
 * tool_walkthrough, assessment_procedures, audit_workpaper,
 * sampling_methodology, poam, poam_status_update / poam_remediation_status,
 * vuln_prioritization / patch_schedule,
 * cross_system_poam_priority / enterprise_poam_prioritization / isso_poam_portfolio,
 * sec_materiality, conmon_strategy,
 * continuous_auditing / continuous_audit_design, backup_dr_plan,
 * cmmc_gap_analysis, security_assessment_report / sar_summary,
 * authorization_package, ao_review, triage,
 * mock_directory, kb_writeup, customer_reply, network_diagnostics,
 * network_topology_fault, config_fault_diagnosis, monitoring_config,
 * sla_escalation, script_remediation, scripting_lab, script_fixtures,
 * ansible_playbook / iac_lab, sla_queue_sim, coaching_feedback,
 * p1_status_updates, kpi_report, helpdesk_capstone, infra_design_capstone,
 * itgc_access_revocation / timely_access_revocation,
 * transaction_anomaly / csv_anomaly_detection,
 * audit_committee_brief / executive_summary_ac,
 * risk_based_audit_plan / annual_audit_plan_capstone,
 * fips_199_impact_categorization / impact_categorization,
 * incident_notification / incident_reporting / isso_incident_notify)
 * register at module load. Unregistered types fall back to `defaultTicketScorer`.
 */

export { configDiffTicketScorer } from '@/lib/scoring/configDiff';
export type {
  ConfigDiffRule,
  ConfigDiffRuleResult,
  ConfigDiffStructuredResult,
  ExpectedState,
} from '@/lib/scoring/configDiff';
export {
  controlMappingTicketScorer,
  createControlMappingTicketScorer,
  evaluateControlMapping,
} from '@/lib/scoring/controlMapping';
export type {
  ControlMappingStructuredResult,
  ControlMappingTargetResult,
} from '@/lib/scoring/controlMapping';
export { conmonStrategyTicketScorer } from '@/lib/scoring/conmonStrategy';
export type {
  ConMonStrategyExpectedState,
  ConMonStrategyStructuredResult,
  ConMonStrategySubmission,
} from '@/lib/scoring/conmonStrategy';
export {
  continuousAuditingTicketScorer,
  evaluateContinuousAuditingDeterministic,
} from '@/lib/scoring/continuousAuditing';
export type {
  ContinuousAuditingExpectedState,
  ContinuousAuditingStructuredResult,
  ContinuousAuditingSubmission,
} from '@/lib/scoring/continuousAuditing';
export { backupDrPlanTicketScorer } from '@/lib/scoring/backupDrPlan';
export type {
  BackupDrPlanExpectedState,
  BackupDrPlanStructuredResult,
  BackupDrPlanSubmission,
} from '@/lib/scoring/backupDrPlan';
export { toolWalkthroughTicketScorer } from '@/lib/scoring/toolWalkthrough';
export type {
  ToolWalkthroughExpectedState,
  ToolWalkthroughStructuredResult,
  ToolWalkthroughSubmission,
} from '@/lib/scoring/toolWalkthrough';
export { assessmentProceduresTicketScorer } from '@/lib/scoring/assessmentProcedures';
export type {
  AssessmentProceduresExpectedState,
  AssessmentProceduresStructuredResult,
  AssessmentProceduresSubmission,
} from '@/lib/scoring/assessmentProcedures';
export {
  auditPlanningMemoTicketScorer,
  evaluateAuditPlanningMemoDeterministic,
  isAuditPlanningMemoTicketType,
} from '@/lib/scoring/auditPlanningMemo';
export type {
  AuditPlanningMemoExpectedState,
  AuditPlanningMemoStructuredResult,
  AuditPlanningMemoSubmission,
} from '@/lib/scoring/auditPlanningMemo';
export {
  evaluateProcessControlTestDeterministic,
  isProcessControlTestTicketType,
  parseProcessControlSampleItems,
  processControlTestTicketScorer,
} from '@/lib/scoring/processControlTest';
export type {
  ProcessControlTestExpectedState,
  ProcessControlTestStructuredResult,
  ProcessControlTestSubmission,
} from '@/lib/scoring/processControlTest';
export {
  evaluateFindingsSummaryDeterministic,
  findingsSummaryTicketScorer,
  isFindingsSummaryTicketType,
} from '@/lib/scoring/findingsSummary';
export type {
  FindingsSummaryExpectedState,
  FindingsSummaryStructuredResult,
  FindingsSummarySubmission,
} from '@/lib/scoring/findingsSummary';
export {
  cccerTicketScorer,
  evaluateCccerDeterministic,
  isCccerTicketType,
  scoreCccerCompleteness,
} from '@/lib/scoring/cccer';
export type {
  CccerExpectedState,
  CccerStructuredResult,
  CccerSubmission,
} from '@/lib/scoring/cccer';
export {
  auditWorkpaperTicketScorer,
  evaluateAuditWorkpaperDeterministic,
} from '@/lib/scoring/auditWorkpaper';
export type {
  AuditWorkpaperExpectedState,
  AuditWorkpaperStructuredResult,
  AuditWorkpaperSubmission,
} from '@/lib/scoring/auditWorkpaper';
export { samplingMethodologyTicketScorer } from '@/lib/scoring/samplingMethodology';
export type {
  SamplingMethodologyExpectedState,
  SamplingMethodologyStructuredResult,
  SamplingMethodologySubmission,
} from '@/lib/scoring/samplingMethodology';
export {
  evaluatePoamCompleteness,
  isPoamTicketType,
  poamTicketScorer,
} from '@/lib/scoring/poam';
export type {
  PoamEntrySubmission,
  PoamPriorFinding,
  PoamStructuredResult,
} from '@/lib/scoring/poam';
export {
  evaluatePoamStatusUpdateDeterministic,
  isPoamStatusUpdateTicketType,
  parsePoamStatusUpdateEvidence,
  parsePoamStatusUpdateItem,
  poamStatusUpdateTicketScorer,
} from '@/lib/scoring/poamStatusUpdate';
export type {
  PoamStatusUpdateExpectedState,
  PoamStatusUpdateStructuredResult,
  PoamStatusUpdateSubmission,
} from '@/lib/scoring/poamStatusUpdate';
export { secMaterialityTicketScorer } from '@/lib/scoring/secMateriality';
export type {
  SecMaterialityExpectedState,
  SecMaterialityStructuredResult,
  SecMaterialitySubmission,
} from '@/lib/scoring/secMateriality';
export {
  evaluateOscalGenerator,
  oscalGeneratorTicketScorer,
  runStaticScriptChecks,
} from '@/lib/scoring/oscalGenerator';
export type {
  OscalGeneratorDocumentKind,
  OscalGeneratorExpectedState,
  OscalGeneratorStructuredResult,
  StaticCheckResult,
} from '@/lib/scoring/oscalGenerator';
export { oscalSspTicketScorer } from '@/lib/scoring/oscalSsp';
export type { OscalSspStructuredResult } from '@/lib/scoring/oscalSsp';
export {
  authorizationPackageTicketScorer,
  createAuthorizationPackageTicketScorer,
} from '@/lib/scoring/authorizationPackage';
export type { AuthorizationPackageStructuredResult } from '@/lib/scoring/authorizationPackage';
export {
  createSecurityAssessmentReportTicketScorer,
  evaluateSecurityAssessmentReportDeterministic,
  securityAssessmentReportTicketScorer,
  SAR_MIN_SUMMARY_LENGTH,
} from '@/lib/scoring/securityAssessmentReport';
export type {
  SecurityAssessmentReportExpectedState,
  SecurityAssessmentReportStructuredResult,
} from '@/lib/scoring/securityAssessmentReport';
export {
  aoReviewTicketScorer,
  createAoReviewTicketScorer,
  evaluateAoReviewDeterministic,
} from '@/lib/scoring/aoReview';
export type { AoReviewStructuredResult } from '@/lib/scoring/aoReview';
export {
  evaluateTriage,
  resolveExpectedPriority,
  resolvePriorityFromRubric,
  triageTicketScorer,
} from '@/lib/scoring/triage';
export type {
  TriageExpectedState,
  TriageStructuredResult,
  TriageSubmission,
} from '@/lib/scoring/triage';
export {
  computeVulnPriorityScore,
  deriveExpectedOrder,
  evaluateVulnPrioritization,
  isVulnPrioritizationTicketType,
  scoreOrderPairwise,
  vulnPrioritizationTicketScorer,
} from '@/lib/scoring/vulnPrioritization';
export type {
  VulnPrioritizationExpectedState,
  VulnPrioritizationStructuredResult,
  VulnPrioritizationSubmission,
  VulnerabilityItem,
} from '@/lib/scoring/vulnPrioritization';
export {
  computePoamRiskScore,
  crossSystemPoamPriorityTicketScorer,
  derivePoamExpectedOrder,
  evaluateCrossSystemPoamPriority,
  isCrossSystemPoamPriorityTicketType,
} from '@/lib/scoring/crossSystemPoamPriority';
export type {
  CrossSystemPoamPriorityExpectedState,
  CrossSystemPoamPriorityStructuredResult,
  CrossSystemPoamPrioritySubmission,
  CrossSystemPoamItem,
  CrossSystemPoamSystem,
} from '@/lib/scoring/crossSystemPoamPriority';
export {
  evaluateMockDirectoryDeterministic,
  mockDirectoryTicketScorer,
  parseMockDirectoryUsers,
} from '@/lib/scoring/mockDirectory';
export type {
  MockDirectoryExpectedState,
  MockDirectoryStructuredResult,
  MockDirectorySubmission,
} from '@/lib/scoring/mockDirectory';
export {
  evaluateKbWriteupDeterministic,
  kbWriteupTicketScorer,
} from '@/lib/scoring/kbWriteup';
export type {
  KbWriteupExpectedState,
  KbWriteupStructuredResult,
  KbWriteupSubmission,
} from '@/lib/scoring/kbWriteup';
export {
  createHelpdeskCapstoneTicketScorer,
  evaluateProcessDocument,
  extractProcessDocument,
  helpdeskCapstoneTicketScorer,
} from '@/lib/scoring/helpdeskCapstone';
export type {
  HelpdeskCapstoneExpectedState,
  HelpdeskCapstoneStructuredResult,
  HelpdeskCapstoneSubmission,
  HelpdeskProcessDocument,
} from '@/lib/scoring/helpdeskCapstone';
export {
  createInfraDesignCapstoneTicketScorer,
  evaluateInfraDesignCapstoneDeterministic,
  extractInfraDesignDocument,
  infraDesignCapstoneTicketScorer,
} from '@/lib/scoring/infraDesignCapstone';
export type {
  InfraDesignCapstoneExpectedState,
  InfraDesignCapstoneStructuredResult,
  InfraDesignCapstoneSubmission,
} from '@/lib/scoring/infraDesignCapstone';
export {
  evaluateKpiReportDeterministic,
  isKpiReportTicketType,
  kpiReportTicketScorer,
} from '@/lib/scoring/kpiReport';
export type {
  KpiReportExpectedState,
  KpiReportStructuredResult,
  KpiReportSubmission,
} from '@/lib/scoring/kpiReport';
export {
  coachingFeedbackTicketScorer,
  evaluateCoachingFeedbackDeterministic,
} from '@/lib/scoring/coachingFeedback';
export type {
  CoachingFeedbackExpectedState,
  CoachingFeedbackStructuredResult,
  CoachingFeedbackSubmission,
} from '@/lib/scoring/coachingFeedback';
export {
  evaluateP1StatusUpdates,
  p1StatusUpdatesTicketScorer,
  resolveRequiredUpdateTimes,
} from '@/lib/scoring/p1StatusUpdates';
export type {
  P1StatusUpdatesExpectedState,
  P1StatusUpdatesStructuredResult,
  P1StatusUpdatesSubmission,
} from '@/lib/scoring/p1StatusUpdates';
export {
  isScriptRemediationTicketType,
  scriptRemediationTicketScorer,
} from '@/lib/scoring/scriptRemediation';
export type {
  ScriptRemediationExpectedState,
  ScriptRemediationStructuredResult,
} from '@/lib/scoring/scriptRemediation';
export {
  extractOutageIncidentReport,
  isOutageCapstoneTicketType,
  outageCapstoneTicketScorer,
} from '@/lib/scoring/outageCapstone';
export type {
  OutageCapstoneExpectedState,
  OutageCapstoneStructuredResult,
  OutageIncidentReport,
} from '@/lib/scoring/outageCapstone';
export {
  evaluateIacLab,
  iacLabTicketScorer,
  isIacLabTicketType,
} from '@/lib/scoring/iacLab';
export type {
  IacDeclaration,
  IacLabExpectedState,
  IacLabStructuredResult,
} from '@/lib/scoring/iacLab';
export {
  evaluateSlaEscalationDeterministic,
  slaEscalationTicketScorer,
} from '@/lib/scoring/slaEscalation';
export type {
  SlaEscalationExpectedState,
  SlaEscalationStructuredResult,
  SlaEscalationSubmission,
} from '@/lib/scoring/slaEscalation';
export {
  evaluateIssmEscalationDeterministic,
  issmEscalationTicketScorer,
} from '@/lib/scoring/issmEscalation';
export type {
  IssmEscalationExpectedState,
  IssmEscalationStructuredResult,
  IssmEscalationSubmission,
} from '@/lib/scoring/issmEscalation';
export {
  evaluateControlImplementationAdequacyDeterministic,
  controlImplementationAdequacyTicketScorer,
} from '@/lib/scoring/controlImplementationAdequacy';
export type {
  ControlImplementationAdequacyExpectedState,
  ControlImplementationAdequacyStructuredResult,
  ControlImplementationAdequacySubmission,
} from '@/lib/scoring/controlImplementationAdequacy';
export {
  evaluateFips199Deterministic,
  fips199ImpactCategorizationTicketScorer,
  highWaterMark,
} from '@/lib/scoring/fips199ImpactCategorization';
export type {
  Fips199ExpectedState,
  Fips199StructuredResult,
  Fips199Submission,
} from '@/lib/scoring/fips199ImpactCategorization';
export {
  evaluateNetworkDiagnostics,
  networkDiagnosticsTicketScorer,
} from '@/lib/scoring/networkDiagnostics';
export type {
  NetworkDiagnosticsExpectedState,
  NetworkDiagnosticsStructuredResult,
  NetworkDiagnosticsSubmission,
} from '@/lib/scoring/networkDiagnostics';
export {
  evaluateNetworkTopologyFaultDeterministic,
  networkTopologyFaultTicketScorer,
} from '@/lib/scoring/networkTopologyFault';
export type {
  NetworkTopologyFaultExpectedState,
  NetworkTopologyFaultStructuredResult,
  NetworkTopologyFaultSubmission,
} from '@/lib/scoring/networkTopologyFault';
export {
  evaluateFsPermissionsLab,
  fsPermissionsLabTicketScorer,
  normalizeFsAnswer,
  parseFsPermissionsLabExpectedState,
  parseFsPermissionsLabQuestions,
} from '@/lib/scoring/fsPermissionsLab';
export type {
  FsPermissionsLabExpectedState,
  FsPermissionsLabQuestion,
  FsPermissionsLabStructuredResult,
  FsPermissionsLabSubmission,
} from '@/lib/scoring/fsPermissionsLab';
export {
  configFaultDiagnosisTicketScorer,
  evaluateConfigFaultDiagnosis,
} from '@/lib/scoring/configFaultDiagnosis';
export type {
  ConfigFaultDiagnosisExpectedState,
  ConfigFaultDiagnosisStructuredResult,
  ConfigFaultDiagnosisSubmission,
} from '@/lib/scoring/configFaultDiagnosis';
export {
  customerReplyTicketScorer,
  evaluateCustomerReplyDeterministic,
  extractCustomerEmailFromInitialState,
} from '@/lib/scoring/customerReply';
export type {
  CustomerReplyExpectedState,
  CustomerReplyStructuredResult,
  CustomerReplySubmission,
} from '@/lib/scoring/customerReply';
export {
  evaluateSlaQueueSim,
  isSlaQueueSimTicketType,
  slaQueueSimTicketScorer,
} from '@/lib/scoring/slaQueueSim';
export type {
  SlaQueueSimExpectedState,
  SlaQueueSimStructuredResult,
  SlaQueueSimSubmission,
} from '@/lib/scoring/slaQueueSim';
export {
  evaluateMonitoringConfig,
  monitoringConfigTicketScorer,
  parseMonitoringConfigExpectedState,
} from '@/lib/scoring/monitoringConfig';
export type {
  MonitoringConfigExpectedState,
  MonitoringConfigStructuredResult,
  MonitoringConfigSubmission,
  RequiredMonitoringAlert,
} from '@/lib/scoring/monitoringConfig';
export {
  evaluateItgcAccessRevocationDeterministic,
  isItgcAccessRevocationTicketType,
  itgcAccessRevocationTicketScorer,
  parseItgcAccessPolicy,
  parseItgcAccessUsers,
} from '@/lib/scoring/itgcAccessRevocation';
export type {
  ItgcAccessRevocationExpectedState,
  ItgcAccessRevocationStructuredResult,
  ItgcAccessRevocationSubmission,
  ItgcAccessUser,
  ItgcControlOutcome,
} from '@/lib/scoring/itgcAccessRevocation';
export {
  evaluateIncidentNotificationDeterministic,
  incidentNotificationTicketScorer,
  isIncidentNotificationTicketType,
  parseIncidentFacts,
  parseIncidentNotificationExpectedState,
  parseIncidentNotificationPolicyRules,
} from '@/lib/scoring/incidentNotification';
export type {
  IncidentNotificationExpectedState,
  IncidentNotificationStructuredResult,
  IncidentNotificationSubmission,
  RequiredNotification,
} from '@/lib/scoring/incidentNotification';
export {
  evaluateSoc2ChangeManagementTestDeterministic,
  isSoc2ChangeManagementTestTicketType,
  parseSoc2ChangeTickets,
  parseSoc2Criterion,
  soc2ChangeManagementTestTicketScorer,
} from '@/lib/scoring/soc2ChangeManagementTest';
export type {
  Soc2ChangeManagementTestExpectedState,
  Soc2ChangeManagementTestStructuredResult,
  Soc2ChangeManagementTestSubmission,
  Soc2ChangeTicket,
} from '@/lib/scoring/soc2ChangeManagementTest';
export {
  evaluateSspGapReviewDeterministic,
  isSspGapReviewTicketType,
  parseSspCandidateGaps,
  parseSspExcerpt,
  sspGapReviewTicketScorer,
} from '@/lib/scoring/sspGapReview';
export type {
  SspCandidateGap,
  SspExcerpt,
  SspGapReviewExpectedState,
  SspGapReviewStructuredResult,
  SspGapReviewSubmission,
} from '@/lib/scoring/sspGapReview';
export {
  evaluateTransactionAnomalyDeterministic,
  isTransactionAnomalyTicketType,
  parseAnomalyTransactions,
  transactionAnomalyTicketScorer,
} from '@/lib/scoring/transactionAnomaly';
export type {
  TransactionAnomalyExpectedState,
  TransactionAnomalyStructuredResult,
  TransactionAnomalySubmission,
} from '@/lib/scoring/transactionAnomaly';
export {
  evaluateRiskBasedAuditPlanDeterministic,
  isRiskBasedAuditPlanTicketType,
  parseRiskRegister,
  riskBasedAuditPlanTicketScorer,
} from '@/lib/scoring/riskBasedAuditPlan';
export type {
  RiskBasedAuditPlanExpectedState,
  RiskBasedAuditPlanStructuredResult,
  RiskBasedAuditPlanSubmission,
  RiskRegisterArea,
} from '@/lib/scoring/riskBasedAuditPlan';
export {
  auditCommitteeBriefTicketScorer,
  createAuditCommitteeBriefTicketScorer,
  evaluateAuditCommitteeBriefDeterministic,
} from '@/lib/scoring/auditCommitteeBrief';
export type {
  AuditCommitteeBriefExpectedState,
  AuditCommitteeBriefStructuredResult,
  AuditCommitteeBriefSubmission,
} from '@/lib/scoring/auditCommitteeBrief';

/** Outcome of scoring — maps onto ticket_progress in the submit route. */
export type TicketScoreStatus = 'resolved' | 'needs_revision';

/** Generic submission payload; track-specific scorers narrow as needed. */
export type TicketSubmission = Record<string, unknown>;

export type TicketScoreResult = {
  status: TicketScoreStatus;
  structuredResult: Record<string, unknown>;
  feedback: string;
};

/** Ticket fields scorers may rely on (matches public.tickets). */
export type ScorableTicket = Pick<
  Ticket,
  | 'id'
  | 'tenant_id'
  | 'track_id'
  | 'tier'
  | 'ticket_type'
  | 'difficulty'
  | 'sla_minutes'
  | 'scenario_brief'
  | 'initial_state'
  | 'expected_state'
  | 'dcwf_code'
  | 'sort_order'
>;

export interface TicketScorer {
  score(
    submission: TicketSubmission,
    ticket: ScorableTicket
  ): TicketScoreResult | Promise<TicketScoreResult>;
}

const scorers = new Map<string, TicketScorer>();

export function registerTicketScorer(
  ticketType: string,
  scorer: TicketScorer
): void {
  const key = ticketType.trim();
  if (!key) {
    throw new Error('ticketType is required to register a scorer');
  }
  scorers.set(key, scorer);
}

export function getTicketScorer(ticketType: string): TicketScorer | undefined {
  return scorers.get(ticketType.trim());
}

/** Resolve a scorer for `ticket_type`, falling back to the default stub. */
export function resolveTicketScorer(ticketType: string): TicketScorer {
  return getTicketScorer(ticketType) ?? defaultTicketScorer;
}

export function listRegisteredTicketTypes(): string[] {
  return Array.from(scorers.keys()).sort();
}

/** Map scorer outcome → ticket_progress.status (`new` | `in_progress` | `resolved`). */
export function scoreStatusToProgressStatus(
  status: TicketScoreStatus
): 'in_progress' | 'resolved' {
  return status === 'resolved' ? 'resolved' : 'in_progress';
}

// ---------------------------------------------------------------------------
// Builtin / stub scorers
// ---------------------------------------------------------------------------

// cccerTicketScorer is implemented in '@/lib/scoring/cccer' (RAG vs IIA/GAO).

function hasConfigDiffTarget(ticket: ScorableTicket): boolean {
  const expected = ticket.expected_state;
  if (
    expected &&
    typeof expected === 'object' &&
    Array.isArray((expected as { rules?: unknown }).rules) &&
    ((expected as { rules: unknown[] }).rules?.length ?? 0) > 0
  ) {
    return true;
  }
  const nested = ticket.initial_state?.expected_state;
  if (
    nested &&
    typeof nested === 'object' &&
    Array.isArray((nested as { rules?: unknown }).rules) &&
    ((nested as { rules: unknown[] }).rules?.length ?? 0) > 0
  ) {
    return true;
  }
  return ticket.initial_state?.expected_config !== undefined;
}

function hasConfigDiffSubmission(submission: TicketSubmission): boolean {
  return (
    submission.files !== undefined ||
    submission.filesystem !== undefined ||
    submission.config !== undefined ||
    submission.final_config !== undefined ||
    submission.final_state !== undefined
  );
}

/**
 * Hybrid stub: config-diff when a ruleset/expected_config exists, else full CCCER.
 * When both config + narrative are present, CCCER uses completeness-only (no RAG)
 * so hybrid tickets do not double-call the LLM.
 */
export const hybridTicketScorer: TicketScorer = {
  async score(submission, ticket) {
    const canScoreConfig = hasConfigDiffTarget(ticket);
    const hasConfigPayload = hasConfigDiffSubmission(submission);

    if (canScoreConfig && hasConfigPayload) {
      const configResult = await configDiffTicketScorer.score(
        submission,
        ticket
      );
      const narrativeResult = scoreCccerCompleteness(submission, ticket);

      const bothResolved =
        configResult.status === 'resolved' &&
        narrativeResult.status === 'resolved';

      return {
        status: bothResolved ? 'resolved' : 'needs_revision',
        structuredResult: {
          style: 'hybrid',
          config: configResult.structuredResult,
          narrative: narrativeResult.structuredResult,
        },
        feedback: [configResult.feedback, narrativeResult.feedback].join(' '),
      };
    }

    if (canScoreConfig) {
      return configDiffTicketScorer.score(submission, ticket);
    }

    return cccerTicketScorer.score(submission, ticket);
  },
};

/** Fallback when no scorer is registered for the ticket_type. */
export const defaultTicketScorer: TicketScorer = {
  score(submission, ticket) {
    const keys = Object.keys(submission);
    if (keys.length === 0) {
      return {
        status: 'needs_revision',
        structuredResult: {
          style: 'default',
          reason: 'empty_submission',
          ticketType: ticket.ticket_type,
        },
        feedback:
          'Submission was empty. Provide work for this ticket and resubmit.',
      };
    }

    return {
      status: 'needs_revision',
      structuredResult: {
        style: 'default',
        reason: 'unregistered_ticket_type',
        ticketType: ticket.ticket_type,
        submissionKeys: keys,
      },
      feedback: `No scorer registered for ticket_type "${ticket.ticket_type}". Submission recorded; register a track scorer via registerTicketScorer().`,
    };
  },
};

// Register builtin scorers under common ticket_type keys.
registerTicketScorer('config_remediation', configDiffTicketScorer);
registerTicketScorer('config_diff', configDiffTicketScorer);
registerTicketScorer('cccer', cccerTicketScorer);
registerTicketScorer('cccer_exception', cccerTicketScorer);
registerTicketScorer('audit_finding_cccer', cccerTicketScorer);
registerTicketScorer('hybrid', hybridTicketScorer);
registerTicketScorer('control_mapping', controlMappingTicketScorer);
registerTicketScorer('oscal_ssp', oscalSspTicketScorer);
registerTicketScorer('ssp', oscalSspTicketScorer);
registerTicketScorer('ssp_gap_review', sspGapReviewTicketScorer);
registerTicketScorer('ssp_quality_review', sspGapReviewTicketScorer);
registerTicketScorer('draft_ssp_gaps', sspGapReviewTicketScorer);
registerTicketScorer('tool_walkthrough', toolWalkthroughTicketScorer);
registerTicketScorer('simplerisk_walkthrough', toolWalkthroughTicketScorer);
registerTicketScorer('simplerisk', toolWalkthroughTicketScorer);
registerTicketScorer('assessment_procedures', assessmentProceduresTicketScorer);
registerTicketScorer('sp800_53a', assessmentProceduresTicketScorer);
registerTicketScorer('sp_800_53a', assessmentProceduresTicketScorer);
registerTicketScorer('audit_workpaper', auditWorkpaperTicketScorer);
registerTicketScorer('workpaper', auditWorkpaperTicketScorer);
registerTicketScorer('sampling_methodology', samplingMethodologyTicketScorer);
registerTicketScorer('assessment_sampling', samplingMethodologyTicketScorer);
registerTicketScorer('transaction_sampling', samplingMethodologyTicketScorer);
registerTicketScorer('poam', poamTicketScorer);
registerTicketScorer('poam_draft', poamTicketScorer);
registerTicketScorer('poam_status_update', poamStatusUpdateTicketScorer);
registerTicketScorer('poam_remediation_status', poamStatusUpdateTicketScorer);
registerTicketScorer('poam_midpoint_update', poamStatusUpdateTicketScorer);
registerTicketScorer('vuln_prioritization', vulnPrioritizationTicketScorer);
registerTicketScorer('patch_schedule', vulnPrioritizationTicketScorer);
registerTicketScorer(
  'cross_system_poam_priority',
  crossSystemPoamPriorityTicketScorer
);
registerTicketScorer(
  'enterprise_poam_prioritization',
  crossSystemPoamPriorityTicketScorer
);
registerTicketScorer('isso_poam_portfolio', crossSystemPoamPriorityTicketScorer);
registerTicketScorer('sec_materiality', secMaterialityTicketScorer);
registerTicketScorer('sec_cyber_materiality', secMaterialityTicketScorer);
registerTicketScorer('conmon_strategy', conmonStrategyTicketScorer);
registerTicketScorer('continuous_monitoring', conmonStrategyTicketScorer);
registerTicketScorer('continuous_auditing', continuousAuditingTicketScorer);
registerTicketScorer('continuous_audit_design', continuousAuditingTicketScorer);
registerTicketScorer('backup_dr_plan', backupDrPlanTicketScorer);
registerTicketScorer('disaster_recovery', backupDrPlanTicketScorer);
registerTicketScorer('oscal_generator', oscalGeneratorTicketScorer);
registerTicketScorer('capstone_oscal', oscalGeneratorTicketScorer);
registerTicketScorer('cmmc_gap_analysis', cmmcGapAnalysisTicketScorer);
registerTicketScorer('cmmc_l2_gap', cmmcGapAnalysisTicketScorer);
registerTicketScorer(
  'security_assessment_report',
  securityAssessmentReportTicketScorer
);
registerTicketScorer('sar_summary', securityAssessmentReportTicketScorer);
registerTicketScorer('authorization_package', authorizationPackageTicketScorer);
registerTicketScorer('ao_review', aoReviewTicketScorer);
registerTicketScorer('mock_directory', mockDirectoryTicketScorer);
registerTicketScorer('directory_reset', mockDirectoryTicketScorer);
registerTicketScorer('account_unlock', mockDirectoryTicketScorer);
registerTicketScorer('triage', triageTicketScorer);
registerTicketScorer('ticket_triage', triageTicketScorer);
registerTicketScorer('helpdesk_triage', triageTicketScorer);
registerTicketScorer('kb_writeup', kbWriteupTicketScorer);
registerTicketScorer('helpdesk_kb', kbWriteupTicketScorer);
registerTicketScorer('resolution_writeup', kbWriteupTicketScorer);
registerTicketScorer('helpdesk_capstone', helpdeskCapstoneTicketScorer);
registerTicketScorer('kb_capstone', helpdeskCapstoneTicketScorer);
registerTicketScorer(
  'onboarding_process_capstone',
  helpdeskCapstoneTicketScorer
);
registerTicketScorer('infra_design_capstone', infraDesignCapstoneTicketScorer);
registerTicketScorer('architecture_decision', infraDesignCapstoneTicketScorer);
registerTicketScorer('kpi_report', kpiReportTicketScorer);
registerTicketScorer('ticket_metrics', kpiReportTicketScorer);
registerTicketScorer('helpdesk_kpis', kpiReportTicketScorer);
registerTicketScorer('csv_kpi_analysis', kpiReportTicketScorer);
registerTicketScorer('coaching_feedback', coachingFeedbackTicketScorer);
registerTicketScorer('peer_coaching', coachingFeedbackTicketScorer);
registerTicketScorer('junior_notes_review', coachingFeedbackTicketScorer);
registerTicketScorer('sla_escalation', slaEscalationTicketScorer);
registerTicketScorer('escalate_or_resolve', slaEscalationTicketScorer);
registerTicketScorer('escalation_decision', slaEscalationTicketScorer);
registerTicketScorer(
  'control_implementation_adequacy',
  controlImplementationAdequacyTicketScorer
);
registerTicketScorer(
  'implementation_statement_review',
  controlImplementationAdequacyTicketScorer
);
registerTicketScorer(
  'control_statement_adequacy',
  controlImplementationAdequacyTicketScorer
);
registerTicketScorer('customer_reply', customerReplyTicketScorer);
registerTicketScorer('deescalation_reply', customerReplyTicketScorer);
registerTicketScorer('angry_email', customerReplyTicketScorer);
registerTicketScorer('script_remediation', scriptRemediationTicketScorer);
registerTicketScorer('spooler_fix', scriptRemediationTicketScorer);
registerTicketScorer('sandbox_script', scriptRemediationTicketScorer);
registerTicketScorer('service_restart', scriptRemediationTicketScorer);
registerTicketScorer('scripting_lab', scriptRemediationTicketScorer);
registerTicketScorer('script_fixtures', scriptRemediationTicketScorer);
registerTicketScorer('ansible_playbook', iacLabTicketScorer);
registerTicketScorer('iac_lab', iacLabTicketScorer);
registerTicketScorer('ansible_lab', iacLabTicketScorer);
registerTicketScorer('terraform_lab', iacLabTicketScorer);
registerTicketScorer('network_diagnostics', networkDiagnosticsTicketScorer);
registerTicketScorer('pi04', networkDiagnosticsTicketScorer);
registerTicketScorer('traceroute_fault', networkDiagnosticsTicketScorer);
registerTicketScorer(
  'command_output_diagnosis',
  networkDiagnosticsTicketScorer
);
registerTicketScorer(
  'network_topology_fault',
  networkTopologyFaultTicketScorer
);
registerTicketScorer(
  'subnet_fault_diagnosis',
  networkTopologyFaultTicketScorer
);
registerTicketScorer('topology_misconfig', networkTopologyFaultTicketScorer);
registerTicketScorer(
  'network_fault_location',
  networkTopologyFaultTicketScorer
);
registerTicketScorer('fs_permissions_lab', fsPermissionsLabTicketScorer);
registerTicketScorer('sandbox_permissions', fsPermissionsLabTicketScorer);
registerTicketScorer('ls_permissions', fsPermissionsLabTicketScorer);
registerTicketScorer('permissions_explore', fsPermissionsLabTicketScorer);
registerTicketScorer(
  'config_fault_diagnosis',
  configFaultDiagnosisTicketScorer
);
registerTicketScorer('named_conf_fault', configFaultDiagnosisTicketScorer);
registerTicketScorer('dns_config_fault', configFaultDiagnosisTicketScorer);
registerTicketScorer('config_line_diagnosis', configFaultDiagnosisTicketScorer);
registerTicketScorer('cis_hardening', configDiffTicketScorer);
registerTicketScorer('linux_hardening', configDiffTicketScorer);
registerTicketScorer('sysadmin_hardening', configDiffTicketScorer);
registerTicketScorer('outage_capstone', outageCapstoneTicketScorer);
registerTicketScorer('incident_response_capstone', outageCapstoneTicketScorer);
registerTicketScorer('sysadmin_outage_capstone', outageCapstoneTicketScorer);
registerTicketScorer('sla_queue_sim', slaQueueSimTicketScorer);
registerTicketScorer('queue_simulation', slaQueueSimTicketScorer);
registerTicketScorer('timed_queue', slaQueueSimTicketScorer);
registerTicketScorer('multi_ticket_sim', slaQueueSimTicketScorer);
registerTicketScorer('p1_status_updates', p1StatusUpdatesTicketScorer);
registerTicketScorer('incident_status_cadence', p1StatusUpdatesTicketScorer);
registerTicketScorer('stakeholder_updates', p1StatusUpdatesTicketScorer);
registerTicketScorer('outage_comms', p1StatusUpdatesTicketScorer);
registerTicketScorer('monitoring_config', monitoringConfigTicketScorer);
registerTicketScorer('alert_config', monitoringConfigTicketScorer);
registerTicketScorer('monitoring_alerts', monitoringConfigTicketScorer);
registerTicketScorer(
  'itgc_access_revocation',
  itgcAccessRevocationTicketScorer
);
registerTicketScorer(
  'timely_access_revocation',
  itgcAccessRevocationTicketScorer
);
registerTicketScorer('risk_based_audit_plan', riskBasedAuditPlanTicketScorer);
registerTicketScorer(
  'annual_audit_plan_capstone',
  riskBasedAuditPlanTicketScorer
);
registerTicketScorer(
  'soc2_change_management_test',
  soc2ChangeManagementTestTicketScorer
);
registerTicketScorer(
  'soc2_exception_testing',
  soc2ChangeManagementTestTicketScorer
);
registerTicketScorer(
  'audit_committee_brief',
  auditCommitteeBriefTicketScorer
);
registerTicketScorer(
  'executive_summary_ac',
  auditCommitteeBriefTicketScorer
);
registerTicketScorer('transaction_anomaly', transactionAnomalyTicketScorer);
registerTicketScorer('csv_anomaly_detection', transactionAnomalyTicketScorer);
registerTicketScorer('anomaly_detection', transactionAnomalyTicketScorer);
registerTicketScorer('audit_planning_memo', auditPlanningMemoTicketScorer);
registerTicketScorer('planning_memo', auditPlanningMemoTicketScorer);
registerTicketScorer('process_control_test', processControlTestTicketScorer);
registerTicketScorer('control_sample_test', processControlTestTicketScorer);
registerTicketScorer('findings_summary', findingsSummaryTicketScorer);
registerTicketScorer('engagement_findings', findingsSummaryTicketScorer);
registerTicketScorer(
  'incident_notification',
  incidentNotificationTicketScorer
);
registerTicketScorer('incident_reporting', incidentNotificationTicketScorer);
registerTicketScorer(
  'isso_incident_notify',
  incidentNotificationTicketScorer
);
registerTicketScorer(
  'fips_199_impact_categorization',
  fips199ImpactCategorizationTicketScorer
);
registerTicketScorer(
  'impact_categorization',
  fips199ImpactCategorizationTicketScorer
);
registerTicketScorer(
  'security_categorization',
  fips199ImpactCategorizationTicketScorer
);
registerTicketScorer('issm_escalation', issmEscalationTicketScorer);
registerTicketScorer('cross_system_escalation', issmEscalationTicketScorer);
registerTicketScorer('isso_to_issm_escalation', issmEscalationTicketScorer);
