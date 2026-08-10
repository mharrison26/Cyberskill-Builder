import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  DEFAULT_RISK_ID_PATTERN,
  evaluateToolWalkthroughDeterministic,
  isValidRiskRegisterId,
  toolWalkthroughTicketScorer,
  vendorProfileTextFromToolWalkthroughTicket,
} from '@/lib/scoring/toolWalkthrough';

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
    id: 't-walk',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'tool_walkthrough',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief: 'Log a risk in SimpleRisk for exposed remote admin.',
    initial_state: {},
    expected_state: {},
    dcwf_code: '612',
    sort_order: 1,
    ...overrides,
  };
}

const solidJustification =
  'Likelihood is moderate because the exposed RDP service is internet-reachable and known exploits exist for weak passwords; adversary capability and intent against remote admin interfaces are high. Impact is high because successful compromise enables confidentiality loss of sensitive operational data and disruption of a critical business process supporting the mission.';

describe('vendorProfileTextFromToolWalkthroughTicket', () => {
  it('reads vendorPosture from thin vendorProfile seed shape', () => {
    const text = vendorProfileTextFromToolWalkthroughTicket(
      ticket({
        initial_state: {
          vendorProfile: {
            name: 'Northwind SaaS Vendor (fictional)',
            dataTypes: ['customer PII'],
            integration: 'REST API with OAuth',
            vendorPosture: 'SOC 2 Type I only, no penetration test history',
          },
        },
      })
    );

    expect(text).toContain('data types: customer PII');
    expect(text).toContain('integration: REST API with OAuth');
    expect(text).toContain(
      'vendor posture: SOC 2 Type I only, no penetration test history'
    );
  });

  it('formats GRC-02 vendor profile facts for RAG grading', () => {
    const text = vendorProfileTextFromToolWalkthroughTicket(
      ticket({
        scenario_brief:
          'SimpleRisk: Northwind is onboarding a new SaaS vendor that will have API access to customer PII.',
        initial_state: {
          organization: { name: 'Northwind' },
          vendor: {
            dataTypes: ['customer PII'],
            integration: 'REST API with OAuth',
            postureSummary: 'SOC 2 Type I only, no penetration test history',
          },
        },
        expected_state: {
          guidanceTopics: [
            'threat-sources',
            'likelihood',
            'impact',
            'risk-determination',
          ],
          topKGuidanceSections: 5,
        },
      })
    );

    expect(text).toContain('organization: Northwind');
    expect(text).toContain('data types: customer PII');
    expect(text).toContain('integration: REST API with OAuth');
    expect(text).toContain(
      'vendor posture: SOC 2 Type I only, no penetration test history'
    );
  });
});

describe('isValidRiskRegisterId', () => {
  it('accepts SimpleRisk numeric and RISK-prefixed IDs', () => {
    expect(isValidRiskRegisterId('42')).toBe(true);
    expect(isValidRiskRegisterId('RISK-42')).toBe(true);
    expect(isValidRiskRegisterId('risk_7')).toBe(true);
    expect(isValidRiskRegisterId('not-an-id')).toBe(false);
    expect(isValidRiskRegisterId('')).toBe(false);
  });

  it('honors a custom pattern', () => {
    expect(isValidRiskRegisterId('SR-100', /^SR-\d+$/i)).toBe(true);
    expect(isValidRiskRegisterId('42', /^SR-\d+$/i)).toBe(false);
  });
});

describe('evaluateToolWalkthroughDeterministic', () => {
  it('rejects missing fields', () => {
    const result = evaluateToolWalkthroughDeterministic({}, ticket());
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_fields');
  });

  it('rejects invalid risk IDs and short justifications', () => {
    const badId = evaluateToolWalkthroughDeterministic(
      { riskRegisterId: 'abc', justification: solidJustification },
      ticket()
    );
    expect(badId.ok).toBe(false);
    expect(badId.structured.riskIdValid).toBe(false);

    const short = evaluateToolWalkthroughDeterministic(
      { riskRegisterId: '12', justification: 'too short' },
      ticket()
    );
    expect(short.ok).toBe(false);
    expect(short.structured.justificationLengthOk).toBe(false);
  });

  it('passes when ID and justification meet deterministic gates', () => {
    const result = evaluateToolWalkthroughDeterministic(
      { riskRegisterId: 'RISK-15', justification: solidJustification },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.riskIdValid).toBe(true);
    expect(DEFAULT_RISK_ID_PATTERN.test('RISK-15')).toBe(true);
  });
});

