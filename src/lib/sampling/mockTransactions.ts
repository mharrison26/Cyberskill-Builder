/**
 * Deterministic mock transaction population for sampling_methodology tickets.
 * Population size is intentionally in the 50–100 range for audit-sampling practice.
 */

export const SAMPLING_RISK_CRITERIA = [
  'high_value',
  'privileged_account',
  'after_hours',
  'foreign_vendor',
] as const;

export type SamplingRiskCriterion = (typeof SAMPLING_RISK_CRITERIA)[number];

export const SAMPLING_RISK_CRITERION_LABELS: Record<
  SamplingRiskCriterion,
  string
> = {
  high_value: 'High value (≥ $10,000)',
  privileged_account: 'Privileged account',
  after_hours: 'After-hours activity',
  foreign_vendor: 'Foreign vendor',
};

export type MockTransaction = {
  id: string;
  timestamp: string;
  user: string;
  department: string;
  vendor: string;
  amount: number;
  currency: 'USD';
  description: string;
  riskFlags: SamplingRiskCriterion[];
};

const USERS = [
  'j.nguyen',
  'a.patel',
  'm.okonkwo',
  's.reyes',
  'c.hoffman',
  'l.chen',
  'r.brooks',
  'admin.svc',
  'backup.ops',
  't.garcia',
  'k.murphy',
  'd.ali',
] as const;

const DEPARTMENTS = [
  'Finance',
  'Procurement',
  'IT Operations',
  'HR',
  'Facilities',
  'Security',
] as const;

const DOMESTIC_VENDORS = [
  'Northline Supplies',
  'Harbor IT Resellers',
  'Summit Cloud LLC',
  'Riverbend Facilities',
  'Apex Office Co',
  'ClearPath Consulting',
] as const;

const FOREIGN_VENDORS = [
  'EuroSoft GmbH',
  'Pacific Rim Logistics Ltd',
  'Nordic Data AB',
  'Sao Paulo Tech SA',
] as const;

const DESCRIPTIONS = [
  'Software license renewal',
  'Cloud infrastructure invoice',
  'Contractor professional services',
  'Hardware refresh PO',
  'Facilities maintenance',
  'Travel reimbursement batch',
  'Privileged access grant review',
  'Emergency change window spend',
] as const;

/** Mulberry32 — small deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

export const DEFAULT_SAMPLING_POPULATION_SIZE = 75;
export const DEFAULT_SAMPLING_POPULATION_SEED = 20260808;
export const MIN_SAMPLING_POPULATION_SIZE = 50;
export const MAX_SAMPLING_POPULATION_SIZE = 100;

export function clampPopulationSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_SAMPLING_POPULATION_SIZE;
  return Math.min(
    MAX_SAMPLING_POPULATION_SIZE,
    Math.max(MIN_SAMPLING_POPULATION_SIZE, Math.floor(size))
  );
}

/**
 * Build a stable mock transaction population.
 * Risk flags are planted so students can justify risk-based additions.
 */
export function buildMockTransactionPopulation(
  size: number = DEFAULT_SAMPLING_POPULATION_SIZE,
  seed: number = DEFAULT_SAMPLING_POPULATION_SEED
): MockTransaction[] {
  const count = clampPopulationSize(size);
  const rng = mulberry32(seed >>> 0);
  const transactions: MockTransaction[] = [];

  for (let i = 0; i < count; i += 1) {
    const day = 1 + Math.floor(rng() * 28);
    const hour = Math.floor(rng() * 24);
    const minute = Math.floor(rng() * 60);
    const user = pick(rng, USERS);
    const isPrivileged =
      user.startsWith('admin.') || user.startsWith('backup.') || rng() < 0.08;
    const isForeign = rng() < 0.12;
    const isAfterHours = hour < 6 || hour >= 20 || rng() < 0.05;
    // Bias a subset toward high-value so risk additions are meaningful.
    const highValueRoll = rng();
    const amount =
      highValueRoll < 0.1
        ? Math.round(10000 + rng() * 40000)
        : Math.round(50 + rng() * 4500);

    const riskFlags: SamplingRiskCriterion[] = [];
    if (amount >= 10000) riskFlags.push('high_value');
    if (isPrivileged) riskFlags.push('privileged_account');
    if (isAfterHours) riskFlags.push('after_hours');
    if (isForeign) riskFlags.push('foreign_vendor');

    transactions.push({
      id: `TXN-${String(i + 1).padStart(4, '0')}`,
      timestamp: `2026-03-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`,
      user:
        isPrivileged &&
        !user.startsWith('admin.') &&
        !user.startsWith('backup.')
          ? 'admin.svc'
          : user,
      department: pick(rng, DEPARTMENTS),
      vendor: isForeign
        ? pick(rng, FOREIGN_VENDORS)
        : pick(rng, DOMESTIC_VENDORS),
      amount,
      currency: 'USD',
      description: pick(rng, DESCRIPTIONS),
      riskFlags,
    });
  }

  return transactions;
}

export function isSamplingRiskCriterion(
  value: string
): value is SamplingRiskCriterion {
  return (SAMPLING_RISK_CRITERIA as readonly string[]).includes(value);
}

/** Synonym patterns used by deterministic scoring for each risk criterion. */
export const RISK_CRITERION_PATTERNS: Record<SamplingRiskCriterion, RegExp> = {
  high_value:
    /\b(high[-\s]?value|large[-\s]?dollar|high[-\s]?dollar|\$\s?10,?000|over\s+\$|amounts?\s+above|material\s+amount)/i,
  privileged_account:
    /\b(privileged|admin(?:istrative)?\s+accounts?|elevated\s+access|service\s+accounts?)/i,
  after_hours:
    /\b(after[-\s]?hours|off[-\s]?hours|outside\s+business|non[-\s]?business\s+hours|weekends?|odd\s+hours)/i,
  foreign_vendor:
    /\b(foreign|overseas|international|non[-\s]?domestic)\s+(vendors?|suppliers?|payees?)|\b(foreign|overseas|international)\b/i,
};

export const APPROACH_KEYWORD_PATTERNS: Record<string, RegExp> = {
  random: /\brandom(ly|ized|isation|ization)?\b/i,
  statistical: /\bstatistical(ly)?\b|\bstatistically\s+valid\b/i,
  sample_size: /\bsample\s*size\b|\bn\s*=\s*\d+\b|\bsize\s+of\s+\d+\b/i,
  risk_based:
    /\brisk[-\s]?based\b|\bjudgmental\b|\bjudgment\s+sample\b|\bhaphazard\b|\badditional\s+selections?\b|\bsupplement(al|ary)?\s+sample\b/i,
};
