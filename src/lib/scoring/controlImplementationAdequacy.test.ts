import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  evaluateControlImplementationAdequacyDeterministic,
  controlImplementationAdequacyTicketScorer,
} from '@/lib/scoring/controlImplementationAdequacy';

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
    id: 't-cia',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 1,
    ticket_type: 'control_implementation_adequacy',
    difficulty: 'medium',
    sla_minutes: 30,
    scenario_brief:
      'Judge whether the HarborNet CMS AC-2 implementation statement is adequate.',
    initial_state: {
      controlId: 'AC-2',
      controlTitle: 'Account Management',
      systemName: 'HarborNet CMS',
      implementationStatement:
        'User accounts for HarborNet CMS are managed appropriately by IT staff in accordance with organizational security practices.',
      prompt:
        'Judge whether the implementation statement adequately addresses the control requirements.',
    },
    expected_state: {
      expectedJudgment: 'inadequate',
      controlId: 'AC-2',
      minJustificationLength: 80,
      guidanceTopics: [],
    },
    dcwf_code: '612',
    sort_order: 1,
    ...overrides,
  };
}

const solidJustification =
  'The statement is inadequate for AC-2 because it only says accounts are "managed appropriately" without defining account types, assigning account managers, describing create/enable/modify/disable/remove procedures, account reviews, or termination/transfer notifications required by the control statement.';

describe('evaluateControlImplementationAdequacyDeterministic', () => {
  it('rejects missing expectedJudgment', () => {
    const result = evaluateControlImplementationAdequacyDeterministic(
      { judgment: 'inadequate', justification: solidJustification },
      ticket({ expected_state: { controlId: 'AC-2' } })
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('misconfigured_expected_state');
  });

  it('rejects missing fields', () => {
    const result = evaluateControlImplementationAdequacyDeterministic(
      {},
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_fields');
  });

  it('rejects incorrect judgment even with a long justification', () => {
    const result = evaluateControlImplementationAdequacyDeterministic(
      {
        judgment: 'adequate',
        justification: solidJustification,
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('incorrect_judgment');
    expect(result.structured.judgmentMatch).toBe(false);
    expect(result.structured.expectedJudgment).toBe('inadequate');
  });

  it('rejects short justification when judgment matches', () => {
    const result = evaluateControlImplementationAdequacyDeterministic(
      {
        judgment: 'inadequate',
        justification: 'Too vague.',
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('justification_too_short');
  });

  it('passes when judgment matches and justification meets length', () => {
    const result = evaluateControlImplementationAdequacyDeterministic(
      {
        type: 'control_implementation_adequacy',
        judgment: 'inadequate',
        justification: solidJustification,
      },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.judgmentMatch).toBe(true);
    expect(result.structured.justificationLengthOk).toBe(true);
    expect(result.structured.controlId).toBe('AC-2');
  });
});

describe('controlImplementationAdequacyTicketScorer', () => {
  beforeEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves when Claude returns satisfied against retrieved control text', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'satisfied',
      feedback:
        'Justification correctly cites missing AC-2 account lifecycle requirements.',
      strengths: ['Cites create/disable/review gaps', 'Tied to statement vagueness'],
      gaps: [],
    });

    const result = await controlImplementationAdequacyTicketScorer.score(
      {
        type: 'control_implementation_adequacy',
        judgment: 'inadequate',
        justification: solidJustification,
      },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      style: 'control_implementation_adequacy',
      judgment: 'inadequate',
      judgmentMatch: true,
      catalogPath: 'data/oscal/NIST_SP-800-53_rev5_catalog.json',
    });
    expect(callClaudeGrading).toHaveBeenCalledOnce();
    const prompt = vi.mocked(callClaudeGrading).mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('Retrieved control statement');
    expect(prompt).toContain('Use only the control title and statement');
    expect(prompt).toContain('Account Management');
    expect(prompt).toContain('managed appropriately');
  });

  it('needs revision when grading is not satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'insufficient_evidence',
      feedback: 'No specific AC-2 requirements are cited.',
      strengths: ['Chose inadequate'],
      gaps: ['Missing citation to account lifecycle requirements'],
    });

    const result = await controlImplementationAdequacyTicketScorer.score(
      {
        judgment: 'inadequate',
        justification: solidJustification,
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.feedback).toContain('No specific AC-2 requirements');
  });

  it('needs revision when API key is missing after deterministic pass', async () => {
    const { MissingAnthropicApiKeyError } =
      await import('@/lib/grading/callClaudeGrading');
    vi.mocked(callClaudeGrading).mockRejectedValue(
      new MissingAnthropicApiKeyError()
    );

    const result = await controlImplementationAdequacyTicketScorer.score(
      {
        judgment: 'inadequate',
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
