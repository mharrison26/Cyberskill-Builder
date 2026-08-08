import { buildAssessmentProcedureGradingPrompt } from '@/lib/grading/buildAssessmentProcedureGradingPrompt';
import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { captureFeatureException } from '@/lib/observability/sentry';
import {
  getAssessmentObjectiveText,
  type AssessmentObjectiveText,
} from '@/lib/oscal/getControl';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

/**
 * SP 800-53A assessment-procedures ticket scoring.
 *
 * Deterministic:
 *   - control_id resolvable from ticket state
 *   - Examine / Interview / Test fields present + min length
 *
 * RAG / LLM (F25 + F26 pattern):
 *   - retrieve live 800-53A assessment objective text via getAssessmentObjectiveText
 *   - grade student procedures against retrieved text only
 */

export { ASSESSMENT_PROCEDURES_MIN_FIELD_LENGTH } from '@/lib/scoring/ticketUi';
import { ASSESSMENT_PROCEDURES_MIN_FIELD_LENGTH } from '@/lib/scoring/ticketUi';

export type AssessmentProceduresExpectedState = {
  controlId?: string;
  control_id?: string;
  minFieldLength?: number;
};

export type AssessmentProceduresSubmission = {
  type?: string;
  controlId?: string;
  examine: string;
  interview: string;
  test: string;
};

export type AssessmentProceduresStructuredResult = {
  style: 'assessment_procedures';
  controlId: string | null;
  examineLength: number;
  interviewLength: number;
  testLength: number;
  minFieldLength: number;
  fieldsOk: boolean;
  catalogPath: string | null;
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

function readControlId(
  record: Record<string, unknown> | null | undefined
): string | null {
  if (!record) return null;
  const value = record.controlId ?? record.control_id;
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return null;
}

export function resolveAssessmentProceduresControlId(
  ticket: ScorableTicket,
  submission?: TicketSubmission
): string | null {
  const fromSubmission =
    submission &&
    (typeof submission.controlId === 'string'
      ? submission.controlId
      : typeof submission.control_id === 'string'
        ? submission.control_id
        : null);

  if (typeof fromSubmission === 'string' && fromSubmission.trim()) {
    return fromSubmission.trim();
  }

  return (
    readControlId(ticket.expected_state) ??
    readControlId(ticket.initial_state) ??
    null
  );
}

export function parseAssessmentProceduresExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): AssessmentProceduresExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }
  return expectedState as AssessmentProceduresExpectedState;
}

export function extractAssessmentProceduresSubmission(
  submission: TicketSubmission
): AssessmentProceduresSubmission | null {
  const examineRaw = submission.examine ?? submission.Examine;
  const interviewRaw = submission.interview ?? submission.Interview;
  const testRaw = submission.test ?? submission.Test;

  if (
    typeof examineRaw !== 'string' ||
    typeof interviewRaw !== 'string' ||
    typeof testRaw !== 'string'
  ) {
    return null;
  }

  const controlIdRaw = submission.controlId ?? submission.control_id;

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'assessment_procedures',
    controlId:
      typeof controlIdRaw === 'string' && controlIdRaw.trim()
        ? controlIdRaw.trim()
        : undefined,
    examine: examineRaw.trim(),
    interview: interviewRaw.trim(),
    test: testRaw.trim(),
  };
}

export function evaluateAssessmentProceduresDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: AssessmentProceduresSubmission | null;
  controlId: string | null;
  structured: AssessmentProceduresStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseAssessmentProceduresExpectedState(
    ticket.expected_state
  );
  const minLength =
    typeof expected.minFieldLength === 'number' &&
    Number.isFinite(expected.minFieldLength) &&
    expected.minFieldLength > 0
      ? Math.floor(expected.minFieldLength)
      : ASSESSMENT_PROCEDURES_MIN_FIELD_LENGTH;

  const controlId = resolveAssessmentProceduresControlId(ticket, submission);
  const parsed = extractAssessmentProceduresSubmission(submission);

  if (!controlId) {
    const structured: AssessmentProceduresStructuredResult = {
      style: 'assessment_procedures',
      controlId: null,
      examineLength: 0,
      interviewLength: 0,
      testLength: 0,
      minFieldLength: minLength,
      fieldsOk: false,
      catalogPath: null,
      reason: 'missing_control_id',
    };
    return {
      parsed,
      controlId: null,
      structured,
      ok: false,
      feedback:
        'Ticket is missing control_id in initial_state or expected_state; cannot grade assessment procedures.',
    };
  }

  if (!parsed) {
    const structured: AssessmentProceduresStructuredResult = {
      style: 'assessment_procedures',
      controlId,
      examineLength: 0,
      interviewLength: 0,
      testLength: 0,
      minFieldLength: minLength,
      fieldsOk: false,
      catalogPath: null,
      reason: 'missing_fields',
    };
    return {
      parsed: null,
      controlId,
      structured,
      ok: false,
      feedback:
        'Submission must include examine, interview, and test assessment procedure fields.',
    };
  }

  const examineLength = parsed.examine.length;
  const interviewLength = parsed.interview.length;
  const testLength = parsed.test.length;
  const tooShort: string[] = [];
  if (examineLength < minLength) tooShort.push('examine');
  if (interviewLength < minLength) tooShort.push('interview');
  if (testLength < minLength) tooShort.push('test');

  const structured: AssessmentProceduresStructuredResult = {
    style: 'assessment_procedures',
    controlId,
    examineLength,
    interviewLength,
    testLength,
    minFieldLength: minLength,
    fieldsOk: tooShort.length === 0,
    catalogPath: null,
  };

  if (tooShort.length > 0) {
    structured.reason = 'fields_too_short';
    return {
      parsed,
      controlId,
      structured,
      ok: false,
      feedback: `Expand these assessment procedure fields (min ${minLength} chars): ${tooShort.join(', ')}.`,
    };
  }

  return {
    parsed,
    controlId,
    structured,
    ok: true,
    feedback:
      'Deterministic checks passed. Grading procedures against SP 800-53A assessment objectives…',
  };
}

async function gradeProceduresWithSp80053A(
  parsed: AssessmentProceduresSubmission,
  ticket: ScorableTicket,
  controlId: string
): Promise<{
  grading: ClaudeGradingResult;
  assessment: AssessmentObjectiveText;
}> {
  const assessment = getAssessmentObjectiveText(controlId);
  const prompt = buildAssessmentProcedureGradingPrompt(assessment, {
    examine: parsed.examine,
    interview: parsed.interview,
    test: parsed.test,
    scenarioBrief: ticket.scenario_brief,
  });
  const grading = await callClaudeGrading(prompt);
  return { grading, assessment };
}

export const assessmentProceduresTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const deterministic = evaluateAssessmentProceduresDeterministic(
      submission,
      ticket
    );

    if (
      !deterministic.ok ||
      !deterministic.parsed ||
      !deterministic.controlId
    ) {
      return {
        status: 'needs_revision',
        structuredResult: deterministic.structured,
        feedback: deterministic.feedback,
      };
    }

    try {
      const { grading, assessment } = await gradeProceduresWithSp80053A(
        deterministic.parsed,
        ticket,
        deterministic.controlId
      );

      const structured: AssessmentProceduresStructuredResult = {
        ...deterministic.structured,
        catalogPath: assessment.catalogPath,
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
        const structured: AssessmentProceduresStructuredResult = {
          ...deterministic.structured,
          reason: 'grading_unavailable_missing_api_key',
        };
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback:
            'Procedure fields look complete, but AI grading against SP 800-53A is unavailable (ANTHROPIC_API_KEY not configured). Ask an admin to enable grading, then resubmit.',
        };
      }

      const message = error instanceof Error ? error.message : '';
      if (
        message.startsWith('Control not found:') ||
        message.startsWith('Assessment objective not found')
      ) {
        return {
          status: 'needs_revision',
          structuredResult: {
            ...deterministic.structured,
            reason: 'control_not_found',
          },
          feedback: `Could not retrieve SP 800-53A assessment objectives for control "${deterministic.controlId}".`,
        };
      }

      console.error('Assessment-procedures SP 800-53A grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'assessment_procedures_sp80053a_grade',
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
          'Could not grade your assessment procedures against SP 800-53A. Please try again shortly.',
      };
    }
  },
};
