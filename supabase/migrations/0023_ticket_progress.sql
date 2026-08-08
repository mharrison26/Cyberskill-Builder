-- Per-student ticket progress (parallel to lesson_progress).
-- Supports console status (New / In Progress / Resolved) and SLA countdown via started_at.

-- ---------------------------------------------------------------------------
-- ticket_progress
-- ---------------------------------------------------------------------------
CREATE TABLE public.ticket_progress (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  ticket_id   uuid NOT NULL REFERENCES public.tickets (id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'new',
  started_at  timestamptz,
  resolved_at timestamptz,
  CONSTRAINT ticket_progress_status_check
    CHECK (status IN ('new', 'in_progress', 'resolved')),
  CONSTRAINT ticket_progress_student_ticket_unique UNIQUE (student_id, ticket_id),
  CONSTRAINT ticket_progress_started_when_active_check
    CHECK (
      status = 'new'
      OR started_at IS NOT NULL
    ),
  CONSTRAINT ticket_progress_resolved_at_check
    CHECK (
      (status = 'resolved' AND resolved_at IS NOT NULL)
      OR (status <> 'resolved' AND resolved_at IS NULL)
    )
);

CREATE INDEX ticket_progress_student_id_idx ON public.ticket_progress (student_id);
CREATE INDEX ticket_progress_ticket_id_idx ON public.ticket_progress (ticket_id);

COMMENT ON TABLE public.ticket_progress IS
  'Per-student status for ticket scenarios (New / In Progress / Resolved).';
COMMENT ON COLUMN public.ticket_progress.started_at IS
  'When the student opened/started the ticket; used with tickets.sla_minutes for SLA countdown.';
COMMENT ON COLUMN public.ticket_progress.resolved_at IS
  'When the student submitted/resolved the ticket.';

ALTER TABLE public.ticket_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_progress FORCE ROW LEVEL SECURITY;

-- Mirror lesson_progress: students manage own rows; admins can read.
CREATE POLICY "Tenant students read own ticket progress"
  ON public.ticket_progress
  FOR SELECT
  TO authenticated
  USING (
    (
      student_id = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM public.users AS u
        WHERE u.id = ticket_progress.student_id
          AND u.tenant_id = public.jwt_tenant_id()
      )
    )
    OR public.is_admin()
  );

CREATE POLICY "Tenant students insert own ticket progress"
  ON public.ticket_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users AS u
      WHERE u.id = ticket_progress.student_id
        AND u.tenant_id = public.jwt_tenant_id()
    )
  );

CREATE POLICY "Tenant students update own ticket progress"
  ON public.ticket_progress
  FOR UPDATE
  TO authenticated
  USING (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users AS u
      WHERE u.id = ticket_progress.student_id
        AND u.tenant_id = public.jwt_tenant_id()
    )
  )
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users AS u
      WHERE u.id = ticket_progress.student_id
        AND u.tenant_id = public.jwt_tenant_id()
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.ticket_progress TO authenticated;
