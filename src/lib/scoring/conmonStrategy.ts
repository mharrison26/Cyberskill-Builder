import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildConMonStrategyGradingPrompt } from '@/lib/grading/buildConMonStrategyGradingPrompt';
import { retrieveSp800137Guidance } from '@/lib/nist/getSp800137Guidance';
import { captureFeatureException } from '@/lib/observability/sentry';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import type { Fips199ImpactLevel } from '@/lib/scoring/ticketUi';

/**
 * Tier 3 continuous monitoring strategy memo scoring (ISSO-01 system-level).
 *
 * Deterministic:
 *   - cadence rows for required control families
 *   - tool→family coverage for DefectDojo, CloudSploit, Scuba
 *   - escalation/reporting narrative meets minimum length
 *   - proposed cadences are risk-appropriate to the system's FIPS 199 impact
 *
 * RAG / LLM (F26 pattern):
 *   - retrieve pinned SP 800-137 guidance text
 *   - grade memo against retrieved text only (incl. impact-based frequencies)
 */

export {
  CONMON_STRATEGY_MIN_FIELD_LENGTH,
  CONMON_STRATEGY_MIN_ESCALATION_LENGTH,
  DEFAULT_CONMON_CONTROL_FAMILIES,
  CONMON_TOOLS,
  type ConMonToolName,
} from '@/lib/scoring/ticketUi';
import {
  CONMON_STRATEGY_MIN_FIELD_LENGTH,
  CONMON_STRATEGY_MIN_ESCALATION_LENGTH,
  DEFAULT_CONMON_CONTROL_FAMILIES,
  CONMON_TOOLS,
} from '@/lib/scoring/ticketUi';

/** High-volatility / high-risk families that need tighter monitoring. */
export const CONMON_HIGH_VOLATILITY_FAMILIES = [
  'CM',
  'SI',
  'RA',
] as const;

/** Elevated families tightened further on High-impact systems. */
export const CONMON_ELEVATED_FAMILIES = [
  'AC',
  'AU',
  'IA',
  'SC',
] as const;

/**
 * Max monitoring interval (days) for high-volatility families by impact.
 * SP 800-137: high-impact systems monitored more frequently than moderate/low;
 * volatile controls (e.g. CM) assessed more frequently, preferably automated.
 */
export const CONMON_VOLATILE_MAX_INTERVAL_DAYS: Record<
  Fips199ImpactLevel,
  number
> = {
  high: 7,
  moderate: 31,
  low: 92,
};

/** Max interval for elevated families (AC/AU/IA/SC) by impact. */
export const CONMON_ELEVATED_MAX_INTERVAL_DAYS: Record<
  Fips199ImpactLevel,
  number
> = {
  high: 31,
  moderate: 92,
  low: 365,
};

export type ConMonFamilyCadence = {
  family: string;
  cadence: string;
  rationale: string;
};

export type ConMonToolCoverage = {
  tool: string;
  families: string[];
  rationale: string;
};

export type ConMonStrategyExpectedState = {
  requiredFamilies?: string[];
  requiredTools?: string[];
  minFieldLength?: number;
  minEscalationLength?: number;
  guidanceTopics?: string[];
  topKGuidanceSections?: number;
  /** Override system impact used for cadence appropriateness (low|moderate|high). */
  impactLevel?: Fips199ImpactLevel | string;
  /** Skip deterministic impact-cadence gate (RAG still grades impact factors). */
  skipCadenceAppropriateness?: boolean;
};

export type ConMonStrategySubmission = {
  type?: string;
  familyCadences: ConMonFamilyCadence[];
  toolCoverage: ConMonToolCoverage[];
  escalationReporting: string;
};

export type ConMonCadenceAppropriatenessIssue = {
  family: string;
  cadence: string;
  parsedIntervalDays: number | null;
  maxIntervalDays: number;
  message: string;
};

