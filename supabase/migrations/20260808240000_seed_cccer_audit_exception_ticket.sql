-- Seed AUD-05 CCCER audit-exception write-up ticket (GRC track).
--
-- Students draft a Condition / Criteria / Cause / Effect / Recommendation
-- finding for the HarborForge timely access revocation exception identified
-- in the ITGC access-revocation testing scenario (narratively linked; this
-- ticket is independently solvable from its own initial_state evidence).
-- Graded via RAG against pinned IIA/GAO finding-writing guidance.
--
-- How to create / customize this ticket content:
--   1. Admin → Tickets → create or edit a ticket with ticket_type = cccer
--      (aliases: cccer_exception, audit_finding_cccer)
--   2. Put exception facts in initial_state.evidenceArtifact / exceptionSummary
--   3. Optional expected_state knobs:
--        minFieldLength, guidanceTopics, topKGuidanceSections
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
  AND t.ticket_type IN ('cccer', 'cccer_exception', 'audit_finding_cccer')
  AND t.scenario_brief LIKE 'AUD-05:%';

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
  'cccer',
  'medium',
  60,
  'AUD-05: Write up the HarborForge timely access revocation exception using CCCER',
  jsonb_build_object(
    'relatedTicketCode', 'AUD-05',
    'relatedControlTest', 'itgc_access_revocation',
    'prompt', 'Using the exception evidence below (from HarborForge ITGC timely access revocation testing), draft a complete audit finding in CCCER format: Condition, Criteria, Cause, Effect, and Recommendation. Stay within the facts provided — do not invent users, dates, or policy requirements.',
    'controlObjective', 'Logical access for terminated personnel is disabled or revoked within the policy SLA so that former employees cannot retain production system access.',
    'criteriaSource', 'HarborForge Access Revocation Standard — revoke within 5 calendar days of termination (testing as of 2026-03-15).',
    'exceptionSummary', 'ITGC testing of timely access revocation concluded FAIL. Of 12 terminated users in the HR/IAM extract tested as of 2026-03-15, 6 users retained production access beyond the 5-calendar-day revocation SLA (including accounts still active after termination). This write-up documents that exception for management reporting. Related control test ticket type: itgc_access_revocation.',
    'exceptions', jsonb_build_array(
      jsonb_build_object(
        'id', 'u-bennett',
        'displayName', 'Avery Bennett',
        'username', 'abennett',
        'department', 'HR',
        'terminationDate', '2026-02-10',
        'accessStatus', 'active',
        'accessRevokedDate', null,
        'detail', 'Terminated 2026-02-10; access still active as of 2026-03-15 (33 days).'
      ),
      jsonb_build_object(
        'id', 'u-cho',
        'displayName', 'Mina Cho',
        'username', 'mcho',
        'department', 'IT',
        'terminationDate', '2026-03-08',
        'accessStatus', 'active',
        'accessRevokedDate', null,
        'detail', 'Terminated 2026-03-08; access still active as of 2026-03-15 (7 days).'
      ),
      jsonb_build_object(
        'id', 'u-garcia',
        'displayName', 'Luis Garcia',
        'username', 'lgarcia',
        'department', 'Operations',
        'terminationDate', '2026-01-05',
        'accessStatus', 'revoked',
        'accessRevokedDate', '2026-01-20',
        'detail', 'Terminated 2026-01-05; revoked 2026-01-20 (15 days — exceeds 5-day SLA).'
      ),
      jsonb_build_object(
        'id', 'u-hayes',
        'displayName', 'Chris Hayes',
        'username', 'chayes',
        'department', 'Finance',
        'terminationDate', '2026-01-20',
        'accessStatus', 'revoked',
        'accessRevokedDate', '2026-02-01',
        'detail', 'Terminated 2026-01-20; revoked 2026-02-01 (12 days — exceeds 5-day SLA).'
      ),
      jsonb_build_object(
        'id', 'u-park',
        'displayName', 'Noah Park',
        'username', 'npark',
        'department', 'Engineering',
        'terminationDate', '2026-03-01',
        'accessStatus', 'active',
        'accessRevokedDate', null,
        'detail', 'Terminated 2026-03-01; access still active as of 2026-03-15 (14 days).'
      ),
      jsonb_build_object(
        'id', 'u-torres',
        'displayName', 'Elena Torres',
        'username', 'etorres',
        'department', 'Sales',
        'terminationDate', '2026-02-01',
        'accessStatus', 'revoked',
        'accessRevokedDate', '2026-02-10',
        'detail', 'Terminated 2026-02-01; revoked 2026-02-10 (9 days — exceeds 5-day SLA).'
      )
    ),
    'evidenceArtifact', jsonb_build_object(
      'engagement_item', 'AUD-05',
      'control_test', 'Timely access revocation (ITGC)',
      'testing_as_of', '2026-03-15',
      'population', 'Terminated users in HR/IAM extract for the period',
      'sample_size', 12,
      'control_outcome', 'fail',
      'exception_count', 6,
      'policy', jsonb_build_object(
        'title', 'HarborForge Access Revocation Standard',
        'revokeWithinDays', 5,
        'calendarBasis', 'calendar_days'
      ),
      'process_notes', jsonb_build_array(
        'HR records terminations in the HRIS; IAM deprovisioning is ticket-driven and manual.',
        'No automated join between HRIS termination events and directory/ERP account disablement was observed.',
        'No weekly reconciliation of terminated users to active accounts was evidenced during the period.'
      ),
      'exception_user_ids', jsonb_build_array(
        'u-bennett', 'u-cho', 'u-garcia', 'u-hayes', 'u-park', 'u-torres'
      )
    )
  ),
  jsonb_build_object(
    'minFieldLength', 40,
    'guidanceTopics', jsonb_build_array(
      'finding-elements-overview',
      'condition',
      'criteria',
      'cause',
      'effect',
      'recommendation'
    ),
    'topKGuidanceSections', 8
  ),
  '612',
  32
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
