import { describe, expect, it } from 'vitest';

import {
  evaluateItgcAccessRevocationDeterministic,
  extractItgcAccessRevocationSubmission,
  itgcAccessRevocationTicketScorer,
  parseItgcAccessPolicy,
  parseItgcAccessRevocationExpectedState,
  parseItgcAccessUsers,
} from '@/lib/scoring/itgcAccessRevocation';
import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-itgc-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'itgc_access_revocation',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief:
      'ITGC: Test timely access revocation against the HR/IAM extract.',
    initial_state: {
      prompt:
        'Evaluate whether terminated-user access was revoked within 5 calendar days.',
      controlObjective:
        'Access for terminated personnel is revoked timely per policy.',
      policy: {
        title: 'HarborForge Access Revocation Standard',
        criteria:
          'Access must be revoked within 5 calendar days of the termination date.',
        revokeWithinDays: 5,
        asOfDate: '2026-03-15',
        calendarBasis: 'calendar_days',
      },
      users: [
        {
          id: 'u-chen',
          displayName: 'Mei Chen',
          username: 'mchen',
          department: 'Finance',
          employmentStatus: 'active',
          terminationDate: null,
          accessStatus: 'active',
          accessRevokedDate: null,
        },
        {
          id: 'u-torres',
          displayName: 'Elena Torres',
          username: 'etorres',
          department: 'Sales',
          employmentStatus: 'terminated',
          terminationDate: '2026-02-01',
          accessStatus: 'revoked',
          accessRevokedDate: '2026-02-10',
        },
        {
          id: 'u-park',
          displayName: 'Noah Park',
          username: 'npark',
          department: 'Engineering',
          employmentStatus: 'terminated',
          terminationDate: '2026-03-01',
          accessStatus: 'active',
          accessRevokedDate: null,
        },
        {
          id: 'u-diaz',
          displayName: 'Carlos Diaz',
          username: 'cdiaz',
          department: 'Ops',
          employmentStatus: 'terminated',
          terminationDate: '2026-02-20',
          accessStatus: 'revoked',
          accessRevokedDate: '2026-02-21',
        },
      ],
    },
    expected_state: {
      controlOutcome: 'fail',
      exceptionUserIds: ['u-park', 'u-torres'],
    },
    dcwf_code: '612',
    sort_order: 1,
    ...overrides,
  };
}

const correctSubmission = {
  type: 'itgc_access_revocation',
  controlOutcome: 'fail' as const,
  exceptionUserIds: ['u-torres', 'u-park'],
};

describe('itgcAccessRevocation parsers', () => {
  it('registers itgc_access_revocation and timely_access_revocation', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('itgc_access_revocation');
    expect(registered).toContain('timely_access_revocation');
    expect(getTicketScorer('timely_access_revocation')).toBe(
      getTicketScorer('itgc_access_revocation')
    );
  });

  it('parses users and policy from initial_state', () => {
    const users = parseItgcAccessUsers(ticket().initial_state);
    expect(users).toHaveLength(4);
    expect(users[1]).toMatchObject({
      id: 'u-torres',
      employmentStatus: 'terminated',
      accessRevokedDate: '2026-02-10',
    });

    const policy = parseItgcAccessPolicy(ticket().initial_state);
    expect(policy).toMatchObject({
      revokeWithinDays: 5,
      asOfDate: '2026-03-15',
    });
  });

  it('parses expected_state with exception aliases', () => {
    const parsed = parseItgcAccessRevocationExpectedState({
      control_outcome: 'fail',
      exceptions: [{ userId: 'u-torres' }, 'u-park', 'u-torres'],
    });
    expect(parsed).toEqual({
      controlOutcome: 'fail',
      exceptionUserIds: ['u-park', 'u-torres'],
    });
  });

  it('extracts submission with pass_fail alias', () => {
    const parsed = extractItgcAccessRevocationSubmission({
      pass_fail: 'Fail',
      exception_user_ids: ['u-park'],
    });
    expect(parsed).toEqual({
      type: 'itgc_access_revocation',
      controlOutcome: 'fail',
      exceptionUserIds: ['u-park'],
    });
  });
});

describe('evaluateItgcAccessRevocationDeterministic', () => {
  it('resolves on correct pass/fail and exception set (order-independent)', () => {
    const result = evaluateItgcAccessRevocationDeterministic(
      correctSubmission,
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.controlOutcomeMatch).toBe(true);
    expect(result.structured.exceptionSetMatch).toBe(true);
    expect(result.structured.missingExceptionUserIds).toEqual([]);
    expect(result.structured.extraExceptionUserIds).toEqual([]);
  });

  it('needs revision when pass/fail is wrong', () => {
    const result = evaluateItgcAccessRevocationDeterministic(
      {
        controlOutcome: 'pass',
        exceptionUserIds: ['u-torres', 'u-park'],
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('wrong_control_outcome');
    expect(result.structured.controlOutcomeMatch).toBe(false);
    expect(result.feedback).toContain('"fail"');
  });

  it('needs revision when an exception is missing', () => {
    const result = evaluateItgcAccessRevocationDeterministic(
      {
        controlOutcome: 'fail',
        exceptionUserIds: ['u-torres'],
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_exceptions');
    expect(result.structured.missingExceptionUserIds).toEqual(['u-park']);
    expect(result.feedback).toContain('u-park');
  });

  it('needs revision when a false-positive exception is included', () => {
    const result = evaluateItgcAccessRevocationDeterministic(
      {
        controlOutcome: 'fail',
        exceptionUserIds: ['u-torres', 'u-park', 'u-diaz'],
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('extra_exceptions');
    expect(result.structured.extraExceptionUserIds).toEqual(['u-diaz']);
    expect(result.feedback).toContain('u-diaz');
  });

  it('scores via itgcAccessRevocationTicketScorer', async () => {
    const pass = await itgcAccessRevocationTicketScorer.score(
      correctSubmission,
      ticket()
    );
    expect(pass.status).toBe('resolved');

    const fail = await itgcAccessRevocationTicketScorer.score(
      { controlOutcome: 'fail', exceptionUserIds: [] },
      ticket()
    );
    expect(fail.status).toBe('needs_revision');
  });
});
