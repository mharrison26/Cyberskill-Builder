-- Seed Tier 3 / capstone risk-based annual audit plan ticket (GRC track).
--
-- Students review a fictional org profile + risk register and produce a
-- prioritized annual audit plan (which areas, order, why) within a capacity
-- constraint. Deterministic completeness / high-risk prioritization gates +
-- RAG grading against pinned risk-based planning guidance
-- (data/grc/risk-based-audit-planning-guidance.json).
--
-- ticket_type: risk_based_audit_plan (alias: annual_audit_plan_capstone)
-- Distinct from engagement-stage planning memos — this is an annual plan
-- built from the enterprise risk register.
--
-- How to create / customize:
--   1. Admin → Tickets → ticket_type = risk_based_audit_plan
--   2. Put org profile + riskRegister[] in initial_state
--   3. expected_state knobs: auditCapacity, minJustificationLength,
--      requiredHighRiskAreaIds, lowRiskAreaIds, maxLowRiskInPlan,
--      guidanceTopics, topKGuidanceSections
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
  AND t.ticket_type IN ('risk_based_audit_plan', 'annual_audit_plan_capstone')
  AND (
    t.scenario_brief LIKE 'Capstone audit plan:%'
    OR t.initial_state->>'ticketCode' = 'AP-CAP-01'
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
  'risk_based_audit_plan',
  'high',
  90,
  'Capstone audit plan: Prioritize Meridian Payments annual internal audit plan from the risk register',
  jsonb_build_object(
    'ticketCode', 'AP-CAP-01',
    'auditCapacity', 5,
    'organization', jsonb_build_object(
      'name', 'Meridian Payments Inc.',
      'industry', 'Payment processing / fintech (card-not-present and ACH)',
      'employees', '480 employees; hybrid workforce; multi-cloud production',
      'revenue', '~$210M annual payment volume processed for mid-market merchants',
      'fiscalYear', 'FY2027 audit plan (calendar 2026 planning cycle)',
      'description', 'Meridian operates a PCI-relevant payment platform, relies on cloud SaaS processors and identity providers, and is preparing for a core ledger migration. The audit committee expects a risk-based annual plan that fits a capacity of five engagements.',
      'auditUniverse', 'ITGCs, payment operations, third-party risk, privacy, finance, and selected administrative processes'
    ),
    'riskRegister', jsonb_build_array(
      jsonb_build_object(
        'id', 'R-01',
        'area', 'Privileged access / IAM',
        'inherentRisk', 'critical',
        'residualRisk', 'critical',
        'lastAuditDate', '2023-02-15',
        'materialityNotes', 'Admin access to payment ops, cloud consoles, and production databases; compromise could enable fraudulent transfers.',
        'knownIssues', 'Q4 access review found orphaned admin accounts; joiner-mover-leaver exceptions remain open.'
      ),
      jsonb_build_object(
        'id', 'R-02',
        'area', 'Change management / production releases',
        'inherentRisk', 'high',
        'residualRisk', 'high',
        'lastAuditDate', 'Never',
        'materialityNotes', 'Release failures can interrupt merchant settlement and card authorization paths.',
        'knownIssues', 'Emergency changes frequently bypass CAB with incomplete backfill evidence.'
      ),
      jsonb_build_object(
        'id', 'R-03',
        'area', 'Third-party / cloud SaaS risk',
        'inherentRisk', 'high',
        'residualRisk', 'high',
        'lastAuditDate', '2022-08-01',
        'materialityNotes', 'Core processors, cloud IAM IdP, and card-tokenization vendors concentrate operational risk.',
        'knownIssues', 'Several vendor SOC reports older than 12 months; residual risk accepted without revalidation.'
      ),
      jsonb_build_object(
        'id', 'R-04',
        'area', 'Payment processing / PCI controls',
        'inherentRisk', 'critical',
        'residualRisk', 'high',
        'lastAuditDate', '2024-11-01',
        'materialityNotes', 'Cardholder data environment and network segmentation; regulatory and brand exposure.',
        'knownIssues', 'Two medium PCI findings still open past management’s original due dates.'
      ),
      jsonb_build_object(
        'id', 'R-05',
        'area', 'Security monitoring / incident response',
        'inherentRisk', 'high',
        'residualRisk', 'high',
        'lastAuditDate', '2023-09-12',
        'materialityNotes', 'Detection and containment speed directly affect payment fraud and downtime impact.',
        'knownIssues', 'SIEM use-case coverage incomplete for payment authorization paths.'
      ),
      jsonb_build_object(
        'id', 'R-06',
        'area', 'Business continuity / disaster recovery',
        'inherentRisk', 'high',
        'residualRisk', 'medium',
        'lastAuditDate', '2021-05-20',
        'materialityNotes', 'Extended outage would halt settlement; RTO/RPO commitments made to large merchants.',
        'knownIssues', 'Last full failover test is stale; ledger migration will change recovery runbooks.'
      ),
      jsonb_build_object(
        'id', 'R-07',
        'area', 'Vendor management / procurement',
        'inherentRisk', 'medium',
        'residualRisk', 'medium',
        'lastAuditDate', '2024-03-10',
        'materialityNotes', 'Spending and onboarding of niche fintech tools; overlaps with third-party risk.',
        'knownIssues', 'Policy exceptions for rush vendors without security questionnaires.'
      ),
      jsonb_build_object(
        'id', 'R-08',
        'area', 'Data privacy / retention',
        'inherentRisk', 'high',
        'residualRisk', 'medium',
        'lastAuditDate', '2023-11-02',
        'materialityNotes', 'Merchant PII and support recordings; state privacy and contractual deletion clauses.',
        'knownIssues', 'Retention jobs fail intermittently for archived support tickets.'
      ),
      jsonb_build_object(
        'id', 'R-09',
        'area', 'Financial close / revenue recognition',
        'inherentRisk', 'medium',
        'residualRisk', 'medium',
        'lastAuditDate', '2025-02-28',
        'materialityNotes', 'Fee revenue and reserve accounting; covered annually by external financial statement audit.',
        'knownIssues', 'No open IA findings; external auditors flagged one immaterial cut-off item.'
      ),
      jsonb_build_object(
        'id', 'R-10',
        'area', 'Physical security / facilities',
        'inherentRisk', 'medium',
        'residualRisk', 'low',
        'lastAuditDate', '2025-01-20',
        'materialityNotes', 'Office badge access; limited direct impact on payment processing (cloud-hosted).',
        'knownIssues', 'None material; clean recent review.'
      ),
      jsonb_build_object(
        'id', 'R-11',
        'area', 'Travel and expense',
        'inherentRisk', 'low',
        'residualRisk', 'low',
        'lastAuditDate', '2024-06-01',
        'materialityNotes', 'Administrative spend; immaterial relative to payment operations risk.',
        'knownIssues', 'None.'
      ),
      jsonb_build_object(
        'id', 'R-12',
        'area', 'Corporate communications / brand',
        'inherentRisk', 'low',
        'residualRisk', 'low',
        'lastAuditDate', 'Never',
        'materialityNotes', 'Brand messaging and social channels; low financial statement impact.',
        'knownIssues', 'None noted on risk register.'
      )
    ),
    'prompt', 'Capstone: Produce a prioritized annual internal audit plan for Meridian Payments. Select exactly 5 audit areas from the risk register, order them (1 = first engagement), and justify each choice using residual risk, last-audit recency, materiality/impact, and known issues. Document capacity/deferral notes for areas left out. Completeness and high-risk coverage are scored deterministically; plan quality is graded against pinned risk-based audit planning guidance.'
  ),
  jsonb_build_object(
    'auditCapacity', 5,
    'minJustificationLength', 60,
    'minCapacityNotesLength', 40,
    'requireCapacityNotes', true,
    'requiredHighRiskAreaIds', jsonb_build_array('R-01', 'R-02', 'R-03'),
    'requiredWithinTopN', 5,
    'lowRiskAreaIds', jsonb_build_array('R-10', 'R-11', 'R-12'),
    'maxLowRiskInPlan', 1,
    'guidanceTopics', jsonb_build_array(
      'risk-based-priority',
      'justification-quality',
      'capacity-tradeoffs',
      'avoid-low-risk-bias',
      'coverage-and-recency'
    ),
    'topKGuidanceSections', 5
  ),
  '612',
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
