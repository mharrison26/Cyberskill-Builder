import {
  formatDesignDocForPrompt,
  retrieveDesignDocSections,
  type InfraDesignDocument,
} from '@/lib/infra/designDocCorpus';
import {
  INFRA_FOLLOWUP_QUESTION_MIN,
  type InfraFollowUpQuestion,
} from '@/lib/infra/generateFollowUpQuestions';
import { retrieveArchitectureDecisionRubric } from '@/lib/infra/getArchitectureDecisionRubric';
import { isInfraDesignCapstoneTicketType } from '@/lib/infra/ticketCodes';
import { buildInfraDesignCapstoneGradingPrompt } from '@/lib/grading/buildInfraDesignCapstoneGradingPrompt';
import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { captureFeatureException } from '@/lib/observability/sentry';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import {
  INFRA_DESIGN_DOC_MIN_BODY_LENGTH,
  INFRA_DESIGN_DOC_MIN_TITLE_LENGTH,
  INFRA_DESIGN_FOLLOWUP_MIN_ANSWER_LENGTH,
} from '@/lib/scoring/ticketUi';

/**
 * Sysadmin Tier 3 infra design capstone (SA-07 / PI-07 flagship).
 *
 * Phase 1: student writes a short backup-topology design decision doc.
 * Phase 2: 4–5 RAG follow-up questions grounded in that doc + tradeoff rubric.
 *
 * Deterministic: min design doc length; all questions answered at min length.
 * RAG: grade design + answers against pinned architecture-decision rubric.
 * On resolve, submit route marks portfolio_items.is_flagship for this track.
 */

export {
  INFRA_DESIGN_DOC_MIN_BODY_LENGTH,
  INFRA_DESIGN_DOC_MIN_TITLE_LENGTH,
  INFRA_DESIGN_FOLLOWUP_MIN_ANSWER_LENGTH,
} from '@/lib/scoring/ticketUi';

export type InfraDesignCapstoneExpectedState = {
  minBodyLength?: number;
  minTitleLength?: number;
  minAnswerLength?: number;
  flagshipOnResolve?: boolean;
};

export type InfraDesignCapstoneSubmission = {
  type?: string;
  designDoc?: InfraDesignDocument;
  title?: string;
  body?: string;
  topologyChoice?: string;
  questions?: InfraFollowUpQuestion[];
  answers?: Record<string, string>;
};

export type InfraDesignCapstoneStructuredResult = {
  style: 'infra_design_capstone';
  flagshipEligible: true;
  titleLength: number;
  bodyLength: number;
  minTitleLength: number;
  minBodyLength: number;
  questionCount: number;
  answeredCount: number;
  shortAnswerIds: string[];
  missingAnswerIds: string[];
  minAnswerLength: number;
  designOk: boolean;
  answersOk: boolean;
  rubricPath: string | null;
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

export function parseInfraDesignCapstoneExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): InfraDesignCapstoneExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }
  return expectedState as InfraDesignCapstoneExpectedState;
}

function resolveMin(
  value: unknown,
  fallback: number
): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}

export function extractInfraDesignDocument(
  submission: TicketSubmission
): InfraDesignDocument | null {
  const nested = submission.designDoc;
  if (isPlainObject(nested)) {
    const title =
      typeof nested.title === 'string' ? nested.title.trim() : '';
    const body = typeof nested.body === 'string' ? nested.body.trim() : '';
    const topologyChoice =
      typeof nested.topologyChoice === 'string' && nested.topologyChoice.trim()
        ? nested.topologyChoice.trim()
        : typeof nested.topology_choice === 'string' &&
            nested.topology_choice.trim()
          ? nested.topology_choice.trim()
          : undefined;
    if (title || body) {
      return { title, body, topologyChoice };
    }
  }

  const title =
    typeof submission.title === 'string' ? submission.title.trim() : '';
  const body =
    typeof submission.body === 'string'
      ? submission.body.trim()
      : typeof submission.designBody === 'string'
        ? submission.designBody.trim()
        : typeof submission.design_body === 'string'
          ? submission.design_body.trim()
          : '';
  const topologyChoice =
    typeof submission.topologyChoice === 'string' &&
    submission.topologyChoice.trim()
      ? submission.topologyChoice.trim()
      : typeof submission.topology_choice === 'string' &&
          submission.topology_choice.trim()
        ? submission.topology_choice.trim()
        : undefined;

  if (!title && !body) return null;
  return { title, body, topologyChoice };
}

