import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildAuditWorkpaperGradingPrompt } from '@/lib/grading/buildAuditWorkpaperGradingPrompt';
import { retrieveAuditWorkpaperGuidance } from '@/lib/grc/getAuditWorkpaperGuidance';
import { captureFeatureException } from '@/lib/observability/sentry';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import {
  AUDIT_WORKPAPER_MIN_FIELD_LENGTH,
  AUDIT_WORKPAPER_MIN_IDENTITY_LENGTH,
} from '@/lib/scoring/ticketUi';

/**
 * Structured audit workpaper scoring.
 *
 * Deterministic:
 *   - objective, procedurePerformed, evidenceObtained, conclusion present + min length
 *   - preparer / reviewer present + short identity min length
 *
 * RAG / LLM (F26 pattern):
 *   - retrieve pinned workpaper guidance
 *   - grade conclusion quality against the ticket's stated test objective
 *     using retrieved guidance text only
 */

export {
  AUDIT_WORKPAPER_MIN_FIELD_LENGTH,
  AUDIT_WORKPAPER_MIN_IDENTITY_LENGTH,
} from '@/lib/scoring/ticketUi';

export type AuditWorkpaperExpectedState = {
  minFieldLength?: number;
  minIdentityLength?: number;
  minConclusionLength?: number;
  guidanceTopics?: string[];
  topKGuidanceSections?: number;
  /** Optional override; normally resolved from initial_state.testObjective */
  testObjective?: string;
};

export type AuditWorkpaperSubmission = {
  type?: string;
  objective: string;
  procedurePerformed: string;
  evidenceObtained: string;
  conclusion: string;
  preparer: string;
  reviewer: string;
};

export type AuditWorkpaperStructuredResult = {
  style: 'audit_workpaper';
  objectiveLength: number;
  procedurePerformedLength: number;
  evidenceObtainedLength: number;
  conclusionLength: number;
  preparerLength: number;
  reviewerLength: number;
  minFieldLength: number;
  minIdentityLength: number;
  minConclusionLength: number;
  fieldsOk: boolean;
  statedTestObjective: string | null;
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

export function parseAuditWorkpaperExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): AuditWorkpaperExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }
  return expectedState as AuditWorkpaperExpectedState;
}

/**
 * Resolve the stated test objective the conclusion must answer.
 * Prefer expected_state override, then initial_state.testObjective / objective.
 */
export function resolveStatedTestObjective(
  ticket: ScorableTicket
): string | null {
  const expected = parseAuditWorkpaperExpectedState(ticket.expected_state);
  if (
    typeof expected.testObjective === 'string' &&
    expected.testObjective.trim()
  ) {
    return expected.testObjective.trim();
  }

  const initial = isPlainObject(ticket.initial_state)
    ? ticket.initial_state
    : null;
  if (!initial) return null;

  return (
    asNonEmptyString(initial.testObjective) ??
    asNonEmptyString(initial.test_objective) ??
    asNonEmptyString(initial.statedTestObjective) ??
    asNonEmptyString(initial.stated_test_objective) ??
    asNonEmptyString(initial.controlTestObjective) ??
    asNonEmptyString(initial.control_test_objective) ??
    null
  );
}

export function extractAuditWorkpaperSubmission(
  submission: TicketSubmission
): AuditWorkpaperSubmission | null {
  const objective = asNonEmptyString(submission.objective);
  const procedurePerformed =
    asNonEmptyString(submission.procedurePerformed) ??
    asNonEmptyString(submission.procedure_performed) ??
    asNonEmptyString(submission.procedure);
  const evidenceObtained =
    asNonEmptyString(submission.evidenceObtained) ??
    asNonEmptyString(submission.evidence_obtained) ??
    asNonEmptyString(submission.evidence);
  const conclusion = asNonEmptyString(submission.conclusion);
  const preparer =
    asNonEmptyString(submission.preparer) ??
    asNonEmptyString(submission.preparedBy) ??
    asNonEmptyString(submission.prepared_by);
  const reviewer =
    asNonEmptyString(submission.reviewer) ??
    asNonEmptyString(submission.reviewedBy) ??
    asNonEmptyString(submission.reviewed_by);

  if (
    !objective ||
    !procedurePerformed ||
    !evidenceObtained ||
    !conclusion ||
    !preparer ||
    !reviewer
  ) {
    return null;
  }

  return {
    type:
      typeof submission.type === 'string' ? submission.type : 'audit_workpaper',
    objective,
    procedurePerformed,
    evidenceObtained,
    conclusion,
    preparer,
    reviewer,
  };
}

