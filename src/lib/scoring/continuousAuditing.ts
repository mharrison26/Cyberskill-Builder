import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildContinuousAuditingGradingPrompt } from '@/lib/grading/buildContinuousAuditingGradingPrompt';
import { retrieveContinuousAuditingGuidance } from '@/lib/grc/getContinuousAuditingGuidance';
import { captureFeatureException } from '@/lib/observability/sentry';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import {
  CONTINUOUS_AUDITING_MIN_EXCEPTION_LENGTH,
  CONTINUOUS_AUDITING_MIN_FIELD_LENGTH,
} from '@/lib/scoring/ticketUi';

/**
 * Continuous auditing design scoring (single control area).
 *
 * Deterministic:
 *   - frequency, dataSource, exceptionHandling present + min length
 *   - controlArea present (may be fixed by scenario)
 *
 * RAG / LLM (F26 pattern):
 *   - retrieve pinned continuous auditing guidance
 *   - grade design against retrieved text only
 */

export {
  CONTINUOUS_AUDITING_MIN_EXCEPTION_LENGTH,
  CONTINUOUS_AUDITING_MIN_FIELD_LENGTH,
  CONTINUOUS_AUDITING_MIN_OPTIONAL_LENGTH,
} from '@/lib/scoring/ticketUi';

export type ContinuousAuditingExpectedState = {
  minFieldLength?: number;
  minExceptionLength?: number;
  minOptionalLength?: number;
  requireControlArea?: boolean;
  guidanceTopics?: string[];
  topKGuidanceSections?: number;
  /** Optional override; normally resolved from initial_state.controlArea */
  controlArea?: string;
};

export type ContinuousAuditingSubmission = {
  type?: string;
  controlArea: string;
  frequency: string;
  dataSource: string;
  exceptionHandling: string;
  automationMethod?: string;
  owners?: string;
  escalation?: string;
  falsePositiveHandling?: string;
};

export type ContinuousAuditingStructuredResult = {
  style: 'continuous_auditing';
  controlAreaLength: number;
  frequencyLength: number;
  dataSourceLength: number;
  exceptionHandlingLength: number;
  minFieldLength: number;
  minExceptionLength: number;
  fieldsOk: boolean;
  controlArea: string | null;
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

export function parseContinuousAuditingExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): ContinuousAuditingExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }
  return expectedState as ContinuousAuditingExpectedState;
}

/**
 * Resolve the control area for the design.
 * Prefer submission, then expected_state override, then initial_state.
 */
export function resolveControlArea(
  ticket: ScorableTicket,
  submissionControlArea?: string | null
): string | null {
  if (submissionControlArea?.trim()) {
    return submissionControlArea.trim();
  }

  const expected = parseContinuousAuditingExpectedState(ticket.expected_state);
  if (typeof expected.controlArea === 'string' && expected.controlArea.trim()) {
    return expected.controlArea.trim();
  }

  const initial = isPlainObject(ticket.initial_state)
    ? ticket.initial_state
    : null;
  if (!initial) return null;

  return (
    asNonEmptyString(initial.controlArea) ??
    asNonEmptyString(initial.control_area) ??
    asNonEmptyString(initial.controlTitle) ??
    asNonEmptyString(initial.control_title) ??
    null
  );
}