export type ConMonStrategyStructuredResult = {
  style: 'conmon_strategy';
  familiesCovered: string[];
  missingFamilies: string[];
  toolsCovered: string[];
  missingTools: string[];
  escalationLength: number;
  minEscalationLength: number;
  fieldLengthOk: boolean;
  impactLevel: Fips199ImpactLevel | null;
  cadenceAppropriatenessOk: boolean;
  cadenceIssues: ConMonCadenceAppropriatenessIssue[];
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

function normalizeFamily(family: string): string {
  return family.trim().toUpperCase();
}

function normalizeTool(tool: string): string {
  const trimmed = tool.trim().toLowerCase();
  if (trimmed === 'defectdojo' || trimmed === 'defect dojo')
    return 'DefectDojo';
  if (
    trimmed === 'cloudsploit' ||
    trimmed === 'cloud sploit' ||
    trimmed === 'aqua cloudsploit'
  ) {
    return 'CloudSploit';
  }
  if (trimmed === 'scuba' || trimmed === 'cisa scuba') return 'Scuba';
  return tool.trim();
}

/**
 * Parse FIPS 199 impact from free text like "Moderate (FIPS 199)" or "high".
 */
export function resolveConMonImpactLevel(
  value: unknown
): Fips199ImpactLevel | null {
  if (typeof value !== 'string') return null;
  const lower = value.trim().toLowerCase();
  if (!lower) return null;
  if (/\bhigh\b/.test(lower)) return 'high';
  if (/\bmoderate\b/.test(lower) || /\bmedium\b/.test(lower)) {
    return 'moderate';
  }
  if (/\blow\b/.test(lower)) return 'low';
  return null;
}

/**
 * Resolve system FIPS 199 impact from expected_state override or initial_state.
 */
export function resolveSystemImpactLevel(
  ticket: ScorableTicket
): Fips199ImpactLevel | null {
  const expected = parseConMonStrategyExpectedState(ticket.expected_state);
  const fromExpected = resolveConMonImpactLevel(expected.impactLevel);
  if (fromExpected) return fromExpected;

  const initial = isPlainObject(ticket.initial_state)
    ? ticket.initial_state
    : {};
  const direct =
    resolveConMonImpactLevel(initial.impactLevel) ??
    resolveConMonImpactLevel(initial.impact_level) ??
    resolveConMonImpactLevel(initial.impact);
  if (direct) return direct;

  const profile = initial.systemProfile ?? initial.system_profile;
  if (typeof profile === 'string') {
    return resolveConMonImpactLevel(profile);
  }
  if (isPlainObject(profile)) {
    return (
      resolveConMonImpactLevel(profile.impactLevel) ??
      resolveConMonImpactLevel(profile.impact_level) ??
      resolveConMonImpactLevel(profile.impact) ??
      resolveConMonImpactLevel(profile.fips199) ??
      resolveConMonImpactLevel(profile.categorization)
    );
  }
  return null;
}

/**
 * Infer the most frequent monitoring interval (days) from free-text cadence.
 * Returns null when no recognizable frequency language is present.
 */
export function parseCadenceIntervalDays(cadence: string): number | null {
  const text = cadence.trim().toLowerCase();
  if (!text) return null;

  const matches: number[] = [];

  if (
    /\b(continuous|ongoing|real[\s-]?time|near[\s-]?real[\s-]?time|automated\s+checks?)\b/.test(
      text
    )
  ) {
    matches.push(1);
  }
  if (/\b(daily|every\s+day|each\s+day|24\s*h(ours?)?)\b/.test(text)) {
    matches.push(1);
  }
  if (/\b(weekly|every\s+week|each\s+week)\b/.test(text)) {
    matches.push(7);
  }
  if (
    /\b(bi[\s-]?weekly|every\s+two\s+weeks|fortnightly)\b/.test(text)
  ) {
    matches.push(14);
  }
  if (/\b(monthly|every\s+month|each\s+month)\b/.test(text)) {
    matches.push(31);
  }
  if (/\b(quarterly|every\s+quarter|each\s+quarter)\b/.test(text)) {
    matches.push(92);
  }
  if (
    /\b(semi[\s-]?annual(?:ly)?|bi[\s-]?annual(?:ly)?|twice\s+(a|per)\s+year)\b/.test(
      text
    )
  ) {
    matches.push(183);
  }
  if (/\b(annual(?:ly)?|yearly|every\s+year|once\s+(a|per)\s+year)\b/.test(text)) {
    matches.push(365);
  }

  if (matches.length === 0) return null;
  return Math.min(...matches);
}

function maxIntervalForFamily(
  family: string,
  impact: Fips199ImpactLevel
): number | null {
  const normalized = normalizeFamily(family);
  if (
    (CONMON_HIGH_VOLATILITY_FAMILIES as readonly string[]).includes(normalized)
  ) {
    return CONMON_VOLATILE_MAX_INTERVAL_DAYS[impact];
  }
  if ((CONMON_ELEVATED_FAMILIES as readonly string[]).includes(normalized)) {
    return CONMON_ELEVATED_MAX_INTERVAL_DAYS[impact];
  }
  return null;
}

function intervalLabel(days: number): string {
  if (days <= 1) return 'continuous/daily';
  if (days <= 7) return 'weekly or more frequent';
  if (days <= 14) return 'biweekly or more frequent';
  if (days <= 31) return 'monthly or more frequent';
  if (days <= 92) return 'quarterly or more frequent';
  if (days <= 183) return 'semi-annual or more frequent';
  return 'at least annual';
}

/**
 * Check that family cadences are risk-appropriate for the system's impact level.
 * Only enforces thresholds for volatile/elevated families; others rely on RAG.
 */
export function evaluateCadenceAppropriateness(
  familyCadences: ConMonFamilyCadence[],
  impactLevel: Fips199ImpactLevel | null
): {
  ok: boolean;
  issues: ConMonCadenceAppropriatenessIssue[];
} {
  if (!impactLevel) {
    return { ok: true, issues: [] };
  }

  const issues: ConMonCadenceAppropriatenessIssue[] = [];

  for (const row of familyCadences) {
    const maxDays = maxIntervalForFamily(row.family, impactLevel);
    if (maxDays == null) continue;

    const parsed = parseCadenceIntervalDays(row.cadence);
    if (parsed == null) {
      issues.push({
        family: normalizeFamily(row.family),
        cadence: row.cadence,
        parsedIntervalDays: null,
        maxIntervalDays: maxDays,
        message: `${normalizeFamily(row.family)}: state a clear frequency (e.g. continuous, weekly, monthly) so cadence can be checked against ${impactLevel}-impact expectations (${intervalLabel(maxDays)}).`,
      });
      continue;
    }

    if (parsed > maxDays) {
      issues.push({
        family: normalizeFamily(row.family),
        cadence: row.cadence,
        parsedIntervalDays: parsed,
        maxIntervalDays: maxDays,
        message: `${normalizeFamily(row.family)}: cadence is too infrequent for a ${impactLevel}-impact system (need ${intervalLabel(maxDays)} for this volatile/high-risk family).`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

export function parseConMonStrategyExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): ConMonStrategyExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }
  return expectedState as ConMonStrategyExpectedState;
}

function parseFamilyCadence(raw: unknown): ConMonFamilyCadence | null {
  if (!isPlainObject(raw)) return null;
  const family = asNonEmptyString(raw.family);
  const cadence = asNonEmptyString(raw.cadence);
  const rationale = asNonEmptyString(raw.rationale);
  if (!family || !cadence || !rationale) return null;
  return {
    family: normalizeFamily(family),
    cadence,
    rationale,
  };
}

function parseToolCoverage(raw: unknown): ConMonToolCoverage | null {
  if (!isPlainObject(raw)) return null;
  const toolRaw = asNonEmptyString(raw.tool);
  const rationale = asNonEmptyString(raw.rationale);
  if (!toolRaw || !rationale) return null;

  const familiesRaw =
    raw.families ?? raw.controlFamilies ?? raw.control_families;
  let families: string[] = [];
  if (Array.isArray(familiesRaw)) {
    families = familiesRaw
      .map((entry) => (typeof entry === 'string' ? normalizeFamily(entry) : ''))
      .filter(Boolean);
  } else if (typeof familiesRaw === 'string') {
    families = familiesRaw
      .split(/[,;\s]+/)
      .map((entry) => normalizeFamily(entry))
      .filter(Boolean);
  }

  if (families.length === 0) return null;

  return {
    tool: normalizeTool(toolRaw),
    families,
    rationale,
  };
}

export function extractConMonStrategySubmission(
  submission: TicketSubmission
): ConMonStrategySubmission | null {
  const escalationReporting =
    asNonEmptyString(submission.escalationReporting) ??
    asNonEmptyString(submission.escalation_reporting) ??
    asNonEmptyString(submission.reportingCadence) ??
    asNonEmptyString(submission.reporting_cadence);

  const familyRaw =
    submission.familyCadences ??
    submission.family_cadences ??
    submission.cadences;
  const toolRaw =
    submission.toolCoverage ?? submission.tool_coverage ?? submission.tools;

  if (
    !escalationReporting ||
    !Array.isArray(familyRaw) ||
    !Array.isArray(toolRaw)
  ) {
    return null;
  }

  const familyCadences = familyRaw
    .map(parseFamilyCadence)
    .filter((entry): entry is ConMonFamilyCadence => entry !== null);
  const toolCoverage = toolRaw
    .map(parseToolCoverage)
    .filter((entry): entry is ConMonToolCoverage => entry !== null);

  if (familyCadences.length === 0 || toolCoverage.length === 0) {
    return null;
  }

  return {
    type:
      typeof submission.type === 'string' ? submission.type : 'conmon_strategy',
    familyCadences,
    toolCoverage,
    escalationReporting,
  };
}

function formatFamilyCadences(rows: ConMonFamilyCadence[]): string {
  return rows
    .map(
      (row) =>
        `- ${row.family}: cadence=${row.cadence}; rationale=${row.rationale}`
    )
    .join('\n');
}

function formatToolCoverage(rows: ConMonToolCoverage[]): string {
  return rows
    .map(
      (row) =>
        `- ${row.tool}: families=${row.families.join(', ')}; rationale=${row.rationale}`
    )
    .join('\n');
}

function formatSystemProfile(
  initialState: Record<string, unknown> | null | undefined
): string | undefined {
  if (!isPlainObject(initialState)) return undefined;
  const profile = initialState.systemProfile ?? initialState.system_profile;
  if (typeof profile === 'string' && profile.trim()) {
    return profile.trim();
  }
  if (!isPlainObject(profile)) return undefined;

  const parts: string[] = [];
  for (const [key, value] of Object.entries(profile)) {
    if (typeof value === 'string' && value.trim()) {
      parts.push(`${key}: ${value.trim()}`);
    } else if (Array.isArray(value)) {
      const items = value.filter(
        (entry) => typeof entry === 'string'
      ) as string[];
      if (items.length > 0) {
        parts.push(`${key}: ${items.join(', ')}`);
      }
    }
  }
  return parts.length > 0 ? parts.join('\n') : undefined;
}

export function evaluateConMonStrategyDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: ConMonStrategySubmission | null;
  structured: ConMonStrategyStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseConMonStrategyExpectedState(ticket.expected_state);
  const requiredFamilies = (
    expected.requiredFamilies && expected.requiredFamilies.length > 0
      ? expected.requiredFamilies
      : [...DEFAULT_CONMON_CONTROL_FAMILIES]
  ).map(normalizeFamily);

  const requiredTools = (
    expected.requiredTools && expected.requiredTools.length > 0
      ? expected.requiredTools
      : [...CONMON_TOOLS]
  ).map(normalizeTool);

  const minFieldLength =
    typeof expected.minFieldLength === 'number' &&
    Number.isFinite(expected.minFieldLength) &&
    expected.minFieldLength > 0
      ? Math.floor(expected.minFieldLength)
      : CONMON_STRATEGY_MIN_FIELD_LENGTH;

  const minEscalationLength =
    typeof expected.minEscalationLength === 'number' &&
    Number.isFinite(expected.minEscalationLength) &&
    expected.minEscalationLength > 0
      ? Math.floor(expected.minEscalationLength)
      : CONMON_STRATEGY_MIN_ESCALATION_LENGTH;

  const impactLevel = resolveSystemImpactLevel(ticket);
  const parsed = extractConMonStrategySubmission(submission);

  if (!parsed) {
    const structured: ConMonStrategyStructuredResult = {
      style: 'conmon_strategy',
      familiesCovered: [],
      missingFamilies: requiredFamilies,
      toolsCovered: [],
      missingTools: requiredTools,
      escalationLength: 0,
      minEscalationLength,
      fieldLengthOk: false,
      impactLevel,
      cadenceAppropriatenessOk: false,
      cadenceIssues: [],
      guidancePath: null,
      retrievedSectionIds: [],
      reason: 'missing_fields',
    };
    return {
      parsed: null,
      structured,
      ok: false,
      feedback:
        'Submission must include familyCadences, toolCoverage (DefectDojo, CloudSploit, Scuba), and escalationReporting.',
    };
  }

  const familiesCovered = Array.from(
    new Set(parsed.familyCadences.map((row) => normalizeFamily(row.family)))
  );
  const missingFamilies = requiredFamilies.filter(
    (family) => !familiesCovered.includes(family)
  );

  const shortCadenceFields = parsed.familyCadences.filter(
    (row) =>
      row.cadence.length < minFieldLength ||
      row.rationale.length < minFieldLength
  );

  const toolsCovered = Array.from(
    new Set(parsed.toolCoverage.map((row) => normalizeTool(row.tool)))
  );
  const missingTools = requiredTools.filter(
    (tool) => !toolsCovered.includes(tool)
  );

  const shortToolFields = parsed.toolCoverage.filter(
    (row) => row.rationale.length < minFieldLength || row.families.length === 0
  );

  const escalationLength = parsed.escalationReporting.length;
  const escalationOk = escalationLength >= minEscalationLength;
  const fieldLengthOk =
    shortCadenceFields.length === 0 && shortToolFields.length === 0;

  const skipCadenceCheck = expected.skipCadenceAppropriateness === true;
  const cadenceCheck = skipCadenceCheck
    ? { ok: true, issues: [] as ConMonCadenceAppropriatenessIssue[] }
    : evaluateCadenceAppropriateness(parsed.familyCadences, impactLevel);

  const structured: ConMonStrategyStructuredResult = {
    style: 'conmon_strategy',
    familiesCovered,
    missingFamilies,
    toolsCovered,
    missingTools,
    escalationLength,
    minEscalationLength,
    fieldLengthOk,
    impactLevel,
    cadenceAppropriatenessOk: cadenceCheck.ok,
    cadenceIssues: cadenceCheck.issues,
    guidancePath: null,
    retrievedSectionIds: [],
  };

  if (missingFamilies.length > 0) {
    structured.reason = 'missing_families';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Provide a monitoring cadence for each required control family. Missing: ${missingFamilies.join(', ')}.`,
    };
  }

  if (missingTools.length > 0) {
    structured.reason = 'missing_tools';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Map each required tool to one or more control families. Missing: ${missingTools.join(', ')}.`,
    };
  }

  if (!fieldLengthOk) {
    structured.reason = 'fields_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Expand cadence rationales and tool-coverage rationales to at least ${minFieldLength} characters each.`,
    };
  }

  if (!escalationOk) {
    structured.reason = 'escalation_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Escalation/reporting cadence must be at least ${minEscalationLength} characters. Include audiences, report frequency, and escalation triggers.`,
    };
  }

  if (!cadenceCheck.ok) {
    structured.reason = 'cadence_not_impact_appropriate';
    const detail = cadenceCheck.issues
      .slice(0, 3)
      .map((issue) => issue.message)
      .join(' ');
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Monitoring cadences are not risk-appropriate for this system's ${impactLevel ?? 'stated'} FIPS 199 impact level. ${detail}`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback:
      'Deterministic checks passed. Grading ConMon strategy against SP 800-137 guidance…',
  };
}

