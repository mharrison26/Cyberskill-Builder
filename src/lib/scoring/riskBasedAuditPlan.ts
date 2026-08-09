import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildRiskBasedAuditPlanGradingPrompt } from '@/lib/grading/buildRiskBasedAuditPlanGradingPrompt';
import { retrieveRiskBasedAuditPlanGuidance } from '@/lib/grc/getRiskBasedAuditPlanGuidance';
import { captureFeatureException } from '@/lib/observability/sentry';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import {
  RISK_BASED_AUDIT_PLAN_DEFAULT_CAPACITY,
  RISK_BASED_AUDIT_PLAN_MIN_CAPACITY_NOTES_LENGTH,
  RISK_BASED_AUDIT_PLAN_MIN_JUSTIFICATION_LENGTH,
} from '@/lib/scoring/ticketUi';

/**
 * Capstone risk-based annual audit plan scoring.
 *
 * Deterministic:
 *   - plan present with required capacity (N areas)
 *   - each entry selects a valid risk-register area + non-trivial justification
 *   - no duplicate areas
 *   - seeded high residual-risk areas appear within top N priorities
 *   - optional: low-risk areas not over-represented in the plan
 *
 * RAG / LLM (F26 pattern):
 *   - retrieve pinned risk-based internal audit planning guidance
 *   - grade prioritization + justifications against retrieved text only
 */

export {
  RISK_BASED_AUDIT_PLAN_DEFAULT_CAPACITY,
  RISK_BASED_AUDIT_PLAN_MIN_CAPACITY_NOTES_LENGTH,
  RISK_BASED_AUDIT_PLAN_MIN_JUSTIFICATION_LENGTH,
} from '@/lib/scoring/ticketUi';

export const RISK_BASED_AUDIT_PLAN_TICKET_TYPES = [
  'risk_based_audit_plan',
  'annual_audit_plan_capstone',
] as const;

export type RiskBasedAuditPlanTicketType =
  (typeof RISK_BASED_AUDIT_PLAN_TICKET_TYPES)[number];

export type RiskRating = 'critical' | 'high' | 'medium' | 'low';

export type RiskRegisterArea = {
  id: string;
  area: string;
  inherentRisk: RiskRating;
  residualRisk: RiskRating;
  lastAuditDate: string;
  materialityNotes: string;
  knownIssues: string;
};

export type RiskBasedAuditPlanExpectedState = {
  auditCapacity?: number;
  minJustificationLength?: number;
  minCapacityNotesLength?: number;
  requireCapacityNotes?: boolean;
  /** High residual-risk area IDs that must appear in the plan (soft key check). */
  requiredHighRiskAreaIds?: string[];
  /** Required high-risk IDs must appear within the first N plan slots (default = capacity). */
  requiredWithinTopN?: number;
  /** Low residual-risk area IDs used for over-prioritization gate. */
  lowRiskAreaIds?: string[];
  /** Max allowed low-risk areas in the plan (default 1). */
  maxLowRiskInPlan?: number;
  guidanceTopics?: string[];
  topKGuidanceSections?: number;
};

export type RiskBasedAuditPlanEntry = {
  areaId: string;
  justification: string;
};

export type RiskBasedAuditPlanSubmission = {
  type?: string;
  planEntries: RiskBasedAuditPlanEntry[];
  capacityNotes?: string;
};

export type RiskBasedAuditPlanStructuredResult = {
  style: 'risk_based_audit_plan';
  planSize: number;
  auditCapacity: number;
  areaIds: string[];
  invalidAreaIds: string[];
  duplicateAreaIds: string[];
  shortJustificationAreaIds: string[];
  missingRequiredHighRiskAreaIds: string[];
  requiredHighRiskOutsideTopN: string[];
  lowRiskAreaIdsInPlan: string[];
  maxLowRiskInPlan: number;
  capacityNotesLength: number;
  minJustificationLength: number;
  minCapacityNotesLength: number;
  fieldsOk: boolean;
  guidancePath: string | null;
  retrievedSectionIds: string[];
  grading?: {
    finding_state: ClaudeGradingResult['finding_state'];
    strengths: string[];
    gaps: string[];
  };
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isRiskBasedAuditPlanTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (
    base === 'risk_based_audit_plan' ||
    base === 'annual_audit_plan_capstone' ||
    (RISK_BASED_AUDIT_PLAN_TICKET_TYPES as readonly string[]).includes(base)
  );
}

