-- Seed CIS Benchmark-derived Linux hardening ticket (Fly sandbox PI-05 + config-diff PI-06).
--
-- Students launch an ephemeral Fly Machines sandbox preloaded with intentionally
-- unhardened baseline configs, apply the checklist via the web terminal, then
-- submit. Submit captures guest filesystem state; grading uses config_diff rules.
--
-- ticket_type: cis_hardening
-- aliases: linux_hardening, sysadmin_hardening
--
-- Idempotent: deletes prior seed rows by stable scenario_brief marker per tenant.

DELETE FROM public.tickets
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND ticket_type IN (
    'cis_hardening',
    'linux_hardening',
    'sysadmin_hardening'
  )
  AND scenario_brief LIKE 'CIS hardening:%';

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
  'cis_hardening',
  'medium',
  45,
  'CIS hardening: Apply Linux baseline controls on an unhardened sandbox host',
  jsonb_build_object(
    'scenario', 'cis_hardening',
    'prompt',
    'You have been given a freshly provisioned Linux host with an intentionally weak baseline. Using the web terminal, apply the CIS Benchmark-derived checklist below, then submit so the lab can capture /etc configs and score each control.',
    'checklist', jsonb_build_array(
      jsonb_build_object(
        'id', 'permit_root_login',
        'title', 'Disable root SSH login',
        'description', 'Set PermitRootLogin no in sshd_config (CIS SSH hardening).',
        'hint', 'Edit /etc/ssh/sshd_config'
      ),
      jsonb_build_object(
        'id', 'password_authentication',
        'title', 'Disable SSH password authentication',
        'description', 'Require key-based auth: PasswordAuthentication no.',
        'hint', 'PasswordAuthentication no'
      ),
      jsonb_build_object(
        'id', 'max_auth_tries',
        'title', 'Limit SSH authentication attempts',
        'description', 'Set MaxAuthTries 4 to reduce brute-force exposure.',
        'hint', 'MaxAuthTries 4'
      ),
      jsonb_build_object(
        'id', 'pass_max_days',
        'title', 'Enforce password maximum age',
        'description', 'Set PASS_MAX_DAYS to 90 in /etc/login.defs.',
        'hint', 'PASS_MAX_DAYS 90'
      ),
      jsonb_build_object(
        'id', 'pass_min_days',
        'title', 'Enforce password minimum age',
        'description', 'Set PASS_MIN_DAYS to 1 so passwords cannot be rotated immediately.',
        'hint', 'PASS_MIN_DAYS 1'
      ),
      jsonb_build_object(
        'id', 'umask',
        'title', 'Tighten default umask',
        'description', 'Set UMASK 027 in /etc/login.defs.',
        'hint', 'UMASK 027'
      ),
      jsonb_build_object(
        'id', 'shadow_mode',
        'title', 'Restrict /etc/shadow permissions',
        'description', 'Ensure /etc/shadow is mode 640 (not world-readable).',
        'hint', 'chmod 640 /etc/shadow'
      ),
      jsonb_build_object(
        'id', 'telnet_disabled',
        'title', 'Disable unused telnet service',
        'description', 'Set disable = yes in /etc/xinetd.d/telnet.',
        'hint', 'disable = yes'
      )
    ),
    'preloadFiles', jsonb_build_object(
      'etc/ssh/sshd_config', $sshd$# CIS lab — intentionally unhardened baseline
Port 22
Protocol 2
PermitRootLogin yes
PasswordAuthentication yes
MaxAuthTries 10
PubkeyAuthentication yes
ChallengeResponseAuthentication no
UsePAM yes
X11Forwarding yes
$sshd$,
      'etc/login.defs', $login$# CIS lab — intentionally unhardened password policy
MAIL_DIR        /var/mail
PASS_MAX_DAYS   99999
PASS_MIN_DAYS   0
PASS_WARN_AGE   7
UMASK           022
ENCRYPT_METHOD  SHA512
$login$,
      'etc/shadow', $shadow$root:*:19000:0:99999:7:::
nobody:*:19000:0:99999:7:::
$shadow$,
      'etc/xinetd.d/telnet', $telnet$# CIS lab — unused cleartext service left enabled
service telnet
{
        disable         = no
        flags           = REUSE
        socket_type     = stream
        wait            = no
        user            = root
        server          = /usr/sbin/in.telnetd
        log_on_failure  += USERID
}
$telnet$
    ),
    'preloadModes', jsonb_build_object(
      'etc/shadow', '644',
      'etc/ssh/sshd_config', '644',
      'etc/login.defs', '644',
      'etc/xinetd.d/telnet', '644'
    )
  ),
  jsonb_build_object(
    'passThresholdPercent', 100,
    'rules', jsonb_build_array(
      jsonb_build_object(
        'id', 'permit_root_login',
        'type', 'file_contains',
        'path', 'etc/ssh/sshd_config',
        'pattern', 'PermitRootLogin no'
      ),
      jsonb_build_object(
        'id', 'password_authentication',
        'type', 'file_contains',
        'path', 'etc/ssh/sshd_config',
        'pattern', 'PasswordAuthentication no'
      ),
      jsonb_build_object(
        'id', 'max_auth_tries',
        'type', 'file_contains',
        'path', 'etc/ssh/sshd_config',
        'pattern', 'MaxAuthTries\s+4',
        'regex', true
      ),
      jsonb_build_object(
        'id', 'pass_max_days',
        'type', 'file_contains',
        'path', 'etc/login.defs',
        'pattern', 'PASS_MAX_DAYS\s+90',
        'regex', true
      ),
      jsonb_build_object(
        'id', 'pass_min_days',
        'type', 'file_contains',
        'path', 'etc/login.defs',
        'pattern', 'PASS_MIN_DAYS\s+1',
        'regex', true
      ),
      jsonb_build_object(
        'id', 'umask',
        'type', 'file_contains',
        'path', 'etc/login.defs',
        'pattern', 'UMASK\s+027',
        'regex', true
      ),
      jsonb_build_object(
        'id', 'shadow_mode',
        'type', 'file_permission',
        'path', 'etc/shadow',
        'mode', '640'
      ),
      jsonb_build_object(
        'id', 'telnet_disabled',
        'type', 'file_contains',
        'path', 'etc/xinetd.d/telnet',
        'pattern', 'disable\s*=\s*yes',
        'regex', true
      )
    )
  ),
  NULL,
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
