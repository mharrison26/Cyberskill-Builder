-- Seed a P1 outage stakeholder status-update ticket (simulated clock).
--
-- Students advance a simulated incident clock (not wall time) and post
-- status updates to a mock stakeholder channel at the required cadence.
-- Each update must cover impact, ETA, and next-update time.
--
-- ticket_type: p1_status_updates
--   aliases: incident_status_cadence, stakeholder_updates, outage_comms
--
-- How to customize:
--   initial_state: outage facts, channel seed messages, clock window/steps
--   expected_state: requiredUpdateTimes (or requiredCadenceMinutes + window),
--                   cadenceToleranceMinutes, minFieldLength
--
-- Idempotent: deletes prior seed rows by stable scenario_brief marker.

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
    'p1_status_updates',
    'incident_status_cadence',
    'stakeholder_updates',
    'outage_comms'
  )
  AND t.scenario_brief LIKE 'HD-P1-01:%';

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
  'p1_status_updates',
  'critical',
  60,
  'HD-P1-01: Corporate SSO is down — post stakeholder status updates every 30 simulated minutes covering impact, ETA, and next-update time',
  jsonb_build_object(
    'ticketCode', 'HD-P1-01',
    'outage', jsonb_build_object(
      'title', 'Corporate SSO authentication outage',
      'service', 'Corporate SSO / IdP',
      'severity', 'P1',
      'summary', E'Detected at T+00:00: users worldwide cannot complete SSO sign-in to email, VPN, and SaaS apps. Identity on-call is investigating an IdP region failure. You own stakeholder communications in #incident-comms.',
      'impactFacts', E'~4,200 employees affected globally.\nBusiness apps behind SSO unavailable (email web, CRM, expense).\nVPN auth also failing for remote staff.\nNo confirmed data breach; availability impact only.'
    ),
    'channel', jsonb_build_object(
      'name', '#incident-comms',
      'stakeholders', jsonb_build_array(
        jsonb_build_object(
          'author', 'Alex Morgan',
          'role', 'IT Director',
          'postedAtSimMinutes', 0,
          'body', 'P1 declared on SSO. Need status in this channel every 30 minutes with impact, ETA, and when we will hear next.'
        )
      )
    ),
    'clock', jsonb_build_object(
      'startSimMinutes', 0,
      'maxSimMinutes', 90,
      'advanceStepsMinutes', jsonb_build_array(5, 15, 30)
    )
  ),
  jsonb_build_object(
    'requiredUpdateTimes', jsonb_build_array(0, 30, 60),
    'cadenceToleranceMinutes', 5,
    'minFieldLength', 20,
    'requireNextUpdatePromise', true,
    'incidentWindowMinutes', 90
  ),
  '722',
  12
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