function normalizeRiskRating(value: unknown): RiskRating | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
  if (
    normalized === 'critical' ||
    normalized === 'crit' ||
    normalized === 'very_high'
  ) {
    return 'critical';
  }
  if (normalized === 'high' || normalized === 'h') return 'high';
  if (
    normalized === 'medium' ||
    normalized === 'moderate' ||
    normalized === 'med' ||
    normalized === 'm'
  ) {
    return 'medium';
  }
  if (normalized === 'low' || normalized === 'l') return 'low';
  return null;
}

function resolvePositiveInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}

function resolveStringIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseRiskBasedAuditPlanExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): RiskBasedAuditPlanExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }
  return expectedState as RiskBasedAuditPlanExpectedState;
}

export function parseRiskRegister(
  initialState: Record<string, unknown> | null | undefined
): RiskRegisterArea[] {
  if (!isPlainObject(initialState)) return [];

  const raw =
    initialState.riskRegister ??
    initialState.risk_register ??
    initialState.areas ??
    [];
  if (!Array.isArray(raw)) return [];

  const areas: RiskRegisterArea[] = [];
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    const id = asNonEmptyString(entry.id ?? entry.areaId ?? entry.area_id);
    const area = asNonEmptyString(
      entry.area ?? entry.name ?? entry.title ?? entry.auditArea
    );
    const inherentRisk = normalizeRiskRating(
      entry.inherentRisk ?? entry.inherent_risk
    );
    const residualRisk = normalizeRiskRating(
      entry.residualRisk ?? entry.residual_risk
    );
    if (!id || !area || !inherentRisk || !residualRisk) continue;

    areas.push({
      id,
      area,
      inherentRisk,
      residualRisk,
      lastAuditDate:
        asNonEmptyString(entry.lastAuditDate ?? entry.last_audit_date) ??
        'Never',
      materialityNotes:
        asNonEmptyString(
          entry.materialityNotes ??
            entry.materiality_notes ??
            entry.impactNotes ??
            entry.impact
        ) ?? '',
      knownIssues:
        asNonEmptyString(
          entry.knownIssues ?? entry.known_issues ?? entry.issues
        ) ?? '',
    });
  }
  return areas;
}

export function resolveAuditCapacity(
  ticket: ScorableTicket,
  expected?: RiskBasedAuditPlanExpectedState
): number {
  const fromExpected = expected
    ? resolvePositiveInt(
        expected.auditCapacity,
        RISK_BASED_AUDIT_PLAN_DEFAULT_CAPACITY
      )
    : RISK_BASED_AUDIT_PLAN_DEFAULT_CAPACITY;

  if (expected && typeof expected.auditCapacity === 'number') {
    return fromExpected;
  }

  const initial = isPlainObject(ticket.initial_state)
    ? ticket.initial_state
    : null;
  if (!initial) return fromExpected;

  const fromInitial =
    initial.auditCapacity ??
    initial.audit_capacity ??
    initial.capacity ??
    initial.auditsPerYear;
  return resolvePositiveInt(fromInitial, fromExpected);
}

function parsePlanEntry(raw: unknown): RiskBasedAuditPlanEntry | null {
  if (!isPlainObject(raw)) return null;
  const areaId = asNonEmptyString(
    raw.areaId ?? raw.area_id ?? raw.id ?? raw.riskId
  );
  const justification = asNonEmptyString(
    raw.justification ?? raw.rationale ?? raw.why ?? raw.reason
  );
  if (!areaId || !justification) return null;
  return { areaId, justification };
}

export function extractRiskBasedAuditPlanSubmission(
  submission: TicketSubmission
): RiskBasedAuditPlanSubmission | null {
  const planRaw =
    submission.planEntries ??
    submission.plan_entries ??
    submission.plan ??
    submission.auditPlan ??
    submission.orderedAreas;

  if (!Array.isArray(planRaw)) {
    return null;
  }

  const planEntries = planRaw
    .map(parsePlanEntry)
    .filter((entry): entry is RiskBasedAuditPlanEntry => entry !== null);

  if (planEntries.length === 0) {
    return null;
  }

  const capacityNotes =
    asNonEmptyString(submission.capacityNotes) ??
    asNonEmptyString(submission.capacity_notes) ??
    asNonEmptyString(submission.deferralNotes) ??
    asNonEmptyString(submission.deferral_notes) ??
    undefined;

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'risk_based_audit_plan',
    planEntries,
    capacityNotes,
  };
}

