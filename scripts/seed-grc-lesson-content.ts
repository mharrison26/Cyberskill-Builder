/**
 * Upsert all 13 rows from the GRC Lesson Content sheet into Supabase.
 *
 * Source of truth:
 *   data/grc/CyberSkillBuilder_GRC_Premium_MVP.xlsx → sheet "GRC Lesson Content"
 *   data/grc/grc-lesson-content.json (exported verbatim)
 *
 * Prefers DATABASE_URL / SUPABASE_DB_URL. Falls back to printing the SQL path
 * when no DB URL is set (apply via supabase/migrations/20260810340000_*.sql).
 *
 * Usage:
 *   npx tsx scripts/seed-grc-lesson-content.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Client } from 'pg';

type SheetRow = {
  _id: string;
  _title: string;
  'Learning Objective': string;
  'Ticket / Scenario (Student-Facing)': string;
  'Key Artifact / Data': string;
  'Grading Focus': string;
  'Cursor Prompt (Seed This Exact Content)': string;
};

const COMMERCIAL = '00000000-0000-4000-8000-000000000001';
const DOD = '00000000-0000-4000-8000-000000000003';

const LESSON_META: Record<
  string,
  { lesson_type: string; tier: string; sort_order: number; title: string }
> = {
  L01: {
    lesson_type: 'conceptual',
    tier: '1',
    sort_order: 1,
    title: 'Core Framework Differences',
  },
  L02: {
    lesson_type: 'catalog_lab',
    tier: '1',
    sort_order: 2,
    title: 'Navigating NIST SP 800-53',
  },
  L03: {
    lesson_type: 'tool_walkthrough',
    tier: '1',
    sort_order: 4,
    title: 'Open-Source Tracking Workflows',
  },
};

/**
 * Finding severity (critical/high/medium/low) is separate from lesson
 * `difficulty` (easy/medium/hard). After the column split, severity must be
 * authored explicitly — never inferred from difficulty.
 */
const TICKET_META: Record<
  string,
  {
    ticket_type: string;
    tier: number;
    sort_order: number;
    difficulty: string;
    /** Finding severity for console stats (not lesson difficulty). */
    severity: 'critical' | 'high' | 'medium' | 'low';
    /** ISO date for POA&M due card when the scenario tracks remediation. */
    poam_due_at?: string;
    sla: number;
    dcwf: string;
  }
> = {
  'GRC-01': {
    ticket_type: 'control_mapping',
    tier: 2,
    sort_order: 27,
    difficulty: 'medium',
    severity: 'medium',
    sla: 45,
    dcwf: '722',
  },
  'GRC-02': {
    ticket_type: 'tool_walkthrough',
    tier: 2,
    sort_order: 20,
    difficulty: 'medium',
    severity: 'medium',
    sla: 45,
    dcwf: '612',
  },
  'GRC-03': {
    ticket_type: 'oscal_ssp',
    tier: 2,
    sort_order: 22,
    difficulty: 'medium',
    severity: 'medium',
    sla: 60,
    dcwf: '612',
  },
  'GRC-04': {
    ticket_type: 'poam',
    tier: 2,
    sort_order: 25,
    difficulty: 'medium',
    severity: 'medium',
    poam_due_at: '2026-08-20',
    sla: 45,
    dcwf: '612',
  },
  'GRC-05': {
    ticket_type: 'assessment_procedures',
    tier: 2,
    sort_order: 26,
    difficulty: 'medium',
    severity: 'medium',
    sla: 45,
    dcwf: '612',
  },
  'GRC-06': {
    ticket_type: 'conmon_strategy',
    tier: 3,
    sort_order: 30,
    difficulty: 'hard',
    severity: 'medium',
    poam_due_at: '2026-08-18',
    sla: 60,
    dcwf: '722',
  },
  'GRC-07': {
    ticket_type: 'cmmc_gap_analysis',
    tier: 3,
    sort_order: 32,
    difficulty: 'hard',
    severity: 'high',
    poam_due_at: '2026-08-15',
    sla: 60,
    dcwf: '722',
  },
  'GRC-08': {
    ticket_type: 'sec_materiality',
    tier: 3,
    sort_order: 31,
    difficulty: 'hard',
    severity: 'high',
    sla: 45,
    dcwf: '722',
  },
  'GRC-09': {
    ticket_type: 'oscal_generator',
    tier: 3,
    sort_order: 90,
    difficulty: 'hard',
    severity: 'medium',
    sla: 90,
    dcwf: '621',
  },
  'GRC-10': {
    ticket_type: 'ao_review',
    tier: 3,
    sort_order: 95,
    difficulty: 'hard',
    severity: 'medium',
    sla: 90,
    dcwf: '722',
  },
};

