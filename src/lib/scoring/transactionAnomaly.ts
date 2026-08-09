import {
  SEED_ANOMALY_TRANSACTIONS,
  type AnomalyTransaction,
} from '@/lib/anomaly/mockTransactions';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

/**
 * Transaction / CSV anomaly detection scoring.
 *
 * Fully deterministic: compare the student's anomaly transaction-ID set against
 * `expected_state.anomalyTransactionIds`. Order does not matter; exact set
 * match is required to resolve. Optional submitted count is a secondary check
 * surfaced in feedback when present and wrong.
 *
 * initial_state:
 *   {
 *     prompt?, title?, ticketCode?,
 *     rules?: Array<{ id, label, detail }>,
 *     transactions?: AnomalyTransaction[],
 *     csv?: string,
 *     files?: Record<path, contents>,  // WebContainer seed
 *     spreadsheetApproach?: string,
 *   }
 *
 * expected_state:
 *   {
 *     anomalyTransactionIds: string[],
 *     anomalyCount?: number,
 *   }
 *
 * submission:
 *   {
 *     type: 'transaction_anomaly' | 'csv_anomaly_detection' | 'anomaly_detection',
 *     anomalyTransactionIds: string[],
 *     anomalyCount?: number
 *   }
 */

export const TRANSACTION_ANOMALY_TICKET_TYPES = [
  'transaction_anomaly',
  'csv_anomaly_detection',
  'anomaly_detection',
] as const;

export type TransactionAnomalyTicketType =
  (typeof TRANSACTION_ANOMALY_TICKET_TYPES)[number];

export type TransactionAnomalyExpectedState = {
  anomalyTransactionIds: string[];
  anomalyCount: number;
};

export type TransactionAnomalySubmission = {
  type?: string;
  anomalyTransactionIds: string[];
  anomalyCount?: number;
};

export type TransactionAnomalyStructuredResult = {
  style: 'transaction_anomaly';
  submittedAnomalyTransactionIds: string[];
  expectedAnomalyTransactionIds: string[];
  anomalySetMatch: boolean;
  missingAnomalyTransactionIds: string[];
  extraAnomalyTransactionIds: string[];
  submittedCount: number | null;
  expectedCount: number;
  countMatch: boolean | null;
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isTransactionAnomalyTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (TRANSACTION_ANOMALY_TICKET_TYPES as readonly string[]).includes(base);
}

function normalizeStringIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of raw) {
    let id = '';
    if (typeof entry === 'string') {
      id = entry.trim();
    } else if (isPlainObject(entry)) {
      const candidate =
        entry.transactionId ??
        entry.transaction_id ??
        entry.id ??
        entry.txnId ??
        entry.txn_id;
      if (typeof candidate === 'string') id = candidate.trim();
    }
    if (!id) continue;
    const normalized = id.toUpperCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    ids.push(id);
  }
  return ids;
}

function sortIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function setDiff(a: string[], b: string[]): string[] {
  const bSet = new Set(b.map((id) => id.toUpperCase()));
  return a.filter((id) => !bSet.has(id.toUpperCase())).sort((x, y) =>
    x.localeCompare(y)
  );
}

function setsEqualIgnoreCase(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const aSorted = sortIds(a).map((id) => id.toUpperCase());
  const bSorted = sortIds(b).map((id) => id.toUpperCase());
  return aSorted.every((id, i) => id === bSorted[i]);
}

function normalizeCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.trim());
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return null;
}

export function parseAnomalyTransactions(
  initialState: Record<string, unknown> | null | undefined
): AnomalyTransaction[] {
  if (!isPlainObject(initialState)) return [...SEED_ANOMALY_TRANSACTIONS];

  const raw = initialState.transactions ?? initialState.rows;
  if (!Array.isArray(raw) || raw.length === 0) {
    return [...SEED_ANOMALY_TRANSACTIONS];
  }

  const parsed: AnomalyTransaction[] = [];
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    const id =
      typeof entry.id === 'string'
        ? entry.id.trim()
        : typeof entry.transactionId === 'string'
          ? entry.transactionId.trim()
          : typeof entry.transaction_id === 'string'
            ? entry.transaction_id.trim()
            : '';
    if (!id) continue;

    const amountRaw = entry.amount;
    const amount =
      typeof amountRaw === 'number'
        ? amountRaw
        : typeof amountRaw === 'string'
          ? Number(amountRaw)
          : NaN;
    if (!Number.isFinite(amount)) continue;

    const invoiceId =
      typeof entry.invoiceId === 'string'
        ? entry.invoiceId.trim()
        : typeof entry.invoice_id === 'string'
          ? entry.invoice_id.trim()
          : '';

    parsed.push({
      id,
      date: typeof entry.date === 'string' ? entry.date.trim() : '',
      vendor: typeof entry.vendor === 'string' ? entry.vendor.trim() : '',
      invoiceId,
      amount,
      currency: 'USD',
      description:
        typeof entry.description === 'string' ? entry.description.trim() : '',
      department:
        typeof entry.department === 'string' ? entry.department.trim() : '',
    });
  }

  return parsed.length > 0 ? parsed : [...SEED_ANOMALY_TRANSACTIONS];
}

