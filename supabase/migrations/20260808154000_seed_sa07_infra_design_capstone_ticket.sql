-- Seed SA-07 sysadmin / infrastructure design capstone (PI-07 flagship portfolio item).
--
-- Student writes a short backup-topology architecture decision for Harbor Dental,
-- then answers 4–5 RAG follow-up questions generated from their own design doc
-- against the pinned architecture-decision / tradeoff rubric.
-- On resolve, submit marks portfolio_items.is_flagship for the track.
--
-- ticket_type: infra_design_capstone
-- alias: architecture_decision
--
-- Idempotent: deletes prior seed rows by ticket_type + ticketCode / scenario marker.

DELETE FROM public.tickets
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND ticket_type IN (
    'infra_design_capstone',
    'architecture_decision'
  )
  AND (
    initial_state->>'ticketCode' = 'SA-07'
    OR scenario_brief LIKE 'SA-07:%'
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
  3,
  'infra_design_capstone',
  'high',
  90,
  'SA-07: Choose and defend a backup topology for Harbor Dental (flagship portfolio)',
  jsonb_build_object(
    'ticketCode', 'SA-07',
    'flagship', true,
    'scenarioId', 'harbor_dental_backup_topology',
    'organization', 'Harbor Dental Practice',
    'constraints', jsonb_build_object(
      'workstations', 12,
      'onPremFileServerTb', 2,
      'workloads', jsonb_build_array(
        'patient imaging share on on-prem file server',
        'QuickBooks on one office PC',
        'Microsoft 365 email'
      ),
      'monthlyCloudBudgetUsd', 200,
      'staffing', 'no dedicated IT; contracting sysadmin + office manager',
      'drivers', jsonb_build_array(
        'peer practice ransomware incident',
        'multi-TB image restores must finish within one business day',
        'QuickBooks data loss tolerance measured in hours'
      )
    ),
    'prompt',
    'Harbor Dental has 12 workstations, a ~2TB on-prem file server (patient images + office docs), QuickBooks on one PC, and Microsoft 365 email. Monthly cloud budget is about $200. There is no dedicated IT. After a peer practice was hit by ransomware, write a short architecture decision record recommending a backup topology (for example 3-2-1 with NAS + immutable cloud, cloud-only, or dual-site). Cover constraints, alternatives rejected, tradeoffs, failure modes, and who operates restores. Then answer follow-up tradeoff questions generated from your design.',
    'designDocPrompt',
    'Write a practical backup-topology ADR that a contracting sysadmin could implement under Harbor Dental''s constraints.'
  ),
  jsonb_build_object(
    'minBodyLength', 400,
    'minTitleLength', 8,
    'minAnswerLength', 40,
    'flagshipOnResolve', true,
    'questionMin', 4,
    'questionMax', 5,
    'rubricPath', 'data/infra/architecture-decision-tradeoff-rubric.json'
  ),
  NULL,
  97
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
