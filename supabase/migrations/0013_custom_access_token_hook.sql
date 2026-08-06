-- Custom Access Token Auth Hook: inject tenant_id into JWT claims.
-- Docs: https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
--
-- Hook output must return { "claims": { ... } } with all required JWT claims preserved.
-- tenant_id is added as a top-level string UUID claim for use in RLS:
--   (auth.jwt() ->> 'tenant_id')::uuid
--
-- ---------------------------------------------------------------------------
-- Register the hook (hosted projects — no SQL registration available)
-- ---------------------------------------------------------------------------
-- Supabase Dashboard:
--   Authentication → Hooks → Custom Access Token Hook
--   Enable hook, type: Postgres function, function: public.custom_access_token_hook
--   Save
--
-- Management API (alternative): PATCH /v1/projects/{ref}/config/auth
--   Set auth.hook.custom_access_token.enabled = true
--   Set auth.hook.custom_access_token.uri = "pg-functions://postgres/public/custom_access_token_hook"
--
-- Local development (supabase/config.toml):
--   [auth.hook.custom_access_token]
--   enabled = true
--   uri = "pg-functions://postgres/public/custom_access_token_hook"
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  original_claims jsonb;
  new_claims jsonb;
  user_tenant_id uuid;
BEGIN
  original_claims := event->'claims';

  SELECT tenant_id INTO user_tenant_id
  FROM public.users
  WHERE id = (event->>'user_id')::uuid;

  new_claims := original_claims;
  IF user_tenant_id IS NOT NULL THEN
    new_claims := jsonb_set(new_claims, '{tenant_id}', to_jsonb(user_tenant_id::text));
  END IF;

  RETURN jsonb_build_object(
    'claims', new_claims
  );
END;
$$;

COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS
  'Auth hook: adds tenant_id (string UUID) from public.users to JWT claims for tenant-scoped RLS.';

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;
