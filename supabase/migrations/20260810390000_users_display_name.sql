-- User-facing display name (never derived from email).
-- Existing rows stay NULL so users are prompted in account settings.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS display_name text;

COMMENT ON COLUMN public.users.display_name IS
  'Optional preferred name for greetings and UI. Set from auth provider name at signup when present; never backfilled from email.';

-- ---------------------------------------------------------------------------
-- Signup trigger: copy provider name when present; ensure membership row
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
  resolved_display_name text;
BEGIN
  resolved_tenant_id := public.resolve_tenant_for_new_user(NEW.raw_user_meta_data);

  user_email := COALESCE(
    NULLIF(NEW.email, ''),
    NULLIF(NEW.raw_user_meta_data->>'email', ''),
    'unknown+' || NEW.id::text || '@users.noreply'
  );

  -- Prefer provider / signup metadata name fields; leave NULL otherwise.
  resolved_display_name := NULLIF(
    trim(
      COALESCE(
        NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
        NULLIF(NEW.raw_user_meta_data->>'name', ''),
        NULLIF(NEW.raw_user_meta_data->>'display_name', '')
      )
    ),
    ''
  );

  INSERT INTO public.users (id, tenant_id, email, display_name)
  VALUES (NEW.id, resolved_tenant_id, user_email, resolved_display_name);

  INSERT INTO public.tenant_memberships (tenant_id, user_id, role)
  VALUES (resolved_tenant_id, NEW.id, 'owner')
  ON CONFLICT (user_id, tenant_id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'AFTER INSERT on auth.users: creates public.users (with display_name from provider metadata when present) and a tenant_memberships row.';

-- Ensure every existing user can update their row under the membership WITH CHECK.
INSERT INTO public.tenant_memberships (tenant_id, user_id, role)
SELECT u.tenant_id, u.id, 'owner'
FROM public.users u
ON CONFLICT (user_id, tenant_id) DO NOTHING;

-- Public portfolio lookup: include display_name (may be null).
-- DROP required: CREATE OR REPLACE cannot change RETURNS TABLE shape.
DROP FUNCTION IF EXISTS public.get_user_by_username(text);

CREATE FUNCTION public.get_user_by_username(p_username text)
RETURNS TABLE (
  id uuid,
  email text,
  username text,
  display_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.email, u.username, u.display_name
  FROM public.users u
  WHERE lower(u.username) = lower(p_username)
     OR public.email_slug(u.email) = lower(p_username)
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_user_by_username(text) IS
  'Resolve a portfolio slug to a user row (explicit username or email slug), including display_name.';

GRANT EXECUTE ON FUNCTION public.get_user_by_username(text) TO anon, authenticated;

-- Own-row updates (including display_name) use the existing
-- "Users update own active tenant" policy; WITH CHECK still requires the
-- active tenant_id to be a membership. Memberships are ensured above and in
-- handle_new_user. Restrict client updates to safe columns only.
REVOKE UPDATE ON public.users FROM authenticated;
GRANT UPDATE (tenant_id, display_name, username) ON public.users TO authenticated;