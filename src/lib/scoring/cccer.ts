import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildCccerFindingGradingPrompt } from '@/lib/grading/buildCccerFindingGradingPrompt';
import { retrieveAuditFindingCccerGuidance } from '@/lib/grc/getAuditFindingCccerGuidance';
import { captureFeatureException } from '@/lib/observability/sentry';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import { CCCER_MIN_FIELD_LENGTH } from '@/lib/scoring/ticketUi';
import type { CCCERValues } from '@/types';

/**
 * CCCER audit-exception write-up scoring (upgrades the former completeness stub).
 *
 * Deterministic:
 *   - all five CCCER fields present + min length (non-trivial)
 *
 * RAG / LLM (F26 pattern):
 *   - retrieve pinned IIA/GAO finding-writing guidance
 *   - grade CCCER against retrieved text + ticket exception context only
 */

export { CCCER_MIN_FIELD_LENGTH } from '@/lib/scoring/ticketUi';

export const CCCER_TICKET_TYPES = [
  'cccer',
  'cccer_exception',
  'audit_finding_cccer',
] as const;

export type CccerTicketType = (typeof CCCER_TICKET_TYPES)[number];

export const CCCER_FIELD_KEYS: (keyof CCCERValues)[] = [
  'condition',
  'criteria',
  'cause',
  'effect',
  'recommendation',
];

export type CccerExpectedState = {
  minFieldLength?: number;
  guidanceTopics?: string[];
  topKGuidanceSections?: number;
};

export type CccerSubmission = CCCERValues & {
  type?: string;
};

export type CccerStructuredResult = {
  style: 'cccer';
  lengths: Record<keyof CCCERValues, number>;
  missing: (keyof CCCERValues)[];
  tooShort: (keyof CCCERValues)[];
  minFieldLength: number;
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

export function isCccerTicketType(ticketType: string): boolean {
  const t = ticketType.trim().toLowerCase();
  const base = t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
  return (CCCER_TICKET_TYPES as readonly string[]).includes(base);
}

export function parseCccerExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): CccerExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }
  return expectedState as CccerExpectedState;
}

export function extractCccerSubmission(
  submission: TicketSubmission
): CccerSubmission | null {
  const condition = asNonEmptyString(submission.condition);
  const criteria = asNonEmptyString(submission.criteria);
  const cause = asNonEmptyString(submission.cause);
  const effect = asNonEmptyString(submission.effect);
  const recommendation = asNonEmptyString(submission.recommendation);

  if (!condition || !criteria || !cause || !effect || !recommendation) {
    return null;
  }

  return {
    type: typeof submission.type === 'string' ? submission.type : 'cccer',
    condition,
    criteria,
    cause,
    effect,
    recommendation,
  };
}

function emptyLengths(): Record<keyof CCCERValues, number> {
  return {
    condition: 0,
    criteria: 0,
    cause: 0,
    effect: 0,
    recommendation: 0,
  };
}

function formatExceptionContext(
  initialState: Record<string, unknown> | null | undefined
): string | undefined {
  if (!isPlainObject(initialState)) return undefined;

  const parts: string[] = [];

  const prompt = asNonEmptyString(initialState.prompt);
  if (prompt) parts.push(`Prompt: ${prompt}`);

  const controlObjective = asNonEmptyString(
    initialState.controlObjective ?? initialState.control_objective
  );
  if (controlObjective) parts.push(`Control objective: ${controlObjective}`);

  const relatedTicket = asNonEmptyString(
    initialState.relatedTicketCode ??
      initialState.related_ticket_code ??
      initialState.audRef ??
      initialState.aud_ref
  );
  if (relatedTicket) parts.push(`Related engagement item: ${relatedTicket}`);

  const criteriaSource = asNonEmptyString(
    initialState.criteriaSource ?? initialState.criteria_source
  );
  if (criteriaSource) parts.push(`Criteria source: ${criteriaSource}`);

  const exceptionSummary = asNonEmptyString(
    initialState.exceptionSummary ?? initialState.exception_summary
  );
  if (exceptionSummary) parts.push(`Exception summary:\n${exceptionSummary}`);

  const evidenceArtifact =
    initialState.evidenceArtifact ?? initialState.evidence_artifact;
  if (typeof evidenceArtifact === 'string' && evidenceArtifact.trim()) {
    parts.push(`Evidence artifact:\n${evidenceArtifact.trim()}`);
  } else if (isPlainObject(evidenceArtifact)) {
    parts.push(
      `Evidence artifact:\n${JSON.stringify(evidenceArtifact, null, 2)}`
    );
  }

  const exceptions = initialState.exceptions ?? initialState.exceptionUsers;
  if (Array.isArray(exceptions) && exceptions.length > 0) {
    const lines = exceptions.map((entry, index) => {
      if (typeof entry === 'string') return `- ${entry}`;
      if (!isPlainObject(entry)) return `- (exception ${index + 1})`;
      const id = asNonEmptyString(entry.id) ?? `exception-${index + 1}`;
      const name =
        asNonEmptyString(entry.displayName) ??
        asNonEmptyString(entry.username) ??
        id;
      const detail =
        asNonEmptyString(entry.detail) ??
        asNonEmptyString(entry.rationale) ??
        asNonEmptyString(entry.notes);
      const termination = asNonEmptyString(entry.terminationDate);
      const revoked = asNonEmptyString(entry.accessRevokedDate);
      const bits = [
        name,
        termination ? `terminated ${termination}` : null,
        revoked ? `revoked ${revoked}` : asNonEmptyString(entry.accessStatus),
        detail,
      ].filter(Boolean);
      return `- ${bits.join('; ')}`;
    });
    parts.push(`Exceptions:\n${lines.join('\n')}`);
  }

  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

/**
 * Deterministic completeness gate: all five CCCER fields present and non-trivial.
 * Used by unit tests and by the hybrid scorer (no LLM).
 */
export function evaluateCccerDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: CccerSubmission | null;
  structured: CccerStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseCccerExpectedState(ticket.expected_state);
  const minFieldLength =
    typeof expected.minFieldLength === 'number' &&
    Number.isFinite(expected.minFieldLength) &&
    expected.minFieldLength > 0
      ? Math.floor(expected.minFieldLength)
      : CCCER_MIN_FIELD_LENGTH;

  const lengths = emptyLengths();
  const missing: (keyof CCCERValues)[] = [];
  const tooShort: (keyof CCCERValues)[] = [];

  for (const key of CCCER_FIELD_KEYS) {
    const value = submission[key];
    if (typeof value !== 'string' || !value.trim()) {
      missing.push(key);
      lengths[key] = 0;
    } else {
      lengths[key] = value.trim().length;
      if (lengths[key] < minFieldLength) {
        tooShort.push(key);
      }
    }
  }

  const parsed =
    missing.length === 0 ? extractCccerSubmission(submission) : null;
  const fieldsOk = missing.length === 0 && tooShort.length === 0;

  const structured: CccerStructuredResult = {
    style: 'cccer',
    lengths,
    missing,
    tooShort,
    minFieldLength,
    fieldsOk,
    guidancePath: null,
    retrievedSectionIds: [],
  };

  if (missing.length > 0) {
    structured.reason = 'missing_fields';
    return {
      parsed: null,
      structured,
      ok: false,
      feedback: `CCCER submission incomplete. Missing: ${missing.join(', ')}.`,
    };
  }

  if (tooShort.length > 0) {
    structured.reason = 'fields_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Expand these CCCER fields (min ${minFieldLength} chars): ${tooShort.join(', ')}.`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback:
      'Deterministic checks passed. Grading CCCER finding against IIA/GAO guidance…',
  };
}

