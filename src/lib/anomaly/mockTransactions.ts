/**
 * Deterministic AP transaction population for transaction_anomaly tickets.
 * Distinct from sampling_methodology (APT-* / May 2026 vs TXN-* / March 2026).
 *
 * Anomaly rules (objective — no judgment calls):
 * 1. duplicate_payment — invoice_id appears on more than one row (flag every copy)
 * 2. round_dollar — amount has no cents (exact whole dollars)
 * 3. weekend — transaction date is Saturday or Sunday (UTC calendar date)
 */

export const ANOMALY_RULE_IDS = [
  'duplicate_payment',
  'round_dollar',
  'weekend',
] as const;

export type AnomalyRuleId = (typeof ANOMALY_RULE_IDS)[number];

export const ANOMALY_RULE_LABELS: Record<AnomalyRuleId, string> = {
  duplicate_payment:
    'Duplicate payment (same invoice_id on more than one transaction)',
  round_dollar: 'Round-dollar amount (exact whole dollars, no cents)',
  weekend: 'Weekend transaction (Saturday or Sunday)',
};

export type AnomalyTransaction = {
  id: string;
  date: string;
  vendor: string;
  invoiceId: string;
  amount: number;
  currency: 'USD';
  description: string;
  department: string;
};

export type AnomalyDetectionResult = {
  anomalyIds: string[];
  anomalyCount: number;
  byRule: Record<AnomalyRuleId, string[]>;
};

