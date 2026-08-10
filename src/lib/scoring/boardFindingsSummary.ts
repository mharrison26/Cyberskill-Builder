import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildBoardFindingsSummaryGradingPrompt } from '@/lib/grading/buildBoardFindingsSummaryGradingPrompt';
import { retrieveBoardCommunicationGuidance } from '@/lib/grc/getBoardCommunicationGuidance';
import { captureFeatureException } from '@/lib/observability/sentry';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import {
  BOARD_FINDINGS_ASK_TYPES,
  BOARD_FINDINGS_MIN_ASK_STATEMENT_LENGTH,
  BOARD_FINDINGS_SUMMARY_MAX_LENGTH,
  BOARD_FINDINGS_SUMMARY_MIN_LENGTH,
  isBoardFindingsSummaryTicketType,
  type BoardFindingsAskType,
} from '@/lib/scoring/ticketUi';

/**
 * Board findings summary scoring.
 *
 * Student translates 3–4 technical GRC/ISSO findings into a one-page
 * board-level summary with plain language, business impact, and a clear ask.
 *
 * Deterministic:
 *   - summary length in [min, max]
 *   - askType present and allowed (budget | decision | awareness)
 *   - optional askStatement min length when provided / required
 *
 * RAG / LLM (F26 pattern):
 *   - retrieve pinned board-communication rubric
 *   - grade against retrieved text only (plain language, impact, clear ask)
 */

export {
  BOARD_FINDINGS_ASK_TYPES,
  BOARD_FINDINGS_MIN_ASK_STATEMENT_LENGTH,
  BOARD_FINDINGS_SUMMARY_MAX_LENGTH,
  BOARD_FINDINGS_SUMMARY_MIN_LENGTH,
  isBoardFindingsSummaryTicketType,
  type BoardFindingsAskType,
} from '@/lib/scoring/ticketUi';

export const BOARD_FINDINGS_SUMMARY_TICKET_TYPES = [
  'board_findings_summary',
  'board_level_summary',
  'technical_to_board_brief',
] as const;

export type BoardFindingsSummaryTicketType =
  (typeof BOARD_FINDINGS_SUMMARY_TICKET_TYPES)[number];

export type BoardFindingsSummaryExpectedState = {
  minSummaryLength?: number;
  maxSummaryLength?: number;
  requireAskType?: boolean;
  acceptableAskTypes?: BoardFindingsAskType[];
  requireAskStatement?: boolean;
  minAskStatementLength?: number;
  guidanceTopics?: string[];
  requiredThemes?: string[];
  topKGuidanceSections?: number;
};

export type BoardFindingsSummarySubmission = {
  type?: string;
  summary: string;
  askType: BoardFindingsAskType;
  askStatement?: string;
};

export type BoardFindingsSummaryStructuredResult = {
  style: 'board_findings_summary';
  summaryLength: number;
  minSummaryLength: number;
  maxSummaryLength: number;
  summaryLengthOk: boolean;
  askType: BoardFindingsAskType | null;
  askTypeOk: boolean;
  askStatementLength: number;
  askStatementOk: boolean;
  acceptableAskTypes: BoardFindingsAskType[];
  requiredThemes: string[];
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

function readPositiveInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return undefined;
}

function normalizeAskType(value: unknown): BoardFindingsAskType | null {
  if (typeof value !== 'string') return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if ((BOARD_FINDINGS_ASK_TYPES as readonly string[]).includes(normalized)) {
    return normalized as BoardFindingsAskType;
  }
  return null;
}

function parseAskTypes(raw: unknown): BoardFindingsAskType[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const types = raw
    .map((item) => normalizeAskType(item))
    .filter((item): item is BoardFindingsAskType => item !== null);
  return types.length > 0 ? Array.from(new Set(types)) : undefined;
}

