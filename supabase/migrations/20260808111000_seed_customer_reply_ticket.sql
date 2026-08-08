-- Seed a Tier 1 customer_reply ticket (angry email → drafted de-escalation reply).
-- Graded with deterministic length gate + RAG against pinned communication rubric.

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
  '00000000-0000-4000-8000-000000000001'::uuid,
  t.id,
  1,
  'customer_reply',
  'medium',
  30,
  $brief$
You are Tier 1 helpdesk for Northline Analytics (fictional). Jordan Hale, a sales manager, has been unable to sign in to email for three business days and sent an angry message to support. Draft a reply that acknowledges their frustration, states clear next steps in plain language, avoids unexplained jargon, and keeps a professional tone. Educational exercise only.
$brief$,
  '{
    "customerEmail": {
      "from": "Jordan Hale <jordan.hale@northline.example>",
      "to": "support@northline.example",
      "subject": "UNACCEPTABLE — still locked out after 3 days!!!",
      "receivedAt": "2026-08-07T14:22:00Z",
      "body": "Hi \"support\",\n\nI have been locked out of my email for THREE DAYS. I already called twice and opened ticket #18422. Nobody called me back. I am missing client proposals and my VP is furious.\n\nIf this is not fixed TODAY I am escalating to the CIO. Stop sending me useless auto-replies and FIX MY ACCOUNT.\n\nJordan Hale\nSales Manager"
    },
    "prompt": "Draft a professional reply that acknowledges Jordan''s frustration, states what you will do next (with timing), uses plain language, and stays calm."
  }'::jsonb,
  '{
    "minReplyLength": 120,
    "guidanceTopics": [
      "acknowledge-frustration",
      "state-next-steps",
      "avoid-jargon",
      "professional-tone"
    ],
    "topKGuidanceSections": 4
  }'::jsonb,
  '411',
  COALESCE(
    (
      SELECT MAX(tk.sort_order) + 1
      FROM public.tickets AS tk
      WHERE tk.track_id = t.id
    ),
    0
  )
FROM public.tracks AS t
WHERE t.slug = 'grc'
  AND NOT EXISTS (
    SELECT 1
    FROM public.tickets AS existing
    WHERE existing.track_id = t.id
      AND existing.ticket_type IN ('customer_reply', 'deescalation_reply')
      AND existing.scenario_brief LIKE 'You are Tier 1 helpdesk for Northline Analytics%'
  );
