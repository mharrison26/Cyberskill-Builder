-- Seed HD-04 junior-notes coaching feedback ticket.
--
-- Students review fictional junior technician ticket notes that are
-- intentionally incomplete and/or unprofessional, then write structured
-- coaching feedback (strengths, gaps, action items, respectful delivery).
-- Graded via RAG against a pinned coaching-quality rubric
-- (specific, actionable, respectful) — NOT a compliance framework.
--
-- How to create / customize this ticket content:
--   1. Admin → Tickets → create or edit a ticket with ticket_type = coaching_feedback
--      (aliases: peer_coaching, junior_notes_review)
--   2. Put junior notes + context in initial_state
--        (ticketCode, title, juniorTech, requester, category, juniorNotes, prompt)
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
  AND t.ticket_type IN ('coaching_feedback', 'peer_coaching', 'junior_notes_review')
  AND t.scenario_brief LIKE 'HD-04:%';

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
  'coaching_feedback',
  'medium',
  40,
  'HD-04: Review a junior technician’s thin ticket notes and write specific, actionable, respectful coaching feedback',
  jsonb_build_object(
    'ticketCode', 'HD-04',
    'title', 'Peer coaching — junior VPN ticket notes',
    'juniorTech', 'Alex Rivera (Tier-1, week 3)',
    'requester', 'Sam Okonkwo (Sales)',
    'category', 'Remote access / VPN',
    'juniorNotes', E'user yelled about vpn again smh. reset stuff in the portal. told them to reboot lol. password whatever. fixed i guess??? closing before they spam me more.',
    'prompt', 'These junior notes are intentionally incomplete and unprofessional. Write structured coaching feedback: strengths, gaps (cite the notes), actionable coaching items, and a respectful 1:1 delivery message. Graded for coaching quality (specific, actionable, respectful) — not a compliance framework.'
  ),
  jsonb_build_object(
    'minFieldLength', 40,
    'guidanceTopics', jsonb_build_array(
      'specific',
      'actionable',
      'respectful'
    ),
    'topKGuidanceSections', 5
  ),
  '411',
  14
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
