-- Multi-workspace memberships for org/team switcher.
-- users.tenant_id remains the active workspace; memberships list switchable orgs.

CREATE TABLE IF NOT EXISTS public.tenant_memberships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_memberships_user_tenant_unique UNIQUE (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS tenant_memberships_user_id_idx
  ON public.tenant_memberships (user_id);
CREATE INDEX IF NOT EXISTS tenant_memberships_tenant_id_idx
  ON public.tenant_memberships (tenant_id);

COMMENT ON TABLE public.tenant_memberships IS
  'Org/workspace memberships. Active workspace is users.tenant_id.';

ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read own memberships" ON public.tenant_memberships;
CREATE POLICY "Members read own memberships"
  ON public.tenant_memberships
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Backfill: every user is a member of their current tenant.
INSERT INTO public.tenant_memberships (tenant_id, user_id, role)
SELECT u.tenant_id, u.id, 'owner'
FROM public.users u
ON CONFLICT (user_id, tenant_id) DO NOTHING;

-- Let members read tenant rows they belong to (for switcher labels).
DROP POLICY IF EXISTS tenants_select_memberships ON public.tenants;
CREATE POLICY tenants_select_memberships
  ON public.tenants
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT tm.tenant_id
      FROM public.tenant_memberships tm
      WHERE tm.user_id = auth.uid()
    )
  );