export function extractInfraFollowUpQuestions(
  submission: TicketSubmission
): InfraFollowUpQuestion[] {
  const raw = submission.questions;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry, index): InfraFollowUpQuestion | null => {
      if (!isPlainObject(entry)) return null;
      const prompt =
        typeof entry.prompt === 'string'
          ? entry.prompt.trim()
          : typeof entry.question === 'string'
            ? entry.question.trim()
            : '';
      if (!prompt) return null;
      const id =
        typeof entry.id === 'string' && entry.id.trim()
          ? entry.id.trim()
          : `q${index + 1}`;
      const focus =
        typeof entry.focus === 'string' && entry.focus.trim()
          ? entry.focus.trim()
          : undefined;
      return { id, prompt, focus };
    })
    .filter((q): q is InfraFollowUpQuestion => q !== null);
}

export function extractInfraFollowUpAnswers(
  submission: TicketSubmission
): Record<string, string> {
  const nested = submission.answers;
  if (!isPlainObject(nested)) return {};

  const answers: Record<string, string> = {};
  for (const [key, value] of Object.entries(nested)) {
    if (typeof value === 'string') {
      answers[key] = value;
    }
  }
  return answers;
}

export function evaluateInfraDesignCapstoneDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  ok: boolean;
  designDoc: InfraDesignDocument | null;
  questions: InfraFollowUpQuestion[];
  answers: Record<string, string>;
  structured: InfraDesignCapstoneStructuredResult;
  feedback: string;
} {
  const expected = parseInfraDesignCapstoneExpectedState(ticket.expected_state);
  const minBodyLength = resolveMin(
    expected.minBodyLength,
    INFRA_DESIGN_DOC_MIN_BODY_LENGTH
  );
  const minTitleLength = resolveMin(
    expected.minTitleLength,
    INFRA_DESIGN_DOC_MIN_TITLE_LENGTH
  );
  const minAnswerLength = resolveMin(
    expected.minAnswerLength,
    INFRA_DESIGN_FOLLOWUP_MIN_ANSWER_LENGTH
  );

  const designDoc = extractInfraDesignDocument(submission);
  const questions = extractInfraFollowUpQuestions(submission);
  const answers = extractInfraFollowUpAnswers(submission);

  const titleLength = designDoc?.title.trim().length ?? 0;
  const bodyLength = designDoc?.body.trim().length ?? 0;

  const missingAnswerIds: string[] = [];
  const shortAnswerIds: string[] = [];
  for (const question of questions) {
    const answer = answers[question.id]?.trim() ?? '';
    if (!answer) {
      missingAnswerIds.push(question.id);
    } else if (answer.length < minAnswerLength) {
      shortAnswerIds.push(question.id);
    }
  }

  const answeredCount = questions.filter(
    (q) => (answers[q.id]?.trim().length ?? 0) > 0
  ).length;

  const designOk =
    Boolean(designDoc) &&
    titleLength >= minTitleLength &&
    bodyLength >= minBodyLength;

  const answersOk =
    questions.length >= INFRA_FOLLOWUP_QUESTION_MIN &&
    missingAnswerIds.length === 0 &&
    shortAnswerIds.length === 0;

  const structured: InfraDesignCapstoneStructuredResult = {
    style: 'infra_design_capstone',
    flagshipEligible: true,
    titleLength,
    bodyLength,
    minTitleLength,
    minBodyLength,
    questionCount: questions.length,
    answeredCount,
    shortAnswerIds,
    missingAnswerIds,
    minAnswerLength,
    designOk,
    answersOk,
    rubricPath: null,
    retrievedSectionIds: [],
  };

  // Keep the type recognizer referenced so dead-code tools don't drop the import.
  void isInfraDesignCapstoneTicketType(ticket.ticket_type);

  if (!designDoc || titleLength < minTitleLength || bodyLength < minBodyLength) {
    return {
      ok: false,
      designDoc,
      questions,
      answers,
      structured: { ...structured, reason: 'design_doc_incomplete' },
      feedback: !designDoc
        ? 'Submit a design decision document (title + body) before follow-up answers.'
        : titleLength < minTitleLength
          ? `Design document title must be at least ${minTitleLength} characters.`
          : `Design document body must be at least ${minBodyLength} characters (currently ${bodyLength}).`,
    };
  }

  if (questions.length < INFRA_FOLLOWUP_QUESTION_MIN) {
    return {
      ok: false,
      designDoc,
      questions,
      answers,
      structured: { ...structured, reason: 'questions_missing' },
      feedback:
        'Follow-up questions are not loaded yet. Submit your design document to generate tradeoff questions, then answer and resubmit.',
    };
  }

  if (missingAnswerIds.length > 0) {
    return {
      ok: false,
      designDoc,
      questions,
      answers,
      structured: { ...structured, reason: 'missing_answers' },
      feedback: `Answer all follow-up questions. Missing: ${missingAnswerIds.join(', ')}.`,
    };
  }

  if (shortAnswerIds.length > 0) {
    return {
      ok: false,
      designDoc,
      questions,
      answers,
      structured: { ...structured, reason: 'answers_too_short' },
      feedback: `Expand these answers (min ${minAnswerLength} chars): ${shortAnswerIds.join(', ')}.`,
    };
  }

  return {
    ok: true,
    designDoc,
    questions,
    answers,
    structured,
    feedback: 'Design document and follow-up answers meet length checks.',
  };
}

