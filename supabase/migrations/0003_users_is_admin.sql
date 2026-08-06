-- Add admin flag to public.users for server-side authorization checks.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_admin IS
  'When true, user may access admin routes and privileged operations.';

-- One-off: grant admin to your account (run manually in Supabase SQL Editor)
-- UPDATE public.users SET is_admin = true WHERE email = 'your-email@example.com';
-- OR by auth id:
-- UPDATE public.users SET is_admin = true WHERE id = '<auth-user-uuid>';
