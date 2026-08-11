-- Durable AI grading job state on lesson_progress.
-- Submissions stay saved even when grading fails or times out; workers
-- claim queued rows, retry with backoff, and mark terminal failure.

ALTER TABLE public.lesson_progress
  ADD COLUMN IF NOT EXISTS grading_job_status text,
  ADD COLUMN IF NOT EXISTS grading_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grading_next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS grading_last_alerted_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lesson_progress_grading_job_status_check'
  ) THEN
    ALTER TABLE public.lesson_progress
      ADD CONSTRAINT lesson_progress_grading_job_status_check
      CHECK (
        grading_job_status IS NULL
        OR grading_job_status IN ('queued', 'running', 'succeeded', 'failed')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.lesson_progress.grading_job_status IS
  'AI grading job state: queued | running | succeeded | failed.';

COMMENT ON COLUMN public.lesson_progress.grading_attempt_count IS
  'Number of AI grading attempts started for the current submission.';

COMMENT ON COLUMN public.lesson_progress.grading_next_retry_at IS
  'Earliest time a failed grading job may be retried automatically.';

COMMENT ON COLUMN public.lesson_progress.grading_last_alerted_at IS
  'When a stuck/failed grading job was last reported to monitoring.';

CREATE INDEX IF NOT EXISTS lesson_progress_grading_jobs_idx
  ON public.lesson_progress (grading_job_status, grading_next_retry_at)
  WHERE status = 'submitted'
    AND grading_job_status IN ('queued', 'running', 'failed');

-- Re-queue legacy stuck submissions (started but never completed/failed)
-- so the grading worker can pick them up after deploy.
UPDATE public.lesson_progress
SET
  grading_job_status = 'queued',
  grading_next_retry_at = now(),
  grading_error = NULL
WHERE status = 'submitted'
  AND graded_at IS NULL
  AND grading_error IS NULL
  AND (
    grading_job_status IS NULL
    OR grading_job_status = 'running'
  );
