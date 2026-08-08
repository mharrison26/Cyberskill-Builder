-- Seed a Tier 1 config_fault_diagnosis ticket.
-- Students review a static named.conf snippet with an unrestricted
-- allow-transfer { any; } directive, identify the faulty line number, and
-- explain the impact. Scoring is deterministic against expected_state.faultLineNumber.
--
-- ticket_type: config_fault_diagnosis
-- aliases: named_conf_fault, dns_config_fault, config_line_diagnosis
--
-- Fault: line 10 — allow-transfer { any; }; (open zone transfer)
-- Idempotent: deletes prior seed rows by stable scenario_brief marker per tenant.

DELETE FROM public.tickets
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND ticket_type IN (
    'config_fault_diagnosis',
    'named_conf_fault',
    'dns_config_fault',
    'config_line_diagnosis'
  )
  AND scenario_brief LIKE 'Config fault diagnosis:%';

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
  'config_fault_diagnosis',
  'medium',
  25,
  'Config fault diagnosis: named.conf unrestricted zone transfer',
  jsonb_build_object(
    'prompt',
    'DNS admins report that an external scanner pulled a full zone dump for corp.example.com. Review the authoritative nameserver named.conf below (read-only). Identify the single misconfigured line that enables this, then explain the security/operational impact.',
    'configFileName',
    'named.conf',
    'configKind',
    'named.conf',
    'configText',
    $cfg$options {
    directory "/var/named";
    recursion no;
    allow-query { any; };
};

zone "corp.example.com" IN {
    type master;
    file "corp.example.com.zone";
    allow-transfer { any; };
};

zone "." IN {
    type hint;
    file "named.ca";
};
$cfg$
  ),
  jsonb_build_object(
    'faultLineNumber', 10,
    'faultLineContent', 'allow-transfer { any; };',
    'minImpactLength', 40
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