/** GRC-07: 4 met + 3 partial + 3 not_met → 55% readiness. */
const GRC07_READINESS_FORMULA =
  'readinessPercent = round(100 * Σ weight(score) / N); weight(met)=1, weight(partial)=0.5, weight(not_met)=0';

const GRC07_PRACTICE_IDS = [
  'AC.L2-3.1.1',
  'AC.L2-3.1.5',
  'IA.L2-3.5.3',
  'AU.L2-3.3.1',
  'CM.L2-3.4.1',
  'IR.L2-3.6.1',
  'MP.L2-3.8.3',
  'SC.L2-3.13.11',
  'SI.L2-3.14.1',
  'AT.L2-3.2.1',
] as const;

const GRC07_CMMC_INITIAL: Record<string, unknown> = {
  companyName: 'Northwind Retail Technology',
  companySummary:
    "Northwind Retail Technology is preparing a CMMC 2.0 Level 2 self-assessment for an upcoming DoD subcontract renewal. Contracts needs a readiness estimate for the curated 10-practice subset below. Use the per-practice implementation notes as the only evidence set.",
  readinessFormula: GRC07_READINESS_FORMULA,
  implementationSummary:
    'Score each practice from the per-practice implementation notes. Overall readiness for this subset uses: readinessPercent = round(100 × Σ weight(score) / N), where met = 1, partial = 0.5, not_met = 0.',
  practiceIds: [...GRC07_PRACTICE_IDS],
  practices: [
    {
      id: 'AC.L2-3.1.1',
      domain: 'Access Control',
      title: 'Limit system access to authorized users, processes, and devices',
      implementationSummary:
        'HR provisions Active Directory accounts within two business days from an approved access request. Terminations disable accounts the same day via a closed-loop ticket. Quarterly access reviews completed last two quarters with zero orphaned or former-contractor accounts remaining enabled.',
    },
    {
      id: 'AC.L2-3.1.5',
      domain: 'Access Control',
      title: 'Employ the principle of least privilege, including for privileged accounts',
      implementationSummary:
        'Engineers use named accounts for day-to-day work, but several developers retain standing local admin on laptops for tooling convenience. Domain admins share a break-glass account password in a team vault rather than individually checked-out privileged sessions.',
    },
    {
      id: 'IA.L2-3.5.3',
      domain: 'Identification and Authentication',
      title: 'Use multifactor authentication for privileged and network access',
      implementationSummary:
        'Corporate VPN and Microsoft 365 require MFA for all users. Privileged access to the AWS management console and on-prem hypervisor hosts still accepts password-only login for a subset of admins.',
    },
    {
      id: 'AU.L2-3.3.1',
      domain: 'Audit and Accountability',
      title: 'Create and retain system audit logs to enable monitoring and investigation',
      implementationSummary:
        'Windows servers, Linux app servers that process CUI, and the SaaS data lake that stores CUI extracts all forward security-relevant audit logs to the SIEM with 90-day retention. Log coverage was validated in the last ConMon cycle and supports investigation use cases.',
    },
    {
      id: 'CM.L2-3.4.1',
      domain: 'Configuration Management',
      title: 'Establish and maintain baseline configurations and system inventories',
      implementationSummary:
        'Asset inventory covers company-issued laptops only. Lab GPU servers and a shadow SaaS BI tool used with CUI-derived datasets are not in the CMDB. Documented baselines exist for Windows images only; Linux and lab systems have ad hoc builds.',
    },
    {
      id: 'IR.L2-3.6.1',
      domain: 'Incident Response',
      title: 'Establish an operational incident-handling capability',
      implementationSummary:
        'An IR plan PDF was approved 18 months ago. Tabletop exercises have not been run; on-call contacts and escalation paths are outdated. There is no evidence the organization can currently execute detection through recovery activities.',
    },
    {
      id: 'MP.L2-3.8.3',
      domain: 'Media Protection',
      title: 'Sanitize or destroy media containing CUI before disposal or reuse',
      implementationSummary:
        'Surplus laptops and removable USB media used with CUI are wiped with an approved sanitization tool before reuse or donation. Each sanitization event is logged with asset ID, method, operator, and date; last quarterly sample found no exceptions.',
    },
    {
      id: 'SC.L2-3.13.11',
      domain: 'System and Communications Protection',
      title: 'Employ FIPS-validated cryptography to protect CUI confidentiality',
      implementationSummary:
        'CUI file shares use BitLocker with a documented FIPS-validated module. Backup tapes and an older Postgres replica that holds CUI analytics outputs still use vendor default encryption without documented FIPS module validation.',
    },
    {
      id: 'SI.L2-3.14.1',
      domain: 'System and Information Integrity',
      title: 'Identify, report, and correct system flaws in a timely manner',
      implementationSummary:
        'Vulnerability scans run monthly on the corporate VLAN. Critical findings on lab systems that process CUI-derived data often remain open more than 60 days, and there is no written patch SLA or closure tracking for those systems.',
    },
    {
      id: 'AT.L2-3.2.1',
      domain: 'Awareness and Training',
      title: 'Ensure users are aware of security risks and applicable policies',
      implementationSummary:
        'Annual security awareness training covering CUI handling is assigned in the LMS to employees, managers, system administrators, and contractors. Completion is enforced before account enablement and tracked to 100% for the current training year.',
    },
  ],
};

