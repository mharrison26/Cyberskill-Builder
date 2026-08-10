import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  evaluateSecMaterialityDeterministic,
  SEC_MATERIALITY_FACTOR_KEYS,
  secMaterialityTicketScorer,
} from '@/lib/scoring/secMateriality';

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
    id: 't-sec',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'sec_materiality',
    difficulty: 'high',
    sla_minutes: 60,
    scenario_brief:
      'Northline Analytics ransomware hit order systems and exfiltrated customer PII.',
    initial_state: {},
    expected_state: {},
    dcwf_code: '612',
    sort_order: 1,
    ...overrides,
  };
}

const solidFactor =
  'The ransomware encrypted production order-entry systems for 36 hours and attackers exfiltrated approximately 180,000 customer records including names, emails, and hashed passwords, creating clear investor-relevant operational and confidentiality harm.';

function solidFactors(): Record<string, string> {
  return Object.fromEntries(
    SEC_MATERIALITY_FACTOR_KEYS.map((key) => [key, `${key}: ${solidFactor}`])
  );
}

const solidRationale =
  'Based on the operational outage, customer data exfiltration, and likely remediation plus litigation costs, a reasonable investor would consider this important. We determine the incident material as of Day 2 after containment facts stabilized, starting the Item 1.05 four-business-day clock.';

describe('evaluateSecMaterialityDeterministic', () => {
  it('rejects missing fields', () => {
    const result = evaluateSecMaterialityDeterministic({}, ticket());
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_fields');
  });

  it('rejects missing or short factor sections', () => {
    const factors = solidFactors();
    delete factors.financial_impact;

    const missing = evaluateSecMaterialityDeterministic(
      {
        determination: 'material',
        determinationRationale: solidRationale,
        factors,
      },
      ticket()
    );
    expect(missing.ok).toBe(false);
    expect(missing.structured.missingFactors).toContain('financial_impact');

    const shortFactors = solidFactors();
    shortFactors.nature_scope = 'too short';
    const short = evaluateSecMaterialityDeterministic(
      {
        determination: 'material',
        determinationRationale: solidRationale,
        factors: shortFactors,
      },
      ticket()
    );
    expect(short.ok).toBe(false);
    expect(short.structured.shortFactors).toContain('nature_scope');
  });

  it('passes when determination, rationale, and all factors meet gates', () => {
    const result = evaluateSecMaterialityDeterministic(
      {
        type: 'sec_materiality',
        determination: 'not_material',
        determinationRationale: solidRationale,
        factors: solidFactors(),
      },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.determination).toBe('not_material');
    expect(result.structured.missingFactors).toEqual([]);
    expect(result.structured.rationaleOk).toBe(true);
  });

  it('enforces GRC-08 requiredFactors and min lengths from expected_state', () => {
    const factors = solidFactors();
    delete factors.reputational_legal;

    const missing = evaluateSecMaterialityDeterministic(
      {
        determination: 'not_material',
        determinationRationale: solidRationale,
        factors,
      },
      ticket({
        expected_state: {
          judgmentCall: true,
          minFactorLength: 40,
          minRationaleLength: 60,
          requiredFactors: [
            'nature_scope',
            'data_compromise',
            'operational_impact',
            'financial_impact',
            'reputational_legal',
            'reasonable_investor',
          ],
        },
      })
    );
    expect(missing.ok).toBe(false);
    expect(missing.structured.missingFactors).toEqual(['reputational_legal']);
    expect(missing.structured.minFactorLength).toBe(40);
    expect(missing.structured.minRationaleLength).toBe(60);
  });
});

describe('secMaterialityTicketScorer', () => {
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
        'Memo applies the reasonable-investor test and covers Item 1.05 timing.',
      strengths: ['Clear determination', 'Factor coverage'],
      gaps: [],
    });

    const result = await secMaterialityTicketScorer.score(
      {
        type: 'sec_materiality',
        determination: 'material',
        determinationRationale: solidRationale,
        factors: solidFactors(),
      },
      ticket({
        scenario_brief:
          "A vendor Northwind uses for payment processing just disclosed a breach that exposed a subset of Northwind's customer records. As the person drafting the initial materiality assessment, determine whether this triggers the SEC's 4-business-day 8-K disclosure requirement and draft the determination memo.",
        initial_state: {
          keyArtifact:
            "Breach scenario details: systems affected (payment vendor's own systems, not Northwind's), data exposed (names, emails, last-4 card digits), estimated customers impacted (~4,000), vendor's remediation status (contained, forensics ongoing).",
          breach: {
            company: 'Northwind Retail Technology',
            systemsAffected: "payment vendor's own systems, not Northwind's",
            customersImpacted: '~4,000',
            scopeNote:
              "Vendor breach (not a direct Northwind breach); exposed a subset of Northwind's customer records.",
          },
        },
        expected_state: {
          gradingFocus:
            "RAG-graded against the SEC cybersecurity disclosure rule's materiality factors -- does the memo address each factor (financial impact, reputational impact, operational impact, legal/regulatory exposure), not just assert a conclusion.",
          judgmentCall: true,
        },
      })
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      style: 'sec_materiality',
      determination: 'material',
    });
    expect(
      (result.structuredResult as { retrievedSectionIds: string[] })
        .retrievedSectionIds
    ).toContain('reasonable-investor');
    expect(callClaudeGrading).toHaveBeenCalledOnce();
    const prompt = vi.mocked(callClaudeGrading).mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('Retrieved SEC materiality guidance');
    expect(prompt).toContain('Use only the retrieved guidance');
    expect(prompt).toContain('Educational summary');
    expect(prompt).toContain('deliberately ambiguous');
    expect(prompt).toContain("payment vendor's own systems, not Northwind's");
    expect(prompt).toContain('not just assert a conclusion');
  });

  it('needs revision when grading is not satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'insufficient_evidence',
      feedback: 'Four-business-day timing is not explained.',
      strengths: ['Mentions data exposure'],
      gaps: ['No determination timing analysis'],
    });

    const result = await secMaterialityTicketScorer.score(
      {
        determination: 'material',
        determinationRationale: solidRationale,
        factors: solidFactors(),
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.feedback).toContain('Four-business-day timing');
  });
});
