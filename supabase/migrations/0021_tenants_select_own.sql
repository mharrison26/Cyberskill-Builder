-- Allow authenticated users to read their own tenant row (e.g. SimulatedDataBanner checks tenant_kind).
-- Without this, isDodAdjacentTenant() fails closed when querying public.tenants.

GRANT SELECT ON public.tenants TO authenticated;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenants_select_own ON public.tenants;

CREATE POLICY tenants_select_own
  ON public.tenants
  FOR SELECT
  TO authenticated
  USING (id = public.jwt_tenant_id());
