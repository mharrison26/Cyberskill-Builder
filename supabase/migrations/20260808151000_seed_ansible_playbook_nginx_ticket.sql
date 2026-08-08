-- Seed ansible_playbook / iac_lab nginx ticket (CodeSandbox file submission).
--
-- Students complete a short Ansible playbook that targets the webservers host
-- group, installs nginx, and enables/starts the service. Grading
-- (ticket_type = ansible_playbook | iac_lab | ansible_lab | terraform_lab)
-- structurally parses the submitted YAML for required declarations — not an
-- exact text match. Module aliases (package|yum|apt|dnf, service|systemd),
-- FQCNs, inline key=value args, task order, and extra tasks are tolerated.
--
-- How to create / customize:
--   1. Admin → Tickets → ticket_type = ansible_playbook
--   2. Put lab files under initial_state.files (README + stub playbook)
--   3. expected_state.declarations: structured hosts/package/service checks
--   4. Optional: playbookPath, passThresholdPercent
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
    'ansible_playbook',
    'iac_lab',
    'ansible_lab',
    'terraform_lab'
  )
  AND t.scenario_brief LIKE 'Ansible playbook:%';

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
  'ansible_playbook',
  'medium',
  30,
  'Ansible playbook: Install and enable nginx on the webservers group',
  jsonb_build_object(
    'files', jsonb_build_object(
      'README.md', $readme$# Nginx on webservers

Ops needs a short Ansible playbook that configures the **webservers** inventory
group with nginx installed and running.

## Goal

Edit `playbook.yml` so that it:

1. Targets the **webservers** host group (`hosts: webservers`)
2. Installs the **nginx** package (`state: present`) — `package`, `yum`, `apt`,
   or `dnf` (including `ansible.builtin.*` FQCNs) are all fine
3. Enables and starts the **nginx** service (`state: started`, `enabled: true`)
   — `service` or `systemd` are fine; split across two tasks is OK

Extra tasks are allowed. Exact formatting / key order does not matter.

## Workflow

1. Edit `playbook.yml`
2. (Optional) Sanity-check YAML indentation in the editor
3. Click **Submit lab**

Grading structurally checks for the required hosts / package / service
declarations — not a full-file text match.
$readme$,
      'playbook.yml', $playbook$---
# TODO: Target webservers, install nginx, enable and start the service.
- name: Configure webservers
  hosts: all
  become: true
  tasks:
    - name: Placeholder — replace with package + service tasks
      debug:
        msg: "Implement nginx install and enable here"
$playbook$,
      'inventory', $inventory$[webservers]
web1.example.local
web2.example.local
$inventory$
    )
  ),
  jsonb_build_object(
    'playbookPath', 'playbook.yml',
    'passThresholdPercent', 100,
    'declarations', jsonb_build_array(
      jsonb_build_object(
        'id', 'hosts_webservers',
        'kind', 'hosts',
        'hosts', 'webservers'
      ),
      jsonb_build_object(
        'id', 'install_nginx',
        'kind', 'package',
        'name', 'nginx',
        'state', 'present'
      ),
      jsonb_build_object(
        'id', 'enable_nginx',
        'kind', 'service',
        'name', 'nginx',
        'state', 'started',
        'enabled', true
      )
    )
  ),
  '411',
  COALESCE(
    (
      SELECT MAX(tk.sort_order) + 1
      FROM public.tickets tk
      WHERE tk.tenant_id = st.id
        AND tk.track_id = grc.track_id
    ),
    1
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