function formatRiskRegisterSummary(areas: RiskRegisterArea[]): string {
  return areas
    .map(
      (area) =>
        `- ${area.id} ${area.area}: inherent=${area.inherentRisk}, residual=${area.residualRisk}, lastAudit=${area.lastAuditDate}. Materiality: ${area.materialityNotes || 'n/a'}. Known issues: ${area.knownIssues || 'none noted'}.`
    )
    .join('\n');
}

function resolveOrganizationName(
  initialState: Record<string, unknown> | null | undefined
): string | undefined {
  if (!isPlainObject(initialState)) return undefined;
  const org = initialState.organization ?? initialState.orgProfile;
  if (typeof org === 'string' && org.trim()) return org.trim();
  if (isPlainObject(org)) {
    return (
      asNonEmptyString(org.name) ??
      asNonEmptyString(org.organizationName) ??
      undefined
    );
  }
  return asNonEmptyString(initialState.organizationName) ?? undefined;
}

export function evaluateRiskBasedAuditPlanDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: RiskBasedAuditPlanSubmission | null;
  areas: RiskRegisterArea[];
  structured: RiskBasedAuditPlanStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseRiskBasedAuditPlanExpectedState(ticket.expected_state);
  const areas = parseRiskRegister(ticket.initial_state);
  const areaById = new Map(areas.map((area) => [area.id, area]));

  const auditCapacity = resolveAuditCapacity(ticket, expected);
  const minJustificationLength = resolvePositiveInt(
    expected.minJustificationLength,
    RISK_BASED_AUDIT_PLAN_MIN_JUSTIFICATION_LENGTH
  );
  const minCapacityNotesLength = resolvePositiveInt(
    expected.minCapacityNotesLength,
    RISK_BASED_AUDIT_PLAN_MIN_CAPACITY_NOTES_LENGTH
  );
  const requireCapacityNotes = expected.requireCapacityNotes !== false;
  const requiredHighRiskAreaIds = resolveStringIdList(
    expected.requiredHighRiskAreaIds
  );
  const requiredWithinTopN = resolvePositiveInt(
    expected.requiredWithinTopN,
    auditCapacity
  );
  const lowRiskAreaIds = new Set(resolveStringIdList(expected.lowRiskAreaIds));
  const maxLowRiskInPlan =
    typeof expected.maxLowRiskInPlan === 'number' &&
    Number.isFinite(expected.maxLowRiskInPlan) &&
    expected.maxLowRiskInPlan >= 0
      ? Math.floor(expected.maxLowRiskInPlan)
      : 1;

  const emptyStructured = (
    overrides: Partial<RiskBasedAuditPlanStructuredResult> = {}
  ): RiskBasedAuditPlanStructuredResult => ({
    style: 'risk_based_audit_plan',
    planSize: 0,
    auditCapacity,
    areaIds: [],
    invalidAreaIds: [],
    duplicateAreaIds: [],
    shortJustificationAreaIds: [],
    missingRequiredHighRiskAreaIds: [],
    requiredHighRiskOutsideTopN: [],
    lowRiskAreaIdsInPlan: [],
    maxLowRiskInPlan,
    capacityNotesLength: 0,
    minJustificationLength,
    minCapacityNotesLength,
    fieldsOk: false,
    guidancePath: null,
    retrievedSectionIds: [],
    ...overrides,
  });

  if (areas.length === 0) {
    return {
      parsed: null,
      areas,
      structured: emptyStructured({ reason: 'missing_risk_register' }),
      ok: false,
      feedback:
        'Ticket is missing riskRegister in initial_state; cannot grade the annual audit plan.',
    };
  }

  const parsed = extractRiskBasedAuditPlanSubmission(submission);
  if (!parsed) {
    return {
      parsed: null,
      areas,
      structured: emptyStructured({ reason: 'missing_fields' }),
      ok: false,
      feedback:
        'Submission must include planEntries: an ordered list of { areaId, justification } items.',
    };
  }

  const areaIds = parsed.planEntries.map((entry) => entry.areaId);
  const invalidAreaIds = areaIds.filter((id) => !areaById.has(id));
  const seen = new Set<string>();
  const duplicateAreaIds: string[] = [];
  for (const id of areaIds) {
    if (seen.has(id)) {
      if (!duplicateAreaIds.includes(id)) duplicateAreaIds.push(id);
    } else {
      seen.add(id);
    }
  }

  const shortJustificationAreaIds = parsed.planEntries
    .filter((entry) => entry.justification.length < minJustificationLength)
    .map((entry) => entry.areaId);

  const missingRequiredHighRiskAreaIds = requiredHighRiskAreaIds.filter(
    (id) => !areaIds.includes(id)
  );
  const topSlotIds = areaIds.slice(0, requiredWithinTopN);
  const requiredHighRiskOutsideTopN = requiredHighRiskAreaIds.filter(
    (id) => areaIds.includes(id) && !topSlotIds.includes(id)
  );

  const lowRiskAreaIdsInPlan = areaIds.filter((id) => lowRiskAreaIds.has(id));
  const capacityNotesLength = parsed.capacityNotes?.length ?? 0;
  const capacityNotesOk =
    !requireCapacityNotes || capacityNotesLength >= minCapacityNotesLength;

  const planSizeOk = areaIds.length === auditCapacity;
  const fieldsOk =
    planSizeOk &&
    invalidAreaIds.length === 0 &&
    duplicateAreaIds.length === 0 &&
    shortJustificationAreaIds.length === 0 &&
    missingRequiredHighRiskAreaIds.length === 0 &&
    requiredHighRiskOutsideTopN.length === 0 &&
    lowRiskAreaIdsInPlan.length <= maxLowRiskInPlan &&
    capacityNotesOk;

  const structured: RiskBasedAuditPlanStructuredResult = {
    style: 'risk_based_audit_plan',
    planSize: areaIds.length,
    auditCapacity,
    areaIds,
    invalidAreaIds,
    duplicateAreaIds,
    shortJustificationAreaIds,
    missingRequiredHighRiskAreaIds,
    requiredHighRiskOutsideTopN,
    lowRiskAreaIdsInPlan,
    maxLowRiskInPlan,
    capacityNotesLength,
    minJustificationLength,
    minCapacityNotesLength,
    fieldsOk,
    guidancePath: null,
    retrievedSectionIds: [],
  };

  if (!planSizeOk) {
    structured.reason = 'wrong_plan_size';
    return {
      parsed,
      areas,
      structured,
      ok: false,
      feedback: `Plan must include exactly ${auditCapacity} audit areas (capacity constraint); received ${areaIds.length}.`,
    };
  }

  if (invalidAreaIds.length > 0) {
    structured.reason = 'invalid_area_ids';
    return {
      parsed,
      areas,
      structured,
      ok: false,
      feedback: `Unknown risk-register area IDs: ${invalidAreaIds.join(', ')}. Select areas from the register.`,
    };
  }

  if (duplicateAreaIds.length > 0) {
    structured.reason = 'duplicate_areas';
    return {
      parsed,
      areas,
      structured,
      ok: false,
      feedback: `Duplicate audit areas are not allowed: ${duplicateAreaIds.join(', ')}.`,
    };
  }

  if (shortJustificationAreaIds.length > 0) {
    structured.reason = 'justifications_too_short';
    return {
      parsed,
      areas,
      structured,
      ok: false,
      feedback: `Each area needs a justification of at least ${minJustificationLength} characters. Short entries: ${shortJustificationAreaIds.join(', ')}.`,
    };
  }

  if (missingRequiredHighRiskAreaIds.length > 0) {
    structured.reason = 'missing_high_risk_areas';
    return {
      parsed,
      areas,
      structured,
      ok: false,
      feedback: `Highest residual-risk areas must appear in the annual plan: missing ${missingRequiredHighRiskAreaIds.join(', ')}.`,
    };
  }

  if (requiredHighRiskOutsideTopN.length > 0) {
    structured.reason = 'high_risk_not_in_top_n';
    return {
      parsed,
      areas,
      structured,
      ok: false,
      feedback: `Required high residual-risk areas must be among the top ${requiredWithinTopN} priorities: ${requiredHighRiskOutsideTopN.join(', ')}.`,
    };
  }

  if (lowRiskAreaIdsInPlan.length > maxLowRiskInPlan) {
    structured.reason = 'low_risk_over_prioritized';
    return {
      parsed,
      areas,
      structured,
      ok: false,
      feedback: `Low residual-risk areas are over-prioritized given capacity (${lowRiskAreaIdsInPlan.join(', ')}). Keep at most ${maxLowRiskInPlan} low-risk area(s) and prioritize higher residual risk.`,
    };
  }

  if (!capacityNotesOk) {
    structured.reason = 'capacity_notes_too_short';
    return {
      parsed,
      areas,
      structured,
      ok: false,
      feedback: `Capacity / deferral notes are required (at least ${minCapacityNotesLength} characters) explaining what you deferred and why.`,
    };
  }

  return {
    parsed,
    areas,
    structured,
    ok: true,
    feedback:
      'Deterministic checks passed. Grading plan against risk-based audit planning guidance…',
  };
}

