-- Seed fs_permissions_lab ticket (PI-04 WebContainer sandbox).
--
-- Students boot CodeSandbox with a seeded filesystem, navigate directories,
-- inspect modes with `ls -l` (lab injects a mode-aware helper), and answer
-- 3 short questions. Scoring is fully deterministic against expected_state.answers.
--
-- ticket_type: fs_permissions_lab
-- aliases: sandbox_permissions, ls_permissions, permissions_explore
--
-- Idempotent: deletes prior seed rows by stable scenario_brief marker per tenant.

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
  AND t.ticket_type IN (
    'fs_permissions_lab',
    'sandbox_permissions',
    'ls_permissions',
    'permissions_explore'
  )
  AND t.scenario_brief LIKE 'Filesystem permissions:%';

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
  'fs_permissions_lab',
  'medium',
  25,
  'Filesystem permissions: Explore the seeded lab tree with ls -l',
  jsonb_build_object(
    'prompt',
    $prompt$A staging host was imaged with a small lab tree under the sandbox workdir. Boot the WebContainer terminal, navigate with `cd` / `ls`, inspect permissions with `ls -l`, and read any files you need with `cat`. Then answer the questions from what you find — do not guess from the file browser (it is hidden on purpose).$prompt$,
    'files', jsonb_build_object(
      'README.md', $readme$# Filesystem permissions lab

This WebContainer is seeded with a small Unix-like tree. Your job:

1. List the top level: `ls -l`
2. Navigate into directories (`cd etc/secrets`, `cd tmp`, `cd home/analyst`)
3. Inspect file modes with `ls -l` (and `ls -l <file>`)
4. Read file contents with `cat` when a question asks for them
5. Submit answers in the form below the terminal

Tip: `ls` is aliased to a mode-aware lab helper so permission bits match the seeded state.
$readme$,
      'etc/secrets/api.key', $key$sk-lab-DO-NOT-COMMIT-9f3c
$key$,
      'etc/hostname', $host$lab-staging-01
$host$,
      'tmp/scratch.log', $log$world-writable scratch space — rotate me
$log$,
      'tmp/notes.txt', $notes$operator scratch notes (group-readable)
$notes$,
      'var/www/index.html', $html$<!doctype html><title>lab</title><p>ok</p>
$html$,
      'home/analyst/notes.txt', $anotes$Check the hidden flag beside this file.
$anotes$,
      'home/analyst/.flag', $flag$NAV-OK-7F3A
$flag$
    ),
    'modes', jsonb_build_object(
      'etc/secrets/api.key', '600',
      'etc/hostname', '644',
      'tmp/scratch.log', '777',
      'tmp/notes.txt', '640',
      'var/www/index.html', '644',
      'home/analyst/notes.txt', '640',
      'home/analyst/.flag', '400'
    ),
    'questions', jsonb_build_array(
      jsonb_build_object(
        'id', 'secret_mode',
        'prompt', 'What is the octal permission mode of etc/secrets/api.key? (from ls -l)',
        'placeholder', 'e.g. 600'
      ),
      jsonb_build_object(
        'id', 'world_writable',
        'prompt', 'Which file under tmp/ is world-writable (mode 777)? Enter the path relative to the lab root.',
        'placeholder', 'e.g. tmp/example.txt'
      ),
      jsonb_build_object(
        'id', 'hidden_flag',
        'prompt', 'Navigate to home/analyst and read the hidden .flag file. What are its contents?',
        'placeholder', 'flag value'
      )
    )
  ),
  jsonb_build_object(
    'passThresholdPercent', 100,
    'answers', jsonb_build_object(
      'secret_mode', jsonb_build_array('600', '0600', '-rw-------', 'rw-------'),
      'world_writable', jsonb_build_array(
        'tmp/scratch.log',
        './tmp/scratch.log'
      ),
      'hidden_flag', jsonb_build_array('NAV-OK-7F3A')
    )
  ),
  '411',
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
