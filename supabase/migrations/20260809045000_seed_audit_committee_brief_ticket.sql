-- Seed AUD-07 audit-committee brief (GRC track flagship portfolio item).
--
-- Student compiles prior findings (AUD-06 findings_summary / CCCER, or seeded
-- prior_findings fallback) into a short executive summary, then generates
-- 4–5 RAG audit-committee questions grounded in that summary against pinned
-- AC / executive reporting guidance
-- (data/grc/audit-committee-reporting-guidance.json).
-- On resolve, submit marks portfolio_items.is_flagship for the track.
--
-- ticket_type: audit_committee_brief
-- alias: executive_summary_ac
--
-- Narrative link: scenario references AUD-06 / HarborForge ITGC engagement
-- findings stage (PI-02). Solvable standalone via initial_state.prior_findings.
--
-- Idempotent: deletes prior seed rows by ticket_type + ticketCode / scenario marker.

DELETE FROM public.tickets
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND ticket_type IN (
    'audit_committee_brief',
    'executive_summary_ac'
  )
  AND (
    initial_state->>'ticketCode' = 'AUD-07'
    OR scenario_brief LIKE 'AUD-07:%'
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
  'audit_committee_brief',
  'high',
  60,
  'AUD-07: Compile AUD-06 findings into an executive summary for the audit committee (flagship portfolio)',
  jsonb_build_object(
    'ticketCode', 'AUD-07',
    'flagship', true,
    'engagementRef', 'harborforge-fy2026-itgc',
    'priorTicketCode', 'AUD-06',
    'sourceTicketTypes', jsonb_build_array(
      'findings_summary',
      'engagement_findings',
      'cccer',
      'audit_finding_cccer'
    ),
    'scenario', jsonb_build_object(
      'organization', 'HarborForge Industries',
      'engagement', 'FY2026 ITGC / process control engagement (PI-02)',
      'audience', 'Audit committee',
      'period', 'FY2026 interim testing',
      'notes',
      'Prefer the student''s resolved AUD-06 findings summary (and AUD-05 CCCER write-ups when present). If those submissions are missing, use the seeded prior_findings below so the ticket remains solvable standalone.'
    ),
    'prior_findings', jsonb_build_array(
      jsonb_build_object(
        'id', 'F-01',
        'controlId', 'AC-2',
        'title', 'Untimely workforce access revocation',
        'summary',
        'Of 15 terminated users sampled, 6 retained Okta access beyond HarborForge''s 5-calendar-day revocation SLA. HR termination tickets were not consistently routed to IAM within 24 hours; no automated deprovisioning job exists. Residual risk: unauthorized access to ERP and email until accounts are disabled.',
        'finding_state', 'not_satisfied'
      ),
      jsonb_build_object(
        'id', 'F-02',
        'controlId', 'CM-3',
        'title', 'Production changes without CAB approval',
        'summary',
        '2 of 12 sampled production changes lacked Change Advisory Board approval before deploy. Developers with prod push rights bypassed the CAB queue during a release freeze exception that was never closed. Management plans CAB gate enforcement in the CI pipeline by 2026-08-31.',
        'finding_state', 'not_satisfied'
      ),
      jsonb_build_object(
        'id', 'F-03',
        'controlId', 'AC-2',
        'title', 'Contractor access recertification gap',
        'summary',
        'Quarterly contractor access recertification was skipped for the Q1 cohort (38 contractors). Access owners cited tool outage; no compensating review was documented. Two contractors retained finance-system roles after contract end dates.',
        'finding_state', 'insufficient_evidence'
      )
    ),
    'prompt',
    'Using your AUD-06 engagement findings (or the seeded prior findings if AUD-06 is not yet complete), write a short executive summary for the HarborForge audit committee. Prioritize severity, root-cause themes, remediation owners/timelines, and residual risk. Then generate 4–5 audit-committee-style questions from that summary.'
  ),
  jsonb_build_object(
    'minSummaryLength', 200,
    'questionMin', 4,
    'questionMax', 5,
    'flagshipOnResolve', true,
    'guidancePath', 'data/grc/audit-committee-reporting-guidance.json',
    'guidanceTopics', jsonb_build_array(
      'exec-summary-purpose',
      'root-cause-accountability',
      'remediation-timeline',
      'residual-risk',
      'ac-question-quality'
    ),
    'topKGuidanceSections', 6
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
