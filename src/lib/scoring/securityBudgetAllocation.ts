import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildSecurityBudgetAllocationGradingPrompt } from '@/lib/grading/buildSecurityBudgetAllocationGradingPrompt';
import { retrieveSecurityBudgetGuidance } from '@/lib/grc/getSecurityBudgetGuidance';
import { captureFeatureException } from '@/lib/observability/sentry';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import {
  parseBudgetRequests,
  type SecurityBudgetRequest,
  type SecurityBudgetRequestCategory,
} from '@/lib/scoring/securityBudgetAllocationShared';
import {
  SECURITY_BUDGET_ALLOCATION_DEFAULT_BUDGET,
  SECURITY_BUDGET_ALLOCATION_MIN_JUSTIFICATION_LENGTH,
  SECURITY_BUDGET_ALLOCATION_TICKET_TYPES,
  isSecurityBudgetAllocationTicketType,
} from '@/lib/scoring/ticketUi';

/**
 * Security budget allocation scoring (ISSM / program authority).
 *
 * Deterministic:
 *   - allocations are numbers ≥ 0
 *   - per-request ≤ amountRequested (partial_ok) or 0 / full (full_only)
 *   - sum ≤ totalBudget; optional minPercentBudgetUsed / requirePositiveAllocation
 *   - justification length ≥ min
 *
 * Soft preferences (preferredHighValueIds / discouragedRequestIds) inform the
 * RAG prompt only — they do not hard-fail a reasonable risk-based mix.
 *
 * RAG / LLM (F26 pattern):
 *   - retrieve pinned security-budget risk rubric
 *   - grade justification against retrieved text only (risk linkage required)
 */

export {
  SECURITY_BUDGET_ALLOCATION_DEFAULT_BUDGET,
  SECURITY_BUDGET_ALLOCATION_MIN_JUSTIFICATION_LENGTH,
  SECURITY_BUDGET_ALLOCATION_TICKET_TYPES,
  isSecurityBudgetAllocationTicketType,
  parseBudgetRequests,
};

export type { SecurityBudgetRequest, SecurityBudgetRequestCategory };

export type SecurityBudgetAllocationTicketType =
  (typeof SECURITY_BUDGET_ALLOCATION_TICKET_TYPES)[number];

export type SecurityBudgetAllocationMode = 'partial_ok' | 'full_only';

export type SecurityBudgetAllocationExpectedState = {
  totalBudget?: number;
  minJustificationLength?: number;
  mustNotExceedBudget?: boolean;
  requirePositiveAllocation?: boolean;
  minPercentBudgetUsed?: number;
  discouragedRequestIds?: string[];
  preferredHighValueIds?: string[];
  guidanceTopics?: string[];
  topKGuidanceSections?: number;
  allocationMode?: SecurityBudgetAllocationMode;
};

export type SecurityBudgetAllocationSubmission = {
  type?: string;
  allocations: Record<string, number>;
  justification: string;
};

export type SecurityBudgetAllocationLineResult = {
  id: string;
  title: string;
  category: string;
  amountRequested: number;
  allocated: number;
};

export type SecurityBudgetAllocationStructuredResult = {
  style: 'security_budget_allocation';
  totalBudget: number;
  budgetUsed: number;
  remaining: number;
  overBudget: boolean;
  percentBudgetUsed: number;
  minPercentBudgetUsed: number | null;
  minJustificationLength: number;
  justificationLength: number;
  allocationMode: SecurityBudgetAllocationMode;
  allocations: SecurityBudgetAllocationLineResult[];
  unknownRequestIds: string[];
  overRequestIds: string[];
  negativeOrInvalidIds: string[];
  fullOnlyViolations: string[];
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

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const cleaned = value.trim().replace(/[$,]/g, '');
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function resolvePositiveNumber(value: unknown, fallback: number): number {
  const n = asFiniteNumber(value);
  if (n !== null && n > 0) return n;
  return fallback;
}

function resolveNonNegativeInt(value: unknown, fallback: number): number {
  const n = asFiniteNumber(value);
  if (n !== null && n >= 0) return Math.floor(n);
  return fallback;
}

function resolveStringIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseSecurityBudgetAllocationExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): SecurityBudgetAllocationExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }
  return expectedState as SecurityBudgetAllocationExpectedState;
}