const GRC07_CMMC_EXPECTED: Record<string, unknown> = {
  minGapAnalysisLength: 120,
  topKPractices: 10,
  practiceIds: [...GRC07_PRACTICE_IDS],
  expectedPracticeScores: [
    { practiceId: 'AC.L2-3.1.1', score: 'met' },
    { practiceId: 'AC.L2-3.1.5', score: 'partial' },
    { practiceId: 'IA.L2-3.5.3', score: 'partial' },
    { practiceId: 'AU.L2-3.3.1', score: 'met' },
    { practiceId: 'CM.L2-3.4.1', score: 'not_met' },
    { practiceId: 'IR.L2-3.6.1', score: 'not_met' },
    { practiceId: 'MP.L2-3.8.3', score: 'met' },
    { practiceId: 'SC.L2-3.13.11', score: 'partial' },
    { practiceId: 'SI.L2-3.14.1', score: 'not_met' },
    { practiceId: 'AT.L2-3.2.1', score: 'met' },
  ],
  expectedReadinessPercent: 55,
  readinessFormula: GRC07_READINESS_FORMULA,
  designedMix: { met: 4, partial: 3, not_met: 3, total: 10 },
};

function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
}

function loadRows(): SheetRow[] {
  const path = resolve(process.cwd(), 'data/grc/grc-lesson-content.json');
  return JSON.parse(readFileSync(path, 'utf8')) as SheetRow[];
}

function contentPayload(row: SheetRow) {
  return {
    sheetId: row._id,
    scenarioBrief: row['Ticket / Scenario (Student-Facing)'],
    gradingFocus: row['Grading Focus'],
    keyArtifact: row['Key Artifact / Data'],
    cursorPrompt: row['Cursor Prompt (Seed This Exact Content)'],
    source: 'GRC Lesson Content',
  };
}

