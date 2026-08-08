-- Seed outage / incident-response sysadmin capstone (Fly PI-05 + config-diff PI-06 + RAG report).
--
-- Students launch an ephemeral Fly Machines sandbox preloaded in a broken state:
--   1. nginx sites-enabled listens on 9999 instead of 80
--   2. var/lib/app/disk.fill simulates a full-disk / capacity block
--   3. var/lib/app/status shows state=down / disk=full
-- They diagnose + remediate via the web terminal, then submit a post-incident
-- report (timeline, root cause, remediation, prevention).
--
-- Grading (ticket_type = outage_capstone | incident_response_capstone |
-- sysadmin_outage_capstone):
--   1. Primary hard gate: deterministic config-diff vs guest snapshot
--   2. Secondary hard gate: RAG vs pinned incident-report-quality rubric
--      (both must pass — report is not advisory-only)
--
-- Idempotent: deletes prior seed rows by stable scenario_brief marker per tenant.

DELETE FROM public.tickets
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND ticket_type IN (
    'outage_capstone',
    'incident_response_capstone',
    'sysadmin_outage_capstone'
  )
  AND scenario_brief LIKE 'P1 API outage:%';

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
  3,
  'outage_capstone',
  'advanced',
  60,
  'P1 API outage: Misconfigured nginx listen port and simulated full disk',
  jsonb_build_object(
    'scenario', 'outage_capstone',
    'prompt',
    'Customer API is returning errors. This Fly sandbox boots in a broken state: reverse-proxy config and disk capacity are wrong. Use the web terminal to diagnose and remediate, then file a post-incident report covering timeline, root cause, remediation, and prevention.',
    'checklist', jsonb_build_array(
      jsonb_build_object(
        'id', 'check_status',
        'title', 'Inspect app status',
        'description', 'Read /var/lib/app/status for state and disk flags.',
        'hint', 'cat /var/lib/app/status'
      ),
      jsonb_build_object(
        'id', 'check_nginx',
        'title', 'Inspect nginx site config',
        'description', 'Find the wrong listen directive under sites-enabled.',
        'hint', 'cat /etc/nginx/sites-enabled/app.conf'
      ),
      jsonb_build_object(
        'id', 'check_disk_fill',
        'title', 'Confirm disk fill simulation',
        'description', 'A fill file under /var/lib/app is blocking capacity.',
        'hint', 'ls -la /var/lib/app'
      ),
      jsonb_build_object(
        'id', 'fix_listen',
        'title', 'Fix nginx listen port',
        'description', 'Change listen 9999 to listen 80 and keep the proxy_pass.',
        'hint', 'listen 80;'
      ),
      jsonb_build_object(
        'id', 'clear_disk',
        'title', 'Remove disk fill and mark healthy',
        'description', 'Delete disk.fill and set status to state=running / disk=ok.',
        'hint', 'rm /var/lib/app/disk.fill'
      )
    ),
    'files', jsonb_build_object(
      'etc/nginx/sites-enabled/app.conf', $nginx$server {
  listen 9999;
  server_name app.local;

  location / {
    proxy_pass http://127.0.0.1:3000;
  }
}
$nginx$,
      'var/lib/app/disk.fill', $fill$DISK_FULL_SIMULATION
# Lab fill file — remove this file to clear simulated disk pressure.
# Do not leave large orphan fill files on production hosts.
$fill$,
      'var/lib/app/status', $status$state=down
disk=full
reason=config_and_capacity
$status$,
      'var/lib/app/README', $readme$# App host lab notes

Broken baseline for the outage capstone:
- nginx listen port is wrong (9999 instead of 80)
- disk.fill simulates capacity exhaustion
- status must show state=running and disk=ok after recovery
$readme$
    )
  ),
  jsonb_build_object(
    'minReportFieldLength', 60,
    'passThresholdPercent', 100,
    'guidanceTopics', jsonb_build_array(
      'timeline',
      'root-cause',
      'remediation',
      'prevention'
    ),
    'topKGuidanceSections', 4,
    'rules', jsonb_build_array(
      jsonb_build_object(
        'id', 'nginx_listen_fixed',
        'type', 'file_contains',
        'path', 'etc/nginx/sites-enabled/app.conf',
        'pattern', 'listen\\s+80\\s*;',
        'regex', true
      ),
      jsonb_build_object(
        'id', 'disk_fill_removed',
        'type', 'file_absent',
        'path', 'var/lib/app/disk.fill'
      ),
      jsonb_build_object(
        'id', 'service_running',
        'type', 'file_contains',
        'path', 'var/lib/app/status',
        'pattern', 'state=running'
      ),
      jsonb_build_object(
        'id', 'disk_ok',
        'type', 'file_contains',
        'path', 'var/lib/app/status',
        'pattern', 'disk=ok'
      ),
      jsonb_build_object(
        'id', 'proxy_pass_preserved',
        'type', 'file_contains',
        'path', 'etc/nginx/sites-enabled/app.conf',
        'pattern', 'proxy_pass'
      )
    )
  ),
  '411',
  COALESCE(
    (
      SELECT MAX(tk.sort_order) + 1
      FROM public.tickets AS tk
      WHERE tk.track_id = grc.track_id
        AND tk.tenant_id = st.id
    ),
    0
  )
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