/** Canonical seeded population (51 rows). */
export const SEED_ANOMALY_TRANSACTIONS: AnomalyTransaction[] = [
  {
    id: 'APT-0001',
    date: '2026-05-01',
    vendor: 'Brightleaf Office',
    invoiceId: 'INV-9001',
    amount: 412.37,
    currency: 'USD',
    description: 'Printer toner restock',
    department: 'Facilities',
  },
  {
    id: 'APT-0002',
    date: '2026-05-04',
    vendor: 'Cascade Networks',
    invoiceId: 'INV-9002',
    amount: 1288.64,
    currency: 'USD',
    description: 'Switch stack maintenance',
    department: 'IT',
  },
  {
    id: 'APT-0003',
    date: '2026-05-05',
    vendor: 'HarborForge Consulting',
    invoiceId: 'INV-9003',
    amount: 755.19,
    currency: 'USD',
    description: 'Quarterly advisory retainer',
    department: 'Finance',
  },
  {
    id: 'APT-0004',
    date: '2026-05-06',
    vendor: 'Summit Hardware Co',
    invoiceId: 'INV-9004',
    amount: 2399.45,
    currency: 'USD',
    description: 'Laptop refresh batch',
    department: 'IT',
  },
  {
    id: 'APT-0005',
    date: '2026-05-07',
    vendor: 'Northwind Catering',
    invoiceId: 'INV-9005',
    amount: 186.22,
    currency: 'USD',
    description: 'Team lunch catering',
    department: 'HR',
  },
  {
    id: 'APT-0006',
    date: '2026-05-08',
    vendor: 'Pinecrest Legal LLP',
    invoiceId: 'INV-9006',
    amount: 3400.88,
    currency: 'USD',
    description: 'Contract review hours',
    department: 'Legal',
  },
  {
    id: 'APT-0007',
    date: '2026-05-11',
    vendor: 'Riverstone Cloud',
    invoiceId: 'INV-9007',
    amount: 919.53,
    currency: 'USD',
    description: 'SaaS seat expansion',
    department: 'IT',
  },
  {
    id: 'APT-0008',
    date: '2026-05-12',
    vendor: 'Oakmont Travel Desk',
    invoiceId: 'INV-9008',
    amount: 642.17,
    currency: 'USD',
    description: 'Conference travel booking',
    department: 'Finance',
  },
  {
    id: 'APT-0009',
    date: '2026-05-13',
    vendor: 'Brightleaf Office',
    invoiceId: 'INV-9009',
    amount: 1544.61,
    currency: 'USD',
    description: 'Desk chairs replacement',
    department: 'Facilities',
  },
  {
    id: 'APT-0010',
    date: '2026-05-14',
    vendor: 'Cascade Networks',
    invoiceId: 'INV-9010',
    amount: 277.4,
    currency: 'USD',
    description: 'Network cable plant',
    department: 'IT',
  },
  {
    id: 'APT-0011',
    date: '2026-05-15',
    vendor: 'HarborForge Consulting',
    invoiceId: 'INV-9011',
    amount: 1102.93,
    currency: 'USD',
    description: 'SOC workshop facilitation',
    department: 'Finance',
  },
  {
    id: 'APT-0012',
    date: '2026-05-18',
    vendor: 'Summit Hardware Co',
    invoiceId: 'INV-9012',
    amount: 488.76,
    currency: 'USD',
    description: 'Badge printer supplies',
    department: 'IT',
  },
  {
    id: 'APT-0013',
    date: '2026-05-19',
    vendor: 'Northwind Catering',
    invoiceId: 'INV-9013',
    amount: 3210.55,
    currency: 'USD',
    description: 'Firewall appliance support',
    department: 'HR',
  },
  {
    id: 'APT-0014',
    date: '2026-05-20',
    vendor: 'Pinecrest Legal LLP',
    invoiceId: 'INV-9014',
    amount: 167.89,
    currency: 'USD',
    description: 'Executive offsite meals',
    department: 'Legal',
  },
  {
    id: 'APT-0015',
    date: '2026-05-21',
    vendor: 'Riverstone Cloud',
    invoiceId: 'INV-9015',
    amount: 2899.12,
    currency: 'USD',
    description: 'Outside counsel memo',
    department: 'IT',
  },
  {
    id: 'APT-0016',
    date: '2026-05-22',
    vendor: 'Oakmont Travel Desk',
    invoiceId: 'INV-9016',
    amount: 733.48,
    currency: 'USD',
    description: 'Object storage overage',
    department: 'Finance',
  },
  {
    id: 'APT-0017',
    date: '2026-05-25',
    vendor: 'Brightleaf Office',
    invoiceId: 'INV-9017',
    amount: 1455.3,
    currency: 'USD',
    description: 'Staff relocation flights',
    department: 'Facilities',
  },
  {
    id: 'APT-0018',
    date: '2026-05-26',
    vendor: 'Cascade Networks',
    invoiceId: 'INV-9018',
    amount: 521.06,
    currency: 'USD',
    description: 'Cleaning contract add-on',
    department: 'IT',
  },
  {
    id: 'APT-0019',
    date: '2026-05-27',
    vendor: 'HarborForge Consulting',
    invoiceId: 'INV-9019',
    amount: 1988.71,
    currency: 'USD',
    description: 'APAC circuit upgrade',
    department: 'Finance',
  },
  {
    id: 'APT-0020',
    date: '2026-05-28',
    vendor: 'Summit Hardware Co',
    invoiceId: 'INV-9020',
    amount: 864.25,
    currency: 'USD',
    description: 'Board packet printing',
    department: 'IT',
  },
  {
    id: 'APT-0021',
    date: '2026-05-29',
    vendor: 'Northwind Catering',
    invoiceId: 'INV-9021',
    amount: 1333.58,
    currency: 'USD',
    description: 'ERP connector license',
    department: 'HR',
  },
  {
    id: 'APT-0022',
    date: '2026-05-01',
    vendor: 'Pinecrest Legal LLP',
    invoiceId: 'INV-9022',
    amount: 249.91,
    currency: 'USD',
    description: 'Wellness stipend batch',
    department: 'Legal',
  },
  {
    id: 'APT-0023',
    date: '2026-05-04',
    vendor: 'Riverstone Cloud',
    invoiceId: 'INV-9023',
    amount: 1766.04,
    currency: 'USD',
    description: 'Penetration test follow-up',
    department: 'IT',
  },
  {
    id: 'APT-0024',
    date: '2026-05-05',
    vendor: 'Oakmont Travel Desk',
    invoiceId: 'INV-9024',
    amount: 390.67,
    currency: 'USD',
    description: 'Courier overnight fees',
    department: 'Finance',
  },
  {
    id: 'APT-0025',
    date: '2026-05-06',
    vendor: 'Brightleaf Office',
    invoiceId: 'INV-9025',
    amount: 2111.39,
    currency: 'USD',
    description: 'Backup appliance parts',
    department: 'Facilities',
  },
  {
    id: 'APT-0026',
    date: '2026-05-07',
    vendor: 'Cascade Networks',
    invoiceId: 'INV-9026',
    amount: 678.14,
    currency: 'USD',
    description: 'Interview panel catering',
    department: 'IT',
  },
  {
    id: 'APT-0027',
    date: '2026-05-08',
    vendor: 'HarborForge Consulting',
    invoiceId: 'INV-9027',
    amount: 4555.82,
    currency: 'USD',
    description: 'M&A diligence support',
    department: 'Finance',
  },
  {
    id: 'APT-0028',
    date: '2026-05-11',
    vendor: 'Summit Hardware Co',
    invoiceId: 'INV-9028',
    amount: 812.46,
    currency: 'USD',
    description: 'CDN burst traffic',
    department: 'IT',
  },
  {
    id: 'APT-0029',
    date: '2026-05-12',
    vendor: 'Northwind Catering',
    invoiceId: 'INV-9029',
    amount: 1204.73,
    currency: 'USD',
    description: 'Sales kickoff lodging',
    department: 'HR',
  },
  {
    id: 'APT-0030',
    date: '2026-05-13',
    vendor: 'Pinecrest Legal LLP',
    invoiceId: 'INV-9030',
    amount: 333.28,
    currency: 'USD',
    description: 'Ergonomic keyboard set',
    department: 'Legal',
  },
  {
    id: 'APT-0031',
    date: '2026-05-14',
    vendor: 'Riverstone Cloud',
    invoiceId: 'INV-9031',
    amount: 967.51,
    currency: 'USD',
    description: 'Identity broker renewal',
    department: 'IT',
  },
  {
    id: 'APT-0032',
    date: '2026-05-15',
    vendor: 'Oakmont Travel Desk',
    invoiceId: 'INV-9032',
    amount: 141.7,
    currency: 'USD',
    description: 'New-hire welcome kits',
    department: 'Finance',
  },
  {
    id: 'APT-0033',
    date: '2026-05-18',
    vendor: 'Brightleaf Office',
    invoiceId: 'INV-9033',
    amount: 2588.96,
    currency: 'USD',
    description: 'SIEM content pack',
    department: 'Facilities',
  },
  {
    id: 'APT-0034',
    date: '2026-05-19',
    vendor: 'Cascade Networks',
    invoiceId: 'INV-9034',
    amount: 704.33,
    currency: 'USD',
    description: 'Notary and filing fees',
    department: 'IT',
  },
  {
    id: 'APT-0035',
    date: '2026-05-20',
    vendor: 'HarborForge Consulting',
    invoiceId: 'INV-9035',
    amount: 1822.07,
    currency: 'USD',
    description: 'Multi-region failover test',
    department: 'Finance',
  },
  {
    id: 'APT-0036',
    date: '2026-05-21',
    vendor: 'Summit Hardware Co',
    invoiceId: 'INV-9036',
    amount: 459.62,
    currency: 'USD',
    description: 'Airport transfers',
    department: 'IT',
  },
  {
    id: 'APT-0037',
    date: '2026-05-05',
    vendor: 'Cascade Networks',
    invoiceId: 'INV-9101',
    amount: 1000.0,
    currency: 'USD',
    description: 'Emergency network cutover fee',
    department: 'IT',
  },
  {
    id: 'APT-0038',
    date: '2026-05-12',
    vendor: 'HarborForge Consulting',
    invoiceId: 'INV-9102',
    amount: 5000.0,
    currency: 'USD',
    description: 'Executive advisory lump sum',
    department: 'Finance',
  },
  {
    id: 'APT-0039',
    date: '2026-05-19',
    vendor: 'Riverstone Cloud',
    invoiceId: 'INV-9103',
    amount: 2500.0,
    currency: 'USD',
    description: 'Cloud credits true-up',
    department: 'IT',
  },
  {
    id: 'APT-0040',
    date: '2026-05-26',
    vendor: 'Summit Hardware Co',
    invoiceId: 'INV-9104',
    amount: 750.0,
    currency: 'USD',
    description: 'Spare hardware contingency',
    department: 'IT',
  },
  {
    id: 'APT-0041',
    date: '2026-05-02',
    vendor: 'Brightleaf Office',
    invoiceId: 'INV-9201',
    amount: 388.44,
    currency: 'USD',
    description: 'Weekend facilities unlock',
    department: 'Facilities',
  },
  {
    id: 'APT-0042',
    date: '2026-05-03',
    vendor: 'Oakmont Travel Desk',
    invoiceId: 'INV-9202',
    amount: 1299.18,
    currency: 'USD',
    description: 'Sunday travel rebook',
    department: 'Finance',
  },
  {
    id: 'APT-0043',
    date: '2026-05-09',
    vendor: 'Cascade Networks',
    invoiceId: 'INV-9203',
    amount: 622.75,
    currency: 'USD',
    description: 'Saturday NOC coverage',
    department: 'IT',
  },
  {
    id: 'APT-0044',
    date: '2026-05-16',
    vendor: 'Northwind Catering',
    invoiceId: 'INV-9204',
    amount: 210.56,
    currency: 'USD',
    description: 'Weekend event catering',
    department: 'HR',
  },
  {
    id: 'APT-0045',
    date: '2026-05-24',
    vendor: 'HarborForge Consulting',
    invoiceId: 'INV-9205',
    amount: 1744.89,
    currency: 'USD',
    description: 'Sunday incident retainer',
    department: 'Finance',
  },
  {
    id: 'APT-0046',
    date: '2026-05-08',
    vendor: 'HarborForge Consulting',
    invoiceId: 'INV-DUP-01',
    amount: 1840.5,
    currency: 'USD',
    description: 'Controls walkthrough hours',
    department: 'Finance',
  },
  {
    id: 'APT-0047',
    date: '2026-05-15',
    vendor: 'HarborForge Consulting',
    invoiceId: 'INV-DUP-01',
    amount: 1840.5,
    currency: 'USD',
    description: 'Controls walkthrough hours',
    department: 'Finance',
  },
  {
    id: 'APT-0048',
    date: '2026-05-20',
    vendor: 'Riverstone Cloud',
    invoiceId: 'INV-DUP-02',
    amount: 960.25,
    currency: 'USD',
    description: 'Object storage expansion',
    department: 'IT',
  },
  {
    id: 'APT-0049',
    date: '2026-05-27',
    vendor: 'Riverstone Cloud',
    invoiceId: 'INV-DUP-02',
    amount: 960.25,
    currency: 'USD',
    description: 'Object storage expansion',
    department: 'IT',
  },
  {
    id: 'APT-0050',
    date: '2026-05-28',
    vendor: 'Pinecrest Legal LLP',
    invoiceId: 'INV-9037',
    amount: 1188.42,
    currency: 'USD',
    description: 'Policy redline package',
    department: 'Legal',
  },
  {
    id: 'APT-0051',
    date: '2026-05-10',
    vendor: 'Summit Hardware Co',
    invoiceId: 'INV-9105',
    amount: 3000.0,
    currency: 'USD',
    description: 'Weekend emergency hardware buy',
    department: 'IT',
  },
] as AnomalyTransaction[];