async function gradePlanWithGuidance(
  parsed: RiskBasedAuditPlanSubmission,
  ticket: ScorableTicket,
  expected: RiskBasedAuditPlanExpectedState,
  areas: RiskRegisterArea[],
  auditCapacity: number
): Promise<{
  grading: ClaudeGradingResult;
  retrievedSectionIds: string[];
  guidancePath: string;
}> {
  const areaById = new Map(areas.map((area) => [area.id, area]));
  const planEntries = parsed.planEntries.map((entry, index) => {
    const area = areaById.get(entry.areaId);
    return {
      priority: index + 1,
      areaId: entry.areaId,
      areaName: area?.area ?? entry.areaId,
      residualRisk: area?.residualRisk,
      inherentRisk: area?.inherentRisk,
      lastAuditDate: area?.lastAuditDate,
      justification: entry.justification,
    };
  });

  const query = [
    ...planEntries.map(
      (entry) =>
        `${entry.areaName} ${entry.residualRisk ?? ''} ${entry.justification}`
    ),
    parsed.capacityNotes ?? '',
    'risk-based residual priority capacity justification',
  ].join('\n');

  const requiredSectionIds =
    expected.guidanceTopics && expected.guidanceTopics.length > 0
      ? expected.guidanceTopics
      : undefined;

  const retrieved = retrieveRiskBasedAuditPlanGuidance(query, {
    topK: expected.topKGuidanceSections ?? 5,
    requiredSectionIds,
  });

  const prompt = buildRiskBasedAuditPlanGradingPrompt(retrieved, {
    planEntries,
    capacityNotes: parsed.capacityNotes,
    auditCapacity,
    organizationName: resolveOrganizationName(ticket.initial_state),
    scenarioBrief: ticket.scenario_brief,
    riskRegisterSummary: formatRiskRegisterSummary(areas),
  });

  const grading = await callClaudeGrading(prompt);

  return {
    grading,
    retrievedSectionIds: retrieved.sections.map((section) => section.id),
    guidancePath: retrieved.catalogPath,
  };
}

