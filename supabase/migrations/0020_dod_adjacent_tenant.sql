-- DoD-adjacent training tenant for simulated environments.
-- Students routed here (via cohort code DOD-ADJACENT) see compliance banners on lesson pages.
--
-- Uses tenant id ...0003 so it does not collide with Test Cohort (...0002) from 0019.

COMMENT ON COLUMN public.tenants.tenant_kind IS
  'Tenant classification (e.g. commercial, school, dod_adjacent). dod_adjacent marks simulated training tenants.';

INSERT INTO public.tenants (id, name, tenant_kind, invite_code)
VALUES (
  '00000000-0000-4000-8000-000000000003'::uuid,
  'DoD Adjacent Training',
  'dod_adjacent',
  'DOD-ADJACENT'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cohort_codes (code, tenant_id)
VALUES (
  'DOD-ADJACENT',
  '00000000-0000-4000-8000-000000000003'::uuid
)
ON CONFLICT (code) DO NOTHING;
