import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  evaluateVendorRiskRatingDeterministic,
  findMissingJustificationThemes,
  normalizeVendorRiskRatingLevel,
  vendorRiskRatingTicketScorer,
} from '@/lib/scoring/vendorRiskRating';
import { isVendorRiskRatingTicketType } from '@/lib/scoring/ticketUi';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';

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
    id: 't-vendor-risk',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'vendor_risk_rating',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief:
      'Vendor risk rating: Rate NimbusData Analytics — questionnaire looks decent but access criticality is high (SP 800-161 C-SCRM).',
    initial_state: {
      prompt:
        'Assign a vendor risk rating and justify using SP 800-161 SCRM-oriented criteria.',
      organization: {
        name: 'HarborForge Payments',
        system: 'prod-analytics-warehouse',
      },
      vendor: {
        name: 'NimbusData Analytics LLC',
        service: 'Cloud analytics / ETL into production warehouse',
        accessCriticality: {
          dataClasses: ['PII', 'financial'],
          privilegeLevel: 'read-write API to production data warehouse',
          businessImpact:
            'pipeline outage blocks monthly reporting and fraud detection',
          replaceability: 'low — 9-month switching cost',
        },
      },
      questionnaire: {
        soc2: {
          status: 'Type II',
          periodEnd: '2025-09-30',
          exceptions: 'One minor change-management exception closed',
        },
        subprocessors: [
          {
            name: 'Cascade Hosting',
            location: 'EU + APAC regions',
            role: 'Infrastructure hosting with production data access',
          },
        ],
        breachHistory: [
          {
            year: 2022,
            summary: 'Misconfigured S3 bucket; limited metadata exposure',
          },
        ],
        otherControls: {
          encryptionAtRest: true,
          mfaRequired: true,
        },
      },
      ratingScale: ['low', 'moderate', 'high', 'critical'],
      minJustificationLength: 200,
    },
    expected_state: {
      acceptableRatings: ['high', 'critical'],
      preferredRating: 'high',
      minJustificationLength: 200,
      requiredJustificationThemes: [
        'access_criticality',
        'inherent_risk',
        'scrm',
      ],
      guidanceTopics: [
        'c-scrm-overview',
        'inherent-vs-residual',
        'access-criticality',
        'questionnaire-limits',
        'rating-justification-quality',
      ],
      rejectQuestionnaireOnlyLowRatings: true,
    },
    dcwf_code: '612',
    sort_order: 1,
    ...overrides,
  };
}

const solidJustification =
  'NimbusData warrants a High vendor risk rating under SP 800-161 C-SCRM. Although the SOC 2 Type II report and MFA/encryption answers look acceptable and the only breach is an older 2022 event, inherent risk is elevated by access criticality: read-write API privilege into the production warehouse, PII and financial data classes, fraud-detection pipeline dependency, and low replaceability with a 9-month switching cost. Subprocessors with production data access further extend supply chain exposure. Questionnaire hygiene does not reduce the need for a High rating when supplier privilege and mission dependency are this high.';

describe('normalizeVendorRiskRatingLevel / themes', () => {
  it('normalizes common aliases', () => {
    expect(normalizeVendorRiskRatingLevel('High')).toBe('high');
    expect(normalizeVendorRiskRatingLevel('medium')).toBe('moderate');
    expect(normalizeVendorRiskRatingLevel('crit')).toBe('critical');
  });

  it('detects required justification themes', () => {
    expect(
      findMissingJustificationThemes(solidJustification, [
        'access_criticality',
        'inherent_risk',
        'scrm',
      ])
    ).toEqual([]);
    expect(
      findMissingJustificationThemes(
        'SOC 2 Type II looks great and there are no recent breaches so Low risk.',
        ['access_criticality', 'inherent_risk', 'scrm']
      )
    ).toEqual(['access_criticality', 'inherent_risk', 'scrm']);
  });

  it('recognizes ticket type aliases', () => {
    expect(isVendorRiskRatingTicketType('vendor_risk_rating')).toBe(true);
    expect(isVendorRiskRatingTicketType('third_party_risk_rating')).toBe(true);
    expect(isVendorRiskRatingTicketType('scrm_vendor_assessment')).toBe(true);
  });
});