export function createInfraDesignCapstoneTicketScorer(): TicketScorer {
  return {
    async score(submission, ticket): Promise<TicketScoreResult> {
      const deterministic = evaluateInfraDesignCapstoneDeterministic(
        submission,
        ticket
      );

      if (!deterministic.ok || !deterministic.designDoc) {
        return {
          status: 'needs_revision',
          structuredResult: deterministic.structured,
          feedback: deterministic.feedback,
        };
      }

      const designDoc = deterministic.designDoc;
      const packageQuery = [
        designDoc.title,
        designDoc.topologyChoice ?? '',
        designDoc.body,
        ...deterministic.questions.map((q) => q.prompt),
        ...Object.values(deterministic.answers),
      ].join(' ');

      const designSections = retrieveDesignDocSections(
        designDoc,
        packageQuery,
        5
      );
      const designExcerpts =
        designSections
          .map((s) => `### ${s.id} — ${s.title}\n\n${s.text}`)
          .join('\n\n') || formatDesignDocForPrompt(designDoc);

      const rubric = retrieveArchitectureDecisionRubric(packageQuery, {
        topK: 6,
      });

      try {
        const grading = await callClaudeGrading(
          buildInfraDesignCapstoneGradingPrompt(rubric, {
            designTitle: designDoc.title,
            designBody: designDoc.body,
            topologyChoice: designDoc.topologyChoice,
            questions: deterministic.questions,
            answers: deterministic.answers,
            designExcerpts,
            scenarioBrief: ticket.scenario_brief,
          })
        );

        const structured: InfraDesignCapstoneStructuredResult = {
          ...deterministic.structured,
          rubricPath: rubric.catalogPath,
          retrievedSectionIds: [
            ...rubric.sections.map((s) => s.id),
            ...designSections.map((s) => s.id),
          ],
          grading: {
            finding_state: grading.finding_state,
            strengths: grading.strengths,
            gaps: grading.gaps,
          },
        };

        const gapHint =
          grading.gaps.length > 0
            ? `\nGaps: ${grading.gaps.slice(0, 3).join(' ')}`
            : '';

        if (grading.finding_state !== 'satisfied') {
          return {
            status: 'needs_revision',
            structuredResult: structured,
            feedback: `${grading.feedback}${gapHint}`,
          };
        }

        return {
          status: 'resolved',
          structuredResult: structured,
          feedback: `${grading.feedback}${gapHint}\n\nInfrastructure design capstone complete. This resolution is marked as your track flagship portfolio item (PI-07).`,
        };
      } catch (error) {
        if (error instanceof MissingAnthropicApiKeyError) {
          return {
            status: 'resolved',
            structuredResult: {
              ...deterministic.structured,
              rubricPath: rubric.catalogPath,
              retrievedSectionIds: rubric.sections.map((s) => s.id),
              reason: 'rag_feedback_unavailable_missing_api_key',
            },
            feedback:
              'Design document and follow-up answers accepted (length checks passed). AI tradeoff grading is unavailable (ANTHROPIC_API_KEY not configured). This resolution is marked as your track flagship portfolio item (PI-07).',
          };
        }

        console.error('Infra design capstone RAG grading failed:', error);
        captureFeatureException(error, {
          feature: 'scoring',
          pi: 'PI-07',
          operation: 'infra_design_capstone_rag_grade',
          ticketId: ticket.id,
          ticketType: ticket.ticket_type,
          level: 'warning',
        });

        return {
          status: 'resolved',
          structuredResult: {
            ...deterministic.structured,
            rubricPath: rubric.catalogPath,
            reason: 'rag_feedback_error',
          },
          feedback:
            'Design document and follow-up answers accepted (length checks passed). Could not complete AI tradeoff grading right now. This resolution is marked as your track flagship portfolio item (PI-07).',
        };
      }
    },
  };
}

export const infraDesignCapstoneTicketScorer: TicketScorer =
  createInfraDesignCapstoneTicketScorer();
