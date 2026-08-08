import { describe, expect, it } from 'vitest';

import {
  evaluateMockDirectoryDeterministic,
  extractMockDirectorySubmission,
  matchRequiredActions,
  mockDirectoryTicketScorer,
  parseMockDirectoryExpectedState,
  parseMockDirectoryUsers,
} from '@/lib/scoring/mockDirectory';
import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-dir-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 1,
    ticket_type: 'mock_directory',
    difficulty: 'medium',
    sla_minutes: 30,
    scenario_brief: 'Unlock and reset jdoe after verifying identity.',
    initial_state: {
      mock_directory_users: [
        {
          id: 'u-jdoe',
          username: 'jdoe',
          displayName: 'Jordan Doe',
          email: 'jdoe@example.com',
          department: 'Finance',
          status: 'locked',
          identityQuestion: 'What is your employee badge number?',
          identityAnswer: 'HF-4412',
        },
        {
          id: 'u-asmith',
          username: 'asmith',
          displayName: 'Alex Smith',
          email: 'asmith@example.com',
          status: 'active',
        },
      ],
    },
    expected_state: {
      requireOrdered: true,
      requiredActions: [
        { type: 'search', query: 'jdoe' },
        { type: 'verify_identity', userId: 'u-jdoe' },
        { type: 'unlock', userId: 'u-jdoe' },
        { type: 'reset_password', userId: 'u-jdoe' },
      ],
    },
    dcwf_code: '722',
    sort_order: 1,
    ...overrides,
  };
}

const completeActions = [
  {
    type: 'search' as const,
    query: 'jdoe',
    at: '2026-08-08T12:00:00.000Z',
  },
  {
    type: 'verify_identity' as const,
    userId: 'u-jdoe',
    correct: true,
    at: '2026-08-08T12:01:00.000Z',
  },
  {
    type: 'unlock' as const,
    userId: 'u-jdoe',
    at: '2026-08-08T12:02:00.000Z',
  },
  {
    type: 'reset_password' as const,
    userId: 'u-jdoe',
    at: '2026-08-08T12:03:00.000Z',
  },
];

describe('mockDirectory parsers', () => {
  it('registers mock_directory and aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('mock_directory');
    expect(registered).toContain('directory_reset');
    expect(registered).toContain('account_unlock');
    expect(getTicketScorer('directory_reset')).toBe(
      getTicketScorer('mock_directory')
    );
  });

  it('parses mock_directory_users from initial_state', () => {
    const users = parseMockDirectoryUsers(ticket().initial_state);
    expect(users).toHaveLength(2);
    expect(users[0]).toMatchObject({
      id: 'u-jdoe',
      username: 'jdoe',
      status: 'locked',
      identityAnswer: 'HF-4412',
    });
  });

  it('parses requiredActions including string shorthand', () => {
    const parsed = parseMockDirectoryExpectedState({
      requiredActions: [
        'search:jdoe',
        'verify_identity:u-jdoe',
        { type: 'unlock', userId: 'u-jdoe' },
      ],
    });
    expect(parsed.requireOrdered).toBe(true);
    expect(parsed.requiredActions).toEqual([
      { type: 'search', query: 'jdoe' },
      { type: 'verify_identity', userId: 'u-jdoe' },
      { type: 'unlock', userId: 'u-jdoe' },
    ]);
  });

  it('extracts actions from submission aliases', () => {
    const parsed = extractMockDirectorySubmission({
      action_log: completeActions,
    });
    expect(parsed?.actions).toHaveLength(4);
    expect(parsed?.actions[1]?.correct).toBe(true);
  });
});

describe('matchRequiredActions', () => {
  it('matches ordered subsequence and rejects out-of-order verify/reset', () => {
    const required = [
      { type: 'verify_identity' as const, userId: 'u-jdoe' },
      { type: 'reset_password' as const, userId: 'u-jdoe' },
    ];

    const ordered = matchRequiredActions(
      [
        {
          type: 'verify_identity',
          userId: 'u-jdoe',
          correct: true,
          at: 't1',
        },
        { type: 'reset_password', userId: 'u-jdoe', at: 't2' },
      ],
      required,
      true
    );
    expect(ordered.matchedCount).toBe(2);

    const outOfOrder = matchRequiredActions(
      [
        { type: 'reset_password', userId: 'u-jdoe', at: 't1' },
        {
          type: 'verify_identity',
          userId: 'u-jdoe',
          correct: true,
          at: 't2',
        },
      ],
      required,
      true
    );
    expect(outOfOrder.matchedCount).toBe(1);
    expect(outOfOrder.missingActions[0]?.type).toBe('reset_password');
  });

  it('requires correct:true for verify_identity', () => {
    const result = matchRequiredActions(
      [
        {
          type: 'verify_identity',
          userId: 'u-jdoe',
          correct: false,
          at: 't1',
        },
      ],
      [{ type: 'verify_identity', userId: 'u-jdoe' }],
      true
    );
    expect(result.matchedCount).toBe(0);
  });
});

describe('evaluateMockDirectoryDeterministic', () => {
  it('rejects missing actions array', () => {
    const result = evaluateMockDirectoryDeterministic({}, ticket());
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_actions');
  });

  it('rejects incomplete required actions', () => {
    const result = evaluateMockDirectoryDeterministic(
      {
        actions: [
          { type: 'search', query: 'jdoe', at: 't1' },
          { type: 'unlock', userId: 'u-jdoe', at: 't2' },
        ],
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('incomplete_required_actions');
    expect(result.structured.missingActions.map((a) => a.type)).toEqual([
      'verify_identity',
      'reset_password',
    ]);
  });

  it('resolves when all required actions are present in order', () => {
    const result = evaluateMockDirectoryDeterministic(
      { type: 'mock_directory', actions: completeActions },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.matchedCount).toBe(4);
    expect(result.structured.missingActions).toEqual([]);
  });

  it('allows extra logged actions between required ones', () => {
    const result = evaluateMockDirectoryDeterministic(
      {
        actions: [
          { type: 'search', query: 'finance', at: 't0' },
          ...completeActions,
        ],
      },
      ticket()
    );
    expect(result.ok).toBe(true);
  });

  it('scores via mockDirectoryTicketScorer', async () => {
    const pass = await mockDirectoryTicketScorer.score(
      { actions: completeActions },
      ticket()
    );
    expect(pass.status).toBe('resolved');

    const fail = await mockDirectoryTicketScorer.score(
      {
        actions: [{ type: 'search', query: 'jdoe', at: 't1' }],
      },
      ticket()
    );
    expect(fail.status).toBe('needs_revision');
  });
});
