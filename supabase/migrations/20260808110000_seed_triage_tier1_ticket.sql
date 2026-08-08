-- Seed a Tier 1 triage ticket on the GRC track (commercial + DoD-adjacent tenants).
--
-- Students read a raw inbound support request and assign:
--   - priority (P1–P4) scored against impact × urgency in expected_state
--   - category (ITSM classification)
--
-- Rubric (default matrix in src/lib/scoring/ticketUi.ts):
--   high impact × medium urgency → P2
--
-- Idempotent: skips insert when the same scenario_brief marker already exists.

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
  'triage',
  'medium',
  20,
  $brief$
Triage: Finance Director cannot open the shared drive used for month-end close. Assign priority using impact × urgency (high impact × medium urgency → P2) and choose the correct ITSM category (access). Educational exercise only.
$brief$,
  jsonb_build_object(
    'subject', 'URGENT: Shared finance drive unavailable — month-end close blocked',
    'body', E'Hi Help Desk,\n\nI am the Finance Director and I cannot open the Finance / Month-End shared drive (\\\\files\\finance\\month-end). Explorer says \"Access is denied\" after this morning''s permission change window. Payroll and AP need these workbooks today for close; auditors are also on-site tomorrow morning.\n\nI can still open email and other network shares. Please restore access as soon as possible.\n\nThanks,\nJordan Blake',
    'affectedUserRole', 'Finance Director',
    'requesterName', 'Jordan Blake',
    'categoryOptions', jsonb_build_array(
      'access',
      'hardware',
      'software',
      'network',
      'email',
      'security',
      'account',
      'how_to',
      'other'
    )
  ),
  jsonb_build_object(
    'impact', 'high',
    'urgency', 'medium',
    'expectedPriority', 'P2',
    'expectedCategory', 'access'
  ),
  '722',
  0
FROM (
  SELECT unnest(ARRAY[
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  ]) AS id
) AS st
CROSS JOIN LATERAL (
  SELECT id AS track_id FROM public.tracks WHERE slug = 'grc' LIMIT 1
) AS grc
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tickets AS existing
  WHERE existing.tenant_id = st.id
    AND existing.track_id = grc.track_id
    AND existing.ticket_type = 'triage'
    AND existing.scenario_brief LIKE 'Triage: Finance Director%'
);
