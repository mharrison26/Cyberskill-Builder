-- Seed script_remediation print-spooler ticket (WebContainer + config-diff + RAG).
--
-- Students write a short Bash (or PowerShell) script in the CodeSandbox
-- WebContainer, run it to clear stuck CUPS jobs and mark the service running,
-- then submit. Grading (ticket_type = script_remediation | spooler_fix |
-- sandbox_script | service_restart):
--   1. Deterministic config-diff rules vs resulting filesystem (PI-06)
--   2. RAG feedback on script quality / side effects (pinned rubric only)
--
-- How to create / customize:
--   1. Admin → Tickets → ticket_type = script_remediation
--   2. Put lab files under initial_state.files
--   3. expected_state.rules: same ConfigDiffRule shape as config_diff
--      (includes file_absent for cleared jobs)
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
    'script_remediation',
    'spooler_fix',
    'sandbox_script',
    'service_restart'
  )
  AND t.scenario_brief LIKE 'Print spooler:%';

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
  'script_remediation',
  'medium',
  30,
  'Print spooler: Clear stuck CUPS jobs and restart the print service',
  jsonb_build_object(
    'files', jsonb_build_object(
      'README.md', $readme$# Stuck print spooler

Users report printers are stuck. The CUPS queue has orphaned job files and
`status/cupsd.state` shows the service as stuck.

## Goal

Write a short **Bash** script (PowerShell is fine for Windows-track practice
if you also produce the same resulting files) that:

1. Removes the stuck job files under `var/spool/cups/`
2. Marks the print service running again in `status/cupsd.state`
3. Does **not** delete or rewrite `etc/cups/cupsd.conf`

## Workflow

1. Edit `fix-spooler.sh`
2. In the sandbox terminal: `bash fix-spooler.sh`
3. Confirm stuck jobs are gone and `status/cupsd.state` contains `state=running`
4. Click **Submit lab**

Grading checks the resulting filesystem with config-diff rules, then gives
RAG feedback on script quality and side effects.
$readme$,
      'fix-spooler.sh', $script$#!/usr/bin/env bash
# TODO: Clear stuck print jobs and restart the print service.
# Hint: remove var/spool/cups/c00001 and d00001-001, then write
#   state=running
#   pid=<any number>
# to status/cupsd.state. Do not touch etc/cups/cupsd.conf.

set -euo pipefail

echo "Implement remediation here"
$script$,
      'var/spool/cups/c00001', $job$Stuck control file — job 1 (orphaned)
$job$,
      'var/spool/cups/d00001-001', $data$Stuck data file — job 1 payload
$data$,
      'status/cupsd.state', $state$state=stuck
pid=9999
reason=queue_blocked
$state$,
      'etc/cups/cupsd.conf', $conf$# Simulated CUPS config — do not delete
LogLevel warn
MaxJobs 500
$conf$
    )
  ),
  jsonb_build_object(
    'scriptPath', 'fix-spooler.sh',
    'minScriptChars', 40,
    'passThresholdPercent', 100,
    'guidanceTopics', jsonb_build_array(
      'targeted-fix',
      'side-effects',
      'idempotent-verify',
      'clarity-ops'
    ),
    'topKGuidanceSections', 4,
    'rules', jsonb_build_array(
      jsonb_build_object(
        'id', 'stuck_control_cleared',
        'type', 'file_absent',
        'path', 'var/spool/cups/c00001'
      ),
      jsonb_build_object(
        'id', 'stuck_data_cleared',
        'type', 'file_absent',
        'path', 'var/spool/cups/d00001-001'
      ),
      jsonb_build_object(
        'id', 'service_running',
        'type', 'file_contains',
        'path', 'status/cupsd.state',
        'pattern', 'state=running'
      ),
      jsonb_build_object(
        'id', 'config_preserved',
        'type', 'file_contains',
        'path', 'etc/cups/cupsd.conf',
        'pattern', 'LogLevel'
      )
    )
  ),
  '411',
  25
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