export const SEED_ANOMALY_TRANSACTION_IDS = SEED_ANOMALY_TRANSACTIONS.map(
  (row) => row.id
);

export function isAnomalyRuleId(value: string): value is AnomalyRuleId {
  return (ANOMALY_RULE_IDS as readonly string[]).includes(value);
}

/** Round-dollar: amount is an exact whole number of dollars (no cents). */
export function isRoundDollarAmount(amount: number): boolean {
  if (!Number.isFinite(amount)) return false;
  return Math.abs(amount - Math.round(amount)) < 1e-9;
}

/** Weekend: Saturday (6) or Sunday (0) for a YYYY-MM-DD calendar date (UTC). */
export function isWeekendDate(isoDate: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return false;
  }
  const weekday = utc.getUTCDay();
  return weekday === 0 || weekday === 6;
}

function sortIds(ids: Iterable<string>): string[] {
  return Array.from(ids).sort((a, b) => a.localeCompare(b));
}

/**
 * Detect anomalies from stated rules. A transaction matching multiple rules
 * appears once in anomalyIds and under each matching rule in byRule.
 */
export function detectAnomalies(
  transactions: AnomalyTransaction[]
): AnomalyDetectionResult {
  const byInvoice = new Map<string, string[]>();
  for (const row of transactions) {
    const list = byInvoice.get(row.invoiceId) ?? [];
    list.push(row.id);
    byInvoice.set(row.invoiceId, list);
  }

  const duplicateIds = new Set<string>();
  for (const ids of Array.from(byInvoice.values())) {
    if (ids.length > 1) {
      for (const id of ids) duplicateIds.add(id);
    }
  }

  const roundIds = new Set<string>();
  const weekendIds = new Set<string>();
  for (const row of transactions) {
    if (isRoundDollarAmount(row.amount)) roundIds.add(row.id);
    if (isWeekendDate(row.date)) weekendIds.add(row.id);
  }

  const anomalyIds = sortIds(
    new Set([
      ...Array.from(duplicateIds),
      ...Array.from(roundIds),
      ...Array.from(weekendIds),
    ])
  );

  return {
    anomalyIds,
    anomalyCount: anomalyIds.length,
    byRule: {
      duplicate_payment: sortIds(duplicateIds),
      round_dollar: sortIds(roundIds),
      weekend: sortIds(weekendIds),
    },
  };
}