function parseStringList(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items = raw
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

export function parseBoardFindingsSummaryExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): BoardFindingsSummaryExpectedState {
  if (!isPlainObject(expectedState)) return {};

  const minSummaryLength =
    readPositiveInt(expectedState.minSummaryLength) ??
    readPositiveInt(expectedState.min_summary_length);
  const maxSummaryLength =
    readPositiveInt(expectedState.maxSummaryLength) ??
    readPositiveInt(expectedState.max_summary_length);

  const requireAskTypeRaw =
    expectedState.requireAskType ?? expectedState.require_ask_type;
  const requireAskType =
    typeof requireAskTypeRaw === 'boolean' ? requireAskTypeRaw : undefined;

  const requireAskStatementRaw =
    expectedState.requireAskStatement ?? expectedState.require_ask_statement;
  const requireAskStatement =
    typeof requireAskStatementRaw === 'boolean'
      ? requireAskStatementRaw
      : undefined;

  return {
    minSummaryLength,
    maxSummaryLength,
    requireAskType,
    acceptableAskTypes: parseAskTypes(
      expectedState.acceptableAskTypes ?? expectedState.acceptable_ask_types
    ),
    requireAskStatement,
    minAskStatementLength:
      readPositiveInt(expectedState.minAskStatementLength) ??
      readPositiveInt(expectedState.min_ask_statement_length),
    guidanceTopics: parseStringList(
      expectedState.guidanceTopics ?? expectedState.guidance_topics
    ),
    requiredThemes: parseStringList(
      expectedState.requiredThemes ??
        expectedState.required_themes ??
        expectedState.expectedThemes
    ),
    topKGuidanceSections:
      readPositiveInt(expectedState.topKGuidanceSections) ??
      readPositiveInt(expectedState.top_k_guidance_sections),
  };
}

export function extractBoardFindingsSummarySubmission(
  submission: TicketSubmission
): BoardFindingsSummarySubmission | null {
  const summary =
    asNonEmptyString(submission.summary) ??
    asNonEmptyString(submission.boardSummary) ??
    asNonEmptyString(submission.board_summary) ??
    asNonEmptyString(submission.executiveSummary) ??
    asNonEmptyString(submission.executive_summary) ??
    asNonEmptyString(submission.body);

  const askType = normalizeAskType(
    submission.askType ?? submission.ask_type ?? submission.ask
  );

  if (!summary || !askType) return null;

  const askStatement =
    asNonEmptyString(submission.askStatement) ??
    asNonEmptyString(submission.ask_statement) ??
    undefined;

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'board_findings_summary',
    summary,
    askType,
    ...(askStatement ? { askStatement } : {}),
  };
}

function formatOrganizationText(
  initialState: Record<string, unknown> | null | undefined
): string | undefined {
  if (!isPlainObject(initialState)) return undefined;

  const org = isPlainObject(initialState.organization)
    ? initialState.organization
    : isPlainObject(initialState.org)
      ? initialState.org
      : null;

  if (!org) {
    if (typeof initialState.organization === 'string') {
      return initialState.organization.trim() || undefined;
    }
    return undefined;
  }

  const parts: string[] = [];
  for (const key of ['name', 'context', 'industry', 'size'] as const) {
    const value = org[key];
    if (typeof value === 'string' && value.trim()) {
      parts.push(`${key}: ${value.trim()}`);
    }
  }
  return parts.length > 0 ? parts.join('\n') : undefined;
}

function formatAudience(
  initialState: Record<string, unknown> | null | undefined
): string | undefined {
  if (!isPlainObject(initialState)) return undefined;
  return (
    asNonEmptyString(initialState.audience) ??
    asNonEmptyString(initialState.audienceLabel) ??
    undefined
  );
}