export function resolveTotalBudget(
  ticket: ScorableTicket,
  expected?: SecurityBudgetAllocationExpectedState
): number {
  if (expected && typeof expected.totalBudget === 'number') {
    return resolvePositiveNumber(
      expected.totalBudget,
      SECURITY_BUDGET_ALLOCATION_DEFAULT_BUDGET
    );
  }

  const initial = isPlainObject(ticket.initial_state)
    ? ticket.initial_state
    : null;
  if (initial) {
    const fromInitial =
      initial.totalBudget ?? initial.total_budget ?? initial.budget;
    return resolvePositiveNumber(
      fromInitial,
      SECURITY_BUDGET_ALLOCATION_DEFAULT_BUDGET
    );
  }

  return SECURITY_BUDGET_ALLOCATION_DEFAULT_BUDGET;
}

export function resolveAllocationMode(
  ticket: ScorableTicket,
  expected?: SecurityBudgetAllocationExpectedState
): SecurityBudgetAllocationMode {
  const fromExpected = expected?.allocationMode;
  if (fromExpected === 'full_only' || fromExpected === 'partial_ok') {
    return fromExpected;
  }
  const initial = isPlainObject(ticket.initial_state)
    ? ticket.initial_state
    : null;
  const fromInitial = initial?.allocationMode ?? initial?.allocation_mode;
  if (fromInitial === 'full_only' || fromInitial === 'partial_ok') {
    return fromInitial;
  }
  return 'partial_ok';
}

function parseAllocationsMap(value: unknown): Record<string, number> | null {
  if (!isPlainObject(value)) return null;
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const id = key.trim();
    if (!id) continue;
    const n = asFiniteNumber(raw);
    if (n === null) return null;
    out[id] = n;
  }
  return out;
}

export function extractSecurityBudgetAllocationSubmission(
  submission: TicketSubmission
): SecurityBudgetAllocationSubmission | null {
  const allocationsRaw =
    submission.allocations ??
    submission.allocation ??
    submission.budgetAllocations ??
    submission.budget_allocations;

  const allocations = parseAllocationsMap(allocationsRaw);
  if (!allocations) return null;

  const justificationRaw =
    submission.justification ??
    submission.rationale ??
    submission.reason ??
    submission.narrative;
  if (typeof justificationRaw !== 'string') return null;

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'security_budget_allocation',
    allocations,
    justification: justificationRaw.trim(),
  };
}

function formatOrganizationText(
  initialState: Record<string, unknown> | null | undefined
): string | undefined {
  if (!isPlainObject(initialState)) return undefined;
  const org = initialState.organization ?? initialState.orgProfile;
  if (typeof org === 'string' && org.trim()) return org.trim();
  if (!isPlainObject(org)) return undefined;

  const parts: string[] = [];
  for (const key of [
    'name',
    'mission',
    'industry',
    'description',
    'notes',
    'constraints',
  ] as const) {
    const value = org[key];
    if (typeof value === 'string' && value.trim()) {
      parts.push(`${key}: ${value.trim()}`);
    }
  }
  return parts.length > 0 ? parts.join('\n') : undefined;
}

export function evaluateSecurityBudgetAllocationDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: SecurityBudgetAllocationSubmission | null;
  requests: SecurityBudgetRequest[];
  structured: SecurityBudgetAllocationStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseSecurityBudgetAllocationExpectedState(
    ticket.expected_state
  );
  const totalBudget = resolveTotalBudget(ticket, expected);
  const allocationMode = resolveAllocationMode(ticket, expected);
  const minJustificationLength = resolveNonNegativeInt(
    expected.minJustificationLength ??
      (isPlainObject(ticket.initial_state)
        ? ticket.initial_state.minJustificationLength
        : undefined),
    SECURITY_BUDGET_ALLOCATION_MIN_JUSTIFICATION_LENGTH
  );
  const mustNotExceedBudget = expected.mustNotExceedBudget !== false;
  const requirePositiveAllocation =
    expected.requirePositiveAllocation !== false;
  const minPercentBudgetUsed =
    typeof expected.minPercentBudgetUsed === 'number' &&
    Number.isFinite(expected.minPercentBudgetUsed) &&
    expected.minPercentBudgetUsed > 0
      ? Math.min(1, expected.minPercentBudgetUsed)
      : null;

  const requests = parseBudgetRequests(
    isPlainObject(ticket.initial_state) ? ticket.initial_state : null
  );
  const requestById = new Map(requests.map((r) => [r.id, r]));
  const parsed = extractSecurityBudgetAllocationSubmission(submission);

  const emptyStructured = (
    reason: string,
    extras?: Partial<SecurityBudgetAllocationStructuredResult>
  ): SecurityBudgetAllocationStructuredResult => ({
    style: 'security_budget_allocation',
    totalBudget,
    budgetUsed: 0,
    remaining: totalBudget,
    overBudget: false,
    percentBudgetUsed: 0,
    minPercentBudgetUsed,
    minJustificationLength,
    justificationLength: parsed?.justification.length ?? 0,
    allocationMode,
    allocations: requests.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      amountRequested: r.amountRequested,
      allocated: 0,
    })),
    unknownRequestIds: [],
    overRequestIds: [],
    negativeOrInvalidIds: [],
    fullOnlyViolations: [],
    fieldsOk: false,
    guidancePath: null,
    retrievedSectionIds: [],
    reason,
    ...extras,
  });

  if (!parsed) {
    return {
      parsed: null,
      requests,
      structured: emptyStructured('missing_fields'),
      ok: false,
      feedback:
        'Submission must include allocations (map of request id → dollars) and a justification string.',
    };
  }

  if (requests.length === 0) {
    return {
      parsed,
      requests,
      structured: emptyStructured('missing_requests'),
      ok: false,
      feedback:
        'Ticket is missing budget requests in initial_state. Ask an admin to seed requests.',
    };
  }

  const unknownRequestIds: string[] = [];
  const overRequestIds: string[] = [];
  const negativeOrInvalidIds: string[] = [];
  const fullOnlyViolations: string[] = [];
  const lineResults: SecurityBudgetAllocationLineResult[] = [];

  for (const req of requests) {
    const allocated = parsed.allocations[req.id] ?? 0;
    if (
      typeof allocated !== 'number' ||
      !Number.isFinite(allocated) ||
      allocated < 0
    ) {
      negativeOrInvalidIds.push(req.id);
    } else if (allocated > req.amountRequested) {
      overRequestIds.push(req.id);
    } else if (
      allocationMode === 'full_only' &&
      allocated !== 0 &&
      allocated !== req.amountRequested
    ) {
      fullOnlyViolations.push(req.id);
    }
    lineResults.push({
      id: req.id,
      title: req.title,
      category: req.category,
      amountRequested: req.amountRequested,
      allocated: Number.isFinite(allocated) ? allocated : 0,
    });
  }

  for (const id of Object.keys(parsed.allocations)) {
    if (!requestById.has(id)) {
      unknownRequestIds.push(id);
    }
  }

  const budgetUsed = lineResults.reduce((sum, line) => sum + line.allocated, 0);
  const overBudget = mustNotExceedBudget && budgetUsed > totalBudget;
  const percentBudgetUsed = totalBudget > 0 ? budgetUsed / totalBudget : 0;
  const justificationLength = parsed.justification.length;

  const structured: SecurityBudgetAllocationStructuredResult = {
    style: 'security_budget_allocation',
    totalBudget,
    budgetUsed,
    remaining: totalBudget - budgetUsed,
    overBudget,
    percentBudgetUsed,
    minPercentBudgetUsed,
    minJustificationLength,
    justificationLength,
    allocationMode,
    allocations: lineResults,
    unknownRequestIds,
    overRequestIds,
    negativeOrInvalidIds,
    fullOnlyViolations,
    fieldsOk: false,
    guidancePath: null,
    retrievedSectionIds: [],
  };

  if (negativeOrInvalidIds.length > 0) {
    structured.reason = 'invalid_allocation_values';
    return {
      parsed,
      requests,
      structured,
      ok: false,
      feedback: `Allocation values must be numbers ≥ 0. Invalid: ${negativeOrInvalidIds.join(', ')}.`,
    };
  }

  if (unknownRequestIds.length > 0) {
    structured.reason = 'unknown_request_ids';
    return {
      parsed,
      requests,
      structured,
      ok: false,
      feedback: `Allocations reference unknown request ids: ${unknownRequestIds.join(', ')}.`,
    };
  }

  if (overRequestIds.length > 0) {
    structured.reason = 'exceeds_amount_requested';
    return {
      parsed,
      requests,
      structured,
      ok: false,
      feedback: `Per-request allocation cannot exceed amountRequested (${allocationMode}): ${overRequestIds.join(', ')}.`,
    };
  }

  if (fullOnlyViolations.length > 0) {
    structured.reason = 'full_only_violation';
    return {
      parsed,
      requests,
      structured,
      ok: false,
      feedback: `This ticket requires full funding or zero per request. Partial amounts not allowed: ${fullOnlyViolations.join(', ')}.`,
    };
  }

  if (overBudget) {
    structured.reason = 'over_budget';
    return {
      parsed,
      requests,
      structured,
      ok: false,
      feedback: `Total allocated ($${Math.round(budgetUsed).toLocaleString()}) exceeds the FY budget ($${Math.round(totalBudget).toLocaleString()}). Reduce allocations to fit the ceiling.`,
    };
  }

  if (requirePositiveAllocation && budgetUsed <= 0) {
    structured.reason = 'zero_allocation';
    return {
      parsed,
      requests,
      structured,
      ok: false,
      feedback:
        'Allocate a positive total across one or more requests. An all-zero plan is not accepted.',
    };
  }

  if (
    minPercentBudgetUsed !== null &&
    percentBudgetUsed + 1e-9 < minPercentBudgetUsed
  ) {
    structured.reason = 'underutilized_budget';
    return {
      parsed,
      requests,
      structured,
      ok: false,
      feedback: `Put more of the budget to work against risk. At least ${Math.round(minPercentBudgetUsed * 100)}% of the FY budget must be allocated (currently ${Math.round(percentBudgetUsed * 100)}%).`,
    };
  }

  if (justificationLength < minJustificationLength) {
    structured.reason = 'justification_too_short';
    return {
      parsed,
      requests,
      structured,
      ok: false,
      feedback: `Expand your risk-based justification to at least ${minJustificationLength} characters (currently ${justificationLength}). Link funding choices to residual-risk reduction — do not only list line items.`,
    };
  }

  structured.fieldsOk = true;
  return {
    parsed,
    requests,
    structured,
    ok: true,
    feedback:
      'Deterministic checks passed. Grading allocation justification against pinned risk-budget rubric…',
  };
}

