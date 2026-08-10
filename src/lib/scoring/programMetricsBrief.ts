import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildProgramMetricsBriefGradingPrompt } from '@/lib/grading/buildProgramMetricsBriefGradingPrompt';
import { retrieveProgramMetricsRubric } from '@/lib/grc/getProgramMetricsRubric';
import { captureFeatureException } from '@/lib/observability/sentry';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import {
  PROGRAM_METRICS_BRIEF_DEFAULT_MAX_SELECTED,
  PROGRAM_METRICS_BRIEF_DEFAULT_MIN_RATIONALE_LENGTH,
  PROGRAM_METRICS_BRIEF_DEFAULT_MIN_SELECTED,
  PROGRAM_METRICS_BRIEF_TICKET_TYPES,
  isProgramMetricsBriefTicketType,
} from '@/lib/scoring/ticketUi';

/**
 * Leadership program-metrics brief (ISSO / ISSM program oversight).
 *
 * Distinct from helpdesk kpi_report (ticket-resolution CSV KPIs):
 * students select 2–3 leadership-meaningful metrics from raw program data
 * (POA&M aging, training completion, incidents), calculate them, and explain why.
 *
 * Deterministic:
 *   - selection count within min/max
 *   - rationale min length
 *   - each selected metric with an expected calculation matches within tolerance
 *
 * RAG / LLM:
 *   - retrieve pinned program-metrics best-practices rubric
 *   - grade metric selection + rationale (not arithmetic)
 */

export {
  PROGRAM_METRICS_BRIEF_DEFAULT_MAX_SELECTED,
  PROGRAM_METRICS_BRIEF_DEFAULT_MIN_RATIONALE_LENGTH,
  PROGRAM_METRICS_BRIEF_DEFAULT_MIN_SELECTED,
  PROGRAM_METRICS_BRIEF_TICKET_TYPES,
  isProgramMetricsBriefTicketType,
};

export type ProgramMetricsCalcExpectation = {
  value: number;
  tolerance?: number;
};

export type ProgramMetricsBriefExpectedState = {
  calculations?: Record<string, ProgramMetricsCalcExpectation>;
  preferredMetricIds?: string[];
  discouragedMetricIds?: string[];
  minSelectedMetrics?: number;
  maxSelectedMetrics?: number;
  minRationaleLength?: number;
  guidanceTopics?: string[];
  topKGuidanceSections?: number;
  /** Optional; unused by finding_state path — reserved for hybrid extensions. */
  passThreshold?: number;
};

export type ProgramMetricsBriefSubmission = {
  type?: string;
  selectedMetricIds: string[];
  calculations: Record<string, number>;
  rationale: string;
};

export type ProgramMetricsCalcMatch = {
  metricId: string;
  expected: number | null;
  actual: number | null;
  tolerance: number | null;
  matched: boolean;
  detail?: string;
};

export type ProgramMetricsBriefStructuredResult = {
  style: 'program_metrics_brief';
  selectedMetricIds: string[];
  selectedCount: number;
  minSelectedMetrics: number;
  maxSelectedMetrics: number;
  selectionCountOk: boolean;
  rationaleLength: number;
  minRationaleLength: number;
  rationaleOk: boolean;
  calcMatches: ProgramMetricsCalcMatch[];
  calcsOk: boolean;
  preferredSelected: string[];
  discouragedSelected: string[];
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

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const cleaned = value.trim().replace(/%$/, '');
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asStringIdArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function withinTolerance(
  actual: number,
  expected: number,
  tolerance: number
): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

/** Accept rate 0–1 or percent 0–100 when expected is a fraction ≤ 1. */
function normalizeComparable(
  actual: number,
  expected: number
): { actual: number; expected: number } {
  if (expected >= 0 && expected <= 1 && actual > 1 && actual <= 100) {
    return { actual: actual / 100, expected };
  }
  if (expected > 1 && expected <= 100 && actual >= 0 && actual <= 1) {
    return { actual: actual * 100, expected };
  }
  return { actual, expected };
}

function parseCalcExpectation(
  value: unknown
): ProgramMetricsCalcExpectation | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { value, tolerance: 0.01 };
  }
  if (!isPlainObject(value)) return null;
  const expectedValue = asFiniteNumber(value.value ?? value.expected);
  if (expectedValue === null) return null;
  const tolerance =
    asFiniteNumber(value.tolerance ?? value.tol) ??
    asFiniteNumber(value.absoluteTolerance) ??
    0.01;
  return { value: expectedValue, tolerance };
}

export function parseProgramMetricsBriefExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): ProgramMetricsBriefExpectedState {
  if (!isPlainObject(expectedState)) return {};

  const calculations: Record<string, ProgramMetricsCalcExpectation> = {};
  const rawCalcs = expectedState.calculations;
  if (isPlainObject(rawCalcs)) {
    for (const [key, entry] of Object.entries(rawCalcs)) {
      const parsed = parseCalcExpectation(entry);
      if (parsed) calculations[key.trim()] = parsed;
    }
  }

  return {
    calculations:
      Object.keys(calculations).length > 0 ? calculations : undefined,
    preferredMetricIds: asStringIdArray(
      expectedState.preferredMetricIds ?? expectedState.preferred_metric_ids
    ),
    discouragedMetricIds: asStringIdArray(
      expectedState.discouragedMetricIds ?? expectedState.discouraged_metric_ids
    ),
    minSelectedMetrics:
      asFiniteNumber(
        expectedState.minSelectedMetrics ?? expectedState.min_selected_metrics
      ) ?? undefined,
    maxSelectedMetrics:
      asFiniteNumber(
        expectedState.maxSelectedMetrics ?? expectedState.max_selected_metrics
      ) ?? undefined,
    minRationaleLength:
      asFiniteNumber(
        expectedState.minRationaleLength ?? expectedState.min_rationale_length
      ) ?? undefined,
    guidanceTopics: asStringIdArray(
      expectedState.guidanceTopics ?? expectedState.guidance_topics
    ),
    topKGuidanceSections:
      asFiniteNumber(
        expectedState.topKGuidanceSections ??
          expectedState.top_k_guidance_sections
      ) ?? undefined,
    passThreshold:
      asFiniteNumber(
        expectedState.passThreshold ?? expectedState.pass_threshold
      ) ?? undefined,
  };
}

export function extractProgramMetricsBriefSubmission(
  submission: TicketSubmission
): ProgramMetricsBriefSubmission | null {
  const selectedMetricIds = asStringIdArray(
    submission.selectedMetricIds ??
      submission.selected_metric_ids ??
      submission.metricIds ??
      submission.metrics
  );

  const rationale =
    asNonEmptyString(submission.rationale) ??
    asNonEmptyString(submission.explanation) ??
    asNonEmptyString(submission.narrative);

  const rawCalcs =
    submission.calculations ??
    submission.calculatedValues ??
    submission.calculated_values;
  const calculations: Record<string, number> = {};
  if (isPlainObject(rawCalcs)) {
    for (const [key, value] of Object.entries(rawCalcs)) {
      const n = asFiniteNumber(value);
      if (n === null) continue;
      calculations[key.trim()] = n;
    }
  }

  if (selectedMetricIds.length === 0 || !rationale) {
    return null;
  }

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'program_metrics_brief',
    selectedMetricIds,
    calculations,
    rationale,
  };
}

function candidateLabelMap(
  initialState: Record<string, unknown> | null | undefined
): Record<string, string> {
  if (!isPlainObject(initialState)) return {};
  const raw = initialState.candidateMetrics ?? initialState.candidate_metrics;
  if (!Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const item of raw) {
    if (!isPlainObject(item)) continue;
    const id = asNonEmptyString(item.id);
    const label = asNonEmptyString(item.label) ?? id;
    if (id && label) out[id] = label;
  }
  return out;
}

function formatScenarioContext(
  initialState: Record<string, unknown> | null | undefined
): string | undefined {
  if (!isPlainObject(initialState)) return undefined;

  const parts: string[] = [];

  const org = initialState.organization;
  if (isPlainObject(org)) {
    const name = asNonEmptyString(org.name);
    const system = asNonEmptyString(org.system);
    if (name && system) parts.push(`Organization: ${name}; System: ${system}`);
    else if (name) parts.push(`Organization: ${name}`);
    else if (system) parts.push(`System: ${system}`);
  }

  const period =
    asNonEmptyString(initialState.reportingPeriod) ??
    asNonEmptyString(initialState.reporting_period);
  if (period) parts.push(`Reporting period: ${period}`);

  const rawData = initialState.rawData ?? initialState.raw_data;
  if (isPlainObject(rawData)) {
    parts.push(`Raw data JSON: ${JSON.stringify(rawData)}`);
  }

  const prompt = asNonEmptyString(initialState.prompt);
  if (prompt) parts.push(`Prompt: ${prompt}`);

  return parts.length > 0 ? parts.join('\n') : undefined;
}

export function evaluateProgramMetricsBriefDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: ProgramMetricsBriefSubmission | null;
  structured: ProgramMetricsBriefStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseProgramMetricsBriefExpectedState(ticket.expected_state);
  const minSelected =
    typeof expected.minSelectedMetrics === 'number' &&
    expected.minSelectedMetrics > 0
      ? Math.floor(expected.minSelectedMetrics)
      : PROGRAM_METRICS_BRIEF_DEFAULT_MIN_SELECTED;
  const maxSelected =
    typeof expected.maxSelectedMetrics === 'number' &&
    expected.maxSelectedMetrics > 0
      ? Math.floor(expected.maxSelectedMetrics)
      : PROGRAM_METRICS_BRIEF_DEFAULT_MAX_SELECTED;
  const minRationale =
    typeof expected.minRationaleLength === 'number' &&
    expected.minRationaleLength > 0
      ? Math.floor(expected.minRationaleLength)
      : PROGRAM_METRICS_BRIEF_DEFAULT_MIN_RATIONALE_LENGTH;

  const preferred = expected.preferredMetricIds ?? [];
  const discouraged = expected.discouragedMetricIds ?? [];
  const calcExpectations = expected.calculations ?? {};

  const parsed = extractProgramMetricsBriefSubmission(submission);

  const emptyStructured = (
    reason: string,
    overrides: Partial<ProgramMetricsBriefStructuredResult> = {}
  ): ProgramMetricsBriefStructuredResult => ({
    style: 'program_metrics_brief',
    selectedMetricIds: [],
    selectedCount: 0,
    minSelectedMetrics: minSelected,
    maxSelectedMetrics: maxSelected,
    selectionCountOk: false,
    rationaleLength: 0,
    minRationaleLength: minRationale,
    rationaleOk: false,
    calcMatches: [],
    calcsOk: false,
    preferredSelected: [],
    discouragedSelected: [],
    guidancePath: null,
    retrievedSectionIds: [],
    reason,
    ...overrides,
  });

  if (!parsed) {
    return {
      parsed: null,
      structured: emptyStructured('missing_fields'),
      ok: false,
      feedback:
        'Submission must include selectedMetricIds (2–3 metrics), calculations for each selected metric, and a rationale.',
    };
  }

  const selectedCount = parsed.selectedMetricIds.length;
  const selectionCountOk =
    selectedCount >= minSelected && selectedCount <= maxSelected;
  const rationaleLength = parsed.rationale.length;
  const rationaleOk = rationaleLength >= minRationale;

  const preferredSelected = parsed.selectedMetricIds.filter((id) =>
    preferred.includes(id)
  );
  const discouragedSelected = parsed.selectedMetricIds.filter((id) =>
    discouraged.includes(id)
  );

  const calcMatches: ProgramMetricsCalcMatch[] = [];
  for (const metricId of parsed.selectedMetricIds) {
    const expectation = calcExpectations[metricId];
    if (!expectation) {
      calcMatches.push({
        metricId,
        expected: null,
        actual: asFiniteNumber(parsed.calculations[metricId]),
        tolerance: null,
        matched: true,
        detail: 'no_expected_calculation',
      });
      continue;
    }

    const actualRaw = asFiniteNumber(parsed.calculations[metricId]);
    const tolerance =
      typeof expectation.tolerance === 'number' ? expectation.tolerance : 0.01;

    if (actualRaw === null) {
      calcMatches.push({
        metricId,
        expected: expectation.value,
        actual: null,
        tolerance,
        matched: false,
        detail: 'missing_submitted_value',
      });
      continue;
    }

    const { actual, expected: expectedValue } = normalizeComparable(
      actualRaw,
      expectation.value
    );
    const matched = withinTolerance(actual, expectedValue, tolerance);
    calcMatches.push({
      metricId,
      expected: expectation.value,
      actual: actualRaw,
      tolerance,
      matched,
      detail: matched
        ? undefined
        : `expected ${expectation.value} ± ${tolerance}`,
    });
  }

  const calcsOk = calcMatches.every((m) => m.matched);

  const structured: ProgramMetricsBriefStructuredResult = {
    style: 'program_metrics_brief',
    selectedMetricIds: parsed.selectedMetricIds,
    selectedCount,
    minSelectedMetrics: minSelected,
    maxSelectedMetrics: maxSelected,
    selectionCountOk,
    rationaleLength,
    minRationaleLength: minRationale,
    rationaleOk,
    calcMatches,
    calcsOk,
    preferredSelected,
    discouragedSelected,
    guidancePath: null,
    retrievedSectionIds: [],
  };

  if (!selectionCountOk) {
    structured.reason = 'selection_count';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Select between ${minSelected} and ${maxSelected} leadership metrics (you selected ${selectedCount}).`,
    };
  }

  if (!rationaleOk) {
    structured.reason = 'rationale_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Rationale must be at least ${minRationale} characters explaining why each selected metric matters to leadership.`,
    };
  }

  if (!calcsOk) {
    const failed = calcMatches
      .filter((m) => !m.matched)
      .map((m) => m.metricId)
      .join(', ');
    structured.reason = 'calculation_mismatch';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Calculation mismatch on: ${failed || 'unknown'}. Re-check formulas against the raw program data (rates as decimals 0–1 or percents are both accepted within tolerance).`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback:
      'Deterministic checks passed. Grading metric selection and rationale against pinned program-metrics rubric…',
  };
}

async function gradeSelectionWithRubric(
  parsed: ProgramMetricsBriefSubmission,
  ticket: ScorableTicket,
  expected: ProgramMetricsBriefExpectedState
): Promise<{
  grading: ClaudeGradingResult;
  retrievedSectionIds: string[];
  guidancePath: string;
}> {
  const labels = candidateLabelMap(ticket.initial_state);
  const query = [
    parsed.selectedMetricIds.join(' '),
    parsed.rationale,
    ...(expected.preferredMetricIds ?? []),
    ...(expected.guidanceTopics ?? []),
  ].join('\n');

  const requiredSectionIds =
    expected.guidanceTopics && expected.guidanceTopics.length > 0
      ? expected.guidanceTopics
      : undefined;

  const retrieved = retrieveProgramMetricsRubric(query, {
    topK: expected.topKGuidanceSections ?? 6,
    requiredSectionIds,
  });

  const prompt = buildProgramMetricsBriefGradingPrompt(retrieved, {
    selectedMetricIds: parsed.selectedMetricIds,
    selectedMetricLabels: parsed.selectedMetricIds.map(
      (id) => labels[id] ?? id
    ),
    calculations: parsed.calculations,
    rationale: parsed.rationale,
    preferredMetricIds: expected.preferredMetricIds,
    discouragedMetricIds: expected.discouragedMetricIds,
    scenarioBrief: ticket.scenario_brief,
    scenarioContextText: formatScenarioContext(ticket.initial_state),
  });

  const grading = await callClaudeGrading(prompt);

  return {
    grading,
    retrievedSectionIds: retrieved.sections.map((section) => section.id),
    guidancePath: retrieved.catalogPath,
  };
}

export const programMetricsBriefTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const deterministic = evaluateProgramMetricsBriefDeterministic(
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

    const expected = parseProgramMetricsBriefExpectedState(
      ticket.expected_state
    );

    try {
      const { grading, retrievedSectionIds, guidancePath } =
        await gradeSelectionWithRubric(deterministic.parsed, ticket, expected);

      const structured: ProgramMetricsBriefStructuredResult = {
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
        const structured: ProgramMetricsBriefStructuredResult = {
          ...deterministic.structured,
          reason: 'grading_unavailable_missing_api_key',
        };
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback:
            'Calculations look correct, but AI grading of metric selection against the program-metrics rubric is unavailable (ANTHROPIC_API_KEY not configured). Ask an admin to enable grading, then resubmit.',
        };
      }

      console.error('Program metrics brief RAG grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'program_metrics_brief_rag_grade',
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
          'Could not grade your metric selection against the pinned program-metrics rubric. Please try again shortly.',
      };
    }
  },
};
