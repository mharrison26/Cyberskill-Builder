import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  evaluateCoachingFeedbackDeterministic,
  extractCoachingFeedbackSubmission,
  extractJuniorNotesFromInitialState,
  coachingFeedbackTicketScorer,
} from '@/lib/scoring/coachingFeedback';

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
    id: 't-coach-hd04',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 1,
    ticket_type: 'coaching_feedback',
    difficulty: 'medium',
    sla_minutes: 40,
    scenario_brief:
      'HD-04: Review a junior technician’s thin ticket notes and write specific, actionable, respectful coaching feedback.',
    initial_state: {
      ticketCode: 'HD-04',
      title: 'Peer coaching — junior VPN ticket notes',
      juniorTech: 'Alex Rivera (Tier-1, week 3)',
      juniorNotes:
        'user yelled about vpn. reset stuff. told them to reboot lol. fixed i guess. closing.',
    },
    expected_state: {
      minFieldLength: 40,
      guidanceTopics: ['specific', 'actionable', 'respectful'],
      topKGuidanceSections: 5,
    },
    dcwf_code: '411',
    sort_order: 4,
    ...overrides,
  };
}

const solidSubmission = {
  type: 'coaching_feedback',
  strengths:
    'Alex contacted the user and attempted a restart path, which shows they tried to restore access quickly rather than leaving the ticket idle.',
  gaps: 'The notes say “reset stuff” and “fixed i guess” with no identity verification, no ordered troubleshooting, and no confirmation the user could reconnect. “lol” and “user yelled” are unprofessional for an auditable ticket.',
  actionItems:
    '1. Use a note template: problem → steps tried → change made → verification with user.\n2. Never close without a verification line.\n3. Replace slang with neutral wording (customer reported frustration; guided reboot; confirmed VPN connected).',
  delivery:
    'Alex, thanks for jumping on this quickly. For the next VPN ticket, let’s tighten the notes so another agent could follow them: list each step, drop the slang, and always include how you verified the user was back online before closing.',
};

describe('extractCoachingFeedbackSubmission', () => {
  it('accepts camelCase and snake_case field names', () => {
    expect(extractCoachingFeedbackSubmission(solidSubmission)).toMatchObject({
      strengths: solidSubmission.strengths,
      actionItems: solidSubmission.actionItems,
    });

    const snake = extractCoachingFeedbackSubmission({
      strengths: solidSubmission.strengths,
      gaps: solidSubmission.gaps,
      action_items: solidSubmission.actionItems,
      delivery_notes: solidSubmission.delivery,
    });
    expect(snake?.actionItems).toBe(solidSubmission.actionItems);
    expect(snake?.delivery).toBe(solidSubmission.delivery);
  });

  it('returns null when a field is missing', () => {
    expect(
      extractCoachingFeedbackSubmission({
        strengths: solidSubmission.strengths,
        gaps: solidSubmission.gaps,
      })
    ).toBeNull();
  });
});

describe('extractJuniorNotesFromInitialState', () => {
  it('reads juniorNotes string and nested body', () => {
    expect(
      extractJuniorNotesFromInitialState(ticket().initial_state)
    ).toContain('reset stuff');

    expect(
      extractJuniorNotesFromInitialState({
        junior_notes: { body: 'nested note body with missing steps' },
      })
    ).toBe('nested note body with missing steps');
  });
});

describe('evaluateCoachingFeedbackDeterministic', () => {
  it('rejects missing fields', () => {
    const result = evaluateCoachingFeedbackDeterministic({}, ticket());
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_fields');
  });

  it('rejects short fields', () => {
    const result = evaluateCoachingFeedbackDeterministic(
      {
        strengths: 'Too short',
        gaps: 'Too short',
        actionItems: 'Too short',
        delivery: 'Too short',
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('fields_too_short');
  });

  it('passes a complete coaching submission', () => {
    const result = evaluateCoachingFeedbackDeterministic(
      solidSubmission,
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.fieldsOk).toBe(true);
  });
});

describe('coachingFeedbackTicketScorer', () => {
  beforeEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns needs_revision when API key is missing', async () => {
    const { MissingAnthropicApiKeyError } =
      await import('@/lib/grading/callClaudeGrading');
    vi.mocked(callClaudeGrading).mockRejectedValue(
      new MissingAnthropicApiKeyError()
    );

    const result = await coachingFeedbackTicketScorer.score(
      solidSubmission,
      ticket()
    );
    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult.reason).toBe(
      'grading_unavailable_missing_api_key'
    );
  });

  it('resolves when rubric grading is satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'satisfied',
      feedback:
        'Specific, actionable, and respectful coaching tied to the junior notes.',
      strengths: ['Cited “reset stuff” and “lol”', 'Gave a note template'],
      gaps: [],
    });

    const result = await coachingFeedbackTicketScorer.score(
      solidSubmission,
      ticket()
    );
    expect(result.status).toBe('resolved');
    expect(result.feedback).toContain('Specific, actionable');
    expect(result.structuredResult.retrievedSectionIds).toEqual(
      expect.arrayContaining(['specific', 'actionable', 'respectful'])
    );
    expect(callClaudeGrading).toHaveBeenCalledTimes(1);
    const prompt = vi.mocked(callClaudeGrading).mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('Retrieved coaching-quality rubric');
    expect(prompt).toContain('reset stuff');
  });

  it('needs revision when grading finds gaps', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'not_satisfied',
      feedback: 'Feedback is too generic and does not cite the notes.',
      strengths: ['Tone is polite'],
      gaps: ['No specific quotation from the junior notes'],
    });

    const result = await coachingFeedbackTicketScorer.score(
      solidSubmission,
      ticket()
    );
    expect(result.status).toBe('needs_revision');
    expect(result.feedback).toContain('generic');
  });
});
