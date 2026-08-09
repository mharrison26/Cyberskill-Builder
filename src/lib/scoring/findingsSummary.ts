import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import { FINDINGS_SUMMARY_MIN_FIELD_LENGTH } from '@/lib/scoring/ticketUi';

/**
 * Engagement findings summary scoring (PI-02 final stage).
 *
 * Deterministic:
 *   - executiveSummary, findingsDetail, recommendations present + min length
 *   - optional requiredThemes: each theme string (or keyword) must appear in
 *     the combined narrative (case-insensitive)
 */

export { FINDINGS_SUMMARY_MIN_FIELD_LENGTH } from '@/lib/scoring/ticketUi';

export const FINDINGS_SUMMARY_TICKET_TYPES = [
  'findings_summary',
  'engagement_findings',
] as const;

export type FindingsSummaryTicketType =
  (typeof FINDINGS_SUMMARY_TICKET_TYPES)[number];

export type FindingsSummaryExpectedState = {
  minFieldLength?: number;
  /** Themes / keywords that must appear somewhere in the summary narrative. */
  requiredThemes?: string[];
};

export type FindingsSummarySubmission = {
  type?: string;
  executiveSummary: string;
  findingsDetail: string;
  recommendations: string;
};

export type FindingsSummaryStructuredResult = {
  style: 'findings_summary';
  executiveSummaryLength: number;
  findingsDetailLength: number;
  recommendationsLength: number;
  minFieldLength: number;
  fieldsOk: boolean;
  requiredThemes: string[];
  themesFound: string[];
  themesMissing: string[];
  themesOk: boolean;
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isFindingsSummaryTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (FINDINGS_SUMMARY_TICKET_TYPES as readonly string[]).includes(base);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function parseFindingsSummaryExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): FindingsSummaryExpectedState {
  if (!isPlainObject(expectedState)) return {};

  const min = expectedState.minFieldLength;
  let requiredThemes: string[] | undefined;
  const raw =
    expectedState.requiredThemes ??
    expectedState.required_themes ??
    expectedState.expectedThemes;
  if (Array.isArray(raw)) {
    const themes = raw
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.trim())
      .filter(Boolean);
    if (themes.length > 0) requiredThemes = themes;
  }

  return {
    minFieldLength:
      typeof min === 'number' && Number.isFinite(min) && min > 0
        ? Math.floor(min)
        : undefined,
    requiredThemes,
  };
}

export function extractFindingsSummarySubmission(
  submission: TicketSubmission
): FindingsSummarySubmission | null {
  const executiveSummary =
    asNonEmptyString(submission.executiveSummary) ??
    asNonEmptyString(submission.executive_summary);
  const findingsDetail =
    asNonEmptyString(submission.findingsDetail) ??
    asNonEmptyString(submission.findings_detail) ??
    asNonEmptyString(submission.findings);
  const recommendations = asNonEmptyString(submission.recommendations);

  if (!executiveSummary || !findingsDetail || !recommendations) {
    return null;
  }

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'findings_summary',
    executiveSummary,
    findingsDetail,
    recommendations,
  };
}

function findThemes(
  haystack: string,
  themes: string[]
): { found: string[]; missing: string[] } {
  const lower = haystack.toLowerCase();
  const found: string[] = [];
  const missing: string[] = [];
  for (const theme of themes) {
    if (lower.includes(theme.toLowerCase())) {
      found.push(theme);
    } else {
      missing.push(theme);
    }
  }
  return { found, missing };
}

export function evaluateFindingsSummaryDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: FindingsSummarySubmission | null;
  structured: FindingsSummaryStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseFindingsSummaryExpectedState(ticket.expected_state);
  const minFieldLength =
    expected.minFieldLength ?? FINDINGS_SUMMARY_MIN_FIELD_LENGTH;
  const requiredThemes = expected.requiredThemes ?? [];
  const parsed = extractFindingsSummarySubmission(submission);

  if (!parsed) {
    const structured: FindingsSummaryStructuredResult = {
      style: 'findings_summary',
      executiveSummaryLength: 0,
      findingsDetailLength: 0,
      recommendationsLength: 0,
      minFieldLength,
      fieldsOk: false,
      requiredThemes,
      themesFound: [],
      themesMissing: requiredThemes,
      themesOk: requiredThemes.length === 0,
      reason: 'missing_fields',
    };
    return {
      parsed: null,
      structured,
      ok: false,
      feedback:
        'Findings summary must include executive summary, findings detail, and recommendations.',
    };
  }

  const lengths = {
    executiveSummaryLength: parsed.executiveSummary.length,
    findingsDetailLength: parsed.findingsDetail.length,
    recommendationsLength: parsed.recommendations.length,
  };

  const shortFields = (
    [
      ['executiveSummary', lengths.executiveSummaryLength],
      ['findingsDetail', lengths.findingsDetailLength],
      ['recommendations', lengths.recommendationsLength],
    ] as const
  ).filter(([, len]) => len < minFieldLength);

  const fieldsOk = shortFields.length === 0;
  const combined = [
    parsed.executiveSummary,
    parsed.findingsDetail,
    parsed.recommendations,
  ].join('\n');
  const { found: themesFound, missing: themesMissing } = findThemes(
    combined,
    requiredThemes
  );
  const themesOk = themesMissing.length === 0;

  const structured: FindingsSummaryStructuredResult = {
    style: 'findings_summary',
    ...lengths,
    minFieldLength,
    fieldsOk,
    requiredThemes,
    themesFound,
    themesMissing,
    themesOk,
  };

  if (!fieldsOk) {
    structured.reason = 'fields_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Each findings section must be at least ${minFieldLength} characters. Short: ${shortFields
        .map(([name]) => name)
        .join(', ')}.`,
    };
  }

  if (!themesOk) {
    structured.reason = 'missing_themes';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Findings summary should address these engagement themes: ${themesMissing.join(
        ', '
      )}.`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback:
      'Findings summary is complete and covers the expected engagement themes.',
  };
}

export const findingsSummaryTicketScorer: TicketScorer = {
  score(submission, ticket): TicketScoreResult {
    const result = evaluateFindingsSummaryDeterministic(submission, ticket);
    return {
      status: result.ok ? 'resolved' : 'needs_revision',
      structuredResult: result.structured,
      feedback: result.feedback,
    };
  },
};
