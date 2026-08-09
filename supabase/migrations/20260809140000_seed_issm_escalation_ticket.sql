-- Seed ISSO→ISSM cross-system escalation ticket (GRC track).
--
-- Students decide whether a multi-system risk requires ISSM escalation:
--   - binary decision: escalate | handle_at_isso
--   - draft escalation memo or non-escalation rationale
-- Deterministic: decision must match seeded expected_state.expectedDecision.
-- RAG: memo graded against pinned ISSM escalation-criteria guidance.
--
-- How to create / customize this ticket content:
--   1. Admin → Tickets → create or edit ticket_type = issm_escalation
--   2. Put the fictional multi-ISSO risk in initial_state.scenario
--   3. Put the answer key in expected_state:
--        expectedDecision, minMemoLength, guidanceTopics, topKGuidanceSections
--
-- Idempotent: deletes prior seed rows by stable scenario_brief marker per tenant.

-- ---------------------------------------------------------------------------
-- Commercial + DoD-adjacent tenants (stable UUIDs from 0002 / 0020)
-- ---------------------------------------------------------------------------

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
    'issm_escalation',
    'cross_system_escalation',
    'isso_to_issm_escalation'
  )
  AND t.scenario_brief LIKE 'ISSM escalation:%';

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
  'issm_escalation',
  'medium',
  45,
  'ISSM escalation: Shared IdP MFA policy drift affects HarborLedger (High) and RiverOps (Moderate) under two ISSOs; enterprise CAB/budget required',
  jsonb_build_object(
    'ticketCode', 'GRC-ISSM-ESC',
    'prompt', 'You are an ISSO supporting HarborLedger. A shared enterprise identity weakness also affects RiverOps under a peer ISSO. Decide whether to escalate to the ISSM or handle at ISSO level, then draft the escalation memo (or non-escalation rationale). Ground your writing in cross-system impact, resource/authority limits, and residual risk.',
    'scenario', jsonb_build_object(
      'title', 'HarborForge shared Entra ID MFA policy drift',
      'summary', 'During continuous monitoring, ISSO Patel discovers that an enterprise Conditional Access baseline on the corporate Entra ID tenant was weakened after a rushed CAB exception. Phishing-resistant MFA is no longer enforced for several high-privilege admin roles that authenticate into both HarborLedger and RiverOps. Local compensating controls (extra session logging on HarborLedger) do not restore MFA for the shared IdP paths used by RiverOps.',
      'sharedDependency', 'Corporate Entra ID tenant (enterprise identity / SSO common control) owned by the Identity Shared Services team — not inside either system authorization boundary alone.',
      'affectedSystems', jsonb_build_array(
        jsonb_build_object(
          'id', 'harborledger',
          'name', 'HarborLedger Financial Reporting',
          'isso', 'Asha Patel',
          'impactLevel', 'High',
          'notes', 'Processes federal financial reporting data. Unauthorized use of privileged finance-admin roles could corrupt integrity of reporting packages under ATO.'
        ),
        jsonb_build_object(
          'id', 'riverops',
          'name', 'RiverOps Field Logistics',
          'isso', 'Chidi Okonkwo',
          'impactLevel', 'Moderate',
          'notes', 'Field logistics and inventory for regional operations. Same IdP admin roles can alter role assignments that unlock warehouse and dispatch workflows.'
        )
      ),
      'impact', 'The weakened MFA posture is concurrent across two authorized systems with different ISSOs and FIPS 199 categorizations. Compromise of a shared privileged IdP path would degrade authentication assurance for both HarborLedger (High) and RiverOps (Moderate) at once.',
      'resourceNeeds', 'Restoring the enterprise Conditional Access baseline requires Identity Shared Services engineering time, an enterprise identity budget line, and CAB approval for a tenant-wide policy change with a coordinated multi-system outage window. Neither ISSO controls that budget or change board.',
      'residualRisk', 'With only HarborLedger-local session logging, residual risk on the High-impact finance system remains above organizational tolerance. RiverOps has not agreed to an interim break-glass process; peer ISSO Okonkwo prioritizes avoiding logistics downtime this quarter.',
      'conflictingPriorities', 'ISSO Patel wants an emergency IdP rollback this week. ISSO Okonkwo prefers a 60-day window to avoid peak logistics season. Without ISSM coordination, remediation timing and compensating-control adequacy will remain inconsistent.',
      'timeline', 'Exception that weakened MFA was approved 11 days ago as temporary; it has not been reversed. Identity Shared Services will not schedule tenant-wide changes without ISSM sponsorship and CAB.'
    )
  ),
  jsonb_build_object(
    'expectedDecision', 'escalate',
    'minMemoLength', 120,
    'guidanceTopics', jsonb_build_array(
      'cross-system-impact',
      'resource-authority',
      'escalation-criteria'
    ),
    'topKGuidanceSections', 5
  ),
  '612',
  COALESCE(
    (
      SELECT MAX(tk.sort_order) + 1
      FROM public.tickets tk
      WHERE tk.track_id = grc.track_id
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
