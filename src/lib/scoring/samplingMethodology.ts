import {
  APPROACH_KEYWORD_PATTERNS,
  RISK_CRITERION_PATTERNS,
  SAMPLING_RISK_CRITERIA,
  isSamplingRiskCriterion,
  type SamplingRiskCriterion,
} from '@/lib/sampling/mockTransactions';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import { SAMPLING_METHODOLOGY_MIN_FIELD_LENGTH } from '@/lib/scoring/ticketUi';

/**
 * Sampling methodology ticket scoring (deterministic only).
 *
 * Students describe how they would select a sample from a presented
 * transaction population and identify risk-based additions. Scoring checks
 * the described methodology against the stated approach in expected_state:
 *   - required sample size mentioned
 *   - approach keywords (e.g. random / statistical)
 *   - risk-based additions discussed
 *   - required risk criteria covered
 *   - min field lengths
 */

export { SAMPLING_METHODOLOGY_MIN_FIELD_LENGTH } from '@/lib/scoring/ticketUi';

export const SAMPLING_METHODOLOGY_TICKET_TYPES = [
  'sampling_methodology',
  'assessment_sampling',
  'transaction_sampling',
] as const;

export type SamplingMethodologyTicketType =
  (typeof SAMPLING_METHODOLOGY_TICKET_TYPES)[number];

export type SamplingMethodologyExpectedState = {
  requiredSampleSize?: number;
  requiredApproachKeywords?: string[];
  requireRiskBasedAdditions?: boolean;
  requiredRiskCriteria?: SamplingRiskCriterion[];
  minMethodologyLength?: number;
  minRiskAdditionsLength?: number;
};

export type SamplingMethodologySubmission = {
  type?: string;
  sampleSelection: string;
  riskBasedAdditions: string;
};

export type SamplingMethodologyStructuredResult = {
  style: 'sampling_methodology';
  requiredSampleSize: number | null;
  sampleSizeMentioned: boolean;
  approachKeywordsRequired: string[];
  approachKeywordsFound: string[];
  approachKeywordsMissing: string[];
  riskBasedRequired: boolean;
  riskBasedMentioned: boolean;
  requiredRiskCriteria: SamplingRiskCriterion[];
  riskCriteriaFound: SamplingRiskCriterion[];
  riskCriteriaMissing: SamplingRiskCriterion[];
  sampleSelectionLength: number;
  riskBasedAdditionsLength: number;
  minMethodologyLength: number;
  minRiskAdditionsLength: number;
  fieldsOk: boolean;
  methodologyOk: boolean;
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const n = Number.parseInt(value.trim(), 10);
    return n > 0 ? n : null;
  }
  return null;
}

function normalizeKeyword(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

export function parseSamplingMethodologyExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): SamplingMethodologyExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }

  const requiredSampleSize =
    readPositiveInt(
      expectedState.requiredSampleSize ?? expectedState.sampleSize
    ) ?? undefined;

  let requiredApproachKeywords: string[] | undefined;
  const rawKeywords =
    expectedState.requiredApproachKeywords ?? expectedState.approachKeywords;
  if (Array.isArray(rawKeywords)) {
    const keywords = rawKeywords
      .filter((item): item is string => typeof item === 'string')
      .map(normalizeKeyword)
      .filter(Boolean);
    if (keywords.length > 0) requiredApproachKeywords = keywords;
  }

  let requiredRiskCriteria: SamplingRiskCriterion[] | undefined;
  const rawCriteria =
    expectedState.requiredRiskCriteria ?? expectedState.riskCriteria;
  if (Array.isArray(rawCriteria)) {
    const criteria = rawCriteria
      .filter((item): item is string => typeof item === 'string')
      .map(normalizeKeyword)
      .filter(isSamplingRiskCriterion);
    if (criteria.length > 0) requiredRiskCriteria = criteria;
  }

  const requireRiskBasedAdditions =
    typeof expectedState.requireRiskBasedAdditions === 'boolean'
      ? expectedState.requireRiskBasedAdditions
      : typeof expectedState.require_risk_based_additions === 'boolean'
        ? expectedState.require_risk_based_additions
        : undefined;

  const minMethodologyLength =
    readPositiveInt(
      expectedState.minMethodologyLength ?? expectedState.minFieldLength
    ) ?? undefined;
  const minRiskAdditionsLength =
    readPositiveInt(expectedState.minRiskAdditionsLength) ?? undefined;

  return {
    requiredSampleSize,
    requiredApproachKeywords,
    requireRiskBasedAdditions,
    requiredRiskCriteria,
    minMethodologyLength,
    minRiskAdditionsLength,
  };
}

