import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  evaluateCccerDeterministic,
  cccerTicketScorer,
  isCccerTicketType,
} from '@/lib/scoring/cccer';
import { listRegisteredTicketTypes, getTicketScorer } from '@/lib/scoring';

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
    id: 't-cccer',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'cccer',
    difficulty: 'medium',
    sla_minutes: 60,
    scenario_brief:
      'AUD-05: Write up the HarborForge timely access revocation exception using CCCER.',
    initial_state: {
      relatedTicketCode: 'AUD-05',
      criteriaSource:
        'HarborForge Access Revocation Standard — 5 calendar days',
      exceptionSummary:
        'Of 12 terminated users tested, 6 retained access beyond the 5-day SLA.',
    },
    expected_state: {
      minFieldLength: 40,
    },
    dcwf_code: '612',
    sort_order: 1,
    ...overrides,
  };
}

const solidField =
  'Of twelve terminated HarborForge users tested as of 2026-03-15, six retained production access beyond the five-calendar-day revocation SLA, including accounts still active after termination.';

function solidSubmission() {
  return {
    type: 'cccer',
    condition: solidField,
    criteria:
      'HarborForge Access Revocation Standard requires logical access for terminated personnel to be disabled or revoked within five calendar days of the termination effective date.',
    cause:
      'HR termination events are not automatically routed to IAM; deprovisioning depends on manual ticket handling without a reconciliation control, so several terminations were never actioned.',
    effect:
      'Former employees retaining ERP and directory access increases unauthorized transaction, data exfiltration, and accountability risk for production systems after employment ends.',
    recommendation:
      'Implement automated IAM deprovisioning triggered by HRIS termination events, add a weekly terminated-user-to-active-account reconciliation, and escalate any access still active after five calendar days to the IAM owner.',
  };
}

describe('isCccerTicketType', () => {
  it('recognizes cccer aliases', () => {
    expect(isCccerTicketType('cccer')).toBe(true);
    expect(isCccerTicketType('cccer_exception')).toBe(true);
    expect(isCccerTicketType('audit_finding_cccer')).toBe(true);
    expect(isCccerTicketType('grc.cccer')).toBe(true);
    expect(isCccerTicketType('conmon_strategy')).toBe(false);
  });
});

describe('evaluateCccerDeterministic', () => {
  it('registers cccer aliases on the scorer registry', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('cccer');
    expect(registered).toContain('cccer_exception');
    expect(registered).toContain('audit_finding_cccer');
    expect(getTicketScorer('cccer')).toBeTruthy();
    expect(getTicketScorer('cccer_exception')).toBe(getTicketScorer('cccer'));
  });

  it('rejects missing fields', () => {
    const result = evaluateCccerDeterministic({}, ticket());
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_fields');
    expect(result.structured.missing).toEqual(
      expect.arrayContaining([
        'condition',
        'criteria',
        'cause',
        'effect',
        'recommendation',
      ])
    );
    expect(result.structured.style).toBe('cccer');
  });

  it('rejects a partially complete submission', () => {
    const result = evaluateCccerDeterministic(
      {
        condition: solidField,
        criteria: solidField,
        cause: '',
        effect: solidField,
        recommendation: solidField,
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.missing).toContain('cause');
  });

  it('rejects fields shorter than minFieldLength', () => {
    const result = evaluateCccerDeterministic(
      {
        condition: 'Access was late.',
        criteria: 'Policy says five days.',
        cause: 'Manual process failed.',
        effect: 'Risk of unauthorized access.',
        recommendation: 'Fix the process soon.',
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('fields_too_short');
    expect(result.structured.tooShort.length).toBe(5);
    expect(result.feedback).toContain('min 40 chars');
  });

  it('passes when all five fields meet the non-trivial length gate', () => {
    const result = evaluateCccerDeterministic(solidSubmission(), ticket());
    expect(result.ok).toBe(true);
    expect(result.parsed).not.toBeNull();
    expect(result.structured.fieldsOk).toBe(true);
    expect(result.structured.missing).toEqual([]);
    expect(result.structured.tooShort).toEqual([]);
    expect(result.structured.minFieldLength).toBe(40);
  });

  it('honors a lower minFieldLength from expected_state', () => {
    const result = evaluateCccerDeterministic(
      {
        condition: 'Terminated users still had access after the SLA window.',
        criteria: 'Policy requires revocation within five calendar days.',
        cause: 'IAM relies on manual tickets without a reconciliation.',
        effect: 'Former staff can still reach production applications.',
        recommendation: 'Automate deprovisioning and reconcile weekly.',
      },
      ticket({ expected_state: { minFieldLength: 20 } })
    );
    expect(result.ok).toBe(true);
  });
});

describe('cccerTicketScorer', () => {
  beforeEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns needs_revision when API key is missing after deterministic pass', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const { MissingAnthropicApiKeyError } =
      await import('@/lib/grading/callClaudeGrading');
    vi.mocked(callClaudeGrading).mockRejectedValue(
      new MissingAnthropicApiKeyError()
    );

    const result = await cccerTicketScorer.score(solidSubmission(), ticket());

    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult).toMatchObject({
      style: 'cccer',
      reason: 'grading_unavailable_missing_api_key',
    });
  });

  it('resolves when Claude grading returns satisfied and retrieves guidance', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'satisfied',
      feedback:
        'CCCER elements are complete, evidence-based, and logically linked.',
      strengths: ['Quantified condition', 'Actionable recommendation'],
      gaps: [],
    });

    const result = await cccerTicketScorer.score(solidSubmission(), ticket());

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      style: 'cccer',
      guidancePath: 'data/grc/audit-finding-cccer-guidance.json',
    });
    const retrieved = (
      result.structuredResult as { retrievedSectionIds: string[] }
    ).retrievedSectionIds;
    expect(retrieved).toContain('condition');
    expect(retrieved).toContain('criteria');
    expect(retrieved).toContain('recommendation');
    expect(callClaudeGrading).toHaveBeenCalledTimes(1);
    const prompt = vi.mocked(callClaudeGrading).mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('CCCER');
    expect(prompt).toContain('IIA');
  });
});
