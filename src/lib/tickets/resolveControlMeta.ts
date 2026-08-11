import {
  controlFamilyFromId,
  familyLabel,
} from '@/lib/progress/controlFamily';

/**
 * Default control id / family for GRC ticket types when initial_state omits
 * them. Keeps console grouping useful without inventing per-tenant content.
 */
const GRC_TICKET_CONTROL_DEFAULTS: Record<
  string,
  { controlId?: string; familyCode: string }
> = {
  control_mapping: { controlId: 'AC-2', familyCode: 'AC' },
  control_implementation_adequacy: { controlId: 'AC-2', familyCode: 'AC' },
  assessment_procedures: { controlId: 'IA-5', familyCode: 'IA' },
  tool_walkthrough: { familyCode: 'RA' },
  poam: { familyCode: 'CA' },
  poam_status_update: { familyCode: 'CA' },
  conmon_strategy: { familyCode: 'CA' },
  cmmc_gap_analysis: { familyCode: 'SR' },
  sec_materiality: { familyCode: 'PM' },
  oscal_generator: { familyCode: 'PL' },
  oscal_ssp: { familyCode: 'PL' },
  ssp: { familyCode: 'PL' },
  ssp_gap_review: { familyCode: 'PL' },
  ao_review: { familyCode: 'CA' },
  fips_199_impact_categorization: { familyCode: 'RA' },
  raci_matrix: { familyCode: 'PM' },
  policy_section_draft: { familyCode: 'PL' },
  program_metrics_brief: { familyCode: 'PM' },
  vendor_risk_rating: { familyCode: 'SR' },
  authorization_package: { familyCode: 'CA' },
  security_assessment_report: { familyCode: 'CA' },
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeTicketType(ticketType: string): string {
  const base = ticketType.includes('.')
    ? (ticketType.split('.').pop() ?? ticketType)
    : ticketType;
  return base.trim().toLowerCase();
}

/** Expand AC / "ac" / "Access Control" into a stable display label. */
export function normalizeControlFamilyLabel(
  value: string | null | undefined
): string | undefined {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    return familyLabel(trimmed.toUpperCase());
  }
  const fromId = controlFamilyFromId(trimmed);
  if (fromId && trimmed.toUpperCase() === fromId) {
    return familyLabel(fromId);
  }
  return trimmed;
}

export function resolveConsoleControlMeta(args: {
  ticketType: string;
  initialState?: Record<string, unknown> | null;
}): { controlId?: string; controlFamily?: string } {
  const state = asRecord(args.initialState);
  const meta = asRecord(state.meta);
  const scenario = asRecord(state.scenario);
  const typeKey = normalizeTicketType(args.ticketType);
  const defaults = GRC_TICKET_CONTROL_DEFAULTS[typeKey];

  const controlId =
    asString(state.control_id) ??
    asString(state.controlId) ??
    asString(state.source_control_id) ??
    asString(state.sourceControlId) ??
    asString(meta.control_id) ??
    asString(meta.controlId) ??
    asString(scenario.control_id) ??
    asString(scenario.controlId) ??
    defaults?.controlId;

  const explicitFamily =
    normalizeControlFamilyLabel(asString(state.control_family)) ??
    normalizeControlFamilyLabel(asString(state.controlFamily)) ??
    normalizeControlFamilyLabel(asString(meta.control_family)) ??
    normalizeControlFamilyLabel(asString(scenario.control_family)) ??
    normalizeControlFamilyLabel(asString(scenario.controlFamily));

  const fromControlId = controlFamilyFromId(controlId);
  const controlFamily =
    explicitFamily ??
    (fromControlId ? familyLabel(fromControlId) : undefined) ??
    (defaults ? familyLabel(defaults.familyCode) : undefined);

  return { controlId, controlFamily };
}
