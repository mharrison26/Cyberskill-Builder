import { describe, expect, it } from 'vitest';

import {
  SAMPLING_METHODOLOGY_MIN_FIELD_LENGTH,
  evaluateSamplingMethodologyDeterministic,
  extractSamplingMethodologySubmission,
  parseSamplingMethodologyExpectedState,
} from '@/lib/scoring/samplingMethodology';
import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';
import { buildMockTransactionPopulation } from '@/lib/sampling/mockTransactions';

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-sample-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'sampling_methodology',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief:
      'Sampling: Select a statistical random sample of 25 from AP transactions and identify risk-based additions.',
    initial_state: {
      populationSize: 75,
      populationSeed: 20260808,
      methodology: {
        approach: 'statistical_random',
        sampleSize: 25,
      },
    },
    expected_state: {
      requiredSampleSize: 25,
      requiredApproachKeywords: ['random', 'statistical'],
      requireRiskBasedAdditions: true,
      requiredRiskCriteria: [
        'high_value',
        'privileged_account',
        'after_hours',
        'foreign_vendor',
      ],
      minMethodologyLength: 80,
      minRiskAdditionsLength: 80,
    },
    dcwf_code: '612',
    sort_order: 1,
    ...overrides,
  };
}

const goodSampleSelection = `
I would draw a statistical random sample of size 25 from the full population of
accounts-payable transactions using a random number generator against the
transaction IDs, so each item has an equal chance of selection.
`.trim();

const goodRiskAdditions = `
I would also make risk-based additions for high-value invoices, privileged
account activity, after-hours postings, and foreign vendor payments that were
not already pulled in the random sample.
`.trim();

describe('samplingMethodology scorer', () => {
  it('registers sampling_methodology aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('sampling_methodology');
    expect(registered).toContain('assessment_sampling');
    expect(registered).toContain('transaction_sampling');
    expect(getTicketScorer('sampling_methodology')).toBeTruthy();
    expect(getTicketScorer('assessment_sampling')).toBe(
      getTicketScorer('sampling_methodology')
    );
  });

  it('builds a 50–100 transaction population', () => {
    const population = buildMockTransactionPopulation(75, 20260808);
    expect(population.length).toBe(75);
    expect(population[0]?.id).toBe('TXN-0001');
    expect(population.some((txn) => txn.riskFlags.length > 0)).toBe(true);
  });

  it('parses expected_state knobs', () => {
    const parsed = parseSamplingMethodologyExpectedState({
      requiredSampleSize: 25,
      requiredApproachKeywords: ['Random', 'statistical'],
      requireRiskBasedAdditions: true,
      requiredRiskCriteria: ['high_value', 'after_hours'],
      minMethodologyLength: 80,
    });

    expect(parsed).toMatchObject({
      requiredSampleSize: 25,
      requiredApproachKeywords: ['random', 'statistical'],
      requireRiskBasedAdditions: true,
      requiredRiskCriteria: ['high_value', 'after_hours'],
      minMethodologyLength: 80,
    });
  });

  it('extracts sampleSelection and riskBasedAdditions', () => {
    const parsed = extractSamplingMethodologySubmission({
      type: 'sampling_methodology',
      sampleSelection: ' random of 25 ',
      riskBasedAdditions: ' risk-based high-value ',
    });

    expect(parsed).toEqual({
      type: 'sampling_methodology',
      sampleSelection: 'random of 25',
      riskBasedAdditions: 'risk-based high-value',
    });
  });

  it('fails when fields are missing or short', () => {
    const missing = evaluateSamplingMethodologyDeterministic({}, ticket());
    expect(missing.ok).toBe(false);
    expect(missing.structured.reason).toBe('missing_fields');

    const short = evaluateSamplingMethodologyDeterministic(
      {
        sampleSelection: 'random sample of 25',
        riskBasedAdditions: goodRiskAdditions,
      },
      ticket()
    );
    expect(short.ok).toBe(false);
    expect(short.structured.reason).toBe('fields_too_short');
    expect(short.feedback).toMatch(/sampleSelection/i);
  });

  it('fails when sample size or approach keywords are omitted', () => {
    const noSize = evaluateSamplingMethodologyDeterministic(
      {
        sampleSelection: `${'x'.repeat(SAMPLING_METHODOLOGY_MIN_FIELD_LENGTH)} I would use a statistical random sample from the population.`,
        riskBasedAdditions: goodRiskAdditions,
      },
      ticket()
    );
    expect(noSize.ok).toBe(false);
    expect(noSize.structured.sampleSizeMentioned).toBe(false);
    expect(noSize.feedback).toMatch(/sample size/i);

    const noApproach = evaluateSamplingMethodologyDeterministic(
      {
        sampleSelection: `${'x'.repeat(SAMPLING_METHODOLOGY_MIN_FIELD_LENGTH)} I would select 25 transactions from the population.`,
        riskBasedAdditions: goodRiskAdditions,
      },
      ticket()
    );
    expect(noApproach.ok).toBe(false);
    expect(
      noApproach.structured.approachKeywordsMissing.length
    ).toBeGreaterThan(0);
  });

  it('fails when risk-based criteria are incomplete', () => {
    const result = evaluateSamplingMethodologyDeterministic(
      {
        sampleSelection: goodSampleSelection,
        riskBasedAdditions: `${'x'.repeat(SAMPLING_METHODOLOGY_MIN_FIELD_LENGTH)} I would make risk-based additions for high-value items only.`,
      },
      ticket()
    );

    expect(result.ok).toBe(false);
    expect(result.structured.riskBasedMentioned).toBe(true);
    expect(result.structured.riskCriteriaMissing).toEqual(
      expect.arrayContaining([
        'privileged_account',
        'after_hours',
        'foreign_vendor',
      ])
    );
  });

  it('passes when methodology matches the stated approach', () => {
    const result = evaluateSamplingMethodologyDeterministic(
      {
        type: 'sampling_methodology',
        sampleSelection: goodSampleSelection,
        riskBasedAdditions: goodRiskAdditions,
      },
      ticket()
    );

    expect(result.ok).toBe(true);
    expect(result.structured).toMatchObject({
      style: 'sampling_methodology',
      sampleSizeMentioned: true,
      approachKeywordsMissing: [],
      riskBasedMentioned: true,
      riskCriteriaMissing: [],
      fieldsOk: true,
      methodologyOk: true,
    });
  });

  it('scores resolved via registered scorer', async () => {
    const scorer = getTicketScorer('sampling_methodology');
    expect(scorer).toBeTruthy();
    const outcome = await scorer!.score(
      {
        type: 'sampling_methodology',
        sampleSelection: goodSampleSelection,
        riskBasedAdditions: goodRiskAdditions,
      },
      ticket()
    );
    expect(outcome.status).toBe('resolved');
  });
});
