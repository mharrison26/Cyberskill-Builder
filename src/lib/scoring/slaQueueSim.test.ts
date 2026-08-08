import { describe, expect, it } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';
import {
  evaluateSlaQueueSim,
  extractSlaQueueSimSubmission,
  parseSlaQueueSimExpectedState,
  parseSlaQueueSimItems,
  slaQueueSimTicketScorer,
} from '@/lib/scoring/slaQueueSim';

const STARTED = '2026-08-08T12:00:00.000Z';

function queueInitialState() {
  return {
    prompt: 'Clear the morning queue under SLA.',
    items: [
      {
        id: 'INC-1001',
        subject: 'VPN down for sales floor',
        body: 'Entire sales floor cannot reach CRM over VPN.',
        requester: 'Sales Manager',
        difficulty: 'critical',
        slaMinutes: 5,
        categoryOptions: ['network', 'access', 'software'],
        resolutionOptions: [
          { id: 'restart_vpn_concentrator', label: 'Restart VPN concentrator' },
          { id: 'password_reset', label: 'Reset user password' },
          { id: 'ignore', label: 'Close as noise' },
        ],
      },
      {
        id: 'INC-1002',
        subject: 'Exec account locked',
        body: 'CFO locked out after travel; needs access for board pack.',
        requester: 'CFO EA',
        difficulty: 'high',
        slaMinutes: 10,
        categoryOptions: ['account', 'access', 'security'],
        resolutionOptions: [
          { id: 'unlock_account', label: 'Unlock account' },
          { id: 'escalate_security', label: 'Escalate to security' },
          { id: 'create_new_account', label: 'Create a new account' },
        ],
      },
      {
        id: 'INC-1003',
        subject: 'Printer jam in finance',
        body: 'Shared finance printer jammed; month-end packets waiting.',
        difficulty: 'medium',
        slaMinutes: 20,
        resolutionOptions: [
          {
            id: 'dispatch_facilities',
            label: 'Dispatch facilities / clear jam',
          },
          { id: 'replace_toner', label: 'Replace toner only' },
          { id: 'ignore', label: 'Close without action' },
        ],
      },
      {
        id: 'INC-1004',
        subject: 'Suspected phishing email',
        body: 'User reports credential-harvesting email with urgent wire request.',
        difficulty: 'high',
        slaMinutes: 10,
        resolutionOptions: [
          { id: 'escalate_security', label: 'Escalate to security' },
          { id: 'delete_mail', label: 'Tell user to delete and move on' },
          { id: 'unlock_account', label: 'Unlock account' },
        ],
      },
      {
        id: 'INC-1005',
        subject: 'Request Visio license',
        body: 'Analyst wants Visio for one diagram; not urgent.',
        difficulty: 'low',
        slaMinutes: 30,
        resolutionOptions: [
          { id: 'catalog_request', label: 'Route through software catalog' },
          { id: 'install_now', label: 'Install immediately without approval' },
          { id: 'ignore', label: 'Close without action' },
        ],
      },
    ],
  };
}

function queueExpectedState() {
  return {
    passSlaCompliancePercent: 80,
    passCorrectnessPercent: 80,
    slaWeight: 0.5,
    correctnessWeight: 0.5,
    items: {
      'INC-1001': {
        expectedPriority: 'P1',
        expectedCategory: 'network',
        expectedResolution: 'restart_vpn_concentrator',
      },
      'INC-1002': {
        expectedPriority: 'P2',
        expectedCategory: 'account',
        expectedResolution: 'unlock_account',
      },
      'INC-1003': {
        expectedPriority: 'P3',
        expectedCategory: 'hardware',
        expectedResolution: 'dispatch_facilities',
      },
      'INC-1004': {
        expectedPriority: 'P2',
        expectedCategory: 'security',
        expectedResolution: 'escalate_security',
      },
      'INC-1005': {
        expectedPriority: 'P4',
        expectedCategory: 'software',
        expectedResolution: 'catalog_request',
      },
    },
  };
}

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-sla-queue',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 1,
    ticket_type: 'sla_queue_sim',
    difficulty: 'high',
    sla_minutes: 45,
    scenario_brief: 'PI-09: Timed multi-ticket queue with SLA timers',
    initial_state: queueInitialState(),
    expected_state: queueExpectedState(),
    dcwf_code: null,
    sort_order: 0,
    ...overrides,
  };
}

function correctItems(resolvedOffsetsMinutes: number[]) {
  const answers: Array<{
    id: string;
    priority: 'P1' | 'P2' | 'P3' | 'P4';
    category: string;
    resolution: string;
  }> = [
    {
      id: 'INC-1001',
      priority: 'P1',
      category: 'network',
      resolution: 'restart_vpn_concentrator',
    },
    {
      id: 'INC-1002',
      priority: 'P2',
      category: 'account',
      resolution: 'unlock_account',
    },
    {
      id: 'INC-1003',
      priority: 'P3',
      category: 'hardware',
      resolution: 'dispatch_facilities',
    },
    {
      id: 'INC-1004',
      priority: 'P2',
      category: 'security',
      resolution: 'escalate_security',
    },
    {
      id: 'INC-1005',
      priority: 'P4',
      category: 'software',
      resolution: 'catalog_request',
    },
  ];

  return answers.map((answer, index) => {
    const minutes = resolvedOffsetsMinutes[index] ?? 1;
    const resolvedAt = new Date(
      Date.parse(STARTED) + minutes * 60_000
    ).toISOString();
    return { ...answer, resolvedAt };
  });
}

