-- Seed a Tier 1 network_diagnostics ticket (PI-04).
-- Students review static ipconfig / ping / traceroute output with an embedded
-- wrong-default-gateway fault, then submit root cause + next diagnostic step.
-- Scoring is fully deterministic against expected_state.faultType / nextDiagnosticStep.
--
-- ticket_type: network_diagnostics
-- aliases: pi04, traceroute_fault, command_output_diagnosis
--
-- Idempotent: deletes prior seed rows by stable scenario_brief marker per tenant.

DELETE FROM public.tickets
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND ticket_type IN (
    'network_diagnostics',
    'pi04',
    'traceroute_fault',
    'command_output_diagnosis'
  )
  AND scenario_brief LIKE 'Network diagnostics:%';

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
  'network_diagnostics',
  'medium',
  25,
  'Network diagnostics: Workstation cannot reach internet — review command output',
  jsonb_build_object(
    'prompt',
    'A user reports their workstation cannot reach the internet or internal file shares. Capture below shows ipconfig, ping to the configured gateway, and tracert to 8.8.8.8. Identify the root-cause fault, then choose the best next diagnostic step.',
    'commands',
    jsonb_build_array(
      jsonb_build_object(
        'command', 'ipconfig',
        'output',
        E'\nWindows IP Configuration\n\nEthernet adapter Ethernet:\n\n   Connection-specific DNS Suffix  . : corp.local\n   IPv4 Address. . . . . . . . . . . : 10.20.30.45\n   Subnet Mask . . . . . . . . . . . : 255.255.255.0\n   Default Gateway . . . . . . . . . : 10.20.40.1\n'
      ),
      jsonb_build_object(
        'command', 'ping 10.20.40.1',
        'output',
        E'\nPinging 10.20.40.1 with 32 bytes of data:\nReply from 10.20.30.45: Destination host unreachable.\nReply from 10.20.30.45: Destination host unreachable.\nReply from 10.20.30.45: Destination host unreachable.\nReply from 10.20.30.45: Destination host unreachable.\n\nPing statistics for 10.20.40.1:\n    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),\n'
      ),
      jsonb_build_object(
        'command', 'tracert 8.8.8.8',
        'output',
        E'\nTracing route to dns.google [8.8.8.8]\nover a maximum of 30 hops:\n\n  1  10.20.30.45  reports: Destination host unreachable.\n\nTrace complete.\n'
      )
    )
  ),
  jsonb_build_object(
    'faultType', 'wrong_default_gateway',
    'nextDiagnosticStep', 'verify_gateway_with_peer'
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