export function parseTransactionAnomalyExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): TransactionAnomalyExpectedState | null {
  if (!isPlainObject(expectedState)) return null;

  const anomalyTransactionIds = sortIds(
    normalizeStringIds(
      expectedState.anomalyTransactionIds ??
        expectedState.anomaly_transaction_ids ??
        expectedState.anomalyIds ??
        expectedState.anomalies
    )
  );

  if (anomalyTransactionIds.length === 0) return null;

  const countFromState = normalizeCount(
    expectedState.anomalyCount ?? expectedState.anomaly_count
  );

  return {
    anomalyTransactionIds,
    anomalyCount: countFromState ?? anomalyTransactionIds.length,
  };
}

export function extractTransactionAnomalySubmission(
  submission: TicketSubmission
): TransactionAnomalySubmission | null {
  const hasIdsKey =
    'anomalyTransactionIds' in submission ||
    'anomaly_transaction_ids' in submission ||
    'anomalyIds' in submission ||
    'anomalies' in submission;

  if (!hasIdsKey && typeof submission.type !== 'string') {
    return null;
  }

  const anomalyTransactionIds = normalizeStringIds(
    submission.anomalyTransactionIds ??
      submission.anomaly_transaction_ids ??
      submission.anomalyIds ??
      submission.anomalies
  );

  const anomalyCount = normalizeCount(
    submission.anomalyCount ?? submission.anomaly_count
  );

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'transaction_anomaly',
    anomalyTransactionIds,
    ...(anomalyCount !== null ? { anomalyCount } : {}),
  };
}

export function evaluateTransactionAnomalyDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: TransactionAnomalySubmission | null;
  structured: TransactionAnomalyStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseTransactionAnomalyExpectedState(ticket.expected_state);
  const parsed = extractTransactionAnomalySubmission(submission);

  const structured: TransactionAnomalyStructuredResult = {
    style: 'transaction_anomaly',
    submittedAnomalyTransactionIds: [],
    expectedAnomalyTransactionIds: expected?.anomalyTransactionIds ?? [],
    anomalySetMatch: false,
    missingAnomalyTransactionIds: [],
    extraAnomalyTransactionIds: [],
    submittedCount: null,
    expectedCount: expected?.anomalyCount ?? 0,
    countMatch: null,
  };

  if (!expected) {
    structured.reason = 'misconfigured_expected_state';
    return {
      parsed,
      structured,
      ok: false,
      feedback:
        'This transaction anomaly ticket is missing anomalyTransactionIds in expected_state. Ask an admin to fix the seed.',
    };
  }

  if (!parsed) {
    structured.reason = 'missing_fields';
    return {
      parsed: null,
      structured,
      ok: false,
      feedback:
        'Submission must include anomalyTransactionIds (array of transaction IDs).',
    };
  }

  const submittedSorted = sortIds(parsed.anomalyTransactionIds);
  const expectedIds = expected.anomalyTransactionIds;
  const missing = setDiff(expectedIds, submittedSorted);
  const extra = setDiff(submittedSorted, expectedIds);
  const setMatch = setsEqualIgnoreCase(submittedSorted, expectedIds);

  const submittedCount =
    parsed.anomalyCount !== undefined
      ? parsed.anomalyCount
      : submittedSorted.length;
  const countMatch = submittedCount === expected.anomalyCount;

  structured.submittedAnomalyTransactionIds = submittedSorted;
  structured.anomalySetMatch = setMatch;
  structured.missingAnomalyTransactionIds = missing;
  structured.extraAnomalyTransactionIds = extra;
  structured.submittedCount = submittedCount;
  structured.countMatch =
    parsed.anomalyCount !== undefined ? countMatch : null;

  if (!setMatch) {
    const parts: string[] = [];
    if (missing.length > 0) {
      parts.push(`Missing anomal(ies): ${missing.join(', ')}.`);
    }
    if (extra.length > 0) {
      parts.push(`Incorrectly flagged: ${extra.join(', ')}.`);
    }
    if (parsed.anomalyCount !== undefined && !countMatch) {
      parts.push(
        `Reported count ${submittedCount} does not match expected ${expected.anomalyCount}.`
      );
    }
    if (parts.length === 0) {
      parts.push('Anomaly set does not match the seeded evidence exactly.');
    }

    structured.reason =
      missing.length > 0
        ? 'missing_anomalies'
        : extra.length > 0
          ? 'extra_anomalies'
          : 'set_mismatch';

    return {
      parsed,
      structured,
      ok: false,
      feedback: parts.join(' '),
    };
  }

  if (parsed.anomalyCount !== undefined && !countMatch) {
    structured.reason = 'wrong_count';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Anomaly IDs match, but reported count should be ${expected.anomalyCount}, not ${submittedCount}.`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback: `Correct — identified all ${expected.anomalyCount} anomalous transaction(s).`,
  };
}

export const transactionAnomalyTicketScorer: TicketScorer = {
  score(submission, ticket): TicketScoreResult {
    const result = evaluateTransactionAnomalyDeterministic(submission, ticket);
    return {
      status: result.ok ? 'resolved' : 'needs_revision',
      structuredResult: result.structured,
      feedback: result.feedback,
    };
  },
};
