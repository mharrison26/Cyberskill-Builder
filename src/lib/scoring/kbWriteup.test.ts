import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  evaluateKbWriteupDeterministic,
  extractKbWriteupSubmission,
  kbWriteupTicketScorer,
} from '@/lib/scoring/kbWriteup';

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
    id: 't-kb-hd02',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 1,
    ticket_type: 'kb_writeup',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief:
      'HD-03: After resolving the VPN MFA lockout, document the fix as a KB article.',
    initial_state: {
      ticketCode: 'HD-03',
      title: 'VPN MFA approval timeout — document for KB',
      requester: 'Jordan Lee (Contractor)',
    },
    expected_state: {
      minFieldLength: 40,
      guidanceTopics: ['clarity', 'completeness', 'jargon'],
      topKGuidanceSections: 5,
    },
    dcwf_code: '411',
    sort_order: 2,
    ...overrides,
  };
}

const solidSubmission = {
  type: 'kb_writeup',
  problem:
    'Contractor Jordan Lee could not connect to the corporate VPN after approving an MFA prompt late; the client showed a timeout and their account was temporarily locked out of remote access.',
  rootCause:
    'The VPN client session expired while waiting for multi-factor authentication (MFA). Jordan approved the push after the timeout window, which counted as a failed attempt and triggered the temporary lockout policy.',
  resolutionSteps:
    '1. Confirmed the VPN error and lockout status in the identity portal.\n2. Cleared the temporary lockout and asked Jordan to cancel stale MFA prompts.\n3. Guided Jordan to reconnect and approve the MFA push within 60 seconds.\n4. Verified: VPN connected and Jordan could open the intranet home page.',
  preventionTip:
    'Tell users to cancel old MFA prompts and only approve a push when they just clicked Connect on the VPN client; document the 60-second approval window in the onboarding checklist.',
};

describe('extractKbWriteupSubmission', () => {
  it('accepts camelCase and snake_case field names', () => {
    expect(extractKbWriteupSubmission(solidSubmission)).toMatchObject({
      problem: solidSubmission.problem,
      rootCause: solidSubmission.rootCause,
    });

    const snake = extractKbWriteupSubmission({
      problem: solidSubmission.problem,
      root_cause: solidSubmission.rootCause,
      resolution_steps: solidSubmission.resolutionSteps,
      prevention_tip: solidSubmission.preventionTip,
    });
    expect(snake?.rootCause).toBe(solidSubmission.rootCause);
    expect(snake?.resolutionSteps).toBe(solidSubmission.resolutionSteps);
  });

  it('returns null when a field is missing', () => {
    expect(
      extractKbWriteupSubmission({
        problem: solidSubmission.problem,
        rootCause: solidSubmission.rootCause,
      })
    ).toBeNull();
  });
});

describe('evaluateKbWriteupDeterministic', () => {
  it('rejects missing fields', () => {
    const result = evaluateKbWriteupDeterministic({}, ticket());
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_fields');
  });

  it('rejects short fields', () => {
    const result = evaluateKbWriteupDeterministic(
      {
        problem: 'Too short',
        rootCause: 'Too short',
        resolutionSteps: 'Too short',
        preventionTip: 'Too short',
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('fields_too_short');
  });

  it('passes a complete write-up', () => {
    const result = evaluateKbWriteupDeterministic(solidSubmission, ticket());
    expect(result.ok).toBe(true);
    expect(result.structured.fieldsOk).toBe(true);
  });
});

describe('kbWriteupTicketScorer', () => {
  beforeEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns needs_revision when API key is missing', async () => {
    const { MissingAnthropicApiKeyError } = await import(
      '@/lib/grading/callClaudeGrading'
    );
    vi.mocked(callClaudeGrading).mockRejectedValue(
      new MissingAnthropicApiKeyError()
    );

    const result = await kbWriteupTicketScorer.score(solidSubmission, ticket());
    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult.reason).toBe(
      'grading_unavailable_missing_api_key'
    );
  });

  it('resolves when rubric grading is satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'satisfied',
      feedback: 'Clear, complete KB article with jargon explained.',
      strengths: ['Ordered verification step', 'MFA expanded on first use'],
      gaps: [],
    });

    const result = await kbWriteupTicketScorer.score(solidSubmission, ticket());
    expect(result.status).toBe('resolved');
    expect(result.feedback).toContain('Clear, complete');
    expect(result.structuredResult.retrievedSectionIds).toEqual(
      expect.arrayContaining(['clarity', 'completeness', 'jargon'])
    );
    expect(callClaudeGrading).toHaveBeenCalledTimes(1);
  });

  it('needs revision when grading finds gaps', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'insufficient_evidence',
      feedback: 'Prevention tip is too generic.',
      strengths: ['Problem is concrete'],
      gaps: ['Prevention tip lacks a concrete action'],
    });

    const result = await kbWriteupTicketScorer.score(solidSubmission, ticket());
    expect(result.status).toBe('needs_revision');
    expect(result.feedback).toContain('Prevention tip');
  });
});
