-- Seed a Tier 1 mock_directory helpdesk ticket on the GRC track.
-- Students use the simulated directory console to search for a locked user,
-- verify identity, unlock the account, and reset the password.
-- Scoring is fully deterministic against expected_state.requiredActions.

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
  'mock_directory',
  'medium',
  30,
  'Helpdesk: Unlock Jordan Doe (jdoe) and reset their password after verifying identity.',
  '{
    "prompt": "A Finance user reports they are locked out after failed sign-in attempts. Find Jordan Doe (jdoe) in the simulated directory, verify identity using the badge challenge, unlock the account, then reset the password. Submit your action log when finished.",
    "mock_directory_users": [
      {
        "id": "u-jdoe",
        "username": "jdoe",
        "displayName": "Jordan Doe",
        "email": "jdoe@harborforge.example",
        "department": "Finance",
        "status": "locked",
        "identityQuestion": "What is your employee badge number?",
        "identityAnswer": "HF-4412"
      },
      {
        "id": "u-asmith",
        "username": "asmith",
        "displayName": "Alex Smith",
        "email": "asmith@harborforge.example",
        "department": "Engineering",
        "status": "active",
        "identityQuestion": "What city were you hired in?",
        "identityAnswer": "Austin"
      },
      {
        "id": "u-rlee",
        "username": "rlee",
        "displayName": "Riley Lee",
        "email": "rlee@harborforge.example",
        "department": "Operations",
        "status": "disabled"
      }
    ]
  }'::jsonb,
  '{
    "requireOrdered": true,
    "requiredActions": [
      { "type": "search", "query": "jdoe" },
      { "type": "verify_identity", "userId": "u-jdoe" },
      { "type": "unlock", "userId": "u-jdoe" },
      { "type": "reset_password", "userId": "u-jdoe" }
    ]
  }'::jsonb,
  '722',
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
      AND existing.ticket_type = 'mock_directory'
      AND existing.scenario_brief LIKE 'Helpdesk: Unlock Jordan Doe%'
  );
