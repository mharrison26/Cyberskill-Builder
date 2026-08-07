-- Cohort / invite codes for sign-up tenant routing.
--
-- Flow: sign-up URL ?code=XXX → supabase.auth.signUp({ options: { data: { cohort_code } } })
--       → handle_new_user reads raw_user_meta_data → resolve_tenant_for_new_user
--       → cohort_codes lookup → public.users.tenant_id (default: commercial tenant).
--
-- Default commercial tenant UUID (seeded in 0002_handle_new_user.sql):
--   00000000-0000-4000-8000-000000000001

-- ---------------------------------------------------------------------------
-- cohort_codes
-- ---------------------------------------------------------------------------
CREATE TABLE public.cohort_codes (
  code       text PRIMARY KEY,
  tenant_id  uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cohort_codes_tenant_id_idx ON public.cohort_codes (tenant_id);

COMMENT ON TABLE public.cohort_codes IS
  'Signup codes mapping to a tenant. Resolved by resolve_tenant_for_new_user on auth.users INSERT.';
COMMENT ON COLUMN public.cohort_codes.code IS
  'Unique invite/cohort code passed via sign-up metadata (cohort_code or invite_code).';

-- No client access: lookup happens only inside SECURITY DEFINER trigger functions.
ALTER TABLE public.cohort_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_codes FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Seed test cohort tenant + code (idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO public.tenants (id, name, tenant_kind, invite_code)
VALUES (
  '00000000-0000-4000-8000-000000000002'::uuid,
  'Test Cohort',
  'school',
  NULL
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cohort_codes (code, tenant_id)
VALUES (
  'TEST-COHORT-2026',
  '00000000-0000-4000-8000-000000000002'::uuid
)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- resolve_tenant_for_new_user: lookup cohort_codes before legacy tenants.invite_code
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_tenant_for_new_user(meta jsonb)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  resolved_tenant_id uuid;
  code text;
BEGIN
  -- 1. Explicit tenant_id in metadata (must reference an existing tenant)
  IF meta ? 'tenant_id' AND NULLIF(meta->>'tenant_id', '') IS NOT NULL THEN
    SELECT t.id
    INTO resolved_tenant_id
    FROM public.tenants AS t
    WHERE t.id = (meta->>'tenant_id')::uuid;

    IF resolved_tenant_id IS NOT NULL THEN
      RETURN resolved_tenant_id;
    END IF;
  END IF;

  -- 2. Invite or cohort code → cohort_codes, then legacy tenants.invite_code
  code := COALESCE(
    NULLIF(meta->>'invite_code', ''),
    NULLIF(meta->>'cohort_code', '')
  );

  IF code IS NOT NULL THEN
    SELECT cc.tenant_id
    INTO resolved_tenant_id
    FROM public.cohort_codes AS cc
    WHERE cc.code = code;

    IF resolved_tenant_id IS NOT NULL THEN
      RETURN resolved_tenant_id;
    END IF;

    -- Legacy fallback: tenants.invite_code (pre-cohort_codes deployments)
    SELECT t.id
    INTO resolved_tenant_id
    FROM public.tenants AS t
    WHERE t.invite_code = code;

    IF resolved_tenant_id IS NOT NULL THEN
      RETURN resolved_tenant_id;
    END IF;
  END IF;

  -- 3. Fallback: default commercial tenant
  SELECT t.id
  INTO resolved_tenant_id
  FROM public.tenants AS t
  WHERE t.tenant_kind = 'commercial'
  ORDER BY t.id
  LIMIT 1;

  IF resolved_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Default commercial tenant not found; seed tenants before signup';
  END IF;

  RETURN resolved_tenant_id;
END;
$$;

COMMENT ON FUNCTION public.resolve_tenant_for_new_user(jsonb) IS
  'Maps auth signup metadata (tenant_id, invite_code, cohort_code) to a tenant UUID via cohort_codes; falls back to commercial.';
