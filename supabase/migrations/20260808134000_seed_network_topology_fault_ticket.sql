-- Seed a Tier 1 network_topology_fault ticket (PI-04 companion).
-- Students review a small ASCII network diagram + static diagnostic output,
-- identify which device/subnet is misconfigured, and justify with subnetting/TCP-IP.
-- Scoring: deterministic faultLocation match + RAG justification against pinned rubric.
--
-- ticket_type: network_topology_fault
-- aliases: subnet_fault_diagnosis, topology_misconfig, network_fault_location
--
-- Idempotent: deletes prior seed rows by stable scenario_brief marker per tenant.

DELETE FROM public.tickets
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND ticket_type IN (
    'network_topology_fault',
    'subnet_fault_diagnosis',
    'topology_misconfig',
    'network_fault_location'
  )
  AND scenario_brief LIKE 'Network topology fault:%';

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
  'network_topology_fault',
  'medium',
  30,
  'Network topology fault: VLAN10 workstation cannot reach internet — locate misconfigured device',
  jsonb_build_object(
    'prompt',
    'A user on WS-A (VLAN10) reports no internet or file-share access. Review the site diagram and the static captures from WS-A (ip addr, ip route, ping, traceroute, arp). Identify which device or subnet is misconfigured, then justify using basic subnetting / TCP-IP reasoning.',
    'diagram',
    E'                    [Internet]\n                         |\n                    +----+----+                \n                    | R1 edge |  203.0.113.1/30\n                    +----+----+                \n                         |                     \n                    +----+----+                \n                    | Core SW |                \n                    +----+----+                \n                    /          \\               \n         VLAN10 SVI              VLAN20 SVI    \n       10.20.30.1/24           10.20.40.1/24   \n              |                      |         \n         +----+----+            +----+----+    \n         |  WS-A   |            |  FS-B   |    \n         | .45/24? |            | .10/24  |    \n         +---------+            +---------+    \n\nLegend: R1 owns both SVIs. Captures below were taken on WS-A.',
    'faultLocations',
    jsonb_build_array(
      jsonb_build_object(
        'id', 'ws_a',
        'label', 'WS-A (VLAN10 workstation)'
      ),
      jsonb_build_object(
        'id', 'vlan10_svi',
        'label', 'R1 VLAN10 SVI (10.20.30.1/24)'
      ),
      jsonb_build_object(
        'id', 'vlan20_svi',
        'label', 'R1 VLAN20 SVI (10.20.40.1/24)'
      ),
      jsonb_build_object(
        'id', 'fs_b',
        'label', 'FS-B (VLAN20 file server)'
      ),
      jsonb_build_object(
        'id', 'core_sw',
        'label', 'Core switch (L2 only)'
      )
    ),
    'commands',
    jsonb_build_array(
      jsonb_build_object(
        'command', 'ip addr show eth0',
        'output',
        E'2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500\n    link/ether 00:0c:29:aa:bb:01 brd ff:ff:ff:ff:ff:ff\n    inet 10.20.30.45/24 brd 10.20.30.255 scope global eth0\n       valid_lft forever preferred_lft forever\n'
      ),
      jsonb_build_object(
        'command', 'ip route',
        'output',
        E'default via 10.20.40.1 dev eth0\n10.20.30.0/24 dev eth0 proto kernel scope link src 10.20.30.45\n'
      ),
      jsonb_build_object(
        'command', 'ping -c 3 10.20.40.1',
        'output',
        E'PING 10.20.40.1 (10.20.40.1) 56(84) bytes of data.\nFrom 10.20.30.45 icmp_seq=1 Destination Host Unreachable\nFrom 10.20.30.45 icmp_seq=2 Destination Host Unreachable\nFrom 10.20.30.45 icmp_seq=3 Destination Host Unreachable\n\n--- 10.20.40.1 ping statistics ---\n3 packets transmitted, 0 received, +3 errors, 100% packet loss\n'
      ),
      jsonb_build_object(
        'command', 'ping -c 2 10.20.30.1',
        'output',
        E'PING 10.20.30.1 (10.20.30.1) 56(84) bytes of data.\n64 bytes from 10.20.30.1: icmp_seq=1 ttl=64 time=0.4 ms\n64 bytes from 10.20.30.1: icmp_seq=2 ttl=64 time=0.3 ms\n\n--- 10.20.30.1 ping statistics ---\n2 packets transmitted, 2 received, 0% packet loss\n'
      ),
      jsonb_build_object(
        'command', 'traceroute -n -m 5 8.8.8.8',
        'output',
        E'traceroute to 8.8.8.8 (8.8.8.8), 5 hops max\n 1  10.20.30.45  Destination Host Unreachable\n'
      ),
      jsonb_build_object(
        'command', 'arp -n',
        'output',
        E'Address                  HWtype  HWaddress           Flags Mask            Iface\n10.20.30.1               ether   00:1a:2b:30:00:01   C                     eth0\n10.20.40.1                       (incomplete)                              eth0\n'
      )
    )
  ),
  jsonb_build_object(
    'faultLocation', 'ws_a',
    'minJustificationLength', 80,
    'guidanceTopics',
    jsonb_build_array(
      'gateway-same-subnet',
      'subnet-mask-boundaries',
      'evidence-from-diagnostics',
      'isolate-fault-location'
    ),
    'topKGuidanceSections', 4
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
