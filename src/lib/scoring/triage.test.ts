import { describe, expect, it } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  DEFAULT_TRIAGE_PRIORITY_MATRIX,
  evaluateTriage,
  extractTriageSubmission,
  resolveExpectedPriority,
  resolvePriorityFromRubric,
  triageTicketScorer,
} from '@/lib/scoring/triage';

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-triage',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 1,
    ticket_type: 'triage',
    difficulty: 'medium',
    sla_minutes: 20,
    scenario_brief: 'Triage the inbound request.',
    initial_state: {
      subject: 'Cannot open shared finance drive',
      body: 'Month-end close files are inaccessible.',
      affectedUserRole: 'Finance Director',
    },
    expected_state: {
      impact: 'high',
      urgency: 'medium',
      expectedPriority: 'P2',
      expectedCategory: 'access',
    },
    dcwf_code: null,
    sort_order: 0,
    ...overrides,
  };
}

describe('resolvePriorityFromRubric', () => {
  it('maps the default impact × urgency matrix', () => {
    expect(resolvePriorityFromRubric('high', 'high')).toBe('P1');
    expect(resolvePriorityFromRubric('high', 'medium')).toBe('P2');
    expect(resolvePriorityFromRubric('medium', 'medium')).toBe('P3');
    expect(resolvePriorityFromRubric('low', 'low')).toBe('P4');
    expect(DEFAULT_TRIAGE_PRIORITY_MATRIX.medium.high).toBe('P2');
  });

  it('honors a matrix override cell', () => {
    expect(
      resolvePriorityFromRubric('low', 'high', {
        low: { high: 'P2' },
      })
    ).toBe('P2');
  });
});

describe('resolveExpectedPriority', () => {
  it('prefers explicit expectedPriority over the matrix', () => {
    expect(
      resolveExpectedPriority({
        impact: 'high',
        urgency: 'high',
        expectedPriority: 'P2',
      })
    ).toBe('P2');
  });

  it('derives from impact × urgency when priority is omitted', () => {
    expect(
      resolveExpectedPriority({
        impact: 'medium',
        urgency: 'high',
      })
    ).toBe('P2');
  });
});

describe('extractTriageSubmission', () => {
  it('normalizes priority and category', () => {
    expect(
      extractTriageSubmission({
        priority: 'p2',
        category: 'Access',
      })
    ).toEqual({
      type: 'triage',
      priority: 'P2',
      category: 'access',
    });
  });

  it('accepts priority digit forms', () => {
    expect(extractTriageSubmission({ priority: '1', category: 'hardware' }))
      .toMatchObject({ priority: 'P1' });
  });

  it('returns null when fields are missing', () => {
    expect(extractTriageSubmission({ priority: 'P1' })).toBeNull();
    expect(extractTriageSubmission({ category: 'access' })).toBeNull();
  });
});

describe('evaluateTriage', () => {
  it('rejects missing submission fields', () => {
    const result = evaluateTriage({}, ticket());
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_fields');
  });

  it('rejects incorrect priority with rubric feedback', () => {
    const result = evaluateTriage(
      { priority: 'P1', category: 'access' },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.priorityMatch).toBe(false);
    expect(result.structured.categoryMatch).toBe(true);
    expect(result.structured.derivedPriority).toBe('P2');
    expect(result.feedback).toContain('P2');
    expect(result.feedback).toContain('high impact');
  });

  it('rejects incorrect category', () => {
    const result = evaluateTriage(
      { priority: 'P2', category: 'hardware' },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.categoryMatch).toBe(false);
    expect(result.feedback).toContain('access');
  });

  it('passes when priority and category match', () => {
    const result = evaluateTriage(
      { type: 'triage', priority: 'P2', category: 'access' },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.priorityMatch).toBe(true);
    expect(result.structured.categoryMatch).toBe(true);
    expect(result.feedback).toContain('Correct triage');
  });

  it('derives expected priority from impact × urgency when not seeded', () => {
    const result = evaluateTriage(
      { priority: 'P1', category: 'security' },
      ticket({
        expected_state: {
          impact: 'high',
          urgency: 'high',
          expectedCategory: 'security',
        },
      })
    );
    expect(result.ok).toBe(true);
    expect(result.structured.expectedPriority).toBe('P1');
    expect(result.structured.derivedPriority).toBe('P1');
  });

  it('flags misconfigured tickets missing answer keys', () => {
    const result = evaluateTriage(
      { priority: 'P2', category: 'access' },
      ticket({ expected_state: { impact: 'high' } })
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('misconfigured_expected_state');
  });
});

describe('triageTicketScorer', () => {
  it('resolves a correct submission', async () => {
    const result = await triageTicketScorer.score(
      { type: 'triage', priority: 'P2', category: 'access' },
      ticket()
    );
    expect(result).toMatchObject({
      status: 'resolved',
      structuredResult: {
        style: 'triage',
        priorityMatch: true,
        categoryMatch: true,
      },
    });
  });

  it('returns needs_revision for wrong triage', async () => {
    const result = await triageTicketScorer.score(
      { priority: 'P4', category: 'other' },
      ticket()
    );
    expect(result.status).toBe('needs_revision');
  });
});
