-- Seed HD-07 helpdesk Tier 3 capstone (PI-07 flagship portfolio item).
--
-- Compiles prior KB write-ups (HD-03 kb_writeup family; HD-02 legacy) into a mini knowledge base
-- and requires a new written process document (new-hire onboarding checklist).
-- On resolve, submit marks portfolio_items.is_flagship for the track.
--
-- ticket_type: helpdesk_capstone
-- aliases: kb_capstone, onboarding_process_capstone
--
-- Idempotent: deletes prior seed rows by ticket_type + ticketCode / scenario marker.

DELETE FROM public.tickets
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND ticket_type IN (
    'helpdesk_capstone',
    'kb_capstone',
    'onboarding_process_capstone'
  )
  AND (
    initial_state->>'ticketCode' = 'HD-07'
    OR scenario_brief LIKE 'HD-07:%'
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
  'helpdesk_capstone',
  'high',
  90,
  'HD-07: Compile your KB articles into a mini knowledge base and author a new-hire onboarding checklist (flagship portfolio)',
  jsonb_build_object(
    'ticketCode', 'HD-07',
    'flagship', true,
    'minArticles', 1,
    'sourceTicketTypes', jsonb_build_array(
      'kb_writeup',
      'helpdesk_kb',
      'resolution_writeup',
      'knowledge_article',
      'kb_article'
    ),
    'processDocPrompt',
    'Write a practical Tier-1 new-hire onboarding checklist that references how to use the compiled knowledge base.',
    'prompt',
    'Review your prior post-resolution KB articles, then submit a process document covering purpose, day one, first week, tools/access, escalation path, and KB usage.'
  ),
  jsonb_build_object(
    'minArticles', 1,
    'minSectionLength', 40,
    'minTitleLength', 8,
    'requireAcknowledgment', true,
    'flagshipOnResolve', true,
    'requiredSections', jsonb_build_array(
      'purpose',
      'day_one',
      'first_week',
      'tools_access',
      'escalation_path',
      'kb_usage'
    )
  ),
  '411',
  95
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
