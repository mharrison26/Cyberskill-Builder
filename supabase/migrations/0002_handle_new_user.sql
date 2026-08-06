-- Auth integration: link auth.users signups to public.users with tenant resolution.
--
-- Sign-up form assumptions (pass in user metadata via supabase.auth.signUp options.data):
--   invite_code  — preferred; matched against tenants.invite_code
--   cohort_code  — alias for invite_code (either field is accepted)
--   tenant_id    — optional explicit UUID override (must reference an existing tenant)
--
-- If none of the above resolve to a tenant, the user is assigned the default
-- 'commercial' tenant (seeded below with a stable UUID).
--
-- RLS note: public.users has RLS enabled. handle_new_user() runs as SECURITY
-- DEFINER (owner bypasses RLS) so trigger inserts succeed without a client
-- INSERT policy. Add client policies when wiring auth, e.g.:
--   SELECT/UPDATE WHERE id = auth.uid()

-- ---------------------------------------------------------------------------
-- tenants: invite_code column for cohort/invite routing
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenants
  ADD COLUMN invite_code text;

CREATE UNIQUE INDEX tenants_invite_code_unique_idx
  ON public.tenants (invite_code)
  WHERE invite_code IS NOT NULL;

COMMENT ON COLUMN public.tenants.invite_code IS
  'Optional signup code routing new users to this tenant. NULL for default/fallback tenants.';

-- ---------------------------------------------------------------------------
-- Seed default commercial tenant (stable UUID for idempotent lookups)
-- ---------------------------------------------------------------------------
INSERT INTO public.tenants (id, name, tenant_kind, invite_code)
VALUES (
  '00000000-0000-4000-8000-000000000001'::uuid,
  'Commercial',
  'commercial',
  NULL
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Resolve tenant from auth signup metadata
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

  -- 2. Invite or cohort code → tenants.invite_code
  code := COALESCE(
    NULLIF(meta->>'invite_code', ''),
    NULLIF(meta->>'cohort_code', '')
  );

  IF code IS NOT NULL THEN
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
  'Maps auth signup metadata (tenant_id, invite_code, cohort_code) to a tenant UUID; falls back to commercial.';

-- ---------------------------------------------------------------------------
-- Trigger function: create public.users row on auth.users INSERT
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_tenant_id uuid;
  user_email text;
BEGIN
  resolved_tenant_id := public.resolve_tenant_for_new_user(NEW.raw_user_meta_data);

  -- auth.users.email may be NULL for phone-only signups; satisfy NOT NULL on public.users
  user_email := COALESCE(
    NULLIF(NEW.email, ''),
    NULLIF(NEW.raw_user_meta_data->>'email', ''),
    'unknown+' || NEW.id::text || '@users.noreply'
  );

  INSERT INTO public.users (id, tenant_id, email)
  VALUES (NEW.id, resolved_tenant_id, user_email);

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'AFTER INSERT on auth.users: creates public.users row with tenant resolved from signup metadata.';

-- Allow Supabase Auth to invoke the trigger function
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.resolve_tenant_for_new_user(jsonb) TO supabase_auth_admin;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_tenant_for_new_user(jsonb) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Trigger on auth.users
-- ---------------------------------------------------------------------------
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