export function formatTechnicalFindingsNarrative(
  initialState: Record<string, unknown> | null | undefined
): string {
  if (!isPlainObject(initialState)) return '';

  const raw = initialState.findings ?? initialState.technicalFindings;
  if (!Array.isArray(raw) || raw.length === 0) return '';

  return raw
    .map((entry, index) => {
      if (!isPlainObject(entry)) return null;
      const id =
        asNonEmptyString(entry.id) ??
        asNonEmptyString(entry.findingId) ??
        `f${index + 1}`;
      const title =
        asNonEmptyString(entry.technicalTitle) ??
        asNonEmptyString(entry.title) ??
        id;
      const detail =
        asNonEmptyString(entry.technicalDetail) ??
        asNonEmptyString(entry.detail) ??
        asNonEmptyString(entry.summary) ??
        '';
      const source = asNonEmptyString(entry.source);
      const lines = [`### ${id} — ${title}`, detail];
      if (source) lines.push(`Source: ${source}`);
      return lines.filter(Boolean).join('\n');
    })
    .filter((block): block is string => Boolean(block))
    .join('\n\n');
}

export function evaluateBoardFindingsSummaryDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: BoardFindingsSummarySubmission | null;
  structured: BoardFindingsSummaryStructuredResult;
  ok: boolean;
  feedback: string;
} {
  // Keep recognizer referenced for tree-shaking / type wiring.
  void isBoardFindingsSummaryTicketType(ticket.ticket_type);

  const expected = parseBoardFindingsSummaryExpectedState(
    ticket.expected_state
  );
  const minSummaryLength =
    expected.minSummaryLength ?? BOARD_FINDINGS_SUMMARY_MIN_LENGTH;
  const maxSummaryLength =
    expected.maxSummaryLength ?? BOARD_FINDINGS_SUMMARY_MAX_LENGTH;
  const acceptableAskTypes = expected.acceptableAskTypes ?? [
    ...BOARD_FINDINGS_ASK_TYPES,
  ];
  const requireAskType = expected.requireAskType !== false;
  const requireAskStatement = expected.requireAskStatement === true;
  const minAskStatementLength =
    expected.minAskStatementLength ?? BOARD_FINDINGS_MIN_ASK_STATEMENT_LENGTH;
  const requiredThemes = expected.requiredThemes ?? [];

  const parsed = extractBoardFindingsSummarySubmission(submission);

  const baseStructured: BoardFindingsSummaryStructuredResult = {
    style: 'board_findings_summary',
    summaryLength: parsed?.summary.length ?? 0,
    minSummaryLength,
    maxSummaryLength,
    summaryLengthOk: false,
    askType: parsed?.askType ?? null,
    askTypeOk: false,
    askStatementLength: parsed?.askStatement?.length ?? 0,
    askStatementOk: !requireAskStatement,
    acceptableAskTypes,
    requiredThemes,
    guidancePath: null,
    retrievedSectionIds: [],
  };

  if (!parsed) {
    return {
      parsed: null,
      structured: { ...baseStructured, reason: 'missing_fields' },
      ok: false,
      feedback:
        'Submission must include a board summary and an ask type (budget, decision, or awareness).',
    };
  }

  const summaryLength = parsed.summary.length;
  const summaryLengthOk =
    summaryLength >= minSummaryLength && summaryLength <= maxSummaryLength;
  const askTypeOk =
    !requireAskType || acceptableAskTypes.includes(parsed.askType);

  const askStatement = parsed.askStatement;
  let askStatementOk = true;
  if (requireAskStatement && !askStatement) {
    askStatementOk = false;
  } else if (askStatement && askStatement.length < minAskStatementLength) {
    askStatementOk = false;
  }

  const structured: BoardFindingsSummaryStructuredResult = {
    ...baseStructured,
    summaryLength,
    summaryLengthOk,
    askType: parsed.askType,
    askTypeOk,
    askStatementLength: askStatement?.length ?? 0,
    askStatementOk,
  };

  if (!summaryLengthOk) {
    if (summaryLength < minSummaryLength) {
      structured.reason = 'summary_too_short';
      return {
        parsed,
        structured,
        ok: false,
        feedback: `Board summary must be at least ${minSummaryLength} characters (currently ${summaryLength}). Expand plain-language framing, business impact, and a clear ask.`,
      };
    }
    structured.reason = 'summary_too_long';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Board summary must stay within one page (max ${maxSummaryLength} characters; currently ${summaryLength}). Tighten jargon translations and keep the ask crisp.`,
    };
  }

  if (!askTypeOk) {
    structured.reason = 'invalid_ask_type';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Select a valid ask type: ${acceptableAskTypes.join(', ')}.`,
    };
  }

  if (!askStatementOk) {
    structured.reason = requireAskStatement
      ? 'ask_statement_missing'
      : 'ask_statement_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: requireAskStatement
        ? `Include an explicit ask statement of at least ${minAskStatementLength} characters.`
        : `Ask statement must be at least ${minAskStatementLength} characters when provided.`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback:
      'Deterministic checks passed. Grading board summary against pinned communication rubric…',
  };
}

