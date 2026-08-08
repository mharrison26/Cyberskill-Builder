-- Seed scripting_lab stale-login fixture ticket (WebContainer + config-diff + RAG).
--
-- Students write a short Bash or PowerShell script that reports users who have
-- not logged in for 90+ days from mock last-login logs, run it against seeded
-- fixtures in the CodeSandbox WebContainer (producing per-fixture output files),
-- then submit. Grading (ticket_type = scripting_lab | script_fixtures |
-- script_remediation aliases):
--   1. Deterministic config-diff file_equals per fixture output (primary gate)
--   2. RAG feedback on script clarity / quality (advisory; does not block pass)
--
-- How to create / customize:
--   1. Admin → Tickets → ticket_type = scripting_lab
--   2. Put fixture inputs under initial_state.files (fixtures/*/last-login.log)
--   3. expected_state.rules: file_equals for each fixtures/*/stale-users.txt
--   4. Optional knobs: scriptPath, minScriptChars, guidanceTopics
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
  AND t.ticket_type IN (
    'scripting_lab',
    'script_fixtures',
    'script_remediation',
    'sandbox_script'
  )
  AND t.scenario_brief LIKE 'Stale logins:%';

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
  'scripting_lab',
  'medium',
  30,
  'Stale logins: Report users inactive 90+ days from mock last-login logs',
  jsonb_build_object(
    'files', jsonb_build_object(
      'README.md', $readme$# Stale login report

Helpdesk needs a repeatable script that lists accounts inactive for **90 or more
days** so Tier-2 can start disable / outreach workflows.

## Goal

Write a short **Bash** or **PowerShell** script that:

1. Reads each fixture log at `fixtures/*/last-login.log`
2. Uses the as-of date in `lab/AS_OF` (treat this as "today")
3. Writes matching usernames to `fixtures/*/stale-users.txt`

## Log format

Each line is `username,YYYY-MM-DD` (last successful login). Ignore blank lines
and lines starting with `#`.

## Output format (exact)

- One username per line
- Sorted A–Z
- LF newlines
- Trailing newline after the last username when the list is non-empty
- Empty file (zero bytes) when nobody is stale

A user is stale when `as_of - last_login >= 90` days (include the 90-day boundary).

## Workflow

1. Edit `report-stale-users.sh` (or replace it with `report-stale-users.ps1`)
2. In the sandbox terminal, run your script (example):

```bash
bash report-stale-users.sh
```

3. Confirm each `fixtures/*/stale-users.txt` looks correct
4. Click **Submit lab**

Grading is pass/fail per fixture output (`file_equals`). Script-clarity RAG
feedback is advisory only and will not fail a correct fixture run.
$readme$,
      'lab/AS_OF', $asof$2026-08-08
$asof$,
      'lab/INACTIVE_DAYS', $days$90
$days$,
      'report-stale-users.sh', $script$#!/usr/bin/env bash
# TODO: Report users inactive for 90+ days (as-of lab/AS_OF).
# For each fixtures/*/last-login.log, write fixtures/*/stale-users.txt
# with matching usernames sorted A-Z (empty file if none).

set -euo pipefail

AS_OF="$(tr -d '[:space:]' < lab/AS_OF)"
DAYS="$(tr -d '[:space:]' < lab/INACTIVE_DAYS)"

echo "Implement stale-login report (as-of=${AS_OF}, days=${DAYS})"
# Hint: cutoff date is 90 days before AS_OF (2026-05-10 for the seeded AS_OF).
$script$,
      'fixtures/01_mixed/last-login.log', $f1$# Mixed recent + stale accounts
alice,2026-07-01
bob,2025-12-01
carol,2026-08-01
dave,2026-01-15
eve,2026-05-10
$f1$,
      'fixtures/02_boundary/last-login.log', $f2$# Boundary: 89 vs 90 vs 91 days before 2026-08-08
fresh89,2026-05-11
stale90,2026-05-10
stale91,2026-05-09
active,2026-08-07
$f2$,
      'fixtures/03_none_stale/last-login.log', $f3$# All accounts logged in within 90 days
ann,2026-08-01
ben,2026-07-20
cia,2026-06-01
$f3$
    )
  ),
  jsonb_build_object(
    'minScriptChars', 60,
    'passThresholdPercent', 100,
    'guidanceTopics', jsonb_build_array(
      'clarity-ops',
      'idempotent-verify',
      'targeted-fix',
      'side-effects'
    ),
    'topKGuidanceSections', 4,
    'rules', jsonb_build_array(
      jsonb_build_object(
        'id', 'fixture_01_mixed',
        'type', 'file_equals',
        'path', 'fixtures/01_mixed/stale-users.txt',
        'content', $out1$bob
dave
eve
$out1$
      ),
      jsonb_build_object(
        'id', 'fixture_02_boundary',
        'type', 'file_equals',
        'path', 'fixtures/02_boundary/stale-users.txt',
        'content', $out2$stale90
stale91
$out2$
      ),
      jsonb_build_object(
        'id', 'fixture_03_none_stale',
        'type', 'file_equals',
        'path', 'fixtures/03_none_stale/stale-users.txt',
        'content', ''
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
