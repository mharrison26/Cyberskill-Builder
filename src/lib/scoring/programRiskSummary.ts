import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

/**
 * Program-level risk rollup / aggregated risk summary (ISSM).
 *
 * Student reviews residual risk ratings across several systems, then selects
 * the top N program risks (risk-weighted) and common themes. Optional short
 * narrative summary is length-gated.
 *
 * Deterministic scoring against a seeded answer key:
 *   - Top risks: ordered exact match to expected_state.topRiskIds when
 *     requireExactTopRiskOrder is true (default); otherwise set equality.
 *   - Themes: order-independent set equality vs expected_state.themeIds.
 *   - Summary: length ≥ minSummaryLength (from expected or initial).
 *   - status = resolved only when all gates pass (and percentage ≥ threshold).
 *
 * Prefer keeping programWeight off the student UI — weights live in the
 * answer key / admin seed; candidates show titles + which systems cite them
 * and per-system scores so students can weight mentally.
 *
 * initial_state:
 *   {
 *     prompt?, program?: { name?, reportingPeriod? },
 *     systems: [{ id, name, overallRating, risks: [{ id, title, severity?,
 *                 likelihood?, score? }] }],
 *     candidateRisks: [{ id, title, programWeight? }],  // weight not shown in UI
 *     candidateThemes: [{ id, label, detail? }],
 *     topN?: number,                                    // default 3
 *     minSummaryLength?: number
 *   }
 *
 * expected_state:
 *   {
 *     topRiskIds: string[],
 *     themeIds: string[],
 *     requireExactTopRiskOrder?: boolean,  // default true
 *     minSummaryLength?: number,
 *     passThresholdPercent?: number        // default 100
 *   }
 *
 * submission:
 *   {
 *     type: 'program_risk_summary' | 'aggregated_risk_summary' |
 *           'issm_program_risk_rollups',
 *     topRiskIds: string[],
 *     themeIds: string[],
 *     summary?: string
 *   }
 */

export const PROGRAM_RISK_SUMMARY_TICKET_TYPES = [
  'program_risk_summary',
  'aggregated_risk_summary',
  'issm_program_risk_rollups',
] as const;

export type ProgramRiskSummaryTicketType =
  (typeof PROGRAM_RISK_SUMMARY_TICKET_TYPES)[number];

export const PROGRAM_RISK_SUMMARY_DEFAULT_TOP_N = 3;
export const PROGRAM_RISK_SUMMARY_DEFAULT_MIN_SUMMARY_LENGTH = 120;

export type ProgramSystemRisk = {
  id: string;
  title: string;
  severity: string;
  likelihood: string;
  score: number | null;
};

export type ProgramRiskSystem = {
  id: string;
  name: string;
  overallRating: string;
  risks: ProgramSystemRisk[];
};

export type ProgramCandidateRisk = {
  id: string;
  title: string;
  /** Internal / admin only — do not surface in student UI. */
  programWeight?: number;
};

export type ProgramCandidateTheme = {
  id: string;
  label: string;
  detail?: string;
};

export type ProgramRiskSummaryExpectedState = {
  topRiskIds: string[];
  themeIds: string[];
  requireExactTopRiskOrder: boolean;
  minSummaryLength: number;
  passThresholdPercent: number;
};

export type ProgramRiskSummarySubmission = {
  type?: string;
  topRiskIds: string[];
  themeIds: string[];
  summary: string;
};

export type ProgramRiskSummaryStructuredResult = {
  style: 'program_risk_summary';
  submittedTopRiskIds: string[];
  expectedTopRiskIds: string[];
  requireExactTopRiskOrder: boolean;
  topRisksOk: boolean;
  topRisksOrderedMatch: boolean;
  topRisksSetMatch: boolean;
  missingTopRiskIds: string[];
  extraTopRiskIds: string[];
  wrongOrderTopRiskIds: string[];
  submittedThemeIds: string[];
  expectedThemeIds: string[];
  themesOk: boolean;
  missingThemeIds: string[];
  extraThemeIds: string[];
  summaryLength: number;
  minSummaryLength: number;
  summaryOk: boolean;
  percentage: number;
  passThresholdPercent: number;
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isProgramRiskSummaryTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (PROGRAM_RISK_SUMMARY_TICKET_TYPES as readonly string[]).includes(
    base
  );
}

function normalizeStringIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of raw) {
    let id = '';
    if (typeof entry === 'string') {
      id = entry.trim();
    } else if (isPlainObject(entry)) {
      const candidate = entry.id ?? entry.riskId ?? entry.themeId;
      if (typeof candidate === 'string') id = candidate.trim();
    }
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function sortIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function setDiff(a: string[], b: string[]): string[] {
  const bSet = new Set(b);
  return a.filter((id) => !bSet.has(id));
}

function setsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((id) => bSet.has(id));
}

function arraysEqualOrdered(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function readPositiveInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return undefined;
}

function readThreshold(value: unknown): number | undefined {
  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
  ) {
    return value;
  }
  return undefined;
}

function asNonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseProgramRiskSystems(
  initialState: Record<string, unknown> | null | undefined
): ProgramRiskSystem[] {
  if (!isPlainObject(initialState)) return [];
  const raw = initialState.systems ?? initialState.systemRisks;
  if (!Array.isArray(raw)) return [];

  const systems: ProgramRiskSystem[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    const id = asNonEmptyString(entry.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const risksRaw = entry.risks ?? entry.residualRisks ?? entry.risk_items;
    const risks: ProgramSystemRisk[] = [];
    if (Array.isArray(risksRaw)) {
      const riskSeen = new Set<string>();
      for (const riskEntry of risksRaw) {
        if (!isPlainObject(riskEntry)) continue;
        const riskId = asNonEmptyString(riskEntry.id);
        if (!riskId || riskSeen.has(riskId)) continue;
        riskSeen.add(riskId);
        const scoreRaw = riskEntry.score ?? riskEntry.riskScore;
        const score =
          typeof scoreRaw === 'number' && Number.isFinite(scoreRaw)
            ? scoreRaw
            : null;
        risks.push({
          id: riskId,
          title:
            asNonEmptyString(riskEntry.title) ||
            asNonEmptyString(riskEntry.name) ||
            riskId,
          severity: asNonEmptyString(riskEntry.severity) || 'unrated',
          likelihood:
            asNonEmptyString(riskEntry.likelihood) ||
            asNonEmptyString(riskEntry.probability) ||
            'unrated',
          score,
        });
      }
    }

    systems.push({
      id,
      name: asNonEmptyString(entry.name) || asNonEmptyString(entry.title) || id,
      overallRating:
        asNonEmptyString(entry.overallRating) ||
        asNonEmptyString(entry.overall_rating) ||
        asNonEmptyString(entry.rating) ||
        'unrated',
      risks,
    });
  }
  return systems;
}

export function parseProgramCandidateRisks(
  initialState: Record<string, unknown> | null | undefined
): ProgramCandidateRisk[] {
  if (!isPlainObject(initialState)) return [];
  const raw =
    initialState.candidateRisks ??
    initialState.candidate_risks ??
    initialState.programRisks;
  if (!Array.isArray(raw)) return [];

  const risks: ProgramCandidateRisk[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    const id = asNonEmptyString(entry.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const weightRaw = entry.programWeight ?? entry.program_weight;
    const programWeight =
      typeof weightRaw === 'number' && Number.isFinite(weightRaw)
        ? weightRaw
        : undefined;
    risks.push({
      id,
      title:
        asNonEmptyString(entry.title) ||
        asNonEmptyString(entry.label) ||
        asNonEmptyString(entry.name) ||
        id,
      programWeight,
    });
  }
  return risks;
}

export function parseProgramCandidateThemes(
  initialState: Record<string, unknown> | null | undefined
): ProgramCandidateTheme[] {
  if (!isPlainObject(initialState)) return [];
  const raw =
    initialState.candidateThemes ??
    initialState.candidate_themes ??
    initialState.themes;
  if (!Array.isArray(raw)) return [];

  const themes: ProgramCandidateTheme[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    const id = asNonEmptyString(entry.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label =
      asNonEmptyString(entry.label) ||
      asNonEmptyString(entry.title) ||
      asNonEmptyString(entry.name) ||
      id;
    const detail =
      asNonEmptyString(entry.detail) ||
      asNonEmptyString(entry.description) ||
      undefined;
    themes.push({
      id,
      label,
      detail: detail || undefined,
    });
  }
  return themes;
}

/** Derive which systems cite each candidate risk (for student rollup table). */
export function buildRiskSystemCitations(
  systems: ProgramRiskSystem[],
  candidateRisks: ProgramCandidateRisk[]
): Array<{
  risk: ProgramCandidateRisk;
  citations: Array<{
    systemId: string;
    systemName: string;
    score: number | null;
    severity: string;
    likelihood: string;
  }>;
  systemsAffected: number;
  scoreSum: number;
}> {
  return candidateRisks.map((risk) => {
    const citations: Array<{
      systemId: string;
      systemName: string;
      score: number | null;
      severity: string;
      likelihood: string;
    }> = [];
    let scoreSum = 0;
    for (const system of systems) {
      const match = system.risks.find((r) => r.id === risk.id);
      if (!match) continue;
      citations.push({
        systemId: system.id,
        systemName: system.name,
        score: match.score,
        severity: match.severity,
        likelihood: match.likelihood,
      });
      if (typeof match.score === 'number') scoreSum += match.score;
    }
    return {
      risk,
      citations,
      systemsAffected: citations.length,
      scoreSum,
    };
  });
}

export function parseProgramRiskSummaryExpectedState(
  expectedState: Record<string, unknown> | null | undefined,
  initialState?: Record<string, unknown> | null
): ProgramRiskSummaryExpectedState | null {
  if (!isPlainObject(expectedState)) return null;

  const topRiskIds = normalizeStringIds(
    expectedState.topRiskIds ??
      expectedState.top_risk_ids ??
      expectedState.expectedTopRiskIds ??
      expectedState.expected_top_risk_ids
  );
  const themeIds = normalizeStringIds(
    expectedState.themeIds ??
      expectedState.theme_ids ??
      expectedState.expectedThemeIds ??
      expectedState.expected_theme_ids ??
      expectedState.requiredThemeIds
  );

  if (topRiskIds.length === 0 || themeIds.length === 0) return null;

  const requireExactTopRiskOrder =
    expectedState.requireExactTopRiskOrder === false ||
    expectedState.require_exact_top_risk_order === false
      ? false
      : true;

  const minFromExpected = readPositiveInt(
    expectedState.minSummaryLength ??
      expectedState.min_summary_length ??
      expectedState.minNarrativeLength
  );
  const minFromInitial = isPlainObject(initialState)
    ? readPositiveInt(
        initialState.minSummaryLength ?? initialState.min_summary_length
      )
    : undefined;

  const passThresholdPercent =
    readThreshold(
      expectedState.passThresholdPercent ??
        expectedState.pass_threshold_percent ??
        expectedState.thresholdPercent
    ) ?? 100;

  return {
    topRiskIds,
    themeIds: sortIds(themeIds),
    requireExactTopRiskOrder,
    minSummaryLength:
      minFromExpected ??
      minFromInitial ??
      PROGRAM_RISK_SUMMARY_DEFAULT_MIN_SUMMARY_LENGTH,
    passThresholdPercent,
  };
}

export function extractProgramRiskSummarySubmission(
  submission: TicketSubmission
): ProgramRiskSummarySubmission | null {
  const hasTopRisks = Array.isArray(
    submission.topRiskIds ??
      submission.top_risk_ids ??
      submission.rankedRiskIds ??
      submission.riskIds
  );
  const hasThemes = Array.isArray(
    submission.themeIds ??
      submission.theme_ids ??
      submission.selectedThemeIds ??
      submission.themes
  );
  if (!hasTopRisks || !hasThemes) return null;

  const topRiskIds = normalizeStringIds(
    submission.topRiskIds ??
      submission.top_risk_ids ??
      submission.rankedRiskIds ??
      submission.riskIds
  );
  const themeIds = normalizeStringIds(
    submission.themeIds ??
      submission.theme_ids ??
      submission.selectedThemeIds ??
      submission.themes
  );

  const summaryRaw =
    submission.summary ??
    submission.narrative ??
    submission.programSummary ??
    submission.program_summary;
  const summary = typeof summaryRaw === 'string' ? summaryRaw.trim() : '';

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'program_risk_summary',
    topRiskIds,
    themeIds,
    summary,
  };
}

function scoreTopRisks(
  submitted: string[],
  expected: string[],
  requireExactOrder: boolean
): {
  topRisksOk: boolean;
  topRisksOrderedMatch: boolean;
  topRisksSetMatch: boolean;
  missingTopRiskIds: string[];
  extraTopRiskIds: string[];
  wrongOrderTopRiskIds: string[];
} {
  const missingTopRiskIds = setDiff(expected, submitted);
  const extraTopRiskIds = setDiff(submitted, expected);
  const topRisksSetMatch =
    missingTopRiskIds.length === 0 && extraTopRiskIds.length === 0;

  const topRisksOrderedMatch = arraysEqualOrdered(submitted, expected);

  const wrongOrderTopRiskIds: string[] = [];
  if (topRisksSetMatch && !topRisksOrderedMatch) {
    for (let i = 0; i < expected.length; i += 1) {
      if (submitted[i] !== expected[i]) {
        wrongOrderTopRiskIds.push(expected[i]!);
      }
    }
  }

  const topRisksOk = requireExactOrder
    ? topRisksOrderedMatch
    : topRisksSetMatch;

  return {
    topRisksOk,
    topRisksOrderedMatch,
    topRisksSetMatch,
    missingTopRiskIds: sortIds(missingTopRiskIds),
    extraTopRiskIds: sortIds(extraTopRiskIds),
    wrongOrderTopRiskIds,
  };
}

export function evaluateProgramRiskSummaryDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: ProgramRiskSummarySubmission | null;
  structured: ProgramRiskSummaryStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const initial = isPlainObject(ticket.initial_state)
    ? ticket.initial_state
    : null;
  const expected = parseProgramRiskSummaryExpectedState(
    ticket.expected_state,
    initial
  );
  const candidates = parseProgramCandidateRisks(initial);
  const themes = parseProgramCandidateThemes(initial);
  const parsed = extractProgramRiskSummarySubmission(submission);

  const structured: ProgramRiskSummaryStructuredResult = {
    style: 'program_risk_summary',
    submittedTopRiskIds: parsed?.topRiskIds ?? [],
    expectedTopRiskIds: expected?.topRiskIds ?? [],
    requireExactTopRiskOrder: expected?.requireExactTopRiskOrder ?? true,
    topRisksOk: false,
    topRisksOrderedMatch: false,
    topRisksSetMatch: false,
    missingTopRiskIds: [],
    extraTopRiskIds: [],
    wrongOrderTopRiskIds: [],
    submittedThemeIds: parsed ? sortIds(parsed.themeIds) : [],
    expectedThemeIds: expected?.themeIds ?? [],
    themesOk: false,
    missingThemeIds: [],
    extraThemeIds: [],
    summaryLength: parsed?.summary.length ?? 0,
    minSummaryLength:
      expected?.minSummaryLength ??
      PROGRAM_RISK_SUMMARY_DEFAULT_MIN_SUMMARY_LENGTH,
    summaryOk: false,
    percentage: 0,
    passThresholdPercent: expected?.passThresholdPercent ?? 100,
  };

  if (!expected) {
    structured.reason = 'misconfigured_expected_state';
    return {
      parsed,
      structured,
      ok: false,
      feedback:
        'This program risk summary ticket is missing topRiskIds or themeIds in expected_state.',
    };
  }

  if (candidates.length === 0 || themes.length === 0) {
    structured.reason = 'misconfigured_initial_state';
    return {
      parsed,
      structured,
      ok: false,
      feedback:
        'This program risk summary ticket is missing candidateRisks or candidateThemes in initial_state.',
    };
  }

  if (!parsed) {
    structured.reason = 'missing_fields';
    return {
      parsed: null,
      structured,
      ok: false,
      feedback:
        'Submission must include topRiskIds (array) and themeIds (array).',
    };
  }

  const candidateRiskSet = new Set(candidates.map((c) => c.id));
  const candidateThemeSet = new Set(themes.map((t) => t.id));

  const unknownRiskIds = parsed.topRiskIds.filter(
    (id) => !candidateRiskSet.has(id)
  );
  if (unknownRiskIds.length > 0) {
    structured.submittedTopRiskIds = parsed.topRiskIds;
    structured.extraTopRiskIds = sortIds(unknownRiskIds);
    structured.reason = 'unknown_risk_ids';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Unknown risk id(s): ${unknownRiskIds.join(', ')}. Select only from the candidate risk list.`,
    };
  }

  const unknownThemeIds = parsed.themeIds.filter(
    (id) => !candidateThemeSet.has(id)
  );
  if (unknownThemeIds.length > 0) {
    structured.submittedThemeIds = sortIds(parsed.themeIds);
    structured.extraThemeIds = sortIds(unknownThemeIds);
    structured.reason = 'unknown_theme_ids';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Unknown theme id(s): ${unknownThemeIds.join(', ')}. Select only from the candidate theme list.`,
    };
  }

  const topRiskScore = scoreTopRisks(
    parsed.topRiskIds,
    expected.topRiskIds,
    expected.requireExactTopRiskOrder
  );

  const submittedThemesSorted = sortIds(parsed.themeIds);
  const missingThemeIds = sortIds(
    setDiff(expected.themeIds, submittedThemesSorted)
  );
  const extraThemeIds = sortIds(
    setDiff(submittedThemesSorted, expected.themeIds)
  );
  const themesOk = setsEqual(submittedThemesSorted, expected.themeIds);

  const summaryLength = parsed.summary.length;
  const summaryOk = summaryLength >= expected.minSummaryLength;

  structured.submittedTopRiskIds = parsed.topRiskIds;
  structured.expectedTopRiskIds = expected.topRiskIds;
  structured.requireExactTopRiskOrder = expected.requireExactTopRiskOrder;
  structured.topRisksOk = topRiskScore.topRisksOk;
  structured.topRisksOrderedMatch = topRiskScore.topRisksOrderedMatch;
  structured.topRisksSetMatch = topRiskScore.topRisksSetMatch;
  structured.missingTopRiskIds = topRiskScore.missingTopRiskIds;
  structured.extraTopRiskIds = topRiskScore.extraTopRiskIds;
  structured.wrongOrderTopRiskIds = topRiskScore.wrongOrderTopRiskIds;
  structured.submittedThemeIds = submittedThemesSorted;
  structured.expectedThemeIds = expected.themeIds;
  structured.themesOk = themesOk;
  structured.missingThemeIds = missingThemeIds;
  structured.extraThemeIds = extraThemeIds;
  structured.summaryLength = summaryLength;
  structured.minSummaryLength = expected.minSummaryLength;
  structured.summaryOk = summaryOk;

  // Three equal gates → percentage for threshold reporting.
  const gatesPassed = [topRiskScore.topRisksOk, themesOk, summaryOk].filter(
    Boolean
  ).length;
  const percentage = Math.round((gatesPassed / 3) * 100);
  structured.percentage = percentage;

  const allGatesOk = topRiskScore.topRisksOk && themesOk && summaryOk;
  const ok = allGatesOk && percentage >= expected.passThresholdPercent;

  if (!topRiskScore.topRisksOk) {
    structured.reason = expected.requireExactTopRiskOrder
      ? topRiskScore.topRisksSetMatch
        ? 'wrong_top_risk_order'
        : 'top_risks_mismatch'
      : 'top_risks_mismatch';
    const parts: string[] = [
      expected.requireExactTopRiskOrder
        ? 'Top program risks must match the risk-weighted ranking in order.'
        : 'Top program risks must match the expected set.',
    ];
    if (topRiskScore.missingTopRiskIds.length > 0) {
      parts.push(`Missing: ${topRiskScore.missingTopRiskIds.join(', ')}.`);
    }
    if (topRiskScore.extraTopRiskIds.length > 0) {
      parts.push(`Extra: ${topRiskScore.extraTopRiskIds.join(', ')}.`);
    }
    if (topRiskScore.wrongOrderTopRiskIds.length > 0) {
      parts.push(
        `Wrong order (expected positions for: ${topRiskScore.wrongOrderTopRiskIds.join(', ')}).`
      );
    }
    return { parsed, structured, ok: false, feedback: parts.join(' ') };
  }

  if (!themesOk) {
    structured.reason = 'themes_mismatch';
    const parts = ['Common themes must match the expected set exactly.'];
    if (missingThemeIds.length > 0) {
      parts.push(`Missing: ${missingThemeIds.join(', ')}.`);
    }
    if (extraThemeIds.length > 0) {
      parts.push(`Extra: ${extraThemeIds.join(', ')}.`);
    }
    return { parsed, structured, ok: false, feedback: parts.join(' ') };
  }

  if (!summaryOk) {
    structured.reason = 'summary_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Program summary must be at least ${expected.minSummaryLength} characters (currently ${summaryLength}).`,
    };
  }

  if (!ok) {
    structured.reason = 'below_threshold';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Program risk summary scored ${percentage}% (need ≥ ${expected.passThresholdPercent}%).`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback: expected.requireExactTopRiskOrder
      ? 'Program risk summary accepted — top risks match the risk-weighted ranking, themes match, and the summary meets the length requirement.'
      : 'Program risk summary accepted — top risks and themes match the answer key, and the summary meets the length requirement.',
  };
}

export const programRiskSummaryTicketScorer: TicketScorer = {
  score(submission, ticket): TicketScoreResult {
    const result = evaluateProgramRiskSummaryDeterministic(submission, ticket);
    return {
      status: result.ok ? 'resolved' : 'needs_revision',
      structuredResult: result.structured,
      feedback: result.feedback,
    };
  },
};
