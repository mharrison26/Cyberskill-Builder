-- Seed a Tier 1 monitoring_config ticket (alert rules for a described system).
-- Students define alerts (type + threshold + routing) covering disk space,
-- service down, and high error rate. Scoring is fully deterministic against
-- expected_state.requiredAlerts (extra alerts are tolerated).
--
-- ticket_type: monitoring_config
-- aliases: alert_config, monitoring_alerts
--
-- Idempotent: deletes prior seed rows by stable scenario_brief marker per tenant.

DELETE FROM public.tickets
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND ticket_type IN (
    'monitoring_config',
    'alert_config',
    'monitoring_alerts'
  )
  AND scenario_brief LIKE 'Monitoring config:%';

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
  1,
  'monitoring_config',
  'medium',
  30,
  'Monitoring config: HarborCheckout API — disk, availability, and error-rate alerts',
  jsonb_build_object(
    'systemName', 'HarborCheckout API',
    'prompt',
    'You are standing up first-line monitoring for HarborCheckout before Black Friday traffic. Define alert rules for the failure modes implied below: which metrics to alert on, sensible thresholds, and where each alert should route. Cover disk pressure on the database host, checkout-api being down, and elevated 5xx rates that threaten the availability SLO.',
    'context',
    E'HarborCheckout processes card payments for retail partners. On-call pages should go to PagerDuty or the email on-call rotation for availability-impacting events. Non-pageable ops chatter can use Slack #ops.\n\nOps guidance for this exercise:\n- Disk: page before the Postgres volume fills (usage threshold in the high 80s–mid 90s % is typical).\n- Service down: page after a small number of consecutive failed health checks (1–3).\n- High error rate: alert when HTTP 5xx % exceeds a low single-digit threshold aligned with the 99.9% availability SLO; PagerDuty, email on-call, or Slack #ops are acceptable.',
    'services',
    jsonb_build_array(
      jsonb_build_object(
        'name', 'checkout-api',
        'role', 'Stateless payment API behind the edge load balancer; exposes /healthz.',
        'slo', '99.9% availability; HTTP 5xx error rate should stay under ~0.1% sustained.'
      ),
      jsonb_build_object(
        'name', 'checkout-db (Postgres)',
        'role', 'Primary Postgres on a 200 GB SSD volume; WAL + data share the same disk.',
        'slo', 'Keep free disk headroom; sustained >90% usage has caused write stalls in past incidents.'
      ),
      jsonb_build_object(
        'name', 'edge-lb',
        'role', 'Terminates TLS and forwards to checkout-api replicas.',
        'slo', 'Reports upstream 5xx when checkout-api fails health checks or returns errors.'
      )
    ),
    'alertTypeOptions',
    jsonb_build_array(
      'disk_space',
      'service_down',
      'high_error_rate',
      'high_latency',
      'cpu_saturation'
    ),
    'routeOptions',
    jsonb_build_array(
      'pagerduty',
      'email_oncall',
      'slack_ops',
      'ticket_queue'
    )
  ),
  jsonb_build_object(
    'requiredAlerts',
    jsonb_build_array(
      jsonb_build_object(
        'alertType', 'disk_space',
        'thresholdMin', 80,
        'thresholdMax', 95,
        'acceptedRoutes', jsonb_build_array('pagerduty', 'email_oncall')
      ),
      jsonb_build_object(
        'alertType', 'service_down',
        'thresholdMin', 1,
        'thresholdMax', 3,
        'acceptedRoutes', jsonb_build_array('pagerduty', 'email_oncall')
      ),
      jsonb_build_object(
        'alertType', 'high_error_rate',
        'thresholdMin', 1,
        'thresholdMax', 5,
        'acceptedRoutes', jsonb_build_array('pagerduty', 'slack_ops', 'email_oncall')
      )
    )
  ),
  NULL,
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
  VALUES
    ('00000000-0000-4000-8000-000000000001'::uuid),
    ('00000000-0000-4000-8000-000000000003'::uuid)
) AS st(id)
CROSS JOIN (
  SELECT id AS track_id FROM public.tracks WHERE slug = 'grc'
) AS grc;
