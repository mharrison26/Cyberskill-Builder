-- GRC-07: CMMC 2.0 maturity self-assessment (cmmc_gap_analysis)
-- Populate a deliberate 10-practice Northwind implementation mix with a
-- checkable answer key (met / partial / not_met) and expected readiness %.
--
-- Formula (documented in expected_state.readinessFormula):
--   readinessPercent = round(100 * Σ weight(score_i) / N)
--   weight(met)=1, weight(partial)=0.5, weight(not_met)=0
-- Designed mix: 4 met + 3 partial + 3 not_met → (4 + 1.5) / 10 * 100 = 55%
--
-- scenario_brief is the exact GRC Lesson Content sheet student-facing text.

UPDATE public.tickets
SET
  scenario_brief = $brief$Northwind's contracts team needs a CMMC Level 2 readiness estimate before the next contract renewal. Score Northwind's current control implementation summary against a subset of CMMC 2.0 Level 2 practices and produce a gap summary with an overall readiness percentage.$brief$,
  tier = 3,
  difficulty = 'hard',
  sla_minutes = 60,
  dcwf_code = '722',
  sort_order = 32,
  initial_state = $initial${
    "sheetId": "GRC-07",
    "ticketCode": "GRC-07",
    "title": "CMMC 2.0 maturity self-assessment",
    "prompt": "Northwind's contracts team needs a CMMC Level 2 readiness estimate before the next contract renewal. Score Northwind's current control implementation summary against a subset of CMMC 2.0 Level 2 practices and produce a gap summary with an overall readiness percentage.",
    "scenarioBrief": "Northwind's contracts team needs a CMMC Level 2 readiness estimate before the next contract renewal. Score Northwind's current control implementation summary against a subset of CMMC 2.0 Level 2 practices and produce a gap summary with an overall readiness percentage.",
    "keyArtifact": "A fictional company's control implementation summary (8-10 practices, some satisfied, some not, some partially).",
    "learningObjective": "Score a fictional company against CMMC 2.0 Level 2 practices and produce a gap summary with a readiness percentage.",
    "companyName": "Northwind Retail Technology",
    "companySummary": "Northwind Retail Technology is preparing a CMMC 2.0 Level 2 self-assessment for an upcoming DoD subcontract renewal. Contracts needs a readiness estimate for the curated 10-practice subset below. Use the per-practice implementation notes as the only evidence set.",
    "readinessFormula": "readinessPercent = round(100 * Σ weight(score) / N); weight(met)=1, weight(partial)=0.5, weight(not_met)=0",
    "implementationSummary": "Score each practice from the per-practice implementation notes. Overall readiness for this subset uses: readinessPercent = round(100 × Σ weight(score) / N), where met = 1, partial = 0.5, not_met = 0.",
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
        "title": "Limit system access to authorized users, processes, and devices",
        "implementationSummary": "HR provisions Active Directory accounts within two business days from an approved access request. Terminations disable accounts the same day via a closed-loop ticket. Quarterly access reviews completed last two quarters with zero orphaned or former-contractor accounts remaining enabled."
      },
      {
        "id": "AC.L2-3.1.5",
        "domain": "Access Control",
        "title": "Employ the principle of least privilege, including for privileged accounts",
        "implementationSummary": "Engineers use named accounts for day-to-day work, but several developers retain standing local admin on laptops for tooling convenience. Domain admins share a break-glass account password in a team vault rather than individually checked-out privileged sessions."
      },
      {
        "id": "IA.L2-3.5.3",
        "domain": "Identification and Authentication",
        "title": "Use multifactor authentication for privileged and network access",
        "implementationSummary": "Corporate VPN and Microsoft 365 require MFA for all users. Privileged access to the AWS management console and on-prem hypervisor hosts still accepts password-only login for a subset of admins."
      },
      {
        "id": "AU.L2-3.3.1",
        "domain": "Audit and Accountability",
        "title": "Create and retain system audit logs to enable monitoring and investigation",
        "implementationSummary": "Windows servers, Linux app servers that process CUI, and the SaaS data lake that stores CUI extracts all forward security-relevant audit logs to the SIEM with 90-day retention. Log coverage was validated in the last ConMon cycle and supports investigation use cases."
      },
      {
        "id": "CM.L2-3.4.1",
        "domain": "Configuration Management",
        "title": "Establish and maintain baseline configurations and system inventories",
        "implementationSummary": "Asset inventory covers company-issued laptops only. Lab GPU servers and a shadow SaaS BI tool used with CUI-derived datasets are not in the CMDB. Documented baselines exist for Windows images only; Linux and lab systems have ad hoc builds."
      },
      {
        "id": "IR.L2-3.6.1",
        "domain": "Incident Response",
        "title": "Establish an operational incident-handling capability",
        "implementationSummary": "An IR plan PDF was approved 18 months ago. Tabletop exercises have not been run; on-call contacts and escalation paths are outdated. There is no evidence the organization can currently execute detection through recovery activities."
      },
      {
        "id": "MP.L2-3.8.3",
        "domain": "Media Protection",
        "title": "Sanitize or destroy media containing CUI before disposal or reuse",
        "implementationSummary": "Surplus laptops and removable USB media used with CUI are wiped with an approved sanitization tool before reuse or donation. Each sanitization event is logged with asset ID, method, operator, and date; last quarterly sample found no exceptions."
      },
      {
        "id": "SC.L2-3.13.11",
        "domain": "System and Communications Protection",
        "title": "Employ FIPS-validated cryptography to protect CUI confidentiality",
        "implementationSummary": "CUI file shares use BitLocker with a documented FIPS-validated module. Backup tapes and an older Postgres replica that holds CUI analytics outputs still use vendor default encryption without documented FIPS module validation."
      },
      {
        "id": "SI.L2-3.14.1",
        "domain": "System and Information Integrity",
        "title": "Identify, report, and correct system flaws in a timely manner",
        "implementationSummary": "Vulnerability scans run monthly on the corporate VLAN. Critical findings on lab systems that process CUI-derived data often remain open more than 60 days, and there is no written patch SLA or closure tracking for those systems."
      },
      {
        "id": "AT.L2-3.2.1",
        "domain": "Awareness and Training",
        "title": "Ensure users are aware of security risks and applicable policies",
        "implementationSummary": "Annual security awareness training covering CUI handling is assigned in the LMS to employees, managers, system administrators, and contractors. Completion is enforced before account enablement and tracked to 100% for the current training year."
      }
    ]
  }$initial$::jsonb,
  expected_state = $expected${
    "sheetId": "GRC-07",
    "learningObjective": "Score a fictional company against CMMC 2.0 Level 2 practices and produce a gap summary with a readiness percentage.",
    "gradingFocus": "RAG-graded gap analysis against pinned CMMC 2.0 practice descriptions -- checks the readiness percentage is derived from the actual gap count, not asserted.",
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
    ],
    "expectedPracticeScores": [
      { "practiceId": "AC.L2-3.1.1", "score": "met" },
      { "practiceId": "AC.L2-3.1.5", "score": "partial" },
      { "practiceId": "IA.L2-3.5.3", "score": "partial" },
      { "practiceId": "AU.L2-3.3.1", "score": "met" },
      { "practiceId": "CM.L2-3.4.1", "score": "not_met" },
      { "practiceId": "IR.L2-3.6.1", "score": "not_met" },
      { "practiceId": "MP.L2-3.8.3", "score": "met" },
      { "practiceId": "SC.L2-3.13.11", "score": "partial" },
      { "practiceId": "SI.L2-3.14.1", "score": "not_met" },
      { "practiceId": "AT.L2-3.2.1", "score": "met" }
    ],
    "expectedReadinessPercent": 55,
    "readinessFormula": "readinessPercent = round(100 * Σ weight(score) / N); weight(met)=1, weight(partial)=0.5, weight(not_met)=0",
    "designedMix": {
      "met": 4,
      "partial": 3,
      "not_met": 3,
      "total": 10
    }
  }$expected$::jsonb
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND ticket_type IN ('cmmc_gap_analysis', 'cmmc_l2_gap')
  AND (
    initial_state->>'ticketCode' = 'GRC-07'
    OR initial_state->>'sheetId' = 'GRC-07'
    OR scenario_brief LIKE 'CMMC L2:%'
    OR scenario_brief LIKE 'Northwind''s contracts team needs a CMMC Level 2 readiness estimate%'
  );
