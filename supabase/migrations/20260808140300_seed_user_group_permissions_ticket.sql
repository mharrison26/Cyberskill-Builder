-- Seed config_remediation user/group/permissions ticket (WebContainer + config-diff).
--
-- Students fulfill a written sysadmin request in the CodeSandbox WebContainer:
--   1. Create local user arivera in simulated etc/passwd
--   2. Add arivera to the developers group in simulated etc/group
--   3. chmod 2770 on srv/projects/shared (setgid + group rwx)
--
-- Grading (ticket_type = config_remediation | config_diff):
--   Deterministic config-diff rules vs resulting filesystem + fileModes (PI-06).
--
-- Lab notes:
--   Real /etc is not writable in WebContainer. Account state lives under the
--   workspace paths etc/passwd and etc/group. Directory mode is collected on
--   submit via Node fs.statSync (CodeSandbox fileModes payload).
--
-- Idempotent: deletes prior seed rows by stable scenario_brief marker per tenant.

WITH seed_tenants AS (
  SELECT id
  FROM public.tenants
  WHERE id IN (
    '00000000-0000-4000-8000-000000000001'::uuid, -- commercial
    '00000000-0000-4000-8000-000000000003'::uuid  -- dod_adjacent
  )
),
grc AS (
  SELECT id AS track_id FROM public.tracks WHERE slug = 'grc'
)
DELETE FROM public.tickets t
USING seed_tenants st, grc
WHERE t.tenant_id = st.id
  AND t.track_id = grc.track_id
  AND t.ticket_type IN ('config_remediation', 'config_diff')
  AND t.scenario_brief LIKE 'Sysadmin provisioning:%';

INSERT INTO public.tickets (
  tenant_id,
  track_id,
  tier,
  ticket_type,
  difficulty,
  sla_minutes,
  scenario_brief,
  initial_state,
  expected_state,
  dcwf_code,
  sort_order
)
SELECT
  st.id,
  grc.track_id,
  2,
  'config_remediation',
  'medium',
  30,
  'Sysadmin provisioning: Create arivera, add to developers, chmod shared project dir',
  jsonb_build_object(
    'files', jsonb_build_object(
      'README.md', $readme$# IT request — local account provisioning

**From:** People Ops / Engineering onboarding
**Subject:** Provision workstation account for Alex Rivera

Please complete the following on the lab host (this WebContainer workspace):

1. **Create user** `arivera`
   - UID/GID: `1005`
   - GECOS: `Alex Rivera`
   - Home: `/home/arivera`
   - Shell: `/bin/bash`
   - Append a standard passwd line to `etc/passwd` (simulated account DB for this lab).

2. **Add to group** `developers` (GID `2001`)
   - Update `etc/group` so `arivera` is a member of `developers`.
   - Keep existing members (`jsmith`, `mchen`).

3. **Directory permissions** on the shared project tree
   - Path: `srv/projects/shared`
   - Mode: `2770` (setgid + owner/group rwx, no world access)

## Workflow

1. Read the request above and inspect `etc/passwd`, `etc/group`, and `srv/projects/shared/`.
2. Use the sandbox terminal and/or editor to apply the changes (`chmod 2770 srv/projects/shared`).
3. Click **Submit lab**.

Grading checks the resulting files and directory mode with deterministic config-diff rules.
$readme$,
      'etc/passwd', $passwd$root:x:0:0:root:/root:/bin/bash
bin:x:1:1:bin:/bin:/sbin/nologin
daemon:x:2:2:daemon:/sbin:/sbin/nologin
jsmith:x:1001:1001:Jordan Smith:/home/jsmith:/bin/bash
mchen:x:1002:1002:Morgan Chen:/home/mchen:/bin/bash
$passwd$,
      'etc/group', $group$root:x:0:
bin:x:1:
daemon:x:2:
developers:x:2001:jsmith,mchen
shared-writers:x:2002:mchen
$group$,
      'srv/projects/shared/README', $shared$# Shared engineering project tree

Group-writable workspace for the developers group. Mode must be 2770 after provisioning.
$shared$,
      'home/jsmith/.keep', '',
      'home/mchen/.keep', ''
    )
  ),
  jsonb_build_object(
    'passThresholdPercent', 100,
    'rules', jsonb_build_array(
      jsonb_build_object(
        'id', 'user_created',
        'type', 'file_contains',
        'path', 'etc/passwd',
        'pattern', 'arivera:x:1005:1005:Alex Rivera:/home/arivera:/bin/bash'
      ),
      jsonb_build_object(
        'id', 'group_membership',
        'type', 'file_contains',
        'path', 'etc/group',
        -- Stored pattern must be JS RegExp source: developers:x:2001:[^\n]*\barivera\b
        'pattern', E'developers:x:2001:[^\\n]*\\barivera\\b',
        'regex', true
      ),
      jsonb_build_object(
        'id', 'shared_dir_mode',
        'type', 'file_permission',
        'path', 'srv/projects/shared',
        'mode', '2770'
      )
    )
  ),
  '411',
  26
FROM (
  SELECT id
  FROM public.tenants
  WHERE id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
) AS st
CROSS JOIN (
  SELECT id AS track_id FROM public.tracks WHERE slug = 'grc'
) AS grc;