export function extractContinuousAuditingSubmission(
  submission: TicketSubmission
): ContinuousAuditingSubmission | null {
  const controlArea =
    asNonEmptyString(submission.controlArea) ??
    asNonEmptyString(submission.control_area);
  const frequency =
    asNonEmptyString(submission.frequency) ??
    asNonEmptyString(submission.cadence) ??
    asNonEmptyString(submission.runFrequency) ??
    asNonEmptyString(submission.run_frequency);
  const dataSource =
    asNonEmptyString(submission.dataSource) ??
    asNonEmptyString(submission.data_source) ??
    asNonEmptyString(submission.dataSources) ??
    asNonEmptyString(submission.data_sources);
  const exceptionHandling =
    asNonEmptyString(submission.exceptionHandling) ??
    asNonEmptyString(submission.exception_handling) ??
    asNonEmptyString(submission.exceptionProcess) ??
    asNonEmptyString(submission.exception_process);

  if (!frequency || !dataSource || !exceptionHandling) {
    return null;
  }

  const automationMethod =
    asNonEmptyString(submission.automationMethod) ??
    asNonEmptyString(submission.automation_method) ??
    undefined;
  const owners =
    asNonEmptyString(submission.owners) ??
    asNonEmptyString(submission.owner) ??
    undefined;
  const escalation =
    asNonEmptyString(submission.escalation) ??
    asNonEmptyString(submission.escalationPath) ??
    asNonEmptyString(submission.escalation_path) ??
    undefined;
  const falsePositiveHandling =
    asNonEmptyString(submission.falsePositiveHandling) ??
    asNonEmptyString(submission.false_positive_handling) ??
    asNonEmptyString(submission.falsePositives) ??
    asNonEmptyString(submission.false_positives) ??
    undefined;

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'continuous_auditing',
    controlArea: controlArea ?? '',
    frequency,
    dataSource,
    exceptionHandling,
    ...(automationMethod ? { automationMethod } : {}),
    ...(owners ? { owners } : {}),
    ...(escalation ? { escalation } : {}),
    ...(falsePositiveHandling ? { falsePositiveHandling } : {}),
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
    asNonEmptyString(initialState.control_title) ??
    asNonEmptyString(initialState.controlArea) ??
    asNonEmptyString(initialState.control_area);
  if (controlId && controlTitle) {
    parts.push(`Control: ${controlId} — ${controlTitle}`);
  } else if (controlTitle) {
    parts.push(`Control area: ${controlTitle}`);
  } else if (controlId) {
    parts.push(`Control: ${controlId}`);
  }

  const scenario = initialState.scenario ?? initialState.orgScenario;
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

export function evaluateContinuousAuditingDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: ContinuousAuditingSubmission | null;
  controlArea: string | null;
  structured: ContinuousAuditingStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseContinuousAuditingExpectedState(ticket.expected_state);
  const minFieldLength =
    typeof expected.minFieldLength === 'number' &&
    Number.isFinite(expected.minFieldLength) &&
    expected.minFieldLength > 0
      ? Math.floor(expected.minFieldLength)
      : CONTINUOUS_AUDITING_MIN_FIELD_LENGTH;
  const minExceptionLength =
    typeof expected.minExceptionLength === 'number' &&
    Number.isFinite(expected.minExceptionLength) &&
    expected.minExceptionLength > 0
      ? Math.floor(expected.minExceptionLength)
      : CONTINUOUS_AUDITING_MIN_EXCEPTION_LENGTH;

  const parsed = extractContinuousAuditingSubmission(submission);
  const controlArea = resolveControlArea(ticket, parsed?.controlArea);

  if (!parsed) {
    const structured: ContinuousAuditingStructuredResult = {
      style: 'continuous_auditing',
      controlAreaLength: 0,
      frequencyLength: 0,
      dataSourceLength: 0,
      exceptionHandlingLength: 0,
      minFieldLength,
      minExceptionLength,
      fieldsOk: false,
      controlArea,
      guidancePath: null,
      retrievedSectionIds: [],
      reason: 'missing_fields',
    };
    return {
      parsed: null,
      controlArea,
      structured,
      ok: false,
      feedback:
        'Submission must include frequency, dataSource, and exceptionHandling.',
    };
  }

  const resolvedParsed: ContinuousAuditingSubmission = {
    ...parsed,
    controlArea: controlArea ?? parsed.controlArea,
  };

  if (!resolvedParsed.controlArea.trim()) {
    const structured: ContinuousAuditingStructuredResult = {
      style: 'continuous_auditing',
      controlAreaLength: 0,
      frequencyLength: resolvedParsed.frequency.length,
      dataSourceLength: resolvedParsed.dataSource.length,
      exceptionHandlingLength: resolvedParsed.exceptionHandling.length,
      minFieldLength,
      minExceptionLength,
      fieldsOk: false,
      controlArea: null,
      guidancePath: null,
      retrievedSectionIds: [],
      reason: 'missing_control_area',
    };
    return {
      parsed: resolvedParsed,
      controlArea: null,
      structured,
      ok: false,
      feedback:
        'Control area is required. Select or confirm the control area for this continuous auditing design.',
    };
  }

  const lengths = {
    controlAreaLength: resolvedParsed.controlArea.length,
    frequencyLength: resolvedParsed.frequency.length,
    dataSourceLength: resolvedParsed.dataSource.length,
    exceptionHandlingLength: resolvedParsed.exceptionHandling.length,
  };

  const shortRequired = (
    [
      ['frequency', lengths.frequencyLength, minFieldLength],
      ['dataSource', lengths.dataSourceLength, minFieldLength],
      [
        'exceptionHandling',
        lengths.exceptionHandlingLength,
        minExceptionLength,
      ],
    ] as const
  )
    .filter(([, length, min]) => length < min)
    .map(([name]) => name);

  const structured: ContinuousAuditingStructuredResult = {
    style: 'continuous_auditing',
    ...lengths,
    minFieldLength,
    minExceptionLength,
    fieldsOk: shortRequired.length === 0,
    controlArea: resolvedParsed.controlArea,
    guidancePath: null,
    retrievedSectionIds: [],
  };

  if (shortRequired.length > 0) {
    structured.reason = 'fields_too_short';
    return {
      parsed: resolvedParsed,
      controlArea: resolvedParsed.controlArea,
      structured,
      ok: false,
      feedback: `Expand required design fields (frequency/dataSource min ${minFieldLength} chars; exceptionHandling min ${minExceptionLength}): ${shortRequired.join(', ')}.`,
    };
  }

  return {
    parsed: resolvedParsed,
    controlArea: resolvedParsed.controlArea,
    structured,
    ok: true,
    feedback:
      'Deterministic checks passed. Grading continuous auditing design against pinned guidance…',
  };
}

