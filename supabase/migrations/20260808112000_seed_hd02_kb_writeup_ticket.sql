-- Seed HD-03 post-resolution knowledge-base write-up ticket.
--
-- Students document a resolved helpdesk issue as a reusable KB article:
--   Problem, Root Cause, Resolution Steps, Prevention Tip
-- Graded via RAG against a pinned writing-quality rubric
-- (clarity, completeness, jargon explained) — NOT a compliance framework.
--
-- Curriculum code: HD-03 (primary). HD-02 is a legacy alias for the same
-- kb_writeup family; delete matcher accepts both for idempotent re-seed.
--
-- How to create / customize this ticket content:
--   1. Admin → Tickets → create or edit a ticket with ticket_type = kb_writeup
--      (aliases: helpdesk_kb, resolution_writeup)
--   2. Put resolved-ticket context in initial_state
--        (ticketCode, title, requester, symptoms, resolvedSummary, resolutionNotes, prompt)
--   3. Optional expected_state knobs:
--        minFieldLength, guidanceTopics, topKGuidanceSections
--
-- Idempotent: deletes prior seed rows by stable scenario_brief / ticketCode marker per tenant.

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
  AND t.ticket_type IN ('kb_writeup', 'helpdesk_kb', 'resolution_writeup')
  AND (
    t.scenario_brief LIKE 'HD-03:%'
    OR t.scenario_brief LIKE 'HD-02:%' -- legacy code before HD-03 primary
    OR t.initial_state->>'ticketCode' IN ('HD-03', 'HD-02')
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
  1,
  'kb_writeup',
  'medium',
  45,
  'HD-03: After resolving the VPN MFA lockout, document the fix as a knowledge-base article',
  jsonb_build_object(
    'ticketCode', 'HD-03',
    'title', 'VPN MFA approval timeout — document for KB',
    'requester', 'Jordan Lee (Contractor)',
    'category', 'Remote access / VPN',
    'environment', 'Corp VPN client + identity-provider MFA push notifications',
    'symptoms', 'User reported: "VPN says authentication timed out after I approved the phone prompt. Now I cannot connect at all."',
    'resolvedSummary', 'Cleared temporary lockout caused by late MFA approval against an expired VPN auth session; user reconnected successfully after approving a fresh prompt within the timeout window.',
    'resolutionNotes', jsonb_build_array(
      'Identity portal showed temporary lockout after repeated failed MFA completions',
      'Stale push prompt was approved after the VPN client had already timed out',
      'Verified intranet access after fresh Connect + timely MFA approval'
    ),
    'prompt', 'The ticket is resolved. Write a reusable knowledge-base article with Problem, Root Cause, Resolution Steps, and Prevention Tip. Writing quality is graded for clarity, completeness, and explaining jargon — not against a compliance framework.'
  ),
  jsonb_build_object(
    'minFieldLength', 40,
    'guidanceTopics', jsonb_build_array(
      'clarity',
      'completeness',
      'jargon'
    ),
    'topKGuidanceSections', 5
  ),
  '411',
  12
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