export function transactionsToCsv(transactions: AnomalyTransaction[]): string {
  const header =
    'transaction_id,date,vendor,invoice_id,amount,currency,description,department';
  const lines = transactions.map((row) => {
    const amount = row.amount.toFixed(2);
    const cells = [
      row.id,
      row.date,
      row.vendor,
      row.invoiceId,
      amount,
      row.currency,
      row.description,
      row.department,
    ];
    return cells
      .map((cell) => {
        const raw = String(cell);
        if (/[",\n]/.test(raw)) {
          return `"${raw.replace(/"/g, '""')}"`;
        }
        return raw;
      })
      .join(',');
  });
  return [header, ...lines].join('\n') + '\n';
}

export const SEED_ANOMALY_CSV = transactionsToCsv(SEED_ANOMALY_TRANSACTIONS);

export const SEED_ANOMALY_DETECTION = detectAnomalies(
  SEED_ANOMALY_TRANSACTIONS
);

export const ANOMALY_RULE_DEFINITIONS = [
  {
    id: 'duplicate_payment' as const,
    label: ANOMALY_RULE_LABELS.duplicate_payment,
    detail:
      'If the same invoice_id appears on two or more rows, flag every transaction_id in that group.',
  },
  {
    id: 'round_dollar' as const,
    label: ANOMALY_RULE_LABELS.round_dollar,
    detail:
      'Flag any transaction whose amount is an exact whole number of dollars (for example 1000.00). Amounts with cents (for example 412.37) are not round-dollar anomalies.',
  },
  {
    id: 'weekend' as const,
    label: ANOMALY_RULE_LABELS.weekend,
    detail:
      'Flag any transaction whose date (YYYY-MM-DD) falls on Saturday or Sunday.',
  },
];