async function gradeDesignWithGuidance(
  parsed: ContinuousAuditingSubmission,
  ticket: ScorableTicket,
  expected: ContinuousAuditingExpectedState
): Promise<{
  grading: ClaudeGradingResult;
  retrievedSectionIds: string[];
  guidancePath: string;
}> {
  const query = [
    parsed.controlArea,
    parsed.frequency,
    parsed.dataSource,
    parsed.exceptionHandling,
    parsed.automationMethod,
    parsed.owners,
    parsed.escalation,
    parsed.falsePositiveHandling,
  ]
    .filter(Boolean)
    .join('\n');

  const requiredSectionIds =
    expected.guidanceTopics && expected.guidanceTopics.length > 0
      ? expected.guidanceTopics
      : undefined;

  const retrieved = retrieveContinuousAuditingGuidance(query, {
    topK: expected.topKGuidanceSections ?? 5,
    requiredSectionIds,
  });

  const prompt = buildContinuousAuditingGradingPrompt(retrieved, {
    controlArea: parsed.controlArea,
    frequency: parsed.frequency,
    dataSource: parsed.dataSource,
    exceptionHandling: parsed.exceptionHandling,
    automationMethod: parsed.automationMethod,
    owners: parsed.owners,
    escalation: parsed.escalation,
    falsePositiveHandling: parsed.falsePositiveHandling,
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

export const continuousAuditingTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const deterministic = evaluateContinuousAuditingDeterministic(
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

    const expected = parseContinuousAuditingExpectedState(ticket.expected_state);

    try {
      const { grading, retrievedSectionIds, guidancePath } =
        await gradeDesignWithGuidance(
          deterministic.parsed,
          ticket,
          expected
        );

      const structured: ContinuousAuditingStructuredResult = {
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
        const structured: ContinuousAuditingStructuredResult = {
          ...deterministic.structured,
          reason: 'grading_unavailable_missing_api_key',
        };
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback:
            'Design fields look complete, but AI grading against continuous auditing guidance is unavailable (ANTHROPIC_API_KEY not configured). Ask an admin to enable grading, then resubmit.',
        };
      }

      console.error('Continuous auditing RAG grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'continuous_auditing_rag_grade',
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
          'Could not grade your continuous auditing design against pinned guidance. Please try again shortly.',
      };
    }
  },
};
