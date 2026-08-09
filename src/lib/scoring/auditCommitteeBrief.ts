import {
  AC_QUESTION_MIN,
  type AuditCommitteeQuestion,
} from '@/lib/grc/generateAuditCommitteeQuestions';
import { retrieveAuditCommitteeGuidance } from '@/lib/grc/getAuditCommitteeGuidance';
import { isAuditCommitteeBriefTicketType } from '@/lib/grc/ticketCodes';
import {
  formatSummaryForPrompt,
  retrieveSummarySections,
} from '@/lib/grc/summaryCorpus';
import { buildAuditCommitteeBriefGradingPrompt } from '@/lib/grading/buildAuditCommitteeBriefGradingPrompt';
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
  AUDIT_COMMITTEE_BRIEF_MIN_SUMMARY_LENGTH,
  AUDIT_COMMITTEE_BRIEF_QUESTION_MAX,
  AUDIT_COMMITTEE_BRIEF_QUESTION_MIN,
} from '@/lib/scoring/ticketUi';

/**
 * GRC audit-committee brief (AUD-07 flagship).
 *
 * Phase 1: student writes a short executive summary compiling prior findings
 * (AUD-06 findings_summary / CCCER, or seeded prior_findings).
 * Phase 2: 4–5 RAG audit-committee questions grounded in that summary +
 * pinned AC/governance guidance.
 *
 * Deterministic: non-trivial summary; questions present (count 4–5).
 * RAG: grade summary quality + suitability of AC questions.
 * On resolve, submit route marks portfolio_items.is_flagship for this track.
 */

export {
  AUDIT_COMMITTEE_BRIEF_MIN_SUMMARY_LENGTH,
  AUDIT_COMMITTEE_BRIEF_QUESTION_MAX,
  AUDIT_COMMITTEE_BRIEF_QUESTION_MIN,
} from '@/lib/scoring/ticketUi';

export type AuditCommitteeBriefExpectedState = {
  minSummaryLength?: number;
  questionMin?: number;
  questionMax?: number;
  flagshipOnResolve?: boolean;
  guidancePath?: string;
  topKGuidanceSections?: number;
};

export type AuditCommitteeBriefSubmission = {
  type?: string;
  executiveSummary?: string;
  summary?: string;
  questions?: AuditCommitteeQuestion[];
  priorFindingsNarrative?: string;
};

export type AuditCommitteeBriefStructuredResult = {
  style: 'audit_committee_brief';
  flagshipEligible: true;
  summaryLength: number;
  minSummaryLength: number;
  questionCount: number;
  questionMin: number;
  questionMax: number;
  summaryOk: boolean;
  questionsOk: boolean;
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

export function parseAuditCommitteeBriefExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): AuditCommitteeBriefExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }
  return expectedState as AuditCommitteeBriefExpectedState;
}

function resolveMin(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}

export function extractExecutiveSummary(
  submission: TicketSubmission
): string {
  const nested = submission.executiveSummary;
  if (typeof nested === 'string' && nested.trim()) {
    return nested.trim();
  }
  if (typeof submission.summary === 'string' && submission.summary.trim()) {
    return submission.summary.trim();
  }
  if (typeof submission.body === 'string' && submission.body.trim()) {
    return submission.body.trim();
  }
  return '';
}

export function extractAuditCommitteeQuestions(
  submission: TicketSubmission
): AuditCommitteeQuestion[] {
  const raw = submission.questions;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry, index): AuditCommitteeQuestion | null => {
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
    .filter((q): q is AuditCommitteeQuestion => q !== null);
}

export function evaluateAuditCommitteeBriefDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  ok: boolean;
  executiveSummary: string;
  questions: AuditCommitteeQuestion[];
  structured: AuditCommitteeBriefStructuredResult;
  feedback: string;
} {
  const expected = parseAuditCommitteeBriefExpectedState(ticket.expected_state);
  const minSummaryLength = resolveMin(
    expected.minSummaryLength,
    AUDIT_COMMITTEE_BRIEF_MIN_SUMMARY_LENGTH
  );
  const questionMin = resolveMin(
    expected.questionMin,
    AUDIT_COMMITTEE_BRIEF_QUESTION_MIN
  );
  const questionMax = resolveMin(
    expected.questionMax,
    AUDIT_COMMITTEE_BRIEF_QUESTION_MAX
  );

  const executiveSummary = extractExecutiveSummary(submission);
  const questions = extractAuditCommitteeQuestions(submission);
  const summaryLength = executiveSummary.length;
  const summaryOk = summaryLength >= minSummaryLength;
  const questionsOk =
    questions.length >= questionMin && questions.length <= questionMax;

  // Keep recognizer referenced so tree-shaking tools don't drop the import.
  void isAuditCommitteeBriefTicketType(ticket.ticket_type);

  const structured: AuditCommitteeBriefStructuredResult = {
    style: 'audit_committee_brief',
    flagshipEligible: true,
    summaryLength,
    minSummaryLength,
    questionCount: questions.length,
    questionMin,
    questionMax,
    summaryOk,
    questionsOk,
    guidancePath: null,
    retrievedSectionIds: [],
  };

  if (!summaryOk) {
    return {
      ok: false,
      executiveSummary,
      questions,
      structured: { ...structured, reason: 'summary_too_short' },
      feedback: executiveSummary
        ? `Executive summary must be at least ${minSummaryLength} characters (currently ${summaryLength}).`
        : 'Write a short executive summary compiling the prior findings before generating audit-committee questions.',
    };
  }

  if (questions.length < Math.max(questionMin, AC_QUESTION_MIN)) {
    return {
      ok: false,
      executiveSummary,
      questions,
      structured: { ...structured, reason: 'questions_missing' },
      feedback:
        'Audit-committee questions are not loaded yet. Generate questions from your executive summary, review the package, then resubmit.',
    };
  }

  if (questions.length > questionMax) {
    return {
      ok: false,
      executiveSummary,
      questions,
      structured: { ...structured, reason: 'too_many_questions' },
      feedback: `Expected ${questionMin}–${questionMax} audit-committee questions (currently ${questions.length}).`,
    };
  }

  return {
    ok: true,
    executiveSummary,
    questions,
    structured,
    feedback:
      'Executive summary and audit-committee questions meet length/count checks.',
  };
}

