-- Seed cross-system POA&M portfolio prioritization ticket (GRC / ISSO).
--
-- Students review POA&M summaries for 4 fictional systems at different
-- FIPS 199 impact levels and produce one prioritized remediation order.
--
-- ticket_type: cross_system_poam_priority
-- aliases: enterprise_poam_prioritization, isso_poam_portfolio
--
-- Risk weight (higher → remediate sooner):
--   riskScore = IMPACT_WEIGHT[impact] × SEVERITY_WEIGHT[severity]
--   impact:  low=1, moderate=2, high=3
--   severity: low=1, moderate=2, high=3, critical=4
-- Tie-break: earlier dueDate, then id ascending.
-- Scoring: resolve on exact order match; pairwise/position kept as partialScore.
--
-- How to create / customize:
--   1. Admin → Tickets → ticket_type = cross_system_poam_priority
--   2. Put systems[] with poamItems[] in initial_state
--   3. Put canonical order in expected_state.expectedOrder (or omit to derive)
--   4. Students submit { type, orderedIds: string[] }
--
-- Idempotent: deletes prior seed rows by stable scenario_brief / ticketCode.

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
    'cross_system_poam_priority',
    'enterprise_poam_prioritization',
    'isso_poam_portfolio'
  )
  AND (
    t.scenario_brief LIKE 'Cross-system POA&M:%'
    OR t.initial_state->>'ticketCode' = 'POAM-PORT-01'
  );

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
  'cross_system_poam_priority',
  'medium',
  35,
  'Cross-system POA&M: Prioritize remediation across FIPS 199 impact levels',
  jsonb_build_object(
    'ticketCode', 'POAM-PORT-01',
    'prompt', 'You are the ISSO for HarborForge. Four systems at different FIPS 199 impact levels have open POA&M items. Produce one prioritized cross-system remediation order (soonest first) using riskScore = impact_weight × severity_weight (impact: low=1, moderate=2, high=3; severity: low=1, moderate=2, high=3, critical=4). Break ties by earlier due date.',
    'systems', jsonb_build_array(
      jsonb_build_object(
        'id', 'SYS-AEGIS',
        'name', 'AEGIS Payment Gateway',
        'impactLevel', 'high',
        'description', 'Card-not-present authorization and settlement path; High confidentiality/integrity impact.',
        'poamItems', jsonb_build_array(
          jsonb_build_object(
            'id', 'AEGIS-POAM-01',
            'title', 'MFA gap on break-glass admins',
            'weakness', 'Privileged break-glass accounts lack phishing-resistant MFA; compromise would allow payment path changes.',
            'severity', 'critical',
            'dueDate', '2026-09-01'
          ),
          jsonb_build_object(
            'id', 'AEGIS-POAM-02',
            'title', 'Incomplete TLS cipher hardening',
            'weakness', 'Legacy TLS 1.0 still accepted on one edge VIP serving authorization traffic.',
            'severity', 'high',
            'dueDate', '2026-10-15'
          )
        )
      ),
      jsonb_build_object(
        'id', 'SYS-IAM',
        'name', 'Meridian Identity Broker',
        'impactLevel', 'moderate',
        'description', 'Workforce SSO / federation broker; Moderate impact (no direct payment CDE access).',
        'poamItems', jsonb_build_array(
          jsonb_build_object(
            'id', 'IAM-POAM-01',
            'title', 'Orphaned privileged roles',
            'weakness', 'Quarterly access review left orphaned admin roles active in the IdP.',
            'severity', 'critical',
            'dueDate', '2026-09-15'
          ),
          jsonb_build_object(
            'id', 'IAM-POAM-02',
            'title', 'Session timeout too long',
            'weakness', 'Idle SSO sessions persist beyond corporate policy on shared workstations.',
            'severity', 'moderate',
            'dueDate', '2026-11-01'
          )
        )
      ),
      jsonb_build_object(
        'id', 'SYS-COLLAB',
        'name', 'Nexus Collaboration Suite',
        'impactLevel', 'high',
        'description', 'Enterprise messaging that stores CUI; High confidentiality impact.',
        'poamItems', jsonb_build_array(
          jsonb_build_object(
            'id', 'COLLAB-POAM-01',
            'title', 'External sharing defaults open',
            'weakness', 'Guest sharing enabled org-wide without DLP gates for CUI labels.',
            'severity', 'moderate',
            'dueDate', '2026-10-01'
          )
        )
      ),
      jsonb_build_object(
        'id', 'SYS-WIKI',
        'name', 'HarborForge Intranet Wiki',
        'impactLevel', 'low',
        'description', 'Internal knowledge base; Low impact (no CUI, internal-only).',
        'poamItems', jsonb_build_array(
          jsonb_build_object(
            'id', 'WIKI-POAM-01',
            'title', 'Outdated CMS plugin',
            'weakness', 'Known XSS in wiki plugin; exposure limited to authenticated intranet users.',
            'severity', 'high',
            'dueDate', '2026-12-01'
          ),
          jsonb_build_object(
            'id', 'WIKI-POAM-02',
            'title', 'Missing security headers',
            'weakness', 'CSP / HSTS not set on wiki vhost.',
            'severity', 'low',
            'dueDate', '2027-01-15'
          )
        )
      )
    )
  ),
  jsonb_build_object(
    'expectedOrder', jsonb_build_array(
      'AEGIS-POAM-01',  -- high×critical = 12
      'AEGIS-POAM-02',  -- high×high = 9
      'IAM-POAM-01',    -- moderate×critical = 8
      'COLLAB-POAM-01', -- high×moderate = 6
      'IAM-POAM-02',    -- moderate×moderate = 4
      'WIKI-POAM-01',   -- low×high = 3
      'WIKI-POAM-02'    -- low×low = 1
    ),
    'scoringMode', 'exact_order',
    'minPrefixCorrect', null,
    'weights', jsonb_build_object(
      'impact', jsonb_build_object(
        'low', 1,
        'moderate', 2,
        'high', 3
      ),
      'severity', jsonb_build_object(
        'low', 1,
        'moderate', 2,
        'high', 3,
        'critical', 4
      )
    )
  ),
  '722', -- ISSO / security control assessor-adjacent DCWF (optional)
  240
FROM seed_tenants st
CROSS JOIN grc;
