-- Seed ISSM FY security budget allocation ticket.
--
-- Students receive a fixed FY ceiling and 6 competing requests spanning
-- tooling, staffing, and training (mix of high risk-reduction and vanity /
-- low-impact items). They allocate dollars (partial OK) totaling ≤ budget
-- and write a justification tied to residual-risk reduction.
--
-- ticket_type: security_budget_allocation
-- aliases: budget_allocation, risk_based_budget
--
-- Scoring: deterministic gates (budget ceiling, per-request caps, min
-- justification length, min percent used) + RAG grading against
-- data/grc/security-budget-risk-rubric.json. Soft preferred/discouraged IDs
-- inform the LLM prompt only — no exact dollar answer key.
--
-- Track: issm (budget / program authority). Idempotent via NOT EXISTS.

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
  tr.track_id,
  2,
  'security_budget_allocation',
  'medium',
  60,
  'Security budget: Allocate HarborForge FY2027 security investment portfolio under a $250k ceiling',
  jsonb_build_object(
    'ticketCode', 'ISSM-BUDGET-01',
    'prompt', 'Allocate the FY security budget across competing requests. Total allocated must not exceed the budget. Justify the allocation based on risk reduction — link funded and deferred items to residual risk, not a shopping list of dollars.',
    'organization', jsonb_build_object(
      'name', 'HarborForge Logistics',
      'mission', 'Regional freight broker and customs brokerage operating hybrid offices, contractor field tablets, and a multi-cloud customs filing platform. The ISSM owns the enterprise security investment portfolio for FY2027.',
      'industry', 'Logistics / customs brokerage',
      'constraints', 'Fixed discretionary security budget of $250,000; unspent funds do not roll forward. AO expects risk-based prioritization over equal splits or optics projects.'
    ),
    'fiscalYear', 'FY2027',
    'totalBudget', 250000,
    'currency', 'USD',
    'allocationMode', 'partial_ok',
    'minJustificationLength', 250,
    'requests', jsonb_build_array(
      jsonb_build_object(
        'id', 'req_edr',
        'title', 'EDR expansion to unmanaged endpoints',
        'category', 'tooling',
        'amountRequested', 80000,
        'riskContext', 'Field tablets and two regional offices still lack endpoint detection agents. Last tabletop showed ransomware could dwell undetected for days on those hosts that process customs filings.'
      ),
      jsonb_build_object(
        'id', 'req_isso_fte',
        'title', 'Additional ISSO FTE (contractor bridge)',
        'category', 'staffing',
        'amountRequested', 120000,
        'riskContext', 'Continuous monitoring reviews and POA&M closures on two High-impact systems are slipping. Current ISSO capacity cannot clear the backlog before the next ATO milestone.'
      ),
      jsonb_build_object(
        'id', 'req_training',
        'title', 'Role-based security training for privileged users',
        'category', 'training',
        'amountRequested', 25000,
        'riskContext', 'Privileged admins and developers failed recent phishing simulations at 3× the workforce average. Role-based modules target credential hygiene and secure change practices.'
      ),
      jsonb_build_object(
        'id', 'req_vanity_dashboard',
        'title', 'Executive security dashboard redesign',
        'category', 'tooling',
        'amountRequested', 40000,
        'riskContext', 'Cosmetic refresh of the C-suite GRC dashboard tiles and branding. No new detection, assessment, or control automation — primarily visual reporting for board decks.'
      ),
      jsonb_build_object(
        'id', 'req_pentest',
        'title', 'Annual external penetration test',
        'category', 'tooling',
        'amountRequested', 45000,
        'riskContext', 'Internet-facing customs filing apps have not had an independent penetration test since the cloud migration. Prior internal scans miss business-logic flaws exploited in peer incidents.'
      ),
      jsonb_build_object(
        'id', 'req_awareness_swag',
        'title', 'Security awareness campaign swag',
        'category', 'training',
        'amountRequested', 15000,
        'riskContext', 'Branded stickers, stress balls, and posters for Cyber Awareness Month. Past campaigns showed negligible change in phishing click rates; low residual-risk reduction.'
      )
    )
  ),
  jsonb_build_object(
    'totalBudget', 250000,
    'minJustificationLength', 250,
    'mustNotExceedBudget', true,
    'requirePositiveAllocation', true,
    'discouragedRequestIds', jsonb_build_array(
      'req_vanity_dashboard',
      'req_awareness_swag'
    ),
    'preferredHighValueIds', jsonb_build_array(
      'req_edr',
      'req_isso_fte',
      'req_pentest'
    ),
    'guidanceTopics', jsonb_build_array(
      'risk-based budgeting',
      'risk reduction',
      'security investment prioritization'
    ),
    'minPercentBudgetUsed', 0.7,
    'topKGuidanceSections', 5,
    'allocationMode', 'partial_ok'
  ),
  '722',
  COALESCE(
    (
      SELECT MAX(tk.sort_order) + 1
      FROM public.tickets AS tk
      WHERE tk.track_id = tr.track_id
    ),
    0
  )
FROM (
  SELECT id
  FROM public.tenants
  WHERE id IN (
    '00000000-0000-4000-8000-000000000001'::uuid, -- commercial
    '00000000-0000-4000-8000-000000000003'::uuid  -- dod_adjacent
  )
) AS st
CROSS JOIN LATERAL (
  SELECT id AS track_id
  FROM public.tracks
  WHERE slug = 'issm'
  UNION ALL
  SELECT id AS track_id
  FROM public.tracks
  WHERE slug = 'grc'
    AND NOT EXISTS (SELECT 1 FROM public.tracks WHERE slug = 'issm')
  LIMIT 1
) AS tr
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tickets AS existing
  WHERE existing.tenant_id = st.id
    AND existing.track_id = tr.track_id
    AND existing.ticket_type IN (
      'security_budget_allocation',
      'budget_allocation',
      'risk_based_budget'
    )
    AND (
      existing.scenario_brief LIKE 'Security budget: Allocate HarborForge FY2027%'
      OR existing.initial_state->>'ticketCode' = 'ISSM-BUDGET-01'
    )
);