export function createAuditCommitteeBriefTicketScorer(): TicketScorer {
  return {
    async score(submission, ticket): Promise<TicketScoreResult> {
      const deterministic = evaluateAuditCommitteeBriefDeterministic(
        submission,
        ticket
      );

      if (!deterministic.ok) {
        return {
          status: 'needs_revision',
          structuredResult: deterministic.structured,
          feedback: deterministic.feedback,
        };
      }

      const expected = parseAuditCommitteeBriefExpectedState(
        ticket.expected_state
      );
      const topK = resolveMin(expected.topKGuidanceSections, 6);
      const priorFindingsNarrative =
        typeof submission.priorFindingsNarrative === 'string'
          ? submission.priorFindingsNarrative
          : typeof submission.prior_findings_narrative === 'string'
            ? submission.prior_findings_narrative
            : undefined;

      const packageQuery = [
        deterministic.executiveSummary,
        ...deterministic.questions.map((q) => q.prompt),
        priorFindingsNarrative ?? '',
      ].join(' ');

      const summarySections = retrieveSummarySections(
        { body: deterministic.executiveSummary },
        packageQuery,
        5
      );
      const summaryExcerpts =
        summarySections
          .map((s) => `### ${s.id} — ${s.title}\n\n${s.text}`)
          .join('\n\n') ||
        formatSummaryForPrompt({ body: deterministic.executiveSummary });

      const guidance = retrieveAuditCommitteeGuidance(packageQuery, { topK });

      try {
        const grading = await callClaudeGrading(
          buildAuditCommitteeBriefGradingPrompt(guidance, {
            executiveSummary: deterministic.executiveSummary,
            questions: deterministic.questions,
            summaryExcerpts,
            priorFindingsNarrative,
            scenarioBrief: ticket.scenario_brief,
          })
        );

        const structured: AuditCommitteeBriefStructuredResult = {
          ...deterministic.structured,
          guidancePath: guidance.catalogPath,
          retrievedSectionIds: [
            ...guidance.sections.map((s) => s.id),
            ...summarySections.map((s) => s.id),
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
          feedback: `${grading.feedback}${gapHint}\n\nAudit-committee brief complete. This resolution is marked as your track flagship portfolio item (AUD-07).`,
        };
      } catch (error) {
        if (error instanceof MissingAnthropicApiKeyError) {
          return {
            status: 'resolved',
            structuredResult: {
              ...deterministic.structured,
              guidancePath: guidance.catalogPath,
              retrievedSectionIds: guidance.sections.map((s) => s.id),
              reason: 'rag_feedback_unavailable_missing_api_key',
            },
            feedback:
              'Executive summary and audit-committee questions accepted (length/count checks passed). AI grading is unavailable (ANTHROPIC_API_KEY not configured). This resolution is marked as your track flagship portfolio item (AUD-07).',
          };
        }

        console.error('Audit committee brief RAG grading failed:', error);
        captureFeatureException(error, {
          feature: 'scoring',
          pi: 'PI-07',
          operation: 'audit_committee_brief_rag_grade',
          ticketId: ticket.id,
          ticketType: ticket.ticket_type,
          level: 'warning',
        });

        return {
          status: 'resolved',
          structuredResult: {
            ...deterministic.structured,
            guidancePath: guidance.catalogPath,
            reason: 'rag_feedback_error',
          },
          feedback:
            'Executive summary and audit-committee questions accepted (length/count checks passed). Could not complete AI grading right now. This resolution is marked as your track flagship portfolio item (AUD-07).',
        };
      }
    },
  };
}

export const auditCommitteeBriefTicketScorer: TicketScorer =
  createAuditCommitteeBriefTicketScorer();
