import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  evaluateCustomerReplyDeterministic,
  extractCustomerEmailFromInitialState,
  customerReplyTicketScorer,
} from '@/lib/scoring/customerReply';

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
    id: 't-customer-reply',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 1,
    ticket_type: 'customer_reply',
    difficulty: 'medium',
    sla_minutes: 30,
    scenario_brief:
      'Customer has been locked out of email for three days and is angry.',
    initial_state: {
      customerEmail: {
        from: 'Jordan Hale <jordan.hale@example.com>',
        subject: 'UNACCEPTABLE — still locked out!',
        body: 'I have been locked out for THREE DAYS. Fix this NOW.',
      },
    },
    expected_state: {
      minReplyLength: 80,
      guidanceTopics: [
        'acknowledge-frustration',
        'state-next-steps',
        'avoid-jargon',
        'professional-tone',
      ],
    },
    dcwf_code: '411',
    sort_order: 1,
    ...overrides,
  };
}

const solidReply =
  "Hi Jordan — I'm sorry you've been locked out for three days; that is frustrating and we should have resolved this sooner. I am unlocking your account now and sending a password reset link to this email within the next 15 minutes. If you do not receive it, reply here and I will call you within two business hours to walk through recovery. Thank you for your patience while we get you back online.";

describe('extractCustomerEmailFromInitialState', () => {
  it('reads nested customerEmail fields', () => {
    const email = extractCustomerEmailFromInitialState({
      customerEmail: {
        from: 'A <a@example.com>',
        subject: 'Help',
        body: 'Broken',
      },
    });
    expect(email.from).toContain('A');
    expect(email.subject).toBe('Help');
    expect(email.body).toBe('Broken');
  });
});

describe('evaluateCustomerReplyDeterministic', () => {
  it('rejects missing reply', () => {
    const result = evaluateCustomerReplyDeterministic({}, ticket());
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_fields');
  });

  it('rejects short replies', () => {
    const result = evaluateCustomerReplyDeterministic(
      { reply: 'Sorry, on it.' },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.replyLengthOk).toBe(false);
  });

  it('passes when reply meets minimum length', () => {
    const result = evaluateCustomerReplyDeterministic(
      { reply: solidReply },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.replyLengthOk).toBe(true);
  });
});

describe('customerReplyTicketScorer', () => {
  beforeEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves when Claude returns satisfied against pinned rubric', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'satisfied',
      feedback:
        'Reply acknowledges frustration, states unlock/reset next steps, and stays professional without jargon.',
      strengths: ['Clear empathy', 'Concrete timeline'],
      gaps: [],
    });

    const result = await customerReplyTicketScorer.score(
      { type: 'customer_reply', reply: solidReply },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      style: 'customer_reply',
      replyLengthOk: true,
    });
    expect(
      (result.structuredResult as { retrievedSectionIds: string[] })
        .retrievedSectionIds
    ).toEqual(
      expect.arrayContaining([
        'acknowledge-frustration',
        'state-next-steps',
        'avoid-jargon',
        'professional-tone',
      ])
    );
    expect(callClaudeGrading).toHaveBeenCalledOnce();
    const prompt = vi.mocked(callClaudeGrading).mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('Retrieved customer-communication rubric');
    expect(prompt).toContain('Use only the retrieved rubric sections');
    expect(prompt).toContain('Do not rely on outside knowledge');
    expect(prompt).toContain('Pinned path:');
    expect(prompt).toContain('still locked out');
    expect(prompt).toContain(solidReply.slice(0, 40));
  });

  it('needs revision when grading is not satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'insufficient_evidence',
      feedback: 'Next steps are vague and jargon appears unexplained.',
      strengths: ['Mentions apology'],
      gaps: ['No concrete timeline', 'Uses unexplained IdP jargon'],
    });

    const result = await customerReplyTicketScorer.score(
      { reply: solidReply },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.feedback).toContain('Next steps are vague');
    expect(result.feedback).toContain('Gaps:');
  });

  it('needs revision when Anthropic API key is missing', async () => {
    const { MissingAnthropicApiKeyError } =
      await import('@/lib/grading/callClaudeGrading');
    vi.mocked(callClaudeGrading).mockRejectedValue(
      new MissingAnthropicApiKeyError()
    );

    const result = await customerReplyTicketScorer.score(
      { reply: solidReply },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult).toMatchObject({
      reason: 'grading_unavailable_missing_api_key',
    });
    expect(result.feedback).toContain('ANTHROPIC_API_KEY');
  });
});
