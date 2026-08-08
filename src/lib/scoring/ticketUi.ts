/**
 * Client-safe ticket UI constants and pure helpers.
 * Keep this module free of server-only imports (next/headers, fs, Supabase server).
 */

export const AO_REVIEW_MIN_ANSWER_LENGTH = 40;

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
