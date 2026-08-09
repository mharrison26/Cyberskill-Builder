-- Ensure users can always read their own profile row by auth.uid(),
-- even while an active-tenant switch is refreshing the JWT claim.
DROP POLICY IF EXISTS "Users read own profile by id" ON public.users;
CREATE POLICY "Users read own profile by id"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());
