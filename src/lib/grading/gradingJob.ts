/**
 * AI grading job status model and retry / timeout helpers.
 *
 * Jobs live on lesson_progress (not a separate table) so submissions and
 * grading state stay in one durable row.
 */

export const GRADING_JOB_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
] as const;

export type GradingJobStatus = (typeof GRADING_JOB_STATUSES)[number];

/** Max wall-clock time a single attempt may stay in `running` before timeout. */
export const GRADING_JOB_TIMEOUT_MS = 5 * 60 * 1000;

/** Maximum grading attempts (including the first) before terminal failure. */
export const GRADING_MAX_ATTEMPTS = 3;

/** Backoff delays (seconds) before retry after attempt 1, 2, … */
export const GRADING_RETRY_BACKOFF_SECONDS = [30, 120, 300] as const;

export const GRADING_TIMEOUT_USER_MESSAGE =
  'Grading failed — your answer is saved. The AI grader timed out. You can retry.';

export const GRADING_FAILED_USER_MESSAGE =
  'Grading failed — your answer is saved. You can retry.';

export function isGradingJobStatus(value: unknown): value is GradingJobStatus {
  return (
    typeof value === 'string' &&
    (GRADING_JOB_STATUSES as readonly string[]).includes(value)
  );
}

export function gradingRetryDelaySeconds(attemptCount: number): number {
  if (attemptCount <= 0) return GRADING_RETRY_BACKOFF_SECONDS[0];
  const index = Math.min(
    attemptCount - 1,
    GRADING_RETRY_BACKOFF_SECONDS.length - 1
  );
  return GRADING_RETRY_BACKOFF_SECONDS[index];
}

export function nextRetryAtIso(attemptCount: number, now = new Date()): string {
  const delayMs = gradingRetryDelaySeconds(attemptCount) * 1000;
  return new Date(now.getTime() + delayMs).toISOString();
}

export function isGradingJobTimedOut(args: {
  jobStatus: GradingJobStatus | null | undefined;
  gradingStartedAt: string | null | undefined;
  now?: Date;
  timeoutMs?: number;
}): boolean {
  const { jobStatus, gradingStartedAt } = args;
  if (jobStatus !== 'running' || !gradingStartedAt) return false;
  const started = Date.parse(gradingStartedAt);
  if (Number.isNaN(started)) return false;
  const now = args.now ?? new Date();
  const timeoutMs = args.timeoutMs ?? GRADING_JOB_TIMEOUT_MS;
  return now.getTime() - started >= timeoutMs;
}

export type GradingJobTransition =
  | { to: 'queued'; reason?: string }
  | { to: 'running'; attemptCount: number }
  | { to: 'succeeded' }
  | {
      to: 'failed';
      message: string;
      /** When set, job stays failed but is eligible for automatic retry. */
      retryAt?: string | null;
      terminal: boolean;
    };

export function resolveFailureTransition(args: {
  attemptCount: number;
  message: string;
  now?: Date;
}): Extract<GradingJobTransition, { to: 'failed' }> {
  const { attemptCount, message } = args;
  const now = args.now ?? new Date();
  const terminal = attemptCount >= GRADING_MAX_ATTEMPTS;
  return {
    to: 'failed',
    message: message.slice(0, 1000),
    terminal,
    retryAt: terminal ? null : nextRetryAtIso(attemptCount, now),
  };
}