describe('evaluateVendorRiskRatingDeterministic', () => {
  it('rejects missing fields', () => {
    const result = evaluateVendorRiskRatingDeterministic({}, ticket());
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_fields');
  });

  it('rejects Low/Moderate questionnaire-only ratings even with long text', () => {
    const result = evaluateVendorRiskRatingDeterministic(
      {
        rating: 'low',
        justification: solidJustification,
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('questionnaire_only_rating_too_low');
    expect(result.structured.ratingAcceptable).toBe(false);
    expect(result.feedback.toLowerCase()).toContain('access criticality');
  });

  it('rejects short justification when rating is acceptable', () => {
    const result = evaluateVendorRiskRatingDeterministic(
      {
        rating: 'high',
        justification: 'High because production access.',
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('justification_too_short');
  });

  it('rejects missing SCRM themes when rating and length are ok', () => {
    const longButWeak =
      'I rate this vendor High. The SOC 2 Type II report is current through September 2025 with only a minor closed exception. Encryption at rest and MFA are attested. Breach history shows only a 2022 metadata exposure that was remediated. Subprocessor Cascade Hosting is disclosed. Based on those questionnaire answers alone the vendor appears well controlled, so High is conservative but still appropriate for a cloud ETL provider in general.';
    expect(longButWeak.length).toBeGreaterThanOrEqual(200);

    const result = evaluateVendorRiskRatingDeterministic(
      {
        rating: 'high',
        justification: longButWeak,
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_justification_themes');
    expect(result.structured.missingThemes.length).toBeGreaterThan(0);
  });

  it('passes deterministic checks for High with criticality-aware justification', () => {
    const result = evaluateVendorRiskRatingDeterministic(
      {
        type: 'vendor_risk_rating',
        rating: 'high',
        justification: solidJustification,
      },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.ratingAcceptable).toBe(true);
    expect(result.structured.justificationLengthOk).toBe(true);
    expect(result.structured.themesOk).toBe(true);
  });

  it('accepts Critical as an acceptable elevated rating', () => {
    const result = evaluateVendorRiskRatingDeterministic(
      {
        rating: 'critical',
        justification: solidJustification,
      },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.rating).toBe('critical');
  });
});

describe('vendorRiskRatingTicketScorer', () => {
  beforeEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('registers vendor_risk_rating aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('vendor_risk_rating');
    expect(registered).toContain('third_party_risk_rating');
    expect(registered).toContain('scrm_vendor_assessment');
    expect(getTicketScorer('vendor_risk_rating')).toBe(
      vendorRiskRatingTicketScorer
    );
  });

  it('resolves when Claude returns satisfied against retrieved guidance', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'satisfied',
      feedback:
        'Justification correctly elevates for access criticality and inherent risk under C-SCRM.',
      strengths: [
        'Access criticality cited',
        'Questionnaire not treated as sole driver',
      ],
      gaps: [],
    });

    const result = await vendorRiskRatingTicketScorer.score(
      {
        type: 'vendor_risk_rating',
        rating: 'high',
        justification: solidJustification,
      },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult.ratingAcceptable).toBe(true);
    expect(result.structuredResult.guidancePath).toBe(
      'data/nist/sp800-161-scrm-guidance.json'
    );
    expect(callClaudeGrading).toHaveBeenCalledTimes(1);
    const prompt = vi.mocked(callClaudeGrading).mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('SP 800-161');
    expect(prompt).toContain('access criticality');
  });

  it('needs_revision when Claude finds questionnaire-only reasoning', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'not_satisfied',
      feedback:
        'Justification still leans on SOC 2 without weighing production privilege.',
      strengths: [],
      gaps: ['Missing access criticality analysis'],
    });

    const result = await vendorRiskRatingTicketScorer.score(
      {
        rating: 'high',
        justification: solidJustification,
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult.reason).toBe('grading_not_satisfied');
  });

  it('needs_revision when ANTHROPIC_API_KEY is missing after deterministic pass', async () => {
    const { MissingAnthropicApiKeyError } =
      await import('@/lib/grading/callClaudeGrading');
    vi.mocked(callClaudeGrading).mockRejectedValue(
      new MissingAnthropicApiKeyError()
    );

    const result = await vendorRiskRatingTicketScorer.score(
      {
        rating: 'high',
        justification: solidJustification,
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult.reason).toBe(
      'grading_unavailable_missing_api_key'
    );
    expect(result.feedback).toContain('ANTHROPIC_API_KEY');
  });
});
