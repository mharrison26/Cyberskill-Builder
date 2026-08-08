-- Daily Fly sandbox machine-hours per tenant (PI-12 cost controls).
-- Written by the sandbox-cost-controls cron (service role); students have no write access.

-- ---------------------------------------------------------------------------
-- sandbox_usage
-- ---------------------------------------------------------------------------
CREATE TABLE public.sandbox_usage (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  usage_date      date NOT NULL,
  machine_hours   numeric(12, 4) NOT NULL DEFAULT 0,
  machine_count   integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sandbox_usage_machine_hours_check
    CHECK (machine_hours >= 0),
  CONSTRAINT sandbox_usage_machine_count_check
    CHECK (machine_count >= 0),
  CONSTRAINT sandbox_usage_tenant_date_unique UNIQUE (tenant_id, usage_date)
);

CREATE INDEX sandbox_usage_tenant_id_idx ON public.sandbox_usage (tenant_id);
CREATE INDEX sandbox_usage_usage_date_idx ON public.sandbox_usage (usage_date);
CREATE INDEX sandbox_usage_tenant_date_idx
  ON public.sandbox_usage (tenant_id, usage_date);

COMMENT ON TABLE public.sandbox_usage IS
  'Daily aggregated Fly sandbox machine-hours per tenant; upserted by cost-controls cron.';
COMMENT ON COLUMN public.sandbox_usage.machine_hours IS
  'Sum of session wall-clock hours attributed to usage_date (UTC).';
COMMENT ON COLUMN public.sandbox_usage.machine_count IS
  'Number of sandbox sessions contributing to machine_hours for usage_date.';

ALTER TABLE public.sandbox_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sandbox_usage FORCE ROW LEVEL SECURITY;

-- Admins may read usage for cost monitoring. No student INSERT/UPDATE/DELETE.
CREATE POLICY "Admins read sandbox usage"
  ON public.sandbox_usage
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

GRANT SELECT ON public.sandbox_usage TO authenticated;
-- Writes go through the service role (bypasses RLS); do not grant write to authenticated.
