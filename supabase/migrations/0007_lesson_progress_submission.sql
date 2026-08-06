-- Store CCCER submission payload on lesson progress rows.

ALTER TABLE public.lesson_progress
  ADD COLUMN IF NOT EXISTS submission jsonb;

COMMENT ON COLUMN public.lesson_progress.submission IS
  'Student submission payload (CCCER finding or tool walkthrough evidence metadata).';
