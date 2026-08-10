import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  calculateCmmcReadinessPercent,
  evaluateCmmcGapAnalysisDeterministic,
  cmmcGapAnalysisTicketScorer,
  DEFAULT_CMMC_READINESS_WEIGHTS,
} from '@/lib/scoring/cmmcGapAnalysis';

vi.mock('@/lib/grading/callClaudeGrading', () => {
  class MissingAnthropicApiKeyError extends Error {
    constructor() {
      super('ANTHROPIC_API_KEY is not configured');
      this.name = 'MissingAnthropicApiKeyError';
    }
  }

  return {
    MissingAnthropicApiKeyError,
    callClaudeGrading: vi.fn(),
  };
});

import { callClaudeGrading } from '@/lib/grading/callClaudeGrading';

const PRACTICE_IDS = [
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
];

/** GRC-07 designed mix: 4 met + 3 partial + 3 not_met → 55%. */
const EXPECTED_PRACTICE_SCORES = [
  { practiceId: 'AC.L2-3.1.1', score: 'met' as const },
  { practiceId: 'AC.L2-3.1.5', score: 'partial' as const },
  { practiceId: 'IA.L2-3.5.3', score: 'partial' as const },
  { practiceId: 'AU.L2-3.3.1', score: 'met' as const },
  { practiceId: 'CM.L2-3.4.1', score: 'not_met' as const },
  { practiceId: 'IR.L2-3.6.1', score: 'not_met' as const },
  { practiceId: 'MP.L2-3.8.3', score: 'met' as const },
  { practiceId: 'SC.L2-3.13.11', score: 'partial' as const },
  { practiceId: 'SI.L2-3.14.1', score: 'not_met' as const },
  { practiceId: 'AT.L2-3.2.1', score: 'met' as const },
];

const EXPECTED_READINESS = 55;

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-cmmc',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 3,
    ticket_type: 'cmmc_gap_analysis',
    difficulty: 'hard',
    sla_minutes: 60,
    scenario_brief:
      "Northwind's contracts team needs a CMMC Level 2 readiness estimate before the next contract renewal. Score Northwind's current control implementation summary against a subset of CMMC 2.0 Level 2 practices and produce a gap summary with an overall readiness percentage.",
    initial_state: {
      companyName: 'Northwind Retail Technology',
      practiceIds: PRACTICE_IDS,
      implementationSummary:
        'Score each practice from the per-practice implementation notes.',
      readinessFormula:
        'readinessPercent = round(100 * Σ weight(score) / N); weight(met)=1, weight(partial)=0.5, weight(not_met)=0',
    },
    expected_state: {
      minGapAnalysisLength: 120,
      practiceIds: PRACTICE_IDS,
      expectedPracticeScores: EXPECTED_PRACTICE_SCORES,
      expectedReadinessPercent: EXPECTED_READINESS,
      readinessFormula:
        'readinessPercent = round(100 * Σ weight(score) / N); weight(met)=1, weight(partial)=0.5, weight(not_met)=0',
    },
    dcwf_code: '722',
    sort_order: 32,
    ...overrides,
  };
}

function completeScores() {
  return EXPECTED_PRACTICE_SCORES.map((entry) => ({ ...entry }));
}

const solidGapAnalysis =
  'AC.L2-3.1.1 and AU.L2-3.3.1, MP.L2-3.8.3, and AT.L2-3.2.1 are met on the Northwind evidence. AC.L2-3.1.5 is partial due to standing local admin and shared break-glass. IA.L2-3.5.3 is partial because MFA covers VPN/M365 but not privileged cloud consoles. SC.L2-3.13.11 is partial: BitLocker is FIPS-validated on shares but backups/replica are not. CM.L2-3.4.1, IR.L2-3.6.1, and SI.L2-3.14.1 are not met (inventory/baselines, non-operational IR, and missing patch SLAs). Readiness is 55% from the weighted mix.';

