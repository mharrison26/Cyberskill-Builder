import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  evaluateFips199Deterministic,
  fips199ImpactCategorizationTicketScorer,
  highWaterMark,
  normalizeFips199ImpactLevel,
} from '@/lib/scoring/fips199ImpactCategorization';

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
    id: 't-fips199',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'fips_199_impact_categorization',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief:
      'FIPS 199: Categorize RiverWatch Flood Decision Support for C/I/A and overall high-water mark.',
    initial_state: {
      systemProfile: {
        name: 'RiverWatch Flood Decision Support System',
        mission:
          'Supports state emergency management flood watch/warning decisions for 12 counties.',
        dataTypes: [
          'Public river gauge telemetry',
          'Resident contact lists (PII) for evacuation zones',
          'Evacuation zone maps used for go/no-go decisions',
        ],
      },
    },
    expected_state: {
      confidentiality: 'moderate',
      integrity: 'high',
      availability: 'moderate',
      overall: 'high',
      minJustificationLength: 80,
      guidanceTopics: [
        'security-objectives',
        'impact-definitions',
        'high-water-mark',
        'information-types',
        'justification-quality',
      ],
    },
    dcwf_code: '612',
    sort_order: 1,
    ...overrides,
  };
}

const solidJustification =
  'Confidentiality is Moderate because resident contact lists are PII; unauthorized disclosure would cause serious privacy harm but not catastrophic national-level loss. Integrity is High because corrupted gauge readings or altered evacuation maps could drive wrong evacuate/shelter decisions with severe life-safety consequences. Availability is Moderate: multi-hour outage significantly degrades warning decisions, but redundant gauges and phone trees provide partial fallbacks, so loss is serious rather than catastrophic. Overall is High by high-water mark of the three objectives.';

describe('normalizeFips199ImpactLevel / highWaterMark', () => {
  it('normalizes common aliases', () => {
    expect(normalizeFips199ImpactLevel('Moderate')).toBe('moderate');
    expect(normalizeFips199ImpactLevel('medium')).toBe('moderate');
    expect(normalizeFips199ImpactLevel('fips-199-high')).toBe('high');
  });

  it('computes high-water mark', () => {
    expect(highWaterMark('moderate', 'high', 'moderate')).toBe('high');
    expect(highWaterMark('low', 'low', 'moderate')).toBe('moderate');
  });
});

describe('evaluateFips199Deterministic', () => {
  it('rejects missing expected levels', () => {
    const result = evaluateFips199Deterministic(
      {
        confidentiality: 'moderate',
        integrity: 'high',
        availability: 'moderate',
        overall: 'high',
        justification: solidJustification,
      },
      ticket({ expected_state: {} })
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('misconfigured_expected_state');
  });

  it('rejects missing fields', () => {
    const result = evaluateFips199Deterministic({}, ticket());
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_fields');
  });

  it('rejects incorrect levels even with a long justification', () => {
    const result = evaluateFips199Deterministic(
      {
        confidentiality: 'high',
        integrity: 'high',
        availability: 'moderate',
        overall: 'high',
        justification: solidJustification,
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('incorrect_levels');
    expect(result.structured.mismatchedObjectives).toContain('confidentiality');
    expect(result.structured.levelsMatch).toBe(false);
  });

  it('rejects short justification when levels match', () => {
    const result = evaluateFips199Deterministic(
      {
        confidentiality: 'moderate',
        integrity: 'high',
        availability: 'moderate',
        overall: 'high',
        justification: 'Looks high impact.',
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('justification_too_short');
  });

  it('passes when levels match and justification meets length', () => {
    const result = evaluateFips199Deterministic(
      {
        type: 'fips_199_impact_categorization',
        confidentiality: 'moderate',
        integrity: 'high',
        availability: 'moderate',
        overall: 'high',
        justification: solidJustification,
      },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.levelsMatch).toBe(true);
    expect(result.structured.overallMatchesHighWaterMark).toBe(true);
    expect(result.structured.justificationLengthOk).toBe(true);
    expect(result.structured.highWaterMark).toBe('high');
  });
});

describe('fips199ImpactCategorizationTicketScorer', () => {
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
        'Justification ties PII and life-safety mission effects to Moderate/High definitions and applies the high-water mark.',
      strengths: [
        'Concrete data-type citations',
        'High-water mark explained',
      ],
      gaps: [],
    });

    const result = await fips199ImpactCategorizationTicketScorer.score(
      {
        type: 'fips_199_impact_categorization',
        confidentiality: 'moderate',
        integrity: 'high',
        availability: 'moderate',
        overall: 'high',
        justification: solidJustification,
      },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      style: 'fips_199_impact_categorization',
      levelsMatch: true,
      overall: 'high',
    });
    expect(
      (result.structuredResult as { retrievedSectionIds: string[] })
        .retrievedSectionIds
    ).toContain('high-water-mark');
    expect(callClaudeGrading).toHaveBeenCalledOnce();
    const prompt = vi.mocked(callClaudeGrading).mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('Retrieved FIPS 199 guidance');
    expect(prompt).toContain('Use only the retrieved guidance');
    expect(prompt).toContain('high-water mark');
  });

  it('needs revision when grading is not satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'insufficient_evidence',
      feedback: 'Does not explain the high-water mark for overall.',
      strengths: ['Selected correct levels'],
      gaps: ['Missing high-water mark explanation'],
    });

    const result = await fips199ImpactCategorizationTicketScorer.score(
      {
        confidentiality: 'moderate',
        integrity: 'high',
        availability: 'moderate',
        overall: 'high',
        justification: solidJustification,
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.feedback).toContain('high-water mark');
  });

  it('needs revision when API key is missing after deterministic pass', async () => {
    const { MissingAnthropicApiKeyError } =
      await import('@/lib/grading/callClaudeGrading');
    vi.mocked(callClaudeGrading).mockRejectedValue(
      new MissingAnthropicApiKeyError()
    );

    const result = await fips199ImpactCategorizationTicketScorer.score(
      {
        confidentiality: 'moderate',
        integrity: 'high',
        availability: 'moderate',
        overall: 'high',
        justification: solidJustification,
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult).toMatchObject({
      reason: 'grading_unavailable_missing_api_key',
    });
  });
});
