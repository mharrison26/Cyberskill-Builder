-- Seed CMMC 2.0 Level 2 gap-analysis ticket (GRC track).
--
-- Students review a fictional company's control implementation summary, then:
--   - score a curated subset of CMMC L2 practices (met / partial / not_met)
--   - enter overall readiness %
--   - write a gap analysis (RAG-graded vs pinned practice text in data/cmmc/)
--
-- How to create / customize:
--   1. Admin → Tickets → ticket_type = cmmc_gap_analysis (alias: cmmc_l2_gap)
--   2. Set initial_state.companyName, implementationSummary, practiceIds / practices
--   3. Optional expected_state: minGapAnalysisLength, topKPractices, practiceIds
--
-- Idempotent: deletes prior seed rows by stable scenario_brief marker per tenant.

DELETE FROM public.tickets
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND ticket_type IN ('cmmc_gap_analysis', 'cmmc_l2_gap')
  AND scenario_brief LIKE 'CMMC L2:%';

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
  'cmmc_gap_analysis',
  'medium',
  60,
  'CMMC L2: Score HarborForge Analytics control maturity and document practice gaps',
  '{
    "companyName": "HarborForge Analytics LLC",
    "companySummary": "Mid-size defense analytics contractor (≈220 employees) pursuing CMMC 2.0 Level 2 certification to support DoD contracts involving CUI.",
    "implementationSummary": "Identity: HR provisions AD accounts within 2 business days; terminations are ticketed but quarterly access reviews are inconsistent and several former-contractor accounts were found enabled last quarter.\n\nAccess / privilege: Engineers use named accounts. Domain admins share a break-glass account password in a team vault; several developers retain local admin on laptops for tooling convenience.\n\nAuthentication: Corporate VPN and Microsoft 365 require MFA. Privileged access to the AWS management console and on-prem hypervisor hosts still accepts password-only login for a subset of admins.\n\nLogging: Windows servers forward Security logs to a SIEM with 90-day retention. Linux app servers and the SaaS data lake that stores CUI extracts have incomplete audit coverage.\n\nConfiguration / inventory: Asset inventory covers company-issued laptops. Lab GPU servers and a shadow SaaS BI tool used with CUI-derived datasets are not in the CMDB; baselines exist for Windows images only.\n\nIncident response: An IR plan PDF was approved 18 months ago. Tabletop exercises have not been run; on-call contacts are outdated.\n\nMedia: Surplus laptops are wiped with a commercial tool before donation; removable USB media used in the field has no sanitization log.\n\nCryptography: CUI file shares use BitLocker. Backup tapes and an older Postgres replica that holds CUI analytics outputs use vendor default encryption without documented FIPS module validation.\n\nFlaw remediation: Vulnerability scans run monthly on the corporate VLAN. Critical findings on lab systems often remain open >60 days; there is no written patch SLA.\n\nAwareness: Annual security awareness training is assigned in the LMS; completion for contractors is not enforced.",
    "practiceIds": [
      "AC.L2-3.1.1",
      "AC.L2-3.1.5",
      "IA.L2-3.5.3",
      "AU.L2-3.3.1",
      "CM.L2-3.4.1",
      "IR.L2-3.6.1",
      "MP.L2-3.8.3",
      "SC.L2-3.13.11",
      "SI.L2-3.14.1",
      "AT.L2-3.2.1"
    ],
    "practices": [
      {
        "id": "AC.L2-3.1.1",
        "domain": "Access Control",
        "title": "Limit system access to authorized users, processes, and devices"
      },
      {
        "id": "AC.L2-3.1.5",
        "domain": "Access Control",
        "title": "Employ the principle of least privilege, including for privileged accounts"
      },
      {
        "id": "IA.L2-3.5.3",
        "domain": "Identification and Authentication",
        "title": "Use multifactor authentication for privileged and network access"
      },
      {
        "id": "AU.L2-3.3.1",
        "domain": "Audit and Accountability",
        "title": "Create and retain system audit logs to enable monitoring and investigation"
      },
      {
        "id": "CM.L2-3.4.1",
        "domain": "Configuration Management",
        "title": "Establish and maintain baseline configurations and system inventories"
      },
      {
        "id": "IR.L2-3.6.1",
        "domain": "Incident Response",
        "title": "Establish an operational incident-handling capability"
      },
      {
        "id": "MP.L2-3.8.3",
        "domain": "Media Protection",
        "title": "Sanitize or destroy media containing CUI before disposal or reuse"
      },
      {
        "id": "SC.L2-3.13.11",
        "domain": "System and Communications Protection",
        "title": "Employ FIPS-validated cryptography to protect CUI confidentiality"
      },
      {
        "id": "SI.L2-3.14.1",
        "domain": "System and Information Integrity",
        "title": "Identify, report, and correct system flaws in a timely manner"
      },
      {
        "id": "AT.L2-3.2.1",
        "domain": "Awareness and Training",
        "title": "Ensure users are aware of security risks and applicable policies"
      }
    ]
  }'::jsonb,
  '{
    "minGapAnalysisLength": 120,
    "topKPractices": 10,
    "practiceIds": [
      "AC.L2-3.1.1",
      "AC.L2-3.1.5",
      "IA.L2-3.5.3",
      "AU.L2-3.3.1",
      "CM.L2-3.4.1",
      "IR.L2-3.6.1",
      "MP.L2-3.8.3",
      "SC.L2-3.13.11",
      "SI.L2-3.14.1",
      "AT.L2-3.2.1"
    ]
  }'::jsonb,
  '612',
  25
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
