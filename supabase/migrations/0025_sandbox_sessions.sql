-- Fly Machines sandbox sessions for Tier 2+ sysadmin/helpdesk tickets (PI-12 cost tracking).

-- ---------------------------------------------------------------------------
-- sandbox_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE public.sandbox_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id             uuid NOT NULL REFERENCES public.tickets (id) ON DELETE CASCADE,
  student_id            uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  tenant_id             uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  machine_id            text NOT NULL,
  machine_name          text,
  region                text,
  status                text NOT NULL DEFAULT 'running',
  started_at            timestamptz NOT NULL DEFAULT now(),
  stopped_at            timestamptz,
  duration_seconds      integer,
  idle_timeout_minutes  integer NOT NULL DEFAULT 20,
  expires_at            timestamptz NOT NULL,
  stop_reason           text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sandbox_sessions_status_check
    CHECK (status IN ('running', 'stopped', 'expired')),
  CONSTRAINT sandbox_sessions_idle_timeout_check
    CHECK (idle_timeout_minutes > 0),
  CONSTRAINT sandbox_sessions_duration_check
    CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  CONSTRAINT sandbox_sessions_stopped_fields_check
    CHECK (
      (status = 'running' AND stopped_at IS NULL AND duration_seconds IS NULL)
      OR (status IN ('stopped', 'expired') AND stopped_at IS NOT NULL)
    )
);

-- At most one active sandbox per student+ticket.
CREATE UNIQUE INDEX sandbox_sessions_one_running_per_student_ticket_idx
  ON public.sandbox_sessions (student_id, ticket_id)
  WHERE status = 'running';

CREATE INDEX sandbox_sessions_student_id_idx ON public.sandbox_sessions (student_id);
CREATE INDEX sandbox_sessions_ticket_id_idx ON public.sandbox_sessions (ticket_id);
CREATE INDEX sandbox_sessions_tenant_id_idx ON public.sandbox_sessions (tenant_id);
CREATE INDEX sandbox_sessions_machine_id_idx ON public.sandbox_sessions (machine_id);
CREATE INDEX sandbox_sessions_started_at_idx ON public.sandbox_sessions (started_at);
CREATE INDEX sandbox_sessions_running_expires_at_idx
  ON public.sandbox_sessions (expires_at)
  WHERE status = 'running';

COMMENT ON TABLE public.sandbox_sessions IS
  'Fly Machines sandbox lifecycle for Tier 2+ shell tickets; duration_seconds feeds PI-12 cost tracking.';
COMMENT ON COLUMN public.sandbox_sessions.machine_id IS
  'Fly Machines API machine id returned on create.';
COMMENT ON COLUMN public.sandbox_sessions.duration_seconds IS
  'Wall-clock seconds from started_at to stopped_at (set on stop/expiry).';
COMMENT ON COLUMN public.sandbox_sessions.idle_timeout_minutes IS
  'Idle timeout used when launching; default 20 minutes.';
COMMENT ON COLUMN public.sandbox_sessions.expires_at IS
  'started_at + idle_timeout_minutes; machine should be destroyed at or before this time.';
COMMENT ON COLUMN public.sandbox_sessions.stop_reason IS
  'Why the session ended: user_stop | idle_timeout | replaced | submit | error.';

ALTER TABLE public.sandbox_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sandbox_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY "Tenant students read own sandbox sessions"
  ON public.sandbox_sessions
  FOR SELECT
  TO authenticated
  USING (
    (
      student_id = auth.uid()
      AND tenant_id = public.jwt_tenant_id()
    )
    OR public.is_admin()
  );

CREATE POLICY "Tenant students insert own sandbox sessions"
  ON public.sandbox_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND tenant_id = public.jwt_tenant_id()
  );

CREATE POLICY "Tenant students update own sandbox sessions"
  ON public.sandbox_sessions
  FOR UPDATE
  TO authenticated
  USING (
    student_id = auth.uid()
    AND tenant_id = public.jwt_tenant_id()
  )
  WITH CHECK (
    student_id = auth.uid()
    AND tenant_id = public.jwt_tenant_id()
  );

GRANT SELECT, INSERT, UPDATE ON public.sandbox_sessions TO authenticated;
