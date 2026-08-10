import {
  compileStudentPackage,
  type CompiledAuthorizationPackage,
} from '@/lib/capstone/compilePackage';
import {
  AO_QUESTION_MIN,
  type AoQuestion,
} from '@/lib/capstone/generateAoQuestions';
import { retrievePackageSections } from '@/lib/capstone/packageCorpus';
import { buildAoReviewGradingPrompt } from '@/lib/grading/buildAoReviewGradingPrompt';
import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { retrieveRiskAcceptanceGuidance } from '@/lib/nist/getRiskAcceptanceGuidance';
import { captureFeatureException } from '@/lib/observability/sentry';
import type { PackageCompileFn } from '@/lib/scoring/authorizationPackage';
import { createClient } from '@/lib/supabase/server';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

export {
  AO_REVIEW_MIN_ANSWER_LENGTH,
  AO_REVIEW_MIN_DEFENSE_SECONDS,
} from '@/lib/scoring/ticketUi';
import {
  AO_REVIEW_MIN_ANSWER_LENGTH,
  AO_REVIEW_MIN_DEFENSE_SECONDS,
} from '@/lib/scoring/ticketUi';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AoReviewResponsePath = 'verbal' | 'written';

export type AoReviewStructuredResult = {
  style: 'ao_review';
  /** Track flagship portfolio item on resolve (sheet GRC-10 / ISSO-05 / legacy GRC-11). */
  flagshipEligible: true;
  /** Primary verbal defense (PI-14 DefenseRecorder) vs written Q&A fallback. */
  responsePath: AoReviewResponsePath;
  defenseRecordingId: string | null;
  defenseDurationSeconds: number | null;
  questionCount: number;
  answeredCount: number;
  shortAnswerIds: string[];
  missingAnswerIds: string[];
  minAnswerLength: number;
  packageComplete: boolean;
  packageSource?: CompiledAuthorizationPackage['packageSource'];
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

export function extractAoQuestions(submission: TicketSubmission): AoQuestion[] {
  const raw = submission.questions;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry, index): AoQuestion | null => {
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
    .filter((q): q is AoQuestion => q !== null);
}

export function extractAoAnswers(
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

export function extractDefenseRecordingId(
  submission: TicketSubmission
): string | null {
  const raw = submission.defenseRecordingId;
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  return id.length > 0 ? id : null;
}

export function evaluateAoReviewDeterministic(
  submission: TicketSubmission,
  options?: { minAnswerLength?: number }
): {
  ok: boolean;
  questions: AoQuestion[];
  answers: Record<string, string>;
  defenseRecordingId: string | null;
  structured: AoReviewStructuredResult;
  feedback: string;
} {
  const minAnswerLength =
    options?.minAnswerLength ?? AO_REVIEW_MIN_ANSWER_LENGTH;
  const questions = extractAoQuestions(submission);
  const answers = extractAoAnswers(submission);
  const defenseRecordingId = extractDefenseRecordingId(submission);
  const usingVerbal = Boolean(defenseRecordingId);

  const missingAnswerIds: string[] = [];
  const shortAnswerIds: string[] = [];

  if (!usingVerbal) {
    for (const question of questions) {
      const answer = answers[question.id]?.trim() ?? '';
      if (!answer) {
        missingAnswerIds.push(question.id);
      } else if (answer.length < minAnswerLength) {
        shortAnswerIds.push(question.id);
      }
    }
  }

  const answeredCount = questions.filter(
    (q) => (answers[q.id]?.trim().length ?? 0) > 0
  ).length;

  const structured: AoReviewStructuredResult = {
    style: 'ao_review',
    flagshipEligible: true,
    responsePath: usingVerbal ? 'verbal' : 'written',
    defenseRecordingId,
    defenseDurationSeconds: null,
    questionCount: questions.length,
    answeredCount,
    shortAnswerIds,
    missingAnswerIds,
    minAnswerLength,
    packageComplete: false,
    guidancePath: null,
    retrievedSectionIds: [],
  };

  if (questions.length < AO_QUESTION_MIN) {
    return {
      ok: false,
      questions,
      answers,
      defenseRecordingId,
      structured: { ...structured, reason: 'questions_missing' },
      feedback:
        'AO review questions are not loaded yet. Open the ticket to generate questions, then answer and resubmit.',
    };
  }

  if (usingVerbal) {
    if (
      !defenseRecordingId ||
      defenseRecordingId.startsWith('defense-local-') ||
      !UUID_RE.test(defenseRecordingId)
    ) {
      return {
        ok: false,
        questions,
        answers,
        defenseRecordingId,
        structured: { ...structured, reason: 'defense_upload_incomplete' },
        feedback:
          'Verbal defense upload did not finish. Confirm & upload to Supabase, then submit again.',
      };
    }

    return {
      ok: true,
      questions,
      answers,
      defenseRecordingId,
      structured,
      feedback:
        'Verbal defense recording attached. Written answers are optional.',
    };
  }

  if (missingAnswerIds.length > 0) {
    return {
      ok: false,
      questions,
      answers,
      defenseRecordingId,
      structured: { ...structured, reason: 'missing_answers' },
      feedback: `Record a verbal defense (primary), or answer all AO questions in writing. Missing: ${missingAnswerIds.join(', ')}.`,
    };
  }

  if (shortAnswerIds.length > 0) {
    return {
      ok: false,
      questions,
      answers,
      defenseRecordingId,
      structured: { ...structured, reason: 'answers_too_short' },
      feedback: `Expand these answers (min ${minAnswerLength} chars), or submit a verbal defense recording instead: ${shortAnswerIds.join(', ')}.`,
    };
  }

  return {
    ok: true,
    questions,
    answers,
    defenseRecordingId,
    structured,
    feedback: 'All AO questions answered.',
  };
}

async function defaultCompilePackage(
  ticket: ScorableTicket
): Promise<CompiledAuthorizationPackage> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  return compileStudentPackage({
    supabase,
    studentId: user.id,
    trackId: ticket.track_id,
    initialState: isPlainObject(ticket.initial_state)
      ? ticket.initial_state
      : {},
  });
}

function minAnswerLengthFromExpected(ticket: ScorableTicket): number {
  const expected = ticket.expected_state;
  if (isPlainObject(expected)) {
    const value = expected.minAnswerLength;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
  }
  return AO_REVIEW_MIN_ANSWER_LENGTH;
}

async function verifyOwnedDefenseRecording(recordingId: string): Promise<{
  ok: boolean;
  durationSeconds: number | null;
  feedback?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      durationSeconds: null,
      feedback: 'Sign in to submit your verbal defense.',
    };
  }

  const { data: recording, error } = await supabase
    .from('defense_recordings')
    .select('id, student_id, duration_seconds, storage_path')
    .eq('id', recordingId)
    .maybeSingle();

  if (error || !recording) {
    return {
      ok: false,
      durationSeconds: null,
      feedback:
        'Could not find your uploaded defense recording. Record again and confirm upload.',
    };
  }

  if (recording.student_id !== user.id) {
    return {
      ok: false,
      durationSeconds: null,
      feedback: 'Defense recording does not belong to the signed-in student.',
    };
  }

  const durationSeconds =
    typeof recording.duration_seconds === 'number'
      ? recording.duration_seconds
      : null;

  if (
    durationSeconds === null ||
    durationSeconds < AO_REVIEW_MIN_DEFENSE_SECONDS
  ) {
    return {
      ok: false,
      durationSeconds,
      feedback: `Verbal defense must be at least ${AO_REVIEW_MIN_DEFENSE_SECONDS} seconds. Record a fuller answer to the AO questions, then resubmit.`,
    };
  }

  if (
    typeof recording.storage_path !== 'string' ||
    !recording.storage_path.trim()
  ) {
    return {
      ok: false,
      durationSeconds,
      feedback: 'Defense recording is missing storage media. Upload again.',
    };
  }

  return { ok: true, durationSeconds };
}