async function gradeMemoWithSp800137(
  parsed: ConMonStrategySubmission,
  ticket: ScorableTicket,
  expected: ConMonStrategyExpectedState
): Promise<{
  grading: ClaudeGradingResult;
  retrievedSectionIds: string[];
  guidancePath: string;
}> {
  const query = [
    formatFamilyCadences(parsed.familyCadences),
    formatToolCoverage(parsed.toolCoverage),
    parsed.escalationReporting,
  ].join('\n');

  const requiredSectionIds =
    expected.guidanceTopics && expected.guidanceTopics.length > 0
      ? expected.guidanceTopics
      : undefined;

  const retrieved = retrieveSp800137Guidance(query, {
    topK: expected.topKGuidanceSections ?? 5,
    requiredSectionIds,
  });

  const impactLevel = resolveSystemImpactLevel(ticket);

  const prompt = buildConMonStrategyGradingPrompt(retrieved, {
    familyCadencesText: formatFamilyCadences(parsed.familyCadences),
    toolCoverageText: formatToolCoverage(parsed.toolCoverage),
    escalationReporting: parsed.escalationReporting,
    scenarioBrief: ticket.scenario_brief,
    systemProfileText: formatSystemProfile(ticket.initial_state),
    impactLevel,
  });

  const grading = await callClaudeGrading(prompt);

  return {
    grading,
    retrievedSectionIds: retrieved.sections.map((section) => section.id),
    guidancePath: retrieved.catalogPath,
  };
}

export const conmonStrategyTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const deterministic = evaluateConMonStrategyDeterministic(
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

    const expected = parseConMonStrategyExpectedState(ticket.expected_state);

    try {
      const { grading, retrievedSectionIds, guidancePath } =
        await gradeMemoWithSp800137(deterministic.parsed, ticket, expected);

      const structured: ConMonStrategyStructuredResult = {
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
        const structured: ConMonStrategyStructuredResult = {
          ...deterministic.structured,
          reason: 'grading_unavailable_missing_api_key',
        };
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback:
            'Memo sections look complete, but AI grading against SP 800-137 is unavailable (ANTHROPIC_API_KEY not configured). Ask an admin to enable grading, then resubmit.',
        };
      }

      console.error('ConMon strategy SP 800-137 grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'conmon_strategy_sp800137_grade',
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
          'Could not grade your ConMon strategy against SP 800-137 guidance. Please try again shortly.',
      };
    }
  },
};
