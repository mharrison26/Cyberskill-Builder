import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  evaluateCmmcGapAnalysisDeterministic,
  cmmcGapAnalysisTicketScorer,
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
  'SI.L2-3.14.1',
];

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-cmmc',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'cmmc_gap_analysis',
    difficulty: 'medium',
    sla_minutes: 60,
    scenario_brief:
      'Score HarborForge Analytics against a CMMC L2 practice subset and document gaps.',
    initial_state: {
      companyName: 'HarborForge Analytics LLC',
      practiceIds: PRACTICE_IDS,
      implementationSummary: 'Mixed maturity summary for the lab.',
    },
    expected_state: {
      minGapAnalysisLength: 120,
    },
    dcwf_code: '612',
    sort_order: 1,
    ...overrides,
  };
}

function completeScores() {
  return PRACTICE_IDS.map((practiceId, index) => ({
    practiceId,
    score:
      index === 0 ? ('met' as const) : index === 1 ? ('partial' as const) : ('not_met' as const),
  }));
}

const solidGapAnalysis =
  'AC.L2-3.1.1 appears met via joiner-mover-leaver account provisioning. AC.L2-3.1.5 is only partial because standing admin rights remain on engineering laptops. IA.L2-3.5.3 is not met: MFA covers VPN but not privileged cloud consoles. SI.L2-3.14.1 is not met because patching lacks defined SLAs and critical findings linger. Overall readiness is limited until MFA scope and flaw remediation timelines close.';

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
        readinessPercent: 40,
      },
      ticket()
    );
    expect(incomplete.ok).toBe(false);
    expect(incomplete.structured.reason).toBe('incomplete_practice_scores');

    const short = evaluateCmmcGapAnalysisDeterministic(
      {
        practiceScores: completeScores(),
        gapAnalysis: 'too short',
        readinessPercent: 40,
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

  it('passes when scores, readiness, and gap narrative meet gates', () => {
    const result = evaluateCmmcGapAnalysisDeterministic(
      {
        practiceScores: completeScores(),
        gapAnalysis: solidGapAnalysis,
        readinessPercent: 35,
      },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.readinessPercentOk).toBe(true);
    expect(result.structured.missingPracticeIds).toEqual([]);
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
        readinessPercent: 35,
      },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      style: 'cmmc_gap_analysis',
      readinessPercentOk: true,
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
      feedback: 'Readiness % is unsupported by the practice scores.',
      strengths: ['Mentions MFA'],
      gaps: ['No link from SI.L2-3.14.1 text to patch timeline gap'],
    });

    const result = await cmmcGapAnalysisTicketScorer.score(
      {
        practiceScores: completeScores(),
        gapAnalysis: solidGapAnalysis,
        readinessPercent: 90,
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(
      (result.structuredResult as { reason?: string }).reason
    ).toBe('grading_insufficient_evidence');
  });
});