describe('slaQueueSim parsers', () => {
  it('registers sla_queue_sim and aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('sla_queue_sim');
    expect(registered).toContain('queue_simulation');
    expect(registered).toContain('timed_queue');
    expect(registered).toContain('multi_ticket_sim');
    expect(getTicketScorer('sla_queue_sim')).toBeTruthy();
    expect(getTicketScorer('queue_simulation')).toBe(
      getTicketScorer('sla_queue_sim')
    );
  });

  it('parses queue items from initial_state', () => {
    const items = parseSlaQueueSimItems(queueInitialState());
    expect(items).toHaveLength(5);
    expect(items[0]?.id).toBe('INC-1001');
    expect(items[0]?.slaMinutes).toBe(5);
    expect(items[0]?.resolutionOptions[0]?.id).toBe('restart_vpn_concentrator');
  });

  it('parses expected_state thresholds and per-item answers', () => {
    const parsed = parseSlaQueueSimExpectedState(queueExpectedState());
    expect(parsed.passSlaCompliancePercent).toBe(80);
    expect(parsed.items?.['INC-1001']?.expectedPriority).toBe('P1');
    expect(parsed.items?.['INC-1004']?.expectedResolution).toBe(
      'escalate_security'
    );
  });

  it('extracts a batch submission', () => {
    const parsed = extractSlaQueueSimSubmission({
      type: 'sla_queue_sim',
      simulationStartedAt: STARTED,
      items: correctItems([1, 2, 3, 4, 5]),
    });
    expect(parsed?.items).toHaveLength(5);
    expect(parsed?.simulationStartedAt).toBe(STARTED);
  });
});

describe('evaluateSlaQueueSim', () => {
  it('passes when all items are correct and within SLA', () => {
    const result = evaluateSlaQueueSim(
      {
        type: 'sla_queue_sim',
        simulationStartedAt: STARTED,
        items: correctItems([2, 4, 8, 6, 12]),
      },
      ticket()
    );

    expect(result.ok).toBe(true);
    expect(result.structured.correctnessPercent).toBe(100);
    expect(result.structured.slaCompliancePercent).toBe(100);
    expect(result.structured.overallScore).toBe(100);
    expect(result.structured.slaPass).toBe(true);
    expect(result.structured.correctnessPass).toBe(true);
  });

  it('fails when two items are incorrect (correctness 60%)', () => {
    const items = correctItems([2, 4, 8, 6, 12]);
    items[0] = { ...items[0], priority: 'P4' };
    items[1] = { ...items[1], resolution: 'create_new_account' };

    const result = evaluateSlaQueueSim(
      {
        type: 'sla_queue_sim',
        simulationStartedAt: STARTED,
        items,
      },
      ticket()
    );

    expect(result.ok).toBe(false);
    expect(result.structured.correctnessPercent).toBe(60);
    expect(result.structured.correctnessPass).toBe(false);
    expect(result.structured.reason).toBe('correctness_below_threshold');
  });

  it('scores SLA compliance independently of correctness', () => {
    // INC-1001 SLA is 5m — resolve at 12m → breach; others within
    const result = evaluateSlaQueueSim(
      {
        type: 'sla_queue_sim',
        simulationStartedAt: STARTED,
        items: correctItems([12, 4, 8, 6, 12]),
      },
      ticket()
    );

    expect(result.structured.correctnessPercent).toBe(100);
    expect(result.structured.slaCompliancePercent).toBe(80);
    expect(result.structured.overallScore).toBe(90);
    expect(result.ok).toBe(true);
  });

  it('fails when SLA compliance drops below threshold', () => {
    // Breach two of five → 60% SLA
    const result = evaluateSlaQueueSim(
      {
        type: 'sla_queue_sim',
        simulationStartedAt: STARTED,
        items: correctItems([12, 20, 8, 6, 12]),
      },
      ticket()
    );

    expect(result.ok).toBe(false);
    expect(result.structured.slaCompliancePercent).toBe(60);
    expect(result.structured.slaPass).toBe(false);
    expect(result.structured.reason).toBe('sla_below_threshold');
  });

  it('requires the full batch', () => {
    const result = evaluateSlaQueueSim(
      {
        type: 'sla_queue_sim',
        simulationStartedAt: STARTED,
        items: correctItems([2, 4, 8, 6, 12]).slice(0, 3),
      },
      ticket()
    );

    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('incomplete_batch');
  });
});

describe('slaQueueSimTicketScorer', () => {
  it('returns resolved for a perfect batch', async () => {
    const result = await slaQueueSimTicketScorer.score(
      {
        type: 'sla_queue_sim',
        simulationStartedAt: STARTED,
        items: correctItems([1, 2, 3, 4, 5]),
      },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult.style).toBe('sla_queue_sim');
  });

  it('returns needs_revision for empty submission', async () => {
    const result = await slaQueueSimTicketScorer.score({}, ticket());
    expect(result.status).toBe('needs_revision');
  });
});