async function gradeAllocationWithGuidance(
  parsed: SecurityBudgetAllocationSubmission,
  requests: SecurityBudgetRequest[],
  ticket: ScorableTicket,
  expected: SecurityBudgetAllocationExpectedState,
  structured: SecurityBudgetAllocationStructuredResult
): Promise<{
  grading: ClaudeGradingResult;
  retrievedSectionIds: string[];
  guidancePath: string;
}> {
  const allocationSummary = structured.allocations
    .map(
      (line) =>
        `${line.id}: allocated ${line.allocated} of ${line.amountRequested} (${line.category}) — ${line.title}`
    )
    .join('\n');

  const query = [
    parsed.justification,
    allocationSummary,
    ...(expected.guidanceTopics ?? []),
    'risk-based budgeting',
    'risk reduction',
    'security investment prioritization',
  ].join('\n');

  // guidanceTopics enrich the keyword query; core section IDs come from the
  // retrieval helper defaults (topics are not section ids).
  const retrieved = retrieveSecurityBudgetGuidance(query, {
    topK: expected.topKGuidanceSections ?? 5,
  });

  const initial = isPlainObject(ticket.initial_state)
    ? ticket.initial_state
    : null;
  const currency = (initial && asNonEmptyString(initial.currency)) || 'USD';
  const fiscalYear =
    (initial && asNonEmptyString(initial.fiscalYear ?? initial.fiscal_year)) ||
    undefined;
  const prompt = (initial && asNonEmptyString(initial.prompt)) || undefined;

  const promptText = buildSecurityBudgetAllocationGradingPrompt(retrieved, {
    fiscalYear,
    totalBudget: structured.totalBudget,
    currency,
    budgetUsed: structured.budgetUsed,
    requests: requests.map((req) => ({
      id: req.id,
      title: req.title,
      category: req.category,
      amountRequested: req.amountRequested,
      riskContext: req.riskContext,
      allocated: parsed.allocations[req.id] ?? 0,
    })),
    justification: parsed.justification,
    preferredHighValueIds: resolveStringIdList(expected.preferredHighValueIds),
    discouragedRequestIds: resolveStringIdList(expected.discouragedRequestIds),
    scenarioBrief: ticket.scenario_brief ?? undefined,
    organizationText: formatOrganizationText(initial),
    prompt,
  });

  const grading = await callClaudeGrading(promptText);

  return {
    grading,
    retrievedSectionIds: retrieved.sections.map((section) => section.id),
    guidancePath: retrieved.catalogPath,
  };
}

export const securityBudgetAllocationTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const deterministic = evaluateSecurityBudgetAllocationDeterministic(
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

    const expected = parseSecurityBudgetAllocationExpectedState(
      ticket.expected_state
    );

    try {
      const { grading, retrievedSectionIds, guidancePath } =
        await gradeAllocationWithGuidance(
          deterministic.parsed,
          deterministic.requests,
          ticket,
          expected,
          deterministic.structured
        );

      const structured: SecurityBudgetAllocationStructuredResult = {
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
        const structured: SecurityBudgetAllocationStructuredResult = {
          ...deterministic.structured,
          reason: 'grading_unavailable_missing_api_key',
        };
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback:
            'Allocation fields look complete, but AI grading against the security-budget risk rubric is unavailable (ANTHROPIC_API_KEY not configured). Ask an admin to enable grading, then resubmit.',
        };
      }

      console.error('Security budget allocation RAG grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'security_budget_allocation_rag_grade',
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
          'Could not grade your budget allocation against pinned guidance. Please try again shortly.',
      };
    }
  },
};