async function gradeSummaryWithGuidance(
  parsed: BoardFindingsSummarySubmission,
  ticket: ScorableTicket,
  expected: BoardFindingsSummaryExpectedState
): Promise<{
  grading: ClaudeGradingResult;
  retrievedSectionIds: string[];
  guidancePath: string;
}> {
  const findingsNarrative = formatTechnicalFindingsNarrative(
    ticket.initial_state
  );
  const query = [
    parsed.summary,
    parsed.askType,
    parsed.askStatement,
    findingsNarrative,
    ticket.scenario_brief,
  ]
    .filter(Boolean)
    .join('\n');

  const requiredSectionIds =
    expected.guidanceTopics && expected.guidanceTopics.length > 0
      ? expected.guidanceTopics
      : undefined;

  const retrieved = retrieveBoardCommunicationGuidance(query, {
    topK: expected.topKGuidanceSections ?? 5,
    requiredSectionIds,
  });

  const prompt = buildBoardFindingsSummaryGradingPrompt(retrieved, {
    summary: parsed.summary,
    askType: parsed.askType,
    askStatement: parsed.askStatement,
    technicalFindingsNarrative: findingsNarrative || undefined,
    scenarioBrief: ticket.scenario_brief,
    organizationText: formatOrganizationText(ticket.initial_state),
    audience: formatAudience(ticket.initial_state),
    requiredThemes: expected.requiredThemes,
  });

  const grading = await callClaudeGrading(prompt);

  return {
    grading,
    retrievedSectionIds: retrieved.sections.map((section) => section.id),
    guidancePath: retrieved.catalogPath,
  };
}

export function createBoardFindingsSummaryTicketScorer(): TicketScorer {
  return {
    async score(submission, ticket): Promise<TicketScoreResult> {
      const deterministic = evaluateBoardFindingsSummaryDeterministic(
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

      const expected = parseBoardFindingsSummaryExpectedState(
        ticket.expected_state
      );

      try {
        const { grading, retrievedSectionIds, guidancePath } =
          await gradeSummaryWithGuidance(
            deterministic.parsed,
            ticket,
            expected
          );

        const structured: BoardFindingsSummaryStructuredResult = {
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
          return {
            status: 'needs_revision',
            structuredResult: {
              ...deterministic.structured,
              reason: 'grading_unavailable_missing_api_key',
            },
            feedback:
              'Summary length and ask type look good, but AI grading against the pinned board-communication rubric is unavailable (ANTHROPIC_API_KEY not configured). Ask an admin to enable grading, then resubmit.',
          };
        }

        console.error('Board findings summary RAG grading failed:', error);
        captureFeatureException(error, {
          feature: 'scoring',
          pi: 'PI-07',
          operation: 'board_findings_summary_rag_grade',
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
            'Could not grade your board summary against the pinned communication rubric. Please try again shortly.',
        };
      }
    },
  };
}

export const boardFindingsSummaryTicketScorer: TicketScorer =
  createBoardFindingsSummaryTicketScorer();
