-- Fallback tenant resolution when JWT lacks tenant_id (pre re-login / hook rollout).
--
-- 0015 RLS policies scope rows with jwt_tenant_id(). Without the custom access token
-- hook claim, that function returned NULL and all tenant-scoped reads failed closed
-- (dashboard → /checkout, lessons → not found).
--
-- Resolve tenant from public.users for auth.uid() when the JWT claim is absent.
-- SECURITY DEFINER avoids circular RLS on users during the fallback lookup.

CREATE OR REPLACE FUNCTION public.jwt_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid,
    (SELECT u.tenant_id FROM public.users AS u WHERE u.id = auth.uid())
  );
$$;

COMMENT ON FUNCTION public.jwt_tenant_id() IS
  'Tenant UUID from JWT claim tenant_id, falling back to public.users.tenant_id for auth.uid().';

GRANT EXECUTE ON FUNCTION public.jwt_tenant_id() TO authenticated;
