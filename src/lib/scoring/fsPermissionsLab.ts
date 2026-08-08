import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

/**
 * Filesystem permissions lab (PI-04 WebContainer sandbox).
 *
 * Students boot a seeded WebContainer, navigate with cd/ls, inspect modes via
 * `ls -l`, then answer short questions. Scoring is fully deterministic against
 * expected_state.answers (known seeded modes / file contents).
 *
 * initial_state:
 *   {
 *     prompt?: string,
 *     files: Record<string, string>,
 *     modes?: Record<string, string>,           // path → octal mode (e.g. "600")
 *     questions: Array<{
 *       id: string,
 *       prompt: string,
 *       placeholder?: string,
 *       input?: 'text' | 'select',
 *       options?: string[],                    // for select
 *     }>
 *   }
 *
 * expected_state:
 *   {
 *     answers: Record<string, string | string[] | { accept: string[] }>,
 *     passThresholdPercent?: number,          // default 100
 *   }
 *
 * submission:
 *   {
 *     type: 'fs_permissions_lab',
 *     answers: Record<string, string>,
 *   }
 */

export type FsPermissionsLabQuestion = {
  id: string;
  prompt: string;
  placeholder?: string;
  input?: 'text' | 'select';
  options?: string[];
};

export type FsPermissionsLabExpectedState = {
  answers: Record<string, string[]>;
  passThresholdPercent: number;
};

export type FsPermissionsLabSubmission = {
  type?: string;
  answers: Record<string, string>;
};

export type FsPermissionsLabQuestionResult = {
  id: string;
  submitted: string | null;
  accepted: string[];
  match: boolean;
};

export type FsPermissionsLabStructuredResult = {
  style: 'fs_permissions_lab';
  questionResults: FsPermissionsLabQuestionResult[];
  matchedCount: number;
  totalCount: number;
  scorePercent: number;
  passThresholdPercent: number;
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Normalize student/expected short answers for deterministic compare. */
export function normalizeFsAnswer(value: string): string {
  let s = value.trim().replace(/\r\n/g, '\n');
  // Collapse internal whitespace for free-text answers.
  s = s.replace(/\s+/g, ' ');
  // Paths: strip leading ./ and collapse slashes.
  if (s.startsWith('./')) s = s.slice(2);
  s = s.replace(/\\/g, '/').replace(/\/+/g, '/');
  // Modes: strip leading zeros on pure octal (0600 → 600), keep "0" alone.
  if (/^0*[0-7]{3,4}$/.test(s)) {
    const octal = s.replace(/^0+/, '');
    s = octal.length === 0 ? '0' : octal;
  }
  // Symbolic modes: drop leading file-type char if present (-rwx… → rwx…).
  if (/^[-dlcbps][rwxstST-]{9}$/.test(s)) {
    s = s.slice(1);
  }
  return s.toLowerCase();
}

function asAcceptList(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is string => typeof entry === 'string' && entry.trim() !== ''
    );
  }
  if (isPlainObject(value)) {
    const accept = value.accept ?? value.accepted ?? value.values;
    if (Array.isArray(accept)) {
      return accept.filter(
        (entry): entry is string =>
          typeof entry === 'string' && entry.trim() !== ''
      );
    }
    if (typeof accept === 'string' && accept.trim()) {
      return [accept];
    }
  }
  return [];
}

export function parseFsPermissionsLabQuestions(
  initialState: Record<string, unknown> | null | undefined
): FsPermissionsLabQuestion[] {
  if (!isPlainObject(initialState)) return [];
  const raw = initialState.questions;
  if (!Array.isArray(raw)) return [];

  const out: FsPermissionsLabQuestion[] = [];
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const prompt = typeof entry.prompt === 'string' ? entry.prompt.trim() : '';
    if (!id || !prompt) continue;

    const input =
      entry.input === 'select' || entry.type === 'select' ? 'select' : 'text';
    const options = Array.isArray(entry.options)
      ? entry.options.filter((o): o is string => typeof o === 'string')
      : undefined;
    const placeholder =
      typeof entry.placeholder === 'string' ? entry.placeholder : undefined;

    out.push({ id, prompt, input, options, placeholder });
  }
  return out;
}

export function parseFsPermissionsLabExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): FsPermissionsLabExpectedState | null {
  if (!isPlainObject(expectedState)) return null;

  const rawAnswers =
    expectedState.answers ??
    expectedState.expectedAnswers ??
    expectedState.expected_answers;
  if (!isPlainObject(rawAnswers)) return null;

  const answers: Record<string, string[]> = {};
  for (const [id, value] of Object.entries(rawAnswers)) {
    const list = asAcceptList(value);
    if (list.length > 0) {
      answers[id.trim()] = list;
    }
  }
  if (Object.keys(answers).length === 0) return null;

  const thresholdRaw =
    expectedState.passThresholdPercent ??
    expectedState.pass_threshold_percent ??
    expectedState.passThreshold;
  let passThresholdPercent = 100;
  if (
    typeof thresholdRaw === 'number' &&
    Number.isFinite(thresholdRaw) &&
    thresholdRaw > 0
  ) {
    passThresholdPercent = Math.min(100, Math.floor(thresholdRaw));
  }

  return { answers, passThresholdPercent };
}

