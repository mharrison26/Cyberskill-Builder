import { describe, expect, it } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';
import {
  evaluateSoc2ChangeManagementTestDeterministic,
  extractSoc2ChangeManagementTestSubmission,
  normalizeExceptionRatePercent,
  parseSoc2ChangeManagementTestExpectedState,
  parseSoc2ChangeTickets,
  parseSoc2Criterion,
  parseSoc2TestProcedure,
} from '@/lib/scoring/soc2ChangeManagementTest';

const CHANGE_TICKETS = [
  {
    id: 'CHG-2401',
    title: 'Bump API gateway rate limits',
    changeType: 'standard',
    requester: 'alex.nguyen',
    approver: 'priya.shah',
    approved: true,
    testEvidence: 'Load test report LT-441 attached',
    requiresCab: false,
    cabApproved: false,
    retroApproval: null,
    deployedAt: '2026-03-02T14:00:00Z',
    environment: 'prod',
  },
  {
    id: 'CHG-2402',
    title: 'Rotate TLS certs on edge',
    changeType: 'standard',
    requester: 'jordan.lee',
    approver: 'priya.shah',
    approved: true,
    testEvidence: 'Staging cert swap validated',
    requiresCab: true,
    cabApproved: true,
    retroApproval: null,
    deployedAt: '2026-03-04T09:30:00Z',
    environment: 'prod',
  },
  {
    id: 'CHG-2403',
    title: 'Enable new feature flag checkout_v2',
    changeType: 'standard',
    requester: 'sam.ortiz',
    approver: null,
    approved: false,
    testEvidence: 'QA checklist QC-88',
    requiresCab: false,
    cabApproved: false,
    retroApproval: null,
    deployedAt: '2026-03-05T16:10:00Z',
    environment: 'prod',
  },
  {
    id: 'CHG-2404',
    title: 'Increase DB connection pool',
    changeType: 'standard',
    requester: 'morgan.cho',
    approver: 'priya.shah',
    approved: true,
    testEvidence: null,
    requiresCab: false,
    cabApproved: false,
    retroApproval: null,
    deployedAt: '2026-03-06T11:00:00Z',
    environment: 'prod',
  },
  {
    id: 'CHG-2405',
    title: 'Patch nginx to 1.26.2',
    changeType: 'standard',
    requester: 'alex.nguyen',
    approver: 'devon.park',
    approved: true,
    testEvidence: 'Canary 10% healthy for 45m',
    requiresCab: false,
    cabApproved: false,
    retroApproval: null,
    deployedAt: '2026-03-07T08:15:00Z',
    environment: 'prod',
  },
  {
    id: 'CHG-2406',
    title: 'Emergency firewall rule for DDoS',
    changeType: 'emergency',
    requester: 'soc.oncall',
    approver: null,
    approved: false,
    testEvidence: null,
    requiresCab: false,
    cabApproved: false,
    retroApproval: false,
    deployedAt: '2026-03-08T02:40:00Z',
    environment: 'prod',
  },
  {
    id: 'CHG-2407',
    title: 'Emergency revoke compromised API key',
    changeType: 'emergency',
    requester: 'soc.oncall',
    approver: 'priya.shah',
    approved: true,
    testEvidence: null,
    requiresCab: false,
    cabApproved: false,
    retroApproval: true,
    deployedAt: '2026-03-09T01:05:00Z',
    environment: 'prod',
  },
  {
    id: 'CHG-2408',
    title: 'Cutover payment processor hostname',
    changeType: 'standard',
    requester: 'finance.eng',
    approver: 'devon.park',
    approved: true,
    testEvidence: 'UAT runbook UR-12 signed',
    requiresCab: true,
    cabApproved: false,
    retroApproval: null,
    deployedAt: '2026-03-10T19:00:00Z',
    environment: 'prod',
  },
  {
    id: 'CHG-2409',
    title: 'Update CDN cache TTL',
    changeType: 'normal',
    requester: 'jordan.lee',
    approver: 'priya.shah',
    approved: true,
    testEvidence: 'Staging TTL validation',
    requiresCab: false,
    cabApproved: false,
    retroApproval: null,
    deployedAt: '2026-03-11T13:20:00Z',
    environment: 'prod',
  },
  {
    id: 'CHG-2410',
    title: 'Add read replica for reporting',
    changeType: 'standard',
    requester: 'data.platform',
    approver: 'devon.park',
    approved: true,
    testEvidence: 'Replica lag < 1s for 2h',
    requiresCab: true,
    cabApproved: true,
    retroApproval: null,
    deployedAt: '2026-03-12T10:45:00Z',
    environment: 'prod',
  },
];

const EXPECTED_EXCEPTION_IDS = ['CHG-2403', 'CHG-2404', 'CHG-2406', 'CHG-2408'];

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-soc2-cm-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'soc2_change_management_test',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief:
      'Execute the CC8.1 change-management test procedure and report exceptions.',
    initial_state: {
      criterion: {
        id: 'CC8.1',
        title: 'Change Management',
        description:
          'The entity authorizes, designs, develops, configures, documents, tests, approves, and implements changes to infrastructure, data, software, and procedures.',
      },
      testProcedure: [
        'Obtain the sample of 10 production change tickets.',
        'For standard/normal changes: confirm approved=true and non-empty testEvidence.',
        'For standard/normal changes with requiresCab=true: confirm cabApproved=true.',
        'For emergency changes: confirm retroApproval=true (pre-approval and testing may be absent).',
        'Count each ticket that fails any applicable criterion as an exception.',
      ],
      exceptionDefinition:
        'Exception = standard/normal missing approval or test evidence; standard/normal with requiresCab but cabApproved=false; or emergency with retroApproval=false.',
      changeTickets: CHANGE_TICKETS,
    },
    expected_state: {
      exceptionCount: 4,
      exceptionRate: 40,
      exceptionIds: EXPECTED_EXCEPTION_IDS,
      requireExceptionIds: true,
    },
    dcwf_code: '612',
    sort_order: 1,
    ...overrides,
  };
}