describe('toolWalkthroughTicketScorer', () => {
  beforeEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves when Claude returns satisfied against retrieved guidance', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'satisfied',
      feedback:
        'Justification ties likelihood to exploitability and impact to mission harm per SP 800-30.',
      strengths: ['Concrete likelihood factors', 'Mission-linked impact'],
      gaps: [],
    });

    const result = await toolWalkthroughTicketScorer.score(
      {
        type: 'tool_walkthrough',
        riskRegisterId: '27',
        justification: solidJustification,
      },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      style: 'tool_walkthrough',
      riskIdValid: true,
    });
    expect(
      (result.structuredResult as { retrievedSectionIds: string[] })
        .retrievedSectionIds
    ).toContain('likelihood');
    expect(callClaudeGrading).toHaveBeenCalledOnce();
    const prompt = vi.mocked(callClaudeGrading).mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('Retrieved SP 800-30 guidance');
    expect(prompt).toContain('Use only the retrieved SP 800-30');
  });

  it('retrieves required SP 800-30 sections and includes vendor profile in prompt', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'satisfied',
      feedback:
        'Threat sources and likelihood/impact are grounded in SP 800-30.',
      strengths: ['Named two threat sources'],
      gaps: [],
    });

    const vendorJustification =
      'Threat sources include an external adversary targeting the OAuth-protected REST API and an accidental insider misconfiguration. Likelihood is elevated because the vendor has SOC 2 Type I only with no penetration test history, leaving control effectiveness uncertain. Impact is high due to confidentiality harm to customer PII and mission disruption if the API is abused.';

    const result = await toolWalkthroughTicketScorer.score(
      {
        type: 'tool_walkthrough',
        riskRegisterId: 'RISK-12',
        justification: vendorJustification,
      },
      ticket({
        scenario_brief:
          'SimpleRisk: Northwind is onboarding a new SaaS vendor that will have API access to customer PII.',
        initial_state: {
          organization: { name: 'Northwind' },
          vendor: {
            dataTypes: ['customer PII'],
            integration: 'REST API with OAuth',
            postureSummary: 'SOC 2 Type I only, no penetration test history',
          },
        },
        expected_state: {
          guidanceTopics: [
            'threat-sources',
            'likelihood',
            'impact',
            'risk-determination',
          ],
          topKGuidanceSections: 5,
        },
      })
    );

    expect(result.status).toBe('resolved');
    const structured = result.structuredResult as {
      retrievedSectionIds: string[];
      guidancePath: string | null;
    };
    expect(structured.guidancePath).toContain('sp800-30');
    expect(structured.retrievedSectionIds).toEqual(
      expect.arrayContaining([
        'threat-sources',
        'likelihood',
        'impact',
        'risk-determination',
      ])
    );

    const prompt = vi.mocked(callClaudeGrading).mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('### threat-sources');
    expect(prompt).toContain('customer PII');
    expect(prompt).toContain('REST API with OAuth');
    expect(prompt).toContain('SOC 2 Type I only, no penetration test history');
    expect(prompt).toContain('Do not rely on outside knowledge');
  });

  it('needs revision when grading is not satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'insufficient_evidence',
      feedback: 'Impact harm categories are not explained.',
      strengths: ['Mentions likelihood'],
      gaps: ['No specific adverse impact categories'],
    });

    const result = await toolWalkthroughTicketScorer.score(
      {
        riskRegisterId: '3',
        justification: solidJustification,
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.feedback).toContain('Impact harm categories');
  });
});