export function extractFsPermissionsLabSubmission(
  submission: TicketSubmission
): FsPermissionsLabSubmission | null {
  const raw =
    (isPlainObject(submission.answers) && submission.answers) ||
    (isPlainObject(submission.responses) && submission.responses) ||
    null;
  if (!raw) return null;

  const answers: Record<string, string> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      answers[id] = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      answers[id] = String(value);
    }
  }
  if (Object.keys(answers).length === 0) return null;

  return {
    type:
      typeof submission.type === 'string' ? submission.type : 'fs_permissions_lab',
    answers,
  };
}

function answerMatches(submitted: string, accepted: string[]): boolean {
  const normalized = normalizeFsAnswer(submitted);
  if (!normalized) return false;
  return accepted.some((entry) => normalizeFsAnswer(entry) === normalized);
}

export function evaluateFsPermissionsLab(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: FsPermissionsLabSubmission | null;
  structured: FsPermissionsLabStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseFsPermissionsLabExpectedState(ticket.expected_state);
  const questions = parseFsPermissionsLabQuestions(ticket.initial_state);
  const parsed = extractFsPermissionsLabSubmission(submission);

  const questionIds =
    questions.length > 0
      ? questions.map((q) => q.id)
      : expected
        ? Object.keys(expected.answers)
        : [];

  if (!expected) {
    return {
      parsed,
      structured: {
        style: 'fs_permissions_lab',
        questionResults: [],
        matchedCount: 0,
        totalCount: 0,
        scorePercent: 0,
        passThresholdPercent: 100,
        reason: 'misconfigured_expected_state',
      },
      ok: false,
      feedback:
        'This permissions lab is missing answers in expected_state. Ask an admin to fix the seed.',
    };
  }

  if (questionIds.length === 0) {
    return {
      parsed,
      structured: {
        style: 'fs_permissions_lab',
        questionResults: [],
        matchedCount: 0,
        totalCount: 0,
        scorePercent: 0,
        passThresholdPercent: expected.passThresholdPercent,
        reason: 'misconfigured_questions',
      },
      ok: false,
      feedback:
        'This permissions lab has no questions configured in initial_state.',
    };
  }

  if (!parsed) {
    return {
      parsed: null,
      structured: {
        style: 'fs_permissions_lab',
        questionResults: questionIds.map((id) => ({
          id,
          submitted: null,
          accepted: expected.answers[id] ?? [],
          match: false,
        })),
        matchedCount: 0,
        totalCount: questionIds.length,
        scorePercent: 0,
        passThresholdPercent: expected.passThresholdPercent,
        reason: 'missing_answers',
      },
      ok: false,
      feedback: 'Submission must include answers for each lab question.',
    };
  }

  const questionResults: FsPermissionsLabQuestionResult[] = questionIds.map(
    (id) => {
      const submitted = parsed.answers[id] ?? null;
      const accepted = expected.answers[id] ?? [];
      const match =
        submitted !== null &&
        accepted.length > 0 &&
        answerMatches(submitted, accepted);
      return { id, submitted, accepted, match };
    }
  );

  const matchedCount = questionResults.filter((r) => r.match).length;
  const totalCount = questionResults.length;
  const scorePercent =
    totalCount === 0 ? 0 : Math.round((matchedCount / totalCount) * 100);
  const ok = scorePercent >= expected.passThresholdPercent;

  const missed = questionResults.filter((r) => !r.match).map((r) => r.id);

  return {
    parsed,
    structured: {
      style: 'fs_permissions_lab',
      questionResults,
      matchedCount,
      totalCount,
      scorePercent,
      passThresholdPercent: expected.passThresholdPercent,
      reason: ok ? undefined : 'incorrect_answers',
    },
    ok,
    feedback: ok
      ? `All set — ${matchedCount}/${totalCount} answers match the seeded filesystem (${scorePercent}%).`
      : `Review the sandbox with ls -l and try again. Correct: ${matchedCount}/${totalCount} (${scorePercent}%). Missed: ${missed.join(', ')}.`,
  };
}

export const fsPermissionsLabTicketScorer: TicketScorer = {
  score(submission, ticket): TicketScoreResult {
    const result = evaluateFsPermissionsLab(submission, ticket);
    return {
      status: result.ok ? 'resolved' : 'needs_revision',
      structuredResult: result.structured,
      feedback: result.feedback,
    };
  },
};