function formatScenarioContext(
  initialState: Record<string, unknown> | null | undefined
): string | undefined {
  if (!isPlainObject(initialState)) return undefined;

  const parts: string[] = [];

  const controlId =
    asNonEmptyString(initialState.controlId) ??
    asNonEmptyString(initialState.control_id);
  const controlTitle =
    asNonEmptyString(initialState.controlTitle) ??
    asNonEmptyString(initialState.control_title);
  if (controlId && controlTitle) {
    parts.push(`Control: ${controlId} — ${controlTitle}`);
  } else if (controlId) {
    parts.push(`Control: ${controlId}`);
  }

  const scenario = initialState.scenario ?? initialState.controlTestScenario;
  if (typeof scenario === 'string' && scenario.trim()) {
    parts.push(scenario.trim());
  } else if (isPlainObject(scenario)) {
    for (const [key, value] of Object.entries(scenario)) {
      if (typeof value === 'string' && value.trim()) {
        parts.push(`${key}: ${value.trim()}`);
      } else if (Array.isArray(value)) {
        const items = value.filter(
          (entry) => typeof entry === 'string'
        ) as string[];
        if (items.length > 0) {
          parts.push(`${key}: ${items.join('; ')}`);
        }
      }
    }
  }

  const prompt = asNonEmptyString(initialState.prompt);
  if (prompt) {
    parts.push(`prompt: ${prompt}`);
  }

  return parts.length > 0 ? parts.join('\n') : undefined;
}

export function evaluateAuditWorkpaperDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: AuditWorkpaperSubmission | null;
  statedTestObjective: string | null;
  structured: AuditWorkpaperStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseAuditWorkpaperExpectedState(ticket.expected_state);
  const minFieldLength =
    typeof expected.minFieldLength === 'number' &&
    Number.isFinite(expected.minFieldLength) &&
    expected.minFieldLength > 0
      ? Math.floor(expected.minFieldLength)
      : AUDIT_WORKPAPER_MIN_FIELD_LENGTH;
  const minIdentityLength =
    typeof expected.minIdentityLength === 'number' &&
    Number.isFinite(expected.minIdentityLength) &&
    expected.minIdentityLength > 0
      ? Math.floor(expected.minIdentityLength)
      : AUDIT_WORKPAPER_MIN_IDENTITY_LENGTH;
  const minConclusionLength =
    typeof expected.minConclusionLength === 'number' &&
    Number.isFinite(expected.minConclusionLength) &&
    expected.minConclusionLength > 0
      ? Math.floor(expected.minConclusionLength)
      : minFieldLength;

  const statedTestObjective = resolveStatedTestObjective(ticket);
  const parsed = extractAuditWorkpaperSubmission(submission);

  if (!statedTestObjective) {
    const structured: AuditWorkpaperStructuredResult = {
      style: 'audit_workpaper',
      objectiveLength: 0,
      procedurePerformedLength: 0,
      evidenceObtainedLength: 0,
      conclusionLength: 0,
      preparerLength: 0,
      reviewerLength: 0,
      minFieldLength,
      minIdentityLength,
      minConclusionLength,
      fieldsOk: false,
      statedTestObjective: null,
      guidancePath: null,
      retrievedSectionIds: [],
      reason: 'missing_test_objective',
    };
    return {
      parsed,
      statedTestObjective: null,
      structured,
      ok: false,
      feedback:
        'Ticket is missing testObjective in initial_state or expected_state; cannot grade the workpaper conclusion.',
    };
  }

  if (!parsed) {
    const structured: AuditWorkpaperStructuredResult = {
      style: 'audit_workpaper',
      objectiveLength: 0,
      procedurePerformedLength: 0,
      evidenceObtainedLength: 0,
      conclusionLength: 0,
      preparerLength: 0,
      reviewerLength: 0,
      minFieldLength,
      minIdentityLength,
      minConclusionLength,
      fieldsOk: false,
      statedTestObjective,
      guidancePath: null,
      retrievedSectionIds: [],
      reason: 'missing_fields',
    };
    return {
      parsed: null,
      statedTestObjective,
      structured,
      ok: false,
      feedback:
        'Submission must include objective, procedurePerformed, evidenceObtained, conclusion, preparer, and reviewer.',
    };
  }

  const lengths = {
    objectiveLength: parsed.objective.length,
    procedurePerformedLength: parsed.procedurePerformed.length,
    evidenceObtainedLength: parsed.evidenceObtained.length,
    conclusionLength: parsed.conclusion.length,
    preparerLength: parsed.preparer.length,
    reviewerLength: parsed.reviewer.length,
  };

  const shortNarrative = (
    [
      ['objective', lengths.objectiveLength, minFieldLength],
      ['procedurePerformed', lengths.procedurePerformedLength, minFieldLength],
      ['evidenceObtained', lengths.evidenceObtainedLength, minFieldLength],
      ['conclusion', lengths.conclusionLength, minConclusionLength],
    ] as const
  )
    .filter(([, length, min]) => length < min)
    .map(([name]) => name);

  const shortIdentity = (
    [
      ['preparer', lengths.preparerLength],
      ['reviewer', lengths.reviewerLength],
    ] as const
  )
    .filter(([, length]) => length < minIdentityLength)
    .map(([name]) => name);

  const shortFields = [...shortNarrative, ...shortIdentity];

  const structured: AuditWorkpaperStructuredResult = {
    style: 'audit_workpaper',
    ...lengths,
    minFieldLength,
    minIdentityLength,
    minConclusionLength,
    fieldsOk: shortFields.length === 0,
    statedTestObjective,
    guidancePath: null,
    retrievedSectionIds: [],
  };

  if (shortFields.length > 0) {
    structured.reason = 'fields_too_short';
    const narrativeHint =
      shortNarrative.length > 0
        ? `Narrative fields need at least ${minFieldLength} chars (conclusion min ${minConclusionLength}): ${shortNarrative.join(', ')}.`
        : '';
    const identityHint =
      shortIdentity.length > 0
        ? `Identity fields need at least ${minIdentityLength} chars: ${shortIdentity.join(', ')}.`
        : '';
    return {
      parsed,
      statedTestObjective,
      structured,
      ok: false,
      feedback: [narrativeHint, identityHint].filter(Boolean).join(' '),
    };
  }

  return {
    parsed,
    statedTestObjective,
    structured,
    ok: true,
    feedback:
      'Deterministic checks passed. Grading conclusion against the stated test objective…',
  };
}

