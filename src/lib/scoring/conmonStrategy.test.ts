import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  evaluateConMonStrategyDeterministic,
  conmonStrategyTicketScorer,
} from '@/lib/scoring/conmonStrategy';

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

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-conmon',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 3,
    ticket_type: 'conmon_strategy',
    difficulty: 'high',
    sla_minutes: 90,
    scenario_brief:
      'Draft a system-level continuous monitoring strategy for HarborNet CMS.',
    initial_state: {
      systemProfile: {
        name: 'HarborNet Case Management System',
        impact: 'Moderate',
      },
    },
    expected_state: {},
    dcwf_code: '612',
    sort_order: 1,
    ...overrides,
  };
}

const solidRationale =
  'Volatile cloud configuration and inventory change frequently; automate checks and assess weekly so unauthorized drift is visible before authorization decisions.';

const solidEscalation =
  'Publish a weekly security status digest to the ISSO and system owner; escalate critical DefectDojo or CloudSploit findings within 24 hours to the authorizing official when risk appears outside tolerance, and refresh the POA&M after each monthly ConMon review.';

function solidSubmission() {
  const families = ['AC', 'AU', 'CA', 'CM', 'IA', 'RA', 'SC', 'SI'];
  return {
    type: 'conmon_strategy',
    familyCadences: families.map((family) => ({
      family,
      cadence:
        family === 'CM' || family === 'SI'
          ? 'Continuous automated + weekly assessor review'
          : 'Monthly assessment with quarterly deep review',
      rationale: solidRationale,
    })),
    toolCoverage: [
      {
        tool: 'DefectDojo',
        families: ['RA', 'SI', 'CA'],
        rationale:
          'DefectDojo aggregates vulnerability scan findings to support risk assessment, flaw remediation evidence, and ongoing control assessment reporting.',
      },
      {
        tool: 'CloudSploit',
        families: ['CM', 'SC', 'IA'],
        rationale:
          'CloudSploit CSPM checks surface misconfigurations affecting configuration settings, communications protections, and identity-related cloud posture.',
      },
      {
        tool: 'Scuba',
        families: ['AC', 'AU', 'IA'],
        rationale:
          'CISA Scuba baseline assessments provide evidence for access control, audit logging posture, and identity configuration in M365-connected environments.',
      },
    ],
    escalationReporting: solidEscalation,
  };
}

describe('evaluateConMonStrategyDeterministic', () => {
  it('rejects missing fields', () => {
    const result = evaluateConMonStrategyDeterministic({}, ticket());
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_fields');
  });

  it('rejects missing families and tools', () => {
    const missingFamily = evaluateConMonStrategyDeterministic(
      {
        ...solidSubmission(),
        familyCadences: solidSubmission().familyCadences.filter(
          (row) => row.family !== 'CM'
        ),
      },
      ticket()
    );
    expect(missingFamily.ok).toBe(false);
    expect(missingFamily.structured.missingFamilies).toContain('CM');

    const missingTool = evaluateConMonStrategyDeterministic(
      {
        ...solidSubmission(),
        toolCoverage: solidSubmission().toolCoverage.filter(
          (row) => row.tool !== 'Scuba'
        ),
      },
      ticket()
    );
    expect(missingTool.ok).toBe(false);
    expect(missingTool.structured.missingTools).toContain('Scuba');
  });

  it('rejects short escalation text', () => {
    const result = evaluateConMonStrategyDeterministic(
      { ...solidSubmission(), escalationReporting: 'Weekly email.' },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('escalation_too_short');
  });

  it('passes a complete memo through deterministic gates', () => {
    const result = evaluateConMonStrategyDeterministic(
      solidSubmission(),
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.missingFamilies).toEqual([]);
    expect(result.structured.missingTools).toEqual([]);
  });
});

describe('conmonStrategyTicketScorer', () => {
  beforeEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns needs_revision when API key is missing after deterministic pass', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const { MissingAnthropicApiKeyError } =
      await import('@/lib/grading/callClaudeGrading');
    vi.mocked(callClaudeGrading).mockRejectedValue(
      new MissingAnthropicApiKeyError()
    );

    const result = await conmonStrategyTicketScorer.score(
      solidSubmission(),
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult).toMatchObject({
      style: 'conmon_strategy',
      reason: 'grading_unavailable_missing_api_key',
    });
  });

  it('resolves when Claude grading returns satisfied and retrieves SP 800-137 sections', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'satisfied',
      feedback:
        'Cadences reflect volatility and reporting/escalation paths are defined.',
      strengths: ['Risk-based CM frequency', 'Tool-to-family mapping'],
      gaps: [],
    });

    const result = await conmonStrategyTicketScorer.score(
      solidSubmission(),
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      style: 'conmon_strategy',
      guidancePath: 'data/nist/sp800-137-conmon-guidance.json',
    });
    const retrieved = (
      result.structuredResult as { retrievedSectionIds: string[] }
    ).retrievedSectionIds;
    expect(retrieved).toContain('define-strategy');
    expect(retrieved).toContain('establish-frequencies');
    expect(callClaudeGrading).toHaveBeenCalledTimes(1);
    const prompt = vi.mocked(callClaudeGrading).mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('SP 800-137');
    expect(prompt).toContain('Retrieved SP 800-137 guidance');
  });
});