function ticketInitialMerge(row: SheetRow): Record<string, unknown> {
  const scenario = row['Ticket / Scenario (Student-Facing)'];
  const meta = TICKET_META[row._id];
  const merge: Record<string, unknown> = {
    sheetId: row._id,
    ticketCode: row._id,
    title: row._title,
    // Short list/header label (top-level so shallow jsonb || merge is safe).
    // Long narrative stays in tickets.scenario_brief.
    displayTitle: row._title,
    prompt: scenario,
    scenarioBrief: scenario,
    keyArtifact: row['Key Artifact / Data'],
    learningObjective: row['Learning Objective'],
    // Finding severity (console stats) — distinct from tickets.difficulty.
    ...(meta?.severity ? { severity: meta.severity } : {}),
    ...(meta?.poam_due_at
      ? { poam_due_at: meta.poam_due_at, poamDueAt: meta.poam_due_at }
      : {}),
  };

  if (row._id === 'GRC-01') {
    merge.source_framework = 'nist_800_53';
    // Normalized form matches public.control_mappings seed IDs.
    merge.source_control_id = 'AC-2';
    merge.source_label = 'NIST SP 800-53 Rev. 5 — AC-2 Account Management';
    merge.prompt =
      'Given NIST SP 800-53 control AC-2, select every equivalent SOC 2 Trust Services Criterion and ISO/IEC 27001:2022 Annex A control from the candidate lists. Scoring uses the reference crosswalk table (not an AI guess). Then explain where those mappings are strong versus only partially overlapping (for example, where SOC 2 CC6.1 does not test account-review cadence the way AC-2 requires).';
    // Candidate options = crosswalk hits + distractors. Required for Tier 2 UI;
    // do not omit — jsonb || merge replaces the whole targets array.
    merge.targets = [
      {
        framework: 'soc2',
        label: 'SOC 2 Trust Services Criteria',
        options: ['CC6.1', 'CC6.2', 'CC6.3', 'CC7.1', 'A1.2'],
      },
      {
        framework: 'iso27001',
        label: 'ISO/IEC 27001:2022 Annex A',
        options: ['A.5.15', 'A.5.16', 'A.5.18', 'A.5.7', 'A.8.9'],
      },
    ];
  }
  if (row._id === 'GRC-02') {
    // Self-hosted SimpleRisk walkthrough (risk ID + SP 800-30 justification).
    // Keep toolUrl on localhost / cohort instance — not the marketing site.
    merge.toolName = 'SimpleRisk';
    merge.toolUrl = 'http://localhost';
    merge.toolHint =
      'Use the self-hosted SimpleRisk instance for this lab (default http://localhost). Start it with: docker run --name simplerisk -d -p 80:80 -p 443:443 simplerisk/simplerisk. Your instructor may share a different cohort URL.';
    merge.organization = { name: 'Northwind' };
    merge.vendor = {
      dataTypes: ['customer PII'],
      integration: 'REST API with OAuth',
      posture: {
        soc2: 'Type I only',
        penetrationTestHistory: 'none',
      },
      postureSummary: 'SOC 2 Type I only, no penetration test history',
    };
    merge.vendorProfile = {
      name: 'Northwind SaaS Vendor (fictional)',
      dataTypes: ['customer PII'],
      integration: 'REST API with OAuth',
      vendorPosture: 'SOC 2 Type I only, no penetration test history',
    };
    merge.steps = [
      {
        title: 'Review the vendor profile',
        body: 'Northwind is onboarding a SaaS vendor with API access to customer PII. Note the integration (REST API with OAuth) and stated posture (SOC 2 Type I only; no penetration test history).',
      },
      {
        title: 'Sign in to SimpleRisk',
        body: 'Open SimpleRisk and sign in with the credentials provided for your cohort.',
      },
      {
        title: 'Submit a risk',
        body: 'Create a new risk for this vendor onboarding scenario. Identify at least two threat sources, and include a clear subject and description that reflects the PII / API exposure and posture gaps.',
      },
      {
        title: 'Set likelihood and impact',
        body: "Assign likelihood and impact in SimpleRisk using SP 800-30 qualitative factors you can defend (threat capability/intent or non-adversarial frequency, control gaps such as Type I-only assurance and missing pen-test evidence, and magnitude of harm to customer PII / mission).",
      },
      {
        title: 'Record the risk ID',
        body: 'After the risk is saved, copy the risk register entry ID shown in SimpleRisk. You will submit that ID plus a written likelihood/impact justification in this ticket.',
      },
    ];
  }
  if (row._id === 'GRC-05') {
    merge.control_id = 'ia-5.1';
    merge.controlId = 'ia-5.1';
  }
  if (row._id === 'GRC-06') {
    // Tier 3 ConMon memo: seeded Northwind profile + GRC-03 continuity flag.
    // Runtime prefers the student's GRC-03 SSP when useStudentSystemProfile is on.
    merge.useStudentSystemProfile = true;
    merge.sourceSystemProfile = {
      mode: 'student_grc03',
      ticketCode: 'GRC-03',
    };
    merge.impactLevel = 'moderate';
    merge.controlFamilies = [
      'AC',
      'AU',
      'CA',
      'CM',
      'IA',
      'RA',
      'SC',
      'SI',
    ];
    merge.tools = ['DefectDojo', 'CloudSploit', 'Scuba'];
    merge.systemProfile = {
      name: 'Northwind CUI Enclave',
      description:
        'Northwind CUI enclave for the DoD subcontract. Enclave boundary: isolated VPC. User population: 12 engineers, 3 admins. Existing controls: SSO with MFA; quarterly access review.',
      impact: 'Moderate (FIPS 199)',
      impactLevel: 'moderate',
      environment:
        "Isolated VPC enclave processing, storing, and transmitting CUI for Northwind's DoD subcontract; SSO with MFA for workforce access.",
      authorizationBoundary:
        "Isolated VPC enclave that processes, stores, and transmits CUI for Northwind's DoD subcontract.",
      dataTypes: ['Controlled Unclassified Information (CUI)'],
      components: [
        'Isolated VPC',
        'SSO with MFA',
        'Quarterly access review',
      ],
      constraints:
        'Budget favors free/open-source monitoring: DefectDojo, CloudSploit, and CISA Scuba. ConMon continues the system from GRC-03 — not a new scenario.',
      controlFamilies: [
        'AC',
        'AU',
        'CA',
        'CM',
        'IA',
        'RA',
        'SC',
        'SI',
      ],
    };
  }
  if (row._id === 'GRC-07') {
    // Deliberate 10-practice mix (4 met / 3 partial / 3 not_met → 55%).
    // Keep in sync with supabase/migrations/20260810370000_update_grc07_cmmc_practice_mix.sql
    Object.assign(merge, GRC07_CMMC_INITIAL);
  }
  if (row._id === 'GRC-09') {
    const sampleJsonTemplate = {
      system_name: 'Northwind CUI Enclave',
      fips_199_category: 'moderate',
      controls: [
        {
          id: 'ac-2',
          status: 'implemented',
          narrative:
            'Accounts are provisioned through the corporate SSO IdP with MFA required for all privileged roles. Joiner/mover/leaver tickets update enclave group membership within one business day.',
        },
        {
          id: 'ia-5',
          status: 'partial',
          narrative:
            'Password complexity and rotation are enforced via the IdP. Hardware authenticator rollout for administrators is scheduled; interim compensating control is phishing-resistant MFA for admin roles.',
        },
      ],
    };
    merge.sampleJsonTemplate = sampleJsonTemplate;
    // Keep in sync with supabase/migrations/*grc09*oscal_generator*.sql
    merge.files = {
      'README.md':
        '# GRC-09: OSCAL SSP generator\n\nWrite a **Node.js** or **Python** script that:\n\n1. Reads `input/system.json` (sample template: `system_name`, `fips_199_category`, `controls[]`)\n2. Builds a **minimal valid** OSCAL System Security Plan (SSP)\n3. Writes JSON to `output/ssp.json` (or prints JSON to stdout)\n\n## Workflow\n\n1. Edit `generate_ssp.js` (or replace it with `generate_ssp.py`)\n2. Optionally preview in the terminal: `node generate_ssp.js`\n3. Click **Submit lab** — the sandbox re-runs your script against the canonical sample input\n4. Pass/fail requires **OSCAL schema validation** and **basic script structure checks** (reads input, writes JSON, not a stub) — not a full code review\n\nTip: keep UUIDs as RFC 4122 and timestamps with timezone (e.g. `2024-01-15T12:00:00Z`).\n',
      'input/system.json': `${JSON.stringify(sampleJsonTemplate, null, 2)}\n`,
      'generate_ssp.js':
        "/**\n * GRC-09 stub — complete this generator.\n *\n * Read input/system.json and write a minimal valid OSCAL SSP to output/ssp.json.\n * On submit, the sandbox re-runs this script against the sample input.\n * Pass/fail = OSCAL schema validation + basic script structure checks.\n *\n * Run: node generate_ssp.js\n */\n\nconst fs = require('fs');\n\nfunction buildSsp(input) {\n  // TODO: map input.system_name, input.fips_199_category, and input.controls\n  // into a minimal OSCAL system-security-plan.\n  // Required assemblies: metadata, import-profile, system-characteristics,\n  // system-implementation, control-implementation.\n  const uuid = '11111111-1111-4111-8111-111111111111';\n  const now = '2024-01-15T12:00:00Z';\n\n  return {\n    'system-security-plan': {\n      uuid,\n      metadata: {\n        title: `${input.system_name || 'System'} SSP`,\n        'last-modified': now,\n        version: '1.0',\n        'oscal-version': '1.1.2',\n      },\n      'import-profile': { href: '#profile' },\n      // Expand the remaining required assemblies using input.* fields.\n    },\n  };\n}\n\nfunction main() {\n  const input = JSON.parse(fs.readFileSync('input/system.json', 'utf8'));\n  const ssp = buildSsp(input);\n  fs.mkdirSync('output', { recursive: true });\n  fs.writeFileSync('output/ssp.json', JSON.stringify(ssp, null, 2));\n  console.log('Wrote output/ssp.json');\n}\n\nmain();\n",
    };
  }
  if (row._id === 'GRC-08') {
    merge.companyName = 'Northwind Retail Technology';
    merge.breachScenario = scenario;
    // Exact sheet Key Artifact facts — vendor/subset ambiguity is deliberate.
    merge.breach = {
      company: 'Northwind Retail Technology',
      discoveredAt: 'A payment-processing vendor just disclosed a breach',
      systemsAffected: "payment vendor's own systems, not Northwind's",
      dataExposed: 'names, emails, last-4 card digits',
      customersImpacted: '~4,000',
      remediationStatus: 'contained, forensics ongoing',
      businessImpact:
        "Northwind's own checkout/ERP systems remain up; payment auth continues via the vendor after containment. Near-term impact is notification/call-center load for ~4,000 affected customers, possible PCI reassessment friction with the processor, and reputational risk from names/emails/last-4 exposure — not a Northwind outage. Quantified financial loss is not yet estimable while vendor forensics are ongoing.",
      scopeNote:
        "Vendor breach (not a direct Northwind breach); exposed a subset of Northwind's customer records. Materiality is a judgment call — defend either conclusion with the factors below.",
    };
  }
  if (row._id === 'GRC-10') {
    // Compiled package sources + seed fallback for AO RAG questions / flagship.
    // Keep in sync with 20260810430000_fix_grc10_ao_review_capstone_package.sql
    merge.flagship = true;
    merge.sourceArtifacts = [
      {
        code: 'GRC-03',
        ticketTypes: ['oscal_ssp'],
        label: 'SSP fragment (OSCAL)',
      },
      {
        code: 'GRC-04',
        ticketTypes: ['poam', 'poam_draft'],
        label: 'POA&M entries',
        table: 'poam_items',
      },
      {
        code: 'GRC-09',
        ticketTypes: ['oscal_generator', 'capstone_oscal'],
        label: 'OSCAL generator artifacts',
      },
    ];
    merge.seedPackage = {
      artifacts: [
        {
          code: 'GRC-03',
          label: 'SSP fragment (OSCAL)',
          ticketTypes: ['oscal_ssp'],
          status: 'present',
          summary: 'Sample SSP for Northwind CUI Enclave (Moderate impact).',
          payload: {
            systemName: 'Northwind CUI Enclave',
            impactLevel: 'Moderate',
            controlImplementations: [
              {
                controlId: 'AC-2',
                status: 'implemented',
                narrative:
                  'Accounts are provisioned through the corporate SSO IdP with MFA required for all privileged roles.',
              },
              {
                controlId: 'IA-5',
                status: 'partial',
                narrative:
                  'Password complexity and rotation are enforced via the IdP. Hardware authenticator rollout for administrators is scheduled.',
              },
            ],
          },
          textCorpus:
            '## GRC-03 SSP (seed)\nSystem: Northwind CUI Enclave\nImpact: Moderate\nAC-2: implemented — SSO IdP with MFA for privileged roles\nIA-5: partial — hardware authenticator rollout pending for admins\nResidual concern: admin authenticator gap until POA&M closes.',
        },
        {
          code: 'GRC-04',
          label: 'POA&M entries',
          ticketTypes: ['poam'],
          status: 'present',
          summary:
            '2 seeded POA&M entries (admin authenticator + access-review evidence gap).',
          payload: {
            poamItems: [
              {
                finding_id: 'FIND-IA5-01',
                weakness_description:
                  'Administrator accounts rely on phishing-resistant MFA software tokens; hardware authenticator rollout is incomplete for the CUI enclave jump path.',
                milestone:
                  'Complete hardware authenticator enrollment for all enclave administrators; remove interim software-token exception.',
                scheduled_completion_date: '2026-09-30',
                status: 'open',
                resources: 'IAM engineer (24 hours)',
              },
              {
                finding_id: 'FIND-AC2-QR-01',
                weakness_description:
                  'Quarterly access review exists, but evidence of manager attestation for contractor accounts is incomplete.',
                milestone:
                  'Capture signed manager attestations for contractor enclave accounts and store in the ConMon evidence folder.',
                scheduled_completion_date: '2026-10-15',
                status: 'open',
                resources: 'ISSO + hiring managers (12 hours)',
              },
            ],
            entries: [],
          },
          textCorpus:
            '## GRC-04 POA&M (seed)\nFIND-IA5-01 open — Admin hardware authenticator rollout incomplete; due 2026-09-30\nFIND-AC2-QR-01 open — Contractor access-review attestation gap; due 2026-10-15\nPOA&M adequacy: Are milestones staffed? Are dates credible before authorization?',
        },
        {
          code: 'GRC-09',
          label: 'OSCAL generator artifacts',
          ticketTypes: ['oscal_generator', 'capstone_oscal'],
          status: 'present',
          summary:
            'Sample OSCAL SSP fragment for Northwind CUI Enclave package consistency checks.',
          payload: {
            files: {
              'output/ssp.json':
                '{"system-security-plan":{"metadata":{"title":"Northwind CUI Enclave"}}}',
            },
          },
          textCorpus:
            '## GRC-09 OSCAL (seed)\noutput/ssp.json — Northwind CUI Enclave system-security-plan metadata present.',
        },
      ],
    };
  }

  return merge;
}