const correctSubmission = {
  type: 'soc2_change_management_test',
  exceptionCount: 4,
  exceptionRate: 40,
  exceptionIds: EXPECTED_EXCEPTION_IDS,
};

describe('soc2ChangeManagementTest scorer', () => {
  it('registers soc2_change_management_test aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('soc2_change_management_test');
    expect(registered).toContain('soc2_exception_testing');
    expect(getTicketScorer('soc2_change_management_test')).toBeTruthy();
    expect(getTicketScorer('soc2_exception_testing')).toBe(
      getTicketScorer('soc2_change_management_test')
    );
  });

  it('parses criterion, procedure, and 10 change tickets', () => {
    const initial = ticket().initial_state as Record<string, unknown>;
    expect(parseSoc2Criterion(initial)).toMatchObject({
      id: 'CC8.1',
      title: 'Change Management',
    });
    expect(parseSoc2TestProcedure(initial).length).toBeGreaterThanOrEqual(4);
    const changes = parseSoc2ChangeTickets(initial);
    expect(changes).toHaveLength(10);
    expect(changes.map((c) => c.id)).toContain('CHG-2406');
  });

  it('parses expected_state and normalizes rate fractions', () => {
    expect(
      parseSoc2ChangeManagementTestExpectedState({
        exception_count: 4,
        exception_rate: 0.4,
        exception_ids: ['CHG-2408', 'CHG-2403'],
      })
    ).toEqual({
      exceptionCount: 4,
      exceptionRate: 40,
      exceptionIds: ['CHG-2403', 'CHG-2408'],
      rateTolerance: 0,
      requireExceptionIds: true,
    });

    expect(normalizeExceptionRatePercent('40%')).toBe(40);
    expect(normalizeExceptionRatePercent(0.3)).toBe(30);
  });

  it('extracts submission with snake_case aliases', () => {
    expect(
      extractSoc2ChangeManagementTestSubmission({
        exception_count: '4',
        exception_rate: '40%',
        exception_ids: ['CHG-2403', 'CHG-2404'],
      })
    ).toEqual({
      type: 'soc2_change_management_test',
      exceptionCount: 4,
      exceptionRate: 40,
      exceptionIds: ['CHG-2403', 'CHG-2404'],
    });
  });

  it('fails when fields are missing', () => {
    const result = evaluateSoc2ChangeManagementTestDeterministic({}, ticket());
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_fields');
  });

  it('fails on wrong exception count', () => {
    const result = evaluateSoc2ChangeManagementTestDeterministic(
      { ...correctSubmission, exceptionCount: 3 },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('wrong_exception_count');
    expect(result.structured.countMatch).toBe(false);
    expect(result.feedback).toMatch(/Exception count should be 4/);
  });

  it('fails on wrong exception rate', () => {
    const result = evaluateSoc2ChangeManagementTestDeterministic(
      { ...correctSubmission, exceptionRate: 30 },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('wrong_exception_rate');
    expect(result.structured.rateMatch).toBe(false);
    expect(result.feedback).toMatch(/Exception rate should be 40%/);
  });

  it('fails when exception ID set is wrong even if count/rate match', () => {
    const result = evaluateSoc2ChangeManagementTestDeterministic(
      {
        ...correctSubmission,
        exceptionIds: ['CHG-2403', 'CHG-2404', 'CHG-2406', 'CHG-2409'],
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.exceptionSetMatch).toBe(false);
    expect(result.structured.extraExceptionIds).toContain('CHG-2409');
    expect(result.structured.missingExceptionIds).toContain('CHG-2408');
  });

  it('fails when exception IDs are omitted but required', () => {
    const result = evaluateSoc2ChangeManagementTestDeterministic(
      {
        type: 'soc2_change_management_test',
        exceptionCount: 4,
        exceptionRate: 40,
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_exceptions');
  });

  it('accepts fraction rate and resolves when count, rate, and IDs match', () => {
    const result = evaluateSoc2ChangeManagementTestDeterministic(
      {
        type: 'soc2_change_management_test',
        exceptionCount: 4,
        exceptionRate: 0.4,
        exceptionIds: [...EXPECTED_EXCEPTION_IDS].reverse(),
      },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured).toMatchObject({
      style: 'soc2_change_management_test',
      countMatch: true,
      rateMatch: true,
      exceptionSetMatch: true,
      populationSize: 10,
    });
  });

  it('allows count+rate only when requireExceptionIds is false', () => {
    const result = evaluateSoc2ChangeManagementTestDeterministic(
      {
        exceptionCount: 4,
        exceptionRate: 40,
      },
      ticket({
        expected_state: {
          exceptionCount: 4,
          exceptionRate: 40,
          exceptionIds: EXPECTED_EXCEPTION_IDS,
          requireExceptionIds: false,
        },
      })
    );
    expect(result.ok).toBe(true);
    expect(result.structured.exceptionSetMatch).toBeNull();
  });

  it('scorer returns resolved for the correct answer', async () => {
    const scorer = getTicketScorer('soc2_change_management_test');
    expect(scorer).toBeTruthy();
    const scored = await scorer!.score(correctSubmission, ticket());
    expect(scored.status).toBe('resolved');
    expect(scored.feedback).toMatch(/match the seeded CC8\.1/i);
  });
});