/** Completeness-only score result (no RAG). Used by hybrid tickets. */
export function scoreCccerCompleteness(
  submission: TicketSubmission,
  ticket: ScorableTicket
): TicketScoreResult {
  const deterministic = evaluateCccerDeterministic(submission, ticket);
  if (!deterministic.ok) {
    return {
      status: 'needs_revision',
      structuredResult: deterministic.structured,
      feedback: deterministic.feedback,
    };
  }

  return {
    status: 'resolved',
    structuredResult: {
      ...deterministic.structured,
      reason: 'completeness_only',
    },
    feedback:
      'CCCER narrative fields are complete. Full RAG grading applies to dedicated cccer tickets.',
  };
}

async function gradeCccerWithGuidance(
  parsed: CccerSubmission,
  ticket: ScorableTicket,
  expected: CccerExpectedState
): Promise<{
  grading: ClaudeGradingResult;
  retrievedSectionIds: string[];
  guidancePath: string;
}> {
  const query = [
    parsed.condition,
    parsed.criteria,
    parsed.cause,
    parsed.effect,
    parsed.recommendation,
  ].join('\n');

  const requiredSectionIds =
    expected.guidanceTopics && expected.guidanceTopics.length > 0
      ? expected.guidanceTopics
      : undefined;

  const retrieved = retrieveAuditFindingCccerGuidance(query, {
    topK: expected.topKGuidanceSections ?? 8,
    requiredSectionIds,
  });

  const prompt = buildCccerFindingGradingPrompt(retrieved, {
    submission: parsed,
    scenarioBrief: ticket.scenario_brief,
    exceptionContextText: formatExceptionContext(ticket.initial_state),
  });

  const grading = await callClaudeGrading(prompt);

  return {
    grading,
    retrievedSectionIds: retrieved.sections.map((section) => section.id),
    guidancePath: retrieved.catalogPath,
  };
}

export const cccerTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const deterministic = evaluateCccerDeterministic(submission, ticket);

    if (!deterministic.ok || !deterministic.parsed) {
      return {
        status: 'needs_revision',
        structuredResult: deterministic.structured,
        feedback: deterministic.feedback,
      };
    }

    const expected = parseCccerExpectedState(ticket.expected_state);

    try {
      const { grading, retrievedSectionIds, guidancePath } =
        await gradeCccerWithGuidance(deterministic.parsed, ticket, expected);

      const structured: CccerStructuredResult = {
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
        const structured: CccerStructuredResult = {
          ...deterministic.structured,
          reason: 'grading_unavailable_missing_api_key',
        };
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback:
            'CCCER fields look complete, but AI grading against IIA/GAO finding-writing guidance is unavailable (ANTHROPIC_API_KEY not configured). Ask an admin to enable grading, then resubmit.',
        };
      }

      console.error('CCCER IIA/GAO finding grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'cccer_iia_gao_grade',
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
          'Could not grade your CCCER finding against IIA/GAO guidance. Please try again shortly.',
      };
    }
  },
};
