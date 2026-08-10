-- Ticket attempts history + SLA due/met columns for workbench persistence.
-- started_at / resolved_at remain the canonical SLA start/end timestamps
-- (exposed in app code as sla_started_at / sla_resolved_at).

-- ---------------------------------------------------------------------------
-- tickets.max_attempts (nullable → app default)
-- ---------------------------------------------------------------------------
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS max_attempts integer;

ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_max_attempts_check;

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_max_attempts_check
    CHECK (max_attempts IS NULL OR max_attempts >= 1);

COMMENT ON COLUMN public.tickets.max_attempts IS
  'Max graded attempts per student for this scenario. NULL uses the app default (3).';

-- ---------------------------------------------------------------------------
-- ticket_progress SLA + last grade snapshot
-- ---------------------------------------------------------------------------
ALTER TABLE public.ticket_progress
  ADD COLUMN IF NOT EXISTS sla_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_met boolean,
  ADD COLUMN IF NOT EXISTS last_score_status text,
  ADD COLUMN IF NOT EXISTS last_feedback text,
  ADD COLUMN IF NOT EXISTS last_structured_result jsonb,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.ticket_progress
  DROP CONSTRAINT IF EXISTS ticket_progress_last_score_status_check;

ALTER TABLE public.ticket_progress
  ADD CONSTRAINT ticket_progress_last_score_status_check
    CHECK (
      last_score_status IS NULL
      OR last_score_status IN ('resolved', 'needs_revision')
    );

ALTER TABLE public.ticket_progress
  DROP CONSTRAINT IF EXISTS ticket_progress_attempt_count_check;

ALTER TABLE public.ticket_progress
  ADD CONSTRAINT ticket_progress_attempt_count_check
    CHECK (attempt_count >= 0);

COMMENT ON COLUMN public.ticket_progress.sla_due_at IS
  'Server-computed SLA deadline (started_at + tickets.sla_minutes).';
COMMENT ON COLUMN public.ticket_progress.sla_met IS
  'Server-computed whether the latest resolution finished within SLA; null until resolved.';
COMMENT ON COLUMN public.ticket_progress.last_score_status IS
  'Latest scorer outcome (resolved | needs_revision) for workbench rehydration.';
COMMENT ON COLUMN public.ticket_progress.last_feedback IS
  'Latest scorer feedback narrative for workbench rehydration.';
COMMENT ON COLUMN public.ticket_progress.last_structured_result IS
  'Latest structured score payload (includes trainingFeedback) for rehydration.';
COMMENT ON COLUMN public.ticket_progress.attempt_count IS
  'Number of graded attempts recorded for this student/ticket.';

-- Backfill sla_due_at for rows that already have started_at.
UPDATE public.ticket_progress AS tp
SET sla_due_at = tp.started_at + (t.sla_minutes * interval '1 minute')
FROM public.tickets AS t
WHERE t.id = tp.ticket_id
  AND tp.started_at IS NOT NULL
  AND tp.sla_due_at IS NULL;

-- Backfill sla_met for already-resolved rows.
UPDATE public.ticket_progress AS tp
SET sla_met = (
  tp.resolved_at IS NOT NULL
  AND tp.started_at IS NOT NULL
  AND tp.resolved_at <= tp.started_at + (t.sla_minutes * interval '1 minute')
)
FROM public.tickets AS t
WHERE t.id = tp.ticket_id
  AND tp.status = 'resolved'
  AND tp.sla_met IS NULL
  AND tp.started_at IS NOT NULL
  AND tp.resolved_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- ticket_attempts (immutable graded attempt ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ticket_attempts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  ticket_id          uuid NOT NULL REFERENCES public.tickets (id) ON DELETE CASCADE,
  attempt_number     integer NOT NULL,
  submitted_at       timestamptz NOT NULL DEFAULT now(),
  score_status       text NOT NULL,
  feedback           text,
  submission         jsonb NOT NULL DEFAULT '{}'::jsonb,
  structured_result  jsonb NOT NULL DEFAULT '{}'::jsonb,
  sla_started_at     timestamptz,
  sla_due_at         timestamptz,
  sla_resolved_at    timestamptz,
  sla_met            boolean,
  CONSTRAINT ticket_attempts_attempt_number_check
    CHECK (attempt_number >= 1),
  CONSTRAINT ticket_attempts_score_status_check
    CHECK (score_status IN ('resolved', 'needs_revision')),
  CONSTRAINT ticket_attempts_student_ticket_number_unique
    UNIQUE (student_id, ticket_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS ticket_attempts_student_id_idx
  ON public.ticket_attempts (student_id);
CREATE INDEX IF NOT EXISTS ticket_attempts_ticket_id_idx
  ON public.ticket_attempts (ticket_id);
CREATE INDEX IF NOT EXISTS ticket_attempts_student_ticket_submitted_idx
  ON public.ticket_attempts (student_id, ticket_id, submitted_at DESC);

COMMENT ON TABLE public.ticket_attempts IS
  'Immutable per-attempt grade ledger for ticket workbench scenarios.';
COMMENT ON COLUMN public.ticket_attempts.sla_started_at IS
  'SLA clock start for this attempt (mirrors ticket_progress.started_at at submit).';
COMMENT ON COLUMN public.ticket_attempts.sla_due_at IS
  'SLA deadline for this attempt.';
COMMENT ON COLUMN public.ticket_attempts.sla_resolved_at IS
  'When this attempt was graded/resolved.';
COMMENT ON COLUMN public.ticket_attempts.sla_met IS
  'Whether this attempt finished within SLA (server-computed).';

ALTER TABLE public.ticket_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_attempts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant students read own ticket attempts"
  ON public.ticket_attempts;
CREATE POLICY "Tenant students read own ticket attempts"
  ON public.ticket_attempts
  FOR SELECT
  TO authenticated
  USING (
    (
      student_id = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM public.users AS u
        WHERE u.id = ticket_attempts.student_id
          AND u.tenant_id = public.jwt_tenant_id()
      )
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Tenant students insert own ticket attempts"
  ON public.ticket_attempts;
CREATE POLICY "Tenant students insert own ticket attempts"
  ON public.ticket_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users AS u
      WHERE u.id = ticket_attempts.student_id
        AND u.tenant_id = public.jwt_tenant_id()
    )
  );

-- Attempts are immutable after insert (no student UPDATE/DELETE).
GRANT SELECT, INSERT ON public.ticket_attempts TO authenticated;
