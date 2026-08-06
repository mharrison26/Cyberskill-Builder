# Custom Access Token Auth Hook — tenant_id in JWT

CyberSkill Builder uses a Supabase **Custom Access Token** hook to inject each user's `tenant_id` into their JWT. RLS policies can then scope rows with:

```sql
(auth.jwt() ->> 'tenant_id')::uuid
```

Migration: `supabase/migrations/0013_custom_access_token_hook.sql`

Function: `public.custom_access_token_hook(event jsonb) returns jsonb`

## 1. Apply the migration

**Remote (Supabase MCP or dashboard SQL Editor):**

- Apply `0013_custom_access_token_hook.sql` to project `oyexzmucngsoyxlxhofy`.

**CLI (when installed):**

```bash
supabase link --project-ref oyexzmucngsoyxlxhofy
supabase db push
```

## 2. Enable the hook in Supabase Dashboard

1. Open [Authentication → Hooks](https://supabase.com/dashboard/project/oyexzmucngsoyxlxhofy/auth/hooks).
2. Under **Custom Access Token Hook**, click **Enable**.
3. Hook type: **Postgres function**.
4. Select **`public.custom_access_token_hook`**.
5. Click **Save**.

There is no supported SQL to register this hook on hosted projects; dashboard (or Management API) configuration is required after the migration creates the function.

## 3. Local development (optional)

If using the Supabase CLI locally, add to `supabase/config.toml`:

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

Restart the local stack after changing config.

## 4. Refresh sessions

Existing JWTs do **not** pick up new claims automatically. Each user must:

- Sign out and sign back in, **or**
- Wait for token refresh (depending on session settings).

Until then, `(auth.jwt() ->> 'tenant_id')` will be null in RLS.

## 5. JWT claim format

After sign-in, the access token includes a top-level claim:

```json
{
  "sub": "<user-uuid>",
  "role": "authenticated",
  "tenant_id": "<tenant-uuid-as-string>",
  "...": "other standard claims"
}
```

- **Key:** `tenant_id`
- **Type:** string (UUID text, e.g. `"a1b2c3d4-e5f6-7890-abcd-ef1234567890"`)
- **Source:** `public.users.tenant_id` for `(event->>'user_id')::uuid`

Decode the access token (not only `session.user`) to inspect claims in the app.

## 6. RLS usage example

```sql
CREATE POLICY "Tenant scoped read"
  ON public.some_table
  FOR SELECT
  TO authenticated
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

## 7. Verify

In SQL Editor (as a sanity check on the function):

```sql
SELECT public.custom_access_token_hook(
  jsonb_build_object(
    'user_id', '<existing-user-uuid>',
    'claims', jsonb_build_object(
      'aud', 'authenticated',
      'sub', '<existing-user-uuid>',
      'role', 'authenticated'
    ),
    'authentication_method', 'password'
  )
);
```

Expected: `{ "claims": { ..., "tenant_id": "<uuid-string>" } }` when the user row exists.

## References

- [Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook)
- [Auth Hooks overview](https://supabase.com/docs/guides/auth/auth-hooks)