describe('calculateCmmcReadinessPercent', () => {
  it('uses met=1, partial=0.5, not_met=0 and rounds to nearest percent', () => {
    expect(DEFAULT_CMMC_READINESS_WEIGHTS).toEqual({
      met: 1,
      partial: 0.5,
      not_met: 0,
    });

    // 4 met + 3 partial + 3 not_met → (4 + 1.5) / 10 * 100 = 55
    expect(calculateCmmcReadinessPercent(EXPECTED_PRACTICE_SCORES)).toBe(55);

    // All met
    expect(
      calculateCmmcReadinessPercent(
        PRACTICE_IDS.map((practiceId) => ({ practiceId, score: 'met' as const }))
      )
    ).toBe(100);

    // All not_met
    expect(
      calculateCmmcReadinessPercent(
        PRACTICE_IDS.map((practiceId) => ({
          practiceId,
          score: 'not_met' as const,
        }))
      )
    ).toBe(0);

    // 1 met + 1 partial → (1 + 0.5) / 2 * 100 = 75
    expect(
      calculateCmmcReadinessPercent([
        { score: 'met' },
        { score: 'partial' },
      ])
    ).toBe(75);

    // Rounding: 1 met + 2 partial of 3 → (1 + 1) / 3 * 100 = 66.666… → 67
    expect(
      calculateCmmcReadinessPercent([
        { score: 'met' },
        { score: 'partial' },
        { score: 'partial' },
      ])
    ).toBe(67);
  });

  it('returns 0 for an empty score list', () => {
    expect(calculateCmmcReadinessPercent([])).toBe(0);
  });
});

