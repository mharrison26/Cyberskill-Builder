import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildRiskJustificationGradingPrompt } from '@/lib/grading/buildRiskJustificationGradingPrompt';
import { retrieveSp80030Guidance } from '@/lib/nist/getSp80030Guidance';
import { captureFeatureException } from '@/lib/observability/sentry';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

/**
 * SimpleRisk tool-walkthrough ticket scoring.
 *
 * Deterministic:
 *   - risk register entry ID present + matches expected pattern
 *   - justification meets minimum length
 *
 * RAG / LLM (F26 pattern):
 *   - retrieve pinned SP 800-30 guidance text
 *   - grade justification against retrieved text only
 */

export const TOOL_WALKTHROUGH_MIN_JUSTIFICATION_LENGTH = 80;

/** Default SimpleRisk-style numeric (or RISK-n) register IDs. */
export const DEFAULT_RISK_ID_PATTERN = /^(?:RISK[-_:]?)?\d{1,10}$/i;

export type ToolWalkthroughExpectedState = {
  /** RegExp source; defaults to DEFAULT_RISK_ID_PATTERN. */
  riskIdPattern?: string;
  minJustificationLength?: number;
  guidanceTopics?: string[];
  topKGuidanceSections?: number;
};

export type ToolWalkthroughSubmission = {
  type?: string;
  riskRegisterId: string;
  justification: string;
};

export type ToolWalkthroughStructuredResult = {
  style: 'tool_walkthrough';
  riskRegisterId: string | null;
  riskIdValid: boolean;
  justificationLength: number;
  minJustificationLength: number;
  justificationLengthOk: boolean;
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

export function parseToolWalkthroughExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): ToolWalkthroughExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }
  return expectedState as ToolWalkthroughExpectedState;
}

export function extractToolWalkthroughSubmission(
  submission: TicketSubmission
): ToolWalkthroughSubmission | null {
  const riskRegisterIdRaw =
    submission.riskRegisterId ??
    submission.risk_register_id ??
    submission.externalReference ??
    submission.external_reference;

  const justificationRaw =
    submission.justification ??
    submission.likelihoodImpactJustification ??
    submission.likelihood_impact_justification ??
    submission.reflection;

  if (
    typeof riskRegisterIdRaw !== 'string' ||
    typeof justificationRaw !== 'string'
  ) {
    return null;
  }

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'tool_walkthrough',
    riskRegisterId: riskRegisterIdRaw.trim(),
    justification: justificationRaw.trim(),
  };
}

export function resolveRiskIdPattern(
  expected: ToolWalkthroughExpectedState
): RegExp {
  if (
    typeof expected.riskIdPattern === 'string' &&
    expected.riskIdPattern.trim()
  ) {
    try {
      return new RegExp(expected.riskIdPattern.trim(), 'i');
    } catch {
      return DEFAULT_RISK_ID_PATTERN;
    }
  }
  return DEFAULT_RISK_ID_PATTERN;
}

export function isValidRiskRegisterId(
  riskRegisterId: string,
  pattern: RegExp = DEFAULT_RISK_ID_PATTERN
): boolean {
  const trimmed = riskRegisterId.trim();
  if (!trimmed) return false;
  return pattern.test(trimmed);
}

export function evaluateToolWalkthroughDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: ToolWalkthroughSubmission | null;
  structured: ToolWalkthroughStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseToolWalkthroughExpectedState(ticket.expected_state);
  const minLength =
    typeof expected.minJustificationLength === 'number' &&
    Number.isFinite(expected.minJustificationLength) &&
    expected.minJustificationLength > 0
      ? Math.floor(expected.minJustificationLength)
      : TOOL_WALKTHROUGH_MIN_JUSTIFICATION_LENGTH;

  const pattern = resolveRiskIdPattern(expected);
  const parsed = extractToolWalkthroughSubmission(submission);

  if (!parsed) {
    const structured: ToolWalkthroughStructuredResult = {
      style: 'tool_walkthrough',
      riskRegisterId: null,
      riskIdValid: false,
      justificationLength: 0,
      minJustificationLength: minLength,
      justificationLengthOk: false,
      guidancePath: null,
      retrievedSectionIds: [],
      reason: 'missing_fields',
    };
    return {
      parsed: null,
      structured,
      ok: false,
      feedback:
        'Submission must include riskRegisterId and justification (likelihood/impact rationale).',
    };
  }

  const riskIdValid = isValidRiskRegisterId(parsed.riskRegisterId, pattern);
  const justificationLength = parsed.justification.length;
  const justificationLengthOk = justificationLength >= minLength;

  const structured: ToolWalkthroughStructuredResult = {
    style: 'tool_walkthrough',
    riskRegisterId: parsed.riskRegisterId,
    riskIdValid,
    justificationLength,
    minJustificationLength: minLength,
    justificationLengthOk,
    guidancePath: null,
    retrievedSectionIds: [],
  };

  if (!riskIdValid) {
    structured.reason = 'invalid_risk_register_id';
    return {
      parsed,
      structured,
      ok: false,
      feedback:
        'Risk register entry ID is missing or does not match the expected SimpleRisk ID format (e.g. 42 or RISK-42).',
    };
  }

  if (!justificationLengthOk) {
    structured.reason = 'justification_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Likelihood/impact justification must be at least ${minLength} characters. Expand how you assessed likelihood and impact.`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback:
      'Deterministic checks passed. Grading justification against SP 800-30 guidance…',
  };
}

async function gradeJustificationWithSp80030(
  parsed: ToolWalkthroughSubmission,
  ticket: ScorableTicket,
  expected: ToolWalkthroughExpectedState
): Promise<{
  grading: ClaudeGradingResult;
  retrievedSectionIds: string[];
  guidancePath: string;
}> {
  const requiredSectionIds =
    expected.guidanceTopics && expected.guidanceTopics.length > 0
      ? expected.guidanceTopics
      : undefined;

  const retrieved = retrieveSp80030Guidance(parsed.justification, {
    topK: expected.topKGuidanceSections ?? 4,
    requiredSectionIds,
  });

  const prompt = buildRiskJustificationGradingPrompt(retrieved, {
    riskRegisterId: parsed.riskRegisterId,
    justification: parsed.justification,
    scenarioBrief: ticket.scenario_brief,
  });

  const grading = await callClaudeGrading(prompt);

  return {
    grading,
    retrievedSectionIds: retrieved.sections.map((section) => section.id),
    guidancePath: retrieved.catalogPath,
  };
}

export const toolWalkthroughTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const deterministic = evaluateToolWalkthroughDeterministic(
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

    const expected = parseToolWalkthroughExpectedState(ticket.expected_state);

    try {
      const { grading, retrievedSectionIds, guidancePath } =
        await gradeJustificationWithSp80030(
          deterministic.parsed,
          ticket,
          expected
        );

      const structured: ToolWalkthroughStructuredResult = {
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
        // Deterministic gates passed; without API key we cannot RAG-grade.
        // Keep ticket open for revision so production grading remains required.
        const structured: ToolWalkthroughStructuredResult = {
          ...deterministic.structured,
          reason: 'grading_unavailable_missing_api_key',
        };
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback:
            'Risk ID and justification length look good, but AI grading against SP 800-30 is unavailable (ANTHROPIC_API_KEY not configured). Ask an admin to enable grading, then resubmit.',
        };
      }

      console.error('Tool-walkthrough SP 800-30 grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'tool_walkthrough_sp80030_grade',
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
          'Could not grade your justification against SP 800-30 guidance. Please try again shortly.',
      };
    }
  },
};
