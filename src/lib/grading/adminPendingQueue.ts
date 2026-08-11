/** Job statuses that admins should always be able to re-run from the grading queue. */
export const ADMIN_RERUN_JOB_STATUSES = [
  'queued',
  'running',
  'failed',
] as const;

export type AdminRerunJobStatus = (typeof ADMIN_RERUN_JOB_STATUSES)[number];

export function isAdminRerunJobStatus(
  status: string | null | undefined
): status is AdminRerunJobStatus {
  return (
    typeof status === 'string' &&
    (ADMIN_RERUN_JOB_STATUSES as readonly string[]).includes(status)
  );
}

/**
 * Whether a submitted lesson_progress row should appear in the admin grading
 * queue as a pending_submission (with Re-run AI grading).
 *
 * Stuck/failed jobs stay visible even when an older finding exists for the
 * same student+lesson (e.g. a resubmit after a prior graded attempt).
 * Otherwise only show submissions that do not yet have a finding.
 */
export function shouldIncludePendingSubmission(args: {
  studentId: string;
  lessonId: string;
  gradingJobStatus: string | null | undefined;
  findingKeys: ReadonlySet<string>;
}): boolean {
  if (isAdminRerunJobStatus(args.gradingJobStatus)) {
    return true;
  }

  return !args.findingKeys.has(`${args.studentId}:${args.lessonId}`);
}