export function extractSamplingMethodologySubmission(
  submission: TicketSubmission
): SamplingMethodologySubmission | null {
  const sampleRaw =
    submission.sampleSelection ??
    submission.sample_selection ??
    submission.methodology;
  const riskRaw =
    submission.riskBasedAdditions ??
    submission.risk_based_additions ??
    submission.riskAdditions;

  if (typeof sampleRaw !== 'string' || typeof riskRaw !== 'string') {
    return null;
  }

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'sampling_methodology',
    sampleSelection: sampleRaw.trim(),
    riskBasedAdditions: riskRaw.trim(),
  };
}

function mentionsSampleSize(text: string, sampleSize: number): boolean {
  const escaped = String(sampleSize);
  const patterns = [
    new RegExp(`\\b${escaped}\\b`),
    new RegExp(`\\bn\\s*=\\s*${escaped}\\b`, 'i'),
    new RegExp(`sample\\s*size\\s*(of\\s*|:\\s*| =\\s*)?${escaped}\\b`, 'i'),
    new RegExp(`\\b${escaped}\\s*(transactions?|items?|selections?)\\b`, 'i'),
  ];
  return patterns.some((re) => re.test(text));
}

function findApproachKeywords(
  text: string,
  required: string[]
): { found: string[]; missing: string[] } {
  const found: string[] = [];
  const missing: string[] = [];

  for (const keyword of required) {
    const pattern =
      APPROACH_KEYWORD_PATTERNS[keyword] ??
      new RegExp(`\\b${keyword.replace(/_/g, '[\\s-]?')}\\b`, 'i');
    if (pattern.test(text)) {
      found.push(keyword);
    } else {
      missing.push(keyword);
    }
  }

  return { found, missing };
}

function findRiskCriteria(
  text: string,
  required: SamplingRiskCriterion[]
): {
  found: SamplingRiskCriterion[];
  missing: SamplingRiskCriterion[];
} {
  const found: SamplingRiskCriterion[] = [];
  const missing: SamplingRiskCriterion[] = [];

  for (const criterion of required) {
    if (RISK_CRITERION_PATTERNS[criterion].test(text)) {
      found.push(criterion);
    } else {
      missing.push(criterion);
    }
  }

  return { found, missing };
}

export function evaluateSamplingMethodologyDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: SamplingMethodologySubmission | null;
  structured: SamplingMethodologyStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseSamplingMethodologyExpectedState(ticket.expected_state);
  const minMethodologyLength =
    expected.minMethodologyLength ?? SAMPLING_METHODOLOGY_MIN_FIELD_LENGTH;
  const minRiskAdditionsLength =
    expected.minRiskAdditionsLength ?? SAMPLING_METHODOLOGY_MIN_FIELD_LENGTH;
  const requiredSampleSize = expected.requiredSampleSize ?? null;
  const approachKeywordsRequired = expected.requiredApproachKeywords ?? [
    'random',
    'statistical',
  ];
  const riskBasedRequired = expected.requireRiskBasedAdditions !== false;
  const requiredRiskCriteria = expected.requiredRiskCriteria ?? [
    ...SAMPLING_RISK_CRITERIA,
  ];

  const parsed = extractSamplingMethodologySubmission(submission);

  const emptyStructured = (
    reason: string,
    extras: Partial<SamplingMethodologyStructuredResult> = {}
  ): SamplingMethodologyStructuredResult => ({
    style: 'sampling_methodology',
    requiredSampleSize,
    sampleSizeMentioned: false,
    approachKeywordsRequired,
    approachKeywordsFound: [],
    approachKeywordsMissing: approachKeywordsRequired,
    riskBasedRequired,
    riskBasedMentioned: false,
    requiredRiskCriteria,
    riskCriteriaFound: [],
    riskCriteriaMissing: requiredRiskCriteria,
    sampleSelectionLength: 0,
    riskBasedAdditionsLength: 0,
    minMethodologyLength,
    minRiskAdditionsLength,
    fieldsOk: false,
    methodologyOk: false,
    reason,
    ...extras,
  });

  if (!parsed) {
    return {
      parsed: null,
      structured: emptyStructured('missing_fields'),
      ok: false,
      feedback:
        'Submission must include sampleSelection and riskBasedAdditions fields.',
    };
  }

  const sampleSelectionLength = parsed.sampleSelection.length;
  const riskBasedAdditionsLength = parsed.riskBasedAdditions.length;
  const tooShort: string[] = [];
  if (sampleSelectionLength < minMethodologyLength) {
    tooShort.push('sampleSelection');
  }
  if (riskBasedAdditionsLength < minRiskAdditionsLength) {
    tooShort.push('riskBasedAdditions');
  }

  const combined = `${parsed.sampleSelection}\n${parsed.riskBasedAdditions}`;
  const sampleSizeMentioned =
    requiredSampleSize === null
      ? true
      : mentionsSampleSize(parsed.sampleSelection, requiredSampleSize) ||
        mentionsSampleSize(combined, requiredSampleSize);

  const { found: approachKeywordsFound, missing: approachKeywordsMissing } =
    findApproachKeywords(parsed.sampleSelection, approachKeywordsRequired);

  const riskBasedMentioned =
    APPROACH_KEYWORD_PATTERNS.risk_based!.test(combined);

  const { found: riskCriteriaFound, missing: riskCriteriaMissing } =
    findRiskCriteria(parsed.riskBasedAdditions, requiredRiskCriteria);

  const fieldsOk = tooShort.length === 0;
  const methodologyOk =
    fieldsOk &&
    sampleSizeMentioned &&
    approachKeywordsMissing.length === 0 &&
    (!riskBasedRequired || riskBasedMentioned) &&
    riskCriteriaMissing.length === 0;

  const structured: SamplingMethodologyStructuredResult = {
    style: 'sampling_methodology',
    requiredSampleSize,
    sampleSizeMentioned,
    approachKeywordsRequired,
    approachKeywordsFound,
    approachKeywordsMissing,
    riskBasedRequired,
    riskBasedMentioned,
    requiredRiskCriteria,
    riskCriteriaFound,
    riskCriteriaMissing,
    sampleSelectionLength,
    riskBasedAdditionsLength,
    minMethodologyLength,
    minRiskAdditionsLength,
    fieldsOk,
    methodologyOk,
  };

  if (!fieldsOk) {
    structured.reason = 'fields_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Expand these fields (min lengths apply): ${tooShort.join(', ')}.`,
    };
  }

  const gaps: string[] = [];
  if (!sampleSizeMentioned && requiredSampleSize !== null) {
    gaps.push(`mention the required sample size (${requiredSampleSize})`);
  }
  if (approachKeywordsMissing.length > 0) {
    gaps.push(
      `describe the stated approach using: ${approachKeywordsMissing.join(', ')}`
    );
  }
  if (riskBasedRequired && !riskBasedMentioned) {
    gaps.push('explicitly call for risk-based (or judgmental) additions');
  }
  if (riskCriteriaMissing.length > 0) {
    gaps.push(
      `cover these risk criteria in risk-based additions: ${riskCriteriaMissing.join(', ')}`
    );
  }

  if (gaps.length > 0) {
    structured.reason = 'methodology_gaps';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Methodology does not yet meet the stated approach. Please ${gaps.join('; ')}.`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback:
      'Sampling methodology matches the stated approach: statistical/random sample size, plus risk-based additions covering the required high-risk attributes.',
  };
}

export const samplingMethodologyTicketScorer: TicketScorer = {
  score(submission, ticket): TicketScoreResult {
    const result = evaluateSamplingMethodologyDeterministic(submission, ticket);

    return {
      status: result.ok ? 'resolved' : 'needs_revision',
      structuredResult: result.structured,
      feedback: result.feedback,
    };
  },
};