describe('evaluateCmmcGapAnalysisDeterministic', () => {
  it('rejects missing fields', () => {
    const result = evaluateCmmcGapAnalysisDeterministic({}, ticket());
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_fields');
  });

  it('rejects incomplete practice scores and short gap analysis', () => {
    const incomplete = evaluateCmmcGapAnalysisDeterministic(
      {
        practiceScores: [{ practiceId: 'AC.L2-3.1.1', score: 'met' }],
        gapAnalysis: solidGapAnalysis,
        readinessPercent: EXPECTED_READINESS,
      },
      ticket()
    );
    expect(incomplete.ok).toBe(false);
    expect(incomplete.structured.reason).toBe('incomplete_practice_scores');

    const short = evaluateCmmcGapAnalysisDeterministic(
      {
        practiceScores: completeScores(),
        gapAnalysis: 'too short',
        readinessPercent: EXPECTED_READINESS,
      },
      ticket()
    );
    expect(short.ok).toBe(false);
    expect(short.structured.reason).toBe('gap_analysis_too_short');
  });

  it('rejects readiness outside 0–100', () => {
    const result = evaluateCmmcGapAnalysisDeterministic(
      {
        practiceScores: completeScores(),
        gapAnalysis: solidGapAnalysis,
        readinessPercent: 140,
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('invalid_readiness_percent');
  });

  it('rejects classifications that do not match the answer key', () => {
    const wrong = completeScores().map((entry) =>
      entry.practiceId === 'SI.L2-3.14.1'
        ? { ...entry, score: 'met' as const }
        : entry
    );
    const result = evaluateCmmcGapAnalysisDeterministic(
      {
        practiceScores: wrong,
        gapAnalysis: solidGapAnalysis,
        readinessPercent: EXPECTED_READINESS,
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('practice_scores_mismatch');
    expect(result.structured.mismatchedPracticeIds).toContain('SI.L2-3.14.1');
  });

  it('rejects readiness % that does not match the designed mix', () => {
    const result = evaluateCmmcGapAnalysisDeterministic(
      {
        practiceScores: completeScores(),
        gapAnalysis: solidGapAnalysis,
        readinessPercent: 90,
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('readiness_percent_mismatch');
    expect(result.structured.expectedReadinessPercent).toBe(55);
    expect(result.structured.calculatedReadinessPercent).toBe(55);
  });

  it('passes when scores, readiness, and gap narrative match the answer key', () => {
    const result = evaluateCmmcGapAnalysisDeterministic(
      {
        practiceScores: completeScores(),
        gapAnalysis: solidGapAnalysis,
        readinessPercent: EXPECTED_READINESS,
      },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.readinessPercentOk).toBe(true);
    expect(result.structured.practiceScoresMatchExpected).toBe(true);
    expect(result.structured.missingPracticeIds).toEqual([]);
    expect(result.structured.mismatchedPracticeIds).toEqual([]);
    expect(result.structured.calculatedReadinessPercent).toBe(55);
    expect(result.structured.expectedReadinessPercent).toBe(55);
  });

  it('allows any in-range readiness when no answer key is configured', () => {
    const result = evaluateCmmcGapAnalysisDeterministic(
      {
        practiceScores: PRACTICE_IDS.map((practiceId, index) => ({
          practiceId,
          score:
            index === 0
              ? ('met' as const)
              : index === 1
                ? ('partial' as const)
                : ('not_met' as const),
        })),
        gapAnalysis: solidGapAnalysis,
        readinessPercent: 35,
      },
      ticket({
        expected_state: {
          minGapAnalysisLength: 120,
          practiceIds: PRACTICE_IDS,
        },
      })
    );
    expect(result.ok).toBe(true);
    expect(result.structured.practiceScoresMatchExpected).toBeNull();
  });
});

describe('cmmcGapAnalysisTicketScorer', () => {
  beforeEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves when Claude returns satisfied against retrieved practices', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'satisfied',
      feedback:
        'Gap analysis ties partial/not-met scores to MFA scope and patch SLAs using practice language.',
      strengths: ['Links IA.L2-3.5.3 to privileged console gap'],
      gaps: [],
    });

    const result = await cmmcGapAnalysisTicketScorer.score(
      {
        type: 'cmmc_gap_analysis',
        practiceScores: completeScores(),
        gapAnalysis: solidGapAnalysis,
        readinessPercent: EXPECTED_READINESS,
      },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      style: 'cmmc_gap_analysis',
      readinessPercentOk: true,
      practiceScoresMatchExpected: true,
      expectedReadinessPercent: 55,
    });
    expect(
      (result.structuredResult as { retrievedPracticeIds: string[] })
        .retrievedPracticeIds
    ).toEqual(expect.arrayContaining(['IA.L2-3.5.3', 'AC.L2-3.1.1']));
    expect(callClaudeGrading).toHaveBeenCalledOnce();
    const prompt = vi.mocked(callClaudeGrading).mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('Retrieved CMMC practice descriptions');
    expect(prompt).toContain('Use only the retrieved CMMC practice');
    expect(prompt).toContain('IA.L2-3.5.3');
  });

  it('needs revision when grading is not satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'insufficient_evidence',
      feedback: 'Narrative does not ground gaps in practice text.',
      strengths: ['Mentions MFA'],
      gaps: ['No link from SI.L2-3.14.1 text to patch timeline gap'],
    });

    const result = await cmmcGapAnalysisTicketScorer.score(
      {
        practiceScores: completeScores(),
        gapAnalysis: solidGapAnalysis,
        readinessPercent: EXPECTED_READINESS,
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect((result.structuredResult as { reason?: string }).reason).toBe(
      'grading_insufficient_evidence'
    );
  });

  it('needs revision before RAG when readiness % is wrong', async () => {
    const result = await cmmcGapAnalysisTicketScorer.score(
      {
        practiceScores: completeScores(),
        gapAnalysis: solidGapAnalysis,
        readinessPercent: 90,
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect((result.structuredResult as { reason?: string }).reason).toBe(
      'readiness_percent_mismatch'
    );
    expect(callClaudeGrading).not.toHaveBeenCalled();
  });
});