export function createAoReviewTicketScorer(
  compile: PackageCompileFn = defaultCompilePackage
): TicketScorer {
  return {
    async score(submission, ticket): Promise<TicketScoreResult> {
      const deterministic = evaluateAoReviewDeterministic(submission, {
        minAnswerLength: minAnswerLengthFromExpected(ticket),
      });

      if (!deterministic.ok) {
        return {
          status: 'needs_revision',
          structuredResult: deterministic.structured,
          feedback: deterministic.feedback,
        };
      }

      let defenseDurationSeconds: number | null = null;
      if (
        deterministic.structured.responsePath === 'verbal' &&
        deterministic.defenseRecordingId
      ) {
        const verified = await verifyOwnedDefenseRecording(
          deterministic.defenseRecordingId
        );
        if (!verified.ok) {
          return {
            status: 'needs_revision',
            structuredResult: {
              ...deterministic.structured,
              defenseDurationSeconds: verified.durationSeconds,
              reason: 'defense_invalid',
            },
            feedback:
              verified.feedback ??
              'Verbal defense recording could not be verified.',
          };
        }
        defenseDurationSeconds = verified.durationSeconds;
      }

      let pkg: CompiledAuthorizationPackage;
      try {
        pkg = await compile(ticket);
      } catch (error) {
        console.error('AO review package compile failed:', error);
        return {
          status: 'needs_revision',
          structuredResult: {
            ...deterministic.structured,
            defenseDurationSeconds,
            reason: 'compile_failed',
          },
          feedback:
            'Could not load your compiled authorization package for grading. Complete ISSO-04 / GRC-03–09 (or use the seeded sample package), then retry.',
        };
      }

      const hasWrittenAnswers = deterministic.questions.every(
        (q) => (deterministic.answers[q.id]?.trim().length ?? 0) > 0
      );

      // Verbal primary path: record-and-share (no speech AI grading). Optional
      // written answers still go through RAG when complete.
      if (
        deterministic.structured.responsePath === 'verbal' &&
        !hasWrittenAnswers
      ) {
        return {
          status: 'resolved',
          structuredResult: {
            ...deterministic.structured,
            flagshipEligible: true,
            defenseDurationSeconds,
            packageComplete: pkg.complete,
            packageSource: pkg.packageSource,
            reason: 'verbal_defense_accepted',
          },
          feedback:
            'Verbal AO defense accepted (recording uploaded). Speech is not auto-graded — share the clip on your portfolio for recruiters. This resolution is marked as your track flagship portfolio item (ISSO-05).',
        };
      }

      const packageQuery = deterministic.questions
        .map((q) => q.prompt)
        .concat(Object.values(deterministic.answers))
        .join(' ');

      const packageSections = retrievePackageSections(pkg, packageQuery, 6);
      const packageExcerpts = packageSections
        .map((s) => `### ${s.id} — ${s.title}\n\n${s.text}`)
        .join('\n\n');

      const guidance = retrieveRiskAcceptanceGuidance(packageQuery, {
        topK: 5,
      });

      try {
        const grading = await callClaudeGrading(
          buildAoReviewGradingPrompt(guidance, {
            questions: deterministic.questions,
            answers: deterministic.answers,
            packageExcerpts,
            scenarioBrief: ticket.scenario_brief,
          })
        );

        const structured: AoReviewStructuredResult = {
          ...deterministic.structured,
          flagshipEligible: true,
          defenseDurationSeconds,
          packageComplete: pkg.complete,
          packageSource: pkg.packageSource,
          guidancePath: guidance.catalogPath,
          retrievedSectionIds: [
            ...guidance.sections.map((s) => s.id),
            ...packageSections.map((s) => s.id),
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
          feedback: `${grading.feedback}${gapHint}\n\nAO risk-acceptance review complete. This resolution is marked as your track flagship portfolio item (ISSO-05).`,
        };
      } catch (error) {
        if (error instanceof MissingAnthropicApiKeyError) {
          return {
            status: 'resolved',
            structuredResult: {
              ...deterministic.structured,
              flagshipEligible: true,
              defenseDurationSeconds,
              packageComplete: pkg.complete,
              packageSource: pkg.packageSource,
              reason: 'rag_feedback_unavailable_missing_api_key',
            },
            feedback:
              'AO answers accepted (length checks passed). AI risk-acceptance grading is unavailable (ANTHROPIC_API_KEY not configured). This resolution is marked as your track flagship portfolio item (ISSO-05).',
          };
        }

        console.error('AO review RAG grading failed:', error);
        captureFeatureException(error, {
          feature: 'scoring',
          pi: 'PI-03',
          operation: 'ao_review_rag_grade',
          ticketId: ticket.id,
          ticketType: ticket.ticket_type,
          level: 'warning',
        });

        return {
          status: 'resolved',
          structuredResult: {
            ...deterministic.structured,
            flagshipEligible: true,
            defenseDurationSeconds,
            packageComplete: pkg.complete,
            packageSource: pkg.packageSource,
            reason: 'rag_feedback_error',
          },
          feedback:
            'AO answers accepted (length checks passed). Could not complete AI risk-acceptance grading right now. This resolution is marked as your track flagship portfolio item (ISSO-05).',
        };
      }
    },
  };
}

export const aoReviewTicketScorer: TicketScorer = createAoReviewTicketScorer();
