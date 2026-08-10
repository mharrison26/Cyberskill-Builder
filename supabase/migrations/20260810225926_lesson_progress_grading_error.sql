-- Persist AI grading failure state on lesson_progress so a grading error
-- cannot leave students stuck on an indefinite "awaiting grading" message,
-- and so admins can see submitted work that has not produced a finding yet.

ALTER TABLE public.lesson_progress
  ADD COLUMN IF NOT EXISTS grading_error text,
  ADD COLUMN IF NOT EXISTS grading_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS graded_at timestamptz;

COMMENT ON COLUMN public.lesson_progress.grading_error IS
  'Last AI grading failure message; null when grading succeeded or has not failed.';

COMMENT ON COLUMN public.lesson_progress.grading_started_at IS
  'When the most recent AI grading attempt began.';

COMMENT ON COLUMN public.lesson_progress.graded_at IS
  'When AI grading last completed successfully.';
