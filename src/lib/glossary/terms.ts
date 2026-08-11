export type GlossaryTermDef = {
  /** URL slug / anchor id */
  id: string;
  /** Display term */
  term: string;
  /** Short tooltip definition (1–2 sentences) */
  short: string;
  /** Longer glossary body */
  long: string;
  /** Alternate spellings learners may search */
  aliases?: string[];
};

/** Canonical GRC / federal cyber glossary used by GlossaryTerm + /help/glossary. */
export const GLOSSARY_TERMS: GlossaryTermDef[] = [
  {
    id: 'poam',
    term: 'POA&M',
    short:
      'Plan of Action and Milestones — the living remediation plan for control weaknesses and residual risk.',
    long: 'A POA&M (Plan of Action and Milestones) tracks deficiencies identified during assessment or ConMon. Each item records the weakness, risk, milestones, resources, and status until closed or accepted as residual risk.',
    aliases: ['POAM', 'plan of action'],
  },
  {
    id: 'conmon',
    term: 'ConMon',
    short:
      'Continuous Monitoring — ongoing assessment that the authorized system stays within its risk posture.',
    long: 'Continuous Monitoring (ConMon) is the post-authorization practice of collecting evidence, reviewing metrics, and updating risk decisions so an ATO remains valid as the system changes.',
    aliases: ['continuous monitoring'],
  },
  {
    id: 'dcwf',
    term: 'DCWF',
    short:
      'DoD Cyber Workforce Framework — work-role codes that map skills to 8140/8570-aligned roles.',
    long: 'The DoD Cyber Workforce Framework (DCWF) defines work roles and codes used across DoD cyber workforce management. CyberSkill Builder tags scenarios so portfolio evidence maps to those roles.',
    aliases: ['DoD 8140', '8570'],
  },
  {
    id: 'high-water-mark',
    term: 'High-water mark',
    short:
      'In FIPS 199, the overall impact level equals the highest of confidentiality, integrity, and availability.',
    long: 'The high-water mark rule sets a system’s overall security categorization to the maximum of its confidentiality, integrity, and availability impact levels (Low / Moderate / High).',
    aliases: ['high water mark', 'HWM'],
  },
  {
    id: 'ato',
    term: 'ATO',
    short:
      'Authorization to Operate — the formal decision that residual risk is acceptable for a system to run.',
    long: 'An Authorization to Operate (ATO) is the Authorizing Official’s decision that a system’s security posture and residual risk are acceptable for operation, usually for a defined period with ConMon conditions.',
  },
  {
    id: 'ssp',
    term: 'SSP',
    short:
      'System Security Plan — the narrative and control implementation description for a system.',
    long: 'The System Security Plan (SSP) documents the system boundary, environment, and how each selected control is implemented. It is a core RMF artifact reviewed during assessment and authorization.',
  },
  {
    id: 'cccer',
    term: 'CCCER',
    short:
      'Condition, Criteria, Cause, Effect, Recommendation — a structured finding write-up pattern.',
    long: 'CCCER is a five-part finding narrative: Condition (what is), Criteria (what should be), Cause, Effect (impact/risk), and Recommendation. Assessors and auditors use it for clear, actionable findings.',
  },
  {
    id: 'rmf',
    term: 'RMF',
    short:
      'Risk Management Framework (NIST SP 800-37) — the federal process to authorize and monitor systems.',
    long: 'The NIST Risk Management Framework defines prepare, categorize, select, implement, assess, authorize, and monitor steps for managing information-system risk in federal environments.',
  },
  {
    id: 'sla',
    term: 'SLA',
    short:
      'Service Level Agreement timer — how long you have to resolve a ticket before it is overdue.',
    long: 'In CyberSkill Builder, each ticket has an SLA window (minutes). Opening the ticket starts the clock; resolving within the window counts as SLA met for ops metrics.',
  },
  {
    id: 'oscal',
    term: 'OSCAL',
    short:
      'Open Security Controls Assessment Language — machine-readable security documentation formats.',
    long: 'OSCAL is a NIST-maintained set of formats for catalogs, profiles, SSPs, assessment plans/results, and POA&Ms so security artifacts can be exchanged and automated.',
  },
  {
    id: 'cmmc',
    term: 'CMMC',
    short:
      'Cybersecurity Maturity Model Certification — DoD contractor cyber requirements against NIST SP 800-171.',
    long: 'CMMC is DoD’s framework for verifying that contractors protect Controlled Unclassified Information (CUI), primarily aligned to NIST SP 800-171 practices and assessment levels.',
  },
  {
    id: 'capability-ledger',
    term: 'Capability ledger',
    short:
      'Your portfolio of verified scenario outcomes mapped to DCWF roles and downloadable evidence.',
    long: 'The capability ledger (My Portfolio) records resolved tickets and graded findings with timestamps, DCWF codes, and OSCAL-friendly exports — evidence of practical skill, not just course completion.',
    aliases: ['portfolio'],
  },
];

const byId = new Map(GLOSSARY_TERMS.map((t) => [t.id, t]));

export function getGlossaryTerm(id: string): GlossaryTermDef | undefined {
  return byId.get(id);
}

export function glossaryHref(id: string): string {
  return `/help/glossary#${id}`;
}
