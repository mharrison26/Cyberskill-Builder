-- Seed vulnerability prioritization / patch schedule ticket (GRC track).
--
-- Students receive 9 fictional vulnerabilities (CVSS, exposed system,
-- exploit-available) and must produce an ordered patch schedule.
--
-- ticket_type: vuln_prioritization
-- aliases: patch_schedule
--
-- Weighting used for the answer key (higher → patch sooner):
--   priorityScore = cvss
--     + (exposure internet=3.0 | partner=1.5 | internal=0)
--     + (exploitAvailable ? 2.0 : 0)
-- Scoring: pairwise concordance vs expectedOrder; passThresholdPercent = 80.
--
-- How to create / customize:
--   1. Admin → Tickets → ticket_type = vuln_prioritization (alias: patch_schedule)
--   2. Put 8–10 vulns in initial_state.vulnerabilities
--   3. Put canonical order in expected_state.expectedOrder (or omit to derive)
--   4. Students submit { type, orderedIds: string[] }
--
-- Idempotent: deletes prior seed rows by stable scenario_brief marker per tenant.

DELETE FROM public.tickets
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND ticket_type IN ('vuln_prioritization', 'patch_schedule')
  AND scenario_brief LIKE 'Vuln prioritization:%';

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
  'vuln_prioritization',
  'medium',
  30,
  'Vuln prioritization: Build a severity-and-exposure-weighted patch schedule',
  jsonb_build_object(
    'prompt', 'Scan findings below are unsorted. Produce a prioritized patch schedule (soonest first) using CVSS severity, whether the system is internet-/partner-facing, and whether a public exploit is available.',
    'vulnerabilities', jsonb_build_array(
      jsonb_build_object(
        'id', 'VULN-INFO-LDAP',
        'cveId', 'CVE-2024-1009',
        'title', 'LDAP anonymous bind information disclosure',
        'description', 'Anonymous binds return user attributes from the corporate directory. No weaponized exploit observed.',
        'cvss', 5.3,
        'exposedSystem', 'Corporate LDAP (ldaps.example.com)',
        'exposure', 'internet',
        'exploitAvailable', false
      ),
      jsonb_build_object(
        'id', 'VULN-RCE-VPN',
        'cveId', 'CVE-2024-1001',
        'title', 'Unauthenticated RCE on VPN concentrator',
        'description', 'Remote code execution via crafted SSL VPN handshake. Public Metasploit module available.',
        'cvss', 9.8,
        'exposedSystem', 'Corporate VPN concentrator',
        'exposure', 'internet',
        'exploitAvailable', true
      ),
      jsonb_build_object(
        'id', 'VULN-PATH-FILE',
        'cveId', 'CVE-2024-1008',
        'title', 'Authenticated path traversal on file server',
        'description', 'Authenticated users can read arbitrary files via ../ sequences. Exploit PoC published.',
        'cvss', 7.2,
        'exposedSystem', 'Internal file server (files.corp.local)',
        'exposure', 'internal',
        'exploitAvailable', true
      ),
      jsonb_build_object(
        'id', 'VULN-SQLI-PORTAL',
        'cveId', 'CVE-2024-1002',
        'title', 'SQL injection in customer portal login',
        'description', 'Boolean-based blind SQLi in the login form. Public exploit scripts circulate on forums.',
        'cvss', 9.1,
        'exposedSystem', 'Customer self-service portal',
        'exposure', 'internet',
        'exploitAvailable', true
      ),
      jsonb_build_object(
        'id', 'VULN-DESER-API',
        'cveId', 'CVE-2024-1007',
        'title', 'Insecure deserialization on public API',
        'description', 'Java deserialization gadget chain possible, but no reliable public exploit yet.',
        'cvss', 8.1,
        'exposedSystem', 'Public API gateway',
        'exposure', 'internet',
        'exploitAvailable', false
      ),
      jsonb_build_object(
        'id', 'VULN-AUTH-SSO',
        'cveId', 'CVE-2024-1003',
        'title', 'SSO token validation bypass',
        'description', 'Forged SAML assertions accepted under certain clock-skew conditions. Exploit kit available.',
        'cvss', 8.6,
        'exposedSystem', 'Corporate SSO identity provider',
        'exposure', 'internet',
        'exploitAvailable', true
      ),
      jsonb_build_object(
        'id', 'VULN-PRIV-ERP',
        'cveId', 'CVE-2024-1006',
        'title', 'Privilege escalation in partner ERP portal',
        'description', 'Low-privilege partner accounts can become org-admins. Working exploit shared privately.',
        'cvss', 8.2,
        'exposedSystem', 'ERP partner extranet',
        'exposure', 'partner',
        'exploitAvailable', true
      ),
      jsonb_build_object(
        'id', 'VULN-RCE-JUMP',
        'cveId', 'CVE-2024-1004',
        'title', 'Remote code execution on partner jump host',
        'description', 'SSH service RCE reachable from the partner VPN. Public exploit exists.',
        'cvss', 9.8,
        'exposedSystem', 'Partner jump host',
        'exposure', 'partner',
        'exploitAvailable', true
      ),
      jsonb_build_object(
        'id', 'VULN-XSS-CRM',
        'cveId', 'CVE-2024-1005',
        'title', 'Stored XSS in CRM contact notes',
        'description', 'Stored cross-site scripting with a published browser exploit chain.',
        'cvss', 7.5,
        'exposedSystem', 'CRM web application',
        'exposure', 'internet',
        'exploitAvailable', true
      )
    )
  ),
  jsonb_build_object(
    'passThresholdPercent', 80,
    'weights', jsonb_build_object(
      'internetExposureBonus', 3,
      'partnerExposureBonus', 1.5,
      'internalExposureBonus', 0,
      'exploitAvailableBonus', 2
    ),
    -- Canonical order by priorityScore desc (cvss + exposure + exploit):
    -- RCE-VPN 14.8, SQLI 14.1, AUTH-SSO 13.6, RCE-JUMP 13.3,
    -- XSS-CRM 12.5, PRIV-ERP 11.7, DESER-API 11.1, PATH-FILE 9.2, INFO-LDAP 8.3
    'expectedOrder', jsonb_build_array(
      'VULN-RCE-VPN',
      'VULN-SQLI-PORTAL',
      'VULN-AUTH-SSO',
      'VULN-RCE-JUMP',
      'VULN-XSS-CRM',
      'VULN-PRIV-ERP',
      'VULN-DESER-API',
      'VULN-PATH-FILE',
      'VULN-INFO-LDAP'
    )
  ),
  '541',
  28
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
