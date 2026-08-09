import { describe, expect, it } from 'vitest';

import {
  SEED_ANOMALY_DETECTION,
  SEED_ANOMALY_TRANSACTIONS,
  detectAnomalies,
  isRoundDollarAmount,
  isWeekendDate,
} from '@/lib/anomaly/mockTransactions';
import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';
import {
  evaluateTransactionAnomalyDeterministic,
  extractTransactionAnomalySubmission,
  parseTransactionAnomalyExpectedState,
  transactionAnomalyTicketScorer,
} from '@/lib/scoring/transactionAnomaly';

const EXPECTED_IDS = SEED_ANOMALY_DETECTION.anomalyIds;

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-anomaly-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'transaction_anomaly',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief:
      'Anomaly detection: Identify duplicate, round-dollar, and weekend AP transactions.',
    initial_state: {
      prompt: 'Flag every anomalous transaction using the stated rules.',
      transactions: SEED_ANOMALY_TRANSACTIONS,
    },
    expected_state: {
      anomalyTransactionIds: EXPECTED_IDS,
      anomalyCount: EXPECTED_IDS.length,
    },
    dcwf_code: '612',
    sort_order: 1,
    ...overrides,
  };
}

const correctSubmission = {
  type: 'transaction_anomaly' as const,
  anomalyTransactionIds: [...EXPECTED_IDS].reverse(),
  anomalyCount: EXPECTED_IDS.length,
};

describe('anomaly dataset rules', () => {
  it('detects the seeded anomaly set deterministically', () => {
    const result = detectAnomalies(SEED_ANOMALY_TRANSACTIONS);
    expect(result.anomalyCount).toBe(14);
    expect(result.anomalyIds).toEqual(EXPECTED_IDS);
    expect(result.byRule.duplicate_payment).toEqual([
      'APT-0046',
      'APT-0047',
      'APT-0048',
      'APT-0049',
    ]);
    expect(result.byRule.round_dollar).toContain('APT-0051');
    expect(result.byRule.weekend).toContain('APT-0051');
  });

  it('classifies round-dollar and weekend dates objectively', () => {
    expect(isRoundDollarAmount(1000)).toBe(true);
    expect(isRoundDollarAmount(1000.0)).toBe(true);
    expect(isRoundDollarAmount(412.37)).toBe(false);
    expect(isWeekendDate('2026-05-02')).toBe(true); // Saturday
    expect(isWeekendDate('2026-05-03')).toBe(true); // Sunday
    expect(isWeekendDate('2026-05-01')).toBe(false); // Friday
  });
});

describe('transactionAnomaly parsers', () => {
  it('registers transaction_anomaly aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('transaction_anomaly');
    expect(registered).toContain('csv_anomaly_detection');
    expect(registered).toContain('anomaly_detection');
    expect(getTicketScorer('transaction_anomaly')).toBeTruthy();
    expect(getTicketScorer('csv_anomaly_detection')).toBe(
      getTicketScorer('transaction_anomaly')
    );
  });

  it('parses expected_state with aliases', () => {
    const parsed = parseTransactionAnomalyExpectedState({
      anomalies: [{ transactionId: 'APT-0037' }, 'APT-0038', 'APT-0037'],
      anomaly_count: 2,
    });
    expect(parsed).toEqual({
      anomalyTransactionIds: ['APT-0037', 'APT-0038'],
      anomalyCount: 2,
    });
  });

  it('extracts submission ids case-insensitively for matching', () => {
    const extracted = extractTransactionAnomalySubmission({
      type: 'csv_anomaly_detection',
      anomaly_transaction_ids: ['apt-0037', 'APT-0038'],
    });
    expect(extracted?.anomalyTransactionIds).toEqual([
      'apt-0037',
      'APT-0038',
    ]);
  });
});

describe('transactionAnomaly scoring', () => {
  it('resolves on exact anomaly set (order-independent)', () => {
    const result = evaluateTransactionAnomalyDeterministic(
      correctSubmission,
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.anomalySetMatch).toBe(true);
    expect(result.structured.style).toBe('transaction_anomaly');
  });

  it('needs revision when an anomaly is missing (partial)', () => {
    const partial = EXPECTED_IDS.slice(0, EXPECTED_IDS.length - 1);
    const result = evaluateTransactionAnomalyDeterministic(
      {
        type: 'transaction_anomaly',
        anomalyTransactionIds: partial,
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_anomalies');
    expect(result.structured.missingAnomalyTransactionIds).toEqual([
      EXPECTED_IDS[EXPECTED_IDS.length - 1],
    ]);
    expect(result.feedback).toMatch(/Missing/i);
  });

  it('needs revision when a false-positive id is included', () => {
    const result = evaluateTransactionAnomalyDeterministic(
      {
        type: 'transaction_anomaly',
        anomalyTransactionIds: [...EXPECTED_IDS, 'APT-0001'],
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('extra_anomalies');
    expect(result.structured.extraAnomalyTransactionIds).toEqual(['APT-0001']);
  });

  it('needs revision on completely wrong answer', () => {
    const result = evaluateTransactionAnomalyDeterministic(
      {
        type: 'transaction_anomaly',
        anomalyTransactionIds: ['APT-0001', 'APT-0002'],
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.missingAnomalyTransactionIds.length).toBe(14);
    expect(result.structured.extraAnomalyTransactionIds).toEqual([
      'APT-0001',
      'APT-0002',
    ]);
  });

  it('fails when IDs match but explicit count is wrong', () => {
    const result = evaluateTransactionAnomalyDeterministic(
      {
        type: 'transaction_anomaly',
        anomalyTransactionIds: EXPECTED_IDS,
        anomalyCount: 99,
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('wrong_count');
  });

  it('scores via transactionAnomalyTicketScorer', async () => {
    const pass = await transactionAnomalyTicketScorer.score(
      correctSubmission,
      ticket()
    );
    expect(pass.status).toBe('resolved');

    const fail = await transactionAnomalyTicketScorer.score(
      { type: 'transaction_anomaly', anomalyTransactionIds: [] },
      ticket()
    );
    expect(fail.status).toBe('needs_revision');
  });
});
