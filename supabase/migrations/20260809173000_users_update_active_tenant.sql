-- Allow students to switch their active workspace (users.tenant_id)
-- only to a tenant they already hold a membership in.

GRANT UPDATE ON public.users TO authenticated;

DROP POLICY IF EXISTS "Users update own active tenant" ON public.users;
CREATE POLICY "Users update own active tenant"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND tenant_id IN (
      SELECT tm.tenant_id
      FROM public.tenant_memberships tm
      WHERE tm.user_id = auth.uid()
    )
  );