export const riskBasedAuditPlanTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const deterministic = evaluateRiskBasedAuditPlanDeterministic(
      submission,
      ticket
    );

    if (!deterministic.ok || !deterministic.parsed) {
      return {
        status: 'needs_revision',
        structuredResult: deterministic.structured,
        feedback: deterministic.feedback,
      };
    }

    const expected = parseRiskBasedAuditPlanExpectedState(
      ticket.expected_state
    );
    const auditCapacity = resolveAuditCapacity(ticket, expected);

    try {
      const { grading, retrievedSectionIds, guidancePath } =
        await gradePlanWithGuidance(
          deterministic.parsed,
          ticket,
          expected,
          deterministic.areas,
          auditCapacity
        );

      const structured: RiskBasedAuditPlanStructuredResult = {
        ...deterministic.structured,
        guidancePath,
        retrievedSectionIds,
        grading: {
          finding_state: grading.finding_state,
          strengths: grading.strengths,
          gaps: grading.gaps,
        },
      };

      if (grading.finding_state === 'satisfied') {
        return {
          status: 'resolved',
          structuredResult: structured,
          feedback: grading.feedback,
        };
      }

      structured.reason = `grading_${grading.finding_state}`;
      const gapHint =
        grading.gaps.length > 0
          ? ` Gaps: ${grading.gaps.slice(0, 3).join(' ')}`
          : '';

      return {
        status: 'needs_revision',
        structuredResult: structured,
        feedback: `${grading.feedback}${gapHint}`,
      };
    } catch (error) {
      if (error instanceof MissingAnthropicApiKeyError) {
        const structured: RiskBasedAuditPlanStructuredResult = {
          ...deterministic.structured,
          reason: 'grading_unavailable_missing_api_key',
        };
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback:
            'Plan structure looks complete, but AI grading against risk-based audit planning guidance is unavailable (ANTHROPIC_API_KEY not configured). Ask an admin to enable grading, then resubmit.',
        };
      }

      console.error('Risk-based audit plan RAG grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'risk_based_audit_plan_rag_grade',
        ticketId: ticket.id,
        ticketType: ticket.ticket_type,
        level: 'error',
      });

      return {
        status: 'needs_revision',
        structuredResult: {
          ...deterministic.structured,
          reason: 'grading_error',
        },
        feedback:
          'Could not grade your annual audit plan against risk-based planning guidance. Please try again shortly.',
      };
    }
  },
};