async function main() {
  const dbUrl = getDatabaseUrl();
  const rows = loadRows();
  if (rows.length !== 13) {
    throw new Error(`Expected 13 sheet rows, found ${rows.length}`);
  }

  if (!dbUrl) {
    console.log(
      'No DATABASE_URL/SUPABASE_DB_URL set. Apply migration instead:\n' +
        '  supabase/migrations/20260810340000_seed_grc_lesson_content.sql'
    );
    console.log(
      'Titles:',
      rows.map((r) => `${r._id}: ${r._title}`).join(' | ')
    );
    return;
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE public.lessons
        ADD COLUMN IF NOT EXISTS content jsonb NOT NULL DEFAULT '{}'::jsonb;
    `);

    const {
      rows: [{ id: trackId }],
    } = await client.query<{ id: string }>(
      `SELECT id FROM public.tracks WHERE slug = 'grc'`
    );

    const {
      rows: iamRows,
    } = await client.query<{ id: string }>(
      `SELECT id FROM public.lessons
       WHERE track_id = $1 AND title = 'Evidence Collection & Validation'
       LIMIT 1`,
      [trackId]
    );
    const iamId = iamRows[0]?.id ?? null;

    for (const row of rows.filter((r) => r._id.startsWith('L'))) {
      const meta = LESSON_META[row._id];
      if (!meta) throw new Error(`Missing lesson meta for ${row._id}`);
      const content = contentPayload(row);
      const depends = row._id === 'L03' ? iamId : null;

      const updated = await client.query(
        `UPDATE public.lessons
         SET tier = $2,
             lesson_type = $3,
             sort_order = $4,
             learning_objectives = $5,
             dcwf_code = COALESCE(dcwf_code, '722'),
             content = $6::jsonb,
             depends_on_lesson_id = COALESCE($7::uuid, depends_on_lesson_id)
         WHERE track_id = $1 AND title = $8
         RETURNING id`,
        [
          trackId,
          meta.tier,
          meta.lesson_type,
          meta.sort_order,
          row['Learning Objective'],
          JSON.stringify(content),
          depends,
          meta.title,
        ]
      );

      if (updated.rowCount === 0) {
        await client.query(
          `INSERT INTO public.lessons (
             track_id, tier, lesson_type, sort_order, title,
             learning_objectives, dcwf_code, content, depends_on_lesson_id
           ) VALUES ($1,$2,$3,$4,$5,$6,'722',$7::jsonb,$8::uuid)`,
          [
            trackId,
            meta.tier,
            meta.lesson_type,
            meta.sort_order,
            meta.title,
            row['Learning Objective'],
            JSON.stringify(content),
            depends,
          ]
        );
      }
    }

    for (const row of rows.filter((r) => r._id.startsWith('GRC-'))) {
      const meta = TICKET_META[row._id];
      if (!meta) throw new Error(`Missing ticket meta for ${row._id}`);
      const scenarioRaw = row['Ticket / Scenario (Student-Facing)'];
      // Stable markers for seed migrations / admin filters.
      let scenario = scenarioRaw;
      if (row._id === 'GRC-02' && !scenarioRaw.startsWith('SimpleRisk:')) {
        scenario = `SimpleRisk: ${scenarioRaw}`;
      }
      if (row._id === 'GRC-06' && !scenarioRaw.startsWith('ConMon:')) {
        scenario = `ConMon: ${scenarioRaw}`;
      }
      const merge = ticketInitialMerge(row);
      const expected: Record<string, unknown> = {
        gradingFocus: row['Grading Focus'],
        sheetId: row._id,
        learningObjective: row['Learning Objective'],
      };
      if (row._id === 'GRC-01') {
        expected.scoringMode = 'options_set_match';
        expected.passThresholdPercent = 100;
        expected.gradeOverlapNarrative = true;
        expected.minOverlapNarrativeLength = 120;
      }
      if (row._id === 'GRC-02') {
        expected.riskIdPattern = '^(?:RISK[-_:]?)?\\d{1,10}$';
        expected.minJustificationLength = 80;
        expected.guidanceTopics = [
          'threat-sources',
          'likelihood',
          'impact',
          'risk-determination',
        ];
        expected.topKGuidanceSections = 5;
      }
      if (row._id === 'GRC-07') {
        Object.assign(expected, GRC07_CMMC_EXPECTED);
      }
      if (row._id === 'GRC-05') {
        expected.control_id = 'ia-5.1';
        expected.controlId = 'ia-5.1';
        expected.minFieldLength = 40;
      }
      if (row._id === 'GRC-06') {
        expected.requiredFamilies = [
          'AC',
          'AU',
          'CA',
          'CM',
          'IA',
          'RA',
          'SC',
          'SI',
        ];
        expected.requiredTools = ['DefectDojo', 'CloudSploit', 'Scuba'];
        expected.impactLevel = 'moderate';
        expected.minFieldLength = 40;
        expected.minEscalationLength = 80;
        expected.guidanceTopics = [
          'define-strategy',
          'system-level-strategy',
          'establish-frequencies',
          'analyze-report',
        ];
        expected.topKGuidanceSections = 6;
      }
      if (row._id === 'GRC-09') {
        expected.documentKind = 'ssp';
        expected.scriptPath = 'generate_ssp.js';
        expected.inputPath = 'input/system.json';
        expected.outputPath = 'output/ssp.json';
        // Both gates: schema validation + basic static structure checks.
        expected.requireStaticChecks = true;
      }
      if (row._id === 'GRC-10') {
        expected.minAnswerLength = 40;
        expected.questionCountMin = 5;
        expected.questionCountMax = 7;
        expected.flagshipOnResolve = true;
      }
      if (row._id === 'GRC-08') {
        // Deterministic factor coverage + min length; RAG grades quality
        // against pinned SEC materiality sections (judgment call, no forced answer).
        expected.judgmentCall = true;
        expected.minFactorLength = 40;
        expected.minRationaleLength = 60;
        expected.requiredFactors = [
          'nature_scope',
          'data_compromise',
          'operational_impact',
          'financial_impact',
          'reputational_legal',
          'reasonable_investor',
        ];
        expected.guidanceTopics = [
          'rule-overview',
          'reasonable-investor',
          'nature-scope',
          'data-compromise',
          'operational-impact',
          'financial-impact',
          'reputational-legal',
          'timing-determination',
        ];
        expected.topKGuidanceSections = 8;
      }

      for (const tenantId of [COMMERCIAL, DOD]) {
        const updated = await client.query(
          `UPDATE public.tickets
           SET scenario_brief = $3,
               tier = $4,
               sort_order = $5,
               difficulty = $6,
               sla_minutes = $7,
               initial_state = COALESCE(initial_state, '{}'::jsonb) || $8::jsonb,
               expected_state = COALESCE(expected_state, '{}'::jsonb) || $9::jsonb,
               dcwf_code = COALESCE(dcwf_code, $10)
           WHERE tenant_id = $1
             AND track_id = $2
             AND ticket_type = $11
             AND (
               initial_state->>'ticketCode' = $12
               OR initial_state->>'sheetId' = $12
               OR (
                 COALESCE(initial_state->>'ticketCode', '') = ''
                 AND COALESCE(initial_state->>'sheetId', '') = ''
               )
             )
           RETURNING id`,
          [
            tenantId,
            trackId,
            scenario,
            meta.tier,
            meta.sort_order,
            meta.difficulty,
            meta.sla,
            JSON.stringify(merge),
            JSON.stringify(expected),
            meta.dcwf,
            meta.ticket_type,
            row._id,
          ]
        );

        if (updated.rowCount === 0) {
          await client.query(
            `INSERT INTO public.tickets (
               tenant_id, track_id, tier, ticket_type, difficulty, sla_minutes,
               scenario_brief, initial_state, expected_state, dcwf_code, sort_order
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11)`,
            [
              tenantId,
              trackId,
              meta.tier,
              meta.ticket_type,
              meta.difficulty,
              meta.sla,
              scenario,
              JSON.stringify(merge),
              JSON.stringify(expected),
              meta.dcwf,
              meta.sort_order,
            ]
          );
        }
      }
    }

    await client.query('COMMIT');

    const verify = await client.query<{
      kind: string;
      title: string;
      sheet_id: string | null;
      scenario_preview: string;
    }>(
      `
      SELECT 'lesson' AS kind, title,
             content->>'sheetId' AS sheet_id,
             left(content->>'scenarioBrief', 80) AS scenario_preview
      FROM lessons
      WHERE track_id = $1
        AND content ? 'scenarioBrief'
        AND coalesce(content->>'scenarioBrief','') <> ''
      UNION ALL
      SELECT DISTINCT ON (ticket_type) 'ticket',
             coalesce(initial_state->>'title', ticket_type),
             initial_state->>'sheetId',
             left(scenario_brief, 80)
      FROM tickets
      WHERE track_id = $1
        AND initial_state->>'sheetId' LIKE 'GRC-%'
      ORDER BY 1, 3
      `,
      [trackId]
    );

    console.log('Seeded/verified rows:');
    for (const row of verify.rows) {
      console.log(`  [${row.kind}] ${row.sheet_id ?? '?'} ${row.title}: ${row.scenario_preview}`);
    }
    console.log(`Total verified: ${verify.rows.length}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