async function gradeWorkpaperWithGuidance(
  parsed: AuditWorkpaperSubmission,
  ticket: ScorableTicket,
  expected: AuditWorkpaperExpectedState,
  statedTestObjective: string
): Promise<{
  grading: ClaudeGradingResult;
  retrievedSectionIds: string[];
  guidancePath: string;
}> {
  const query = [
    statedTestObjective,
    parsed.objective,
    parsed.procedurePerformed,
    parsed.evidenceObtained,
    parsed.conclusion,
  ].join('\n');

  const requiredSectionIds =
    expected.guidanceTopics && expected.guidanceTopics.length > 0
      ? expected.guidanceTopics
      : undefined;

  const retrieved = retrieveAuditWorkpaperGuidance(query, {
    topK: expected.topKGuidanceSections ?? 5,
    requiredSectionIds,
  });

  const prompt = buildAuditWorkpaperGradingPrompt(retrieved, {
    objective: parsed.objective,
    procedurePerformed: parsed.procedurePerformed,
    evidenceObtained: parsed.evidenceObtained,
    conclusion: parsed.conclusion,
    preparer: parsed.preparer,
    reviewer: parsed.reviewer,
    statedTestObjective,
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

export const auditWorkpaperTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const deterministic = evaluateAuditWorkpaperDeterministic(
      submission,
      ticket
    );

    if (
      !deterministic.ok ||
      !deterministic.parsed ||
      !deterministic.statedTestObjective
    ) {
      return {
        status: 'needs_revision',
        structuredResult: deterministic.structured,
        feedback: deterministic.feedback,
      };
    }

    const expected = parseAuditWorkpaperExpectedState(ticket.expected_state);

    try {
      const { grading, retrievedSectionIds, guidancePath } =
        await gradeWorkpaperWithGuidance(
          deterministic.parsed,
          ticket,
          expected,
          deterministic.statedTestObjective
        );

      const structured: AuditWorkpaperStructuredResult = {
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
        const structured: AuditWorkpaperStructuredResult = {
          ...deterministic.structured,
          reason: 'grading_unavailable_missing_api_key',
        };
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback:
            'Workpaper fields look complete, but AI grading of the conclusion against the stated test objective is unavailable (ANTHROPIC_API_KEY not configured). Ask an admin to enable grading, then resubmit.',
        };
      }

      console.error('Audit workpaper RAG grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'audit_workpaper_rag_grade',
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
          'Could not grade your workpaper conclusion against the stated test objective. Please try again shortly.',
      };
    }
  },
};
