import { describe, expect, it } from 'vitest';

import {
  breachIncidentCommandTicketScorer,
  evaluateBreachIncidentCommandDeterministic,
  extractBreachIncidentCommandSubmission,
  isBreachIncidentCommandTicketType,
  listBreachDecisionPoints,
  parseBreachIncidentCommandExpectedState,
  parseBreachIncidentFacts,
  parseBreachIncidentStages,
} from '@/lib/scoring/breachIncidentCommand';
import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';

const STAGES = [
  {
    id: 'stage_detect',
    title: 'Stage 1 — Detection',
    brief: 'EDR alerts on payment tier; lateral movement suspected.',
    decisionPoints: [
      {
        id: 'notify_immediate',
        type: 'multi_select',
        prompt: 'Who do you notify immediately?',
        options: [
          { id: 'ciso', label: 'CISO' },
          { id: 'isso', label: 'ISSO' },
          { id: 'soc_lead', label: 'SOC Lead' },
          { id: 'all_staff_email', label: 'All-staff email' },
          { id: 'press', label: 'Press' },
        ],
      },
    ],
  },
  {
    id: 'stage_confirm',
    title: 'Stage 2 — Confirmed compromise',
    brief: 'Evidence of data access confirmed.',
    decisionPoints: [
      {
        id: 'engage_legal_pr',
        type: 'single_select',
        prompt: 'When do you engage Legal and PR?',
        options: [
          { id: 'now', label: 'Engage both now' },
          {
            id: 'legal_now_pr_later',
            label: 'Legal now; PR when impact confirmed',
          },
          { id: 'wait_containment', label: 'Wait until containment' },
          { id: 'not_needed', label: 'Not needed for this incident' },
        ],
      },
    ],
  },
  {
    id: 'stage_impact',
    title: 'Stage 3 — Impact assessment',
    brief: 'PII exfiltration suspected.',
    decisionPoints: [
      {
        id: 'external_notify',
        type: 'single_select',
        prompt: 'What is your external notification posture?',
        options: [
          {
            id: 'customers_now',
            label: 'Notify all customers immediately',
          },
          {
            id: 'counsel_led_plan',
            label: 'Counsel-led regulator/customer plan; no public notice yet',
          },
          {
            id: 'press_release_now',
            label: 'Issue a public press release now',
          },
          {
            id: 'no_external',
            label: 'No external notification will be needed',
          },
        ],
      },
    ],
  },
  {
    id: 'stage_contain',
    title: 'Stage 4 — Containment declaration',
    brief: 'Beaconing still observed after initial blocks.',
    decisionPoints: [
      {
        id: 'declare_contained',
        type: 'single_select',
        prompt: 'Do you declare the incident contained?',
        options: [
          { id: 'declare_now', label: 'Declare contained now' },
          { id: 'not_yet', label: 'Do not declare contained yet' },
          {
            id: 'declare_and_close',
            label: 'Declare contained and close incident',
          },
        ],
      },
    ],
  },
];

const JUST =
  'Incident command requires scoped internal escalation first; premature press or all-staff notice harms containment and legal posture.';

function correctDecisions() {
  return {
    notify_immediate: {
      selectedOptionIds: ['ciso', 'isso', 'soc_lead'],
      justification: JUST,
    },
    engage_legal_pr: {
      selectedOptionId: 'legal_now_pr_later',
      justification: JUST,
    },
    external_notify: {
      selectedOptionId: 'counsel_led_plan',
      justification: JUST,
    },
    declare_contained: {
      selectedOptionId: 'not_yet',
      justification: JUST,
    },
  };
}

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-breach-1',
    tenant_id: 'ten1',
    track_id: 'tr-issm',
    tier: 3,
    ticket_type: 'breach_incident_command',
    difficulty: 'high',
    sla_minutes: 75,
    scenario_brief:
      'Major breach simulation: HarborForge Payments API ransomware / data staging — ISSM incident-command decisions across four stages',
    initial_state: {
      prompt:
        'As ISSM, work the breach through each stage. At every decision point, choose the incident-command action and briefly justify it.',
      role: 'ISSM',
      minJustificationLength: 40,
      incident: {
        id: 'INC-2026-0847',
        title: 'Suspected ransomware / data staging on payment tier',
        system: 'HarborForge Payments API',
      },
      stages: STAGES,
    },
    expected_state: {
      decisions: {
        notify_immediate: {
          type: 'multi_select',
          correctOptionIds: ['ciso', 'isso', 'soc_lead'],
        },
        engage_legal_pr: {
          type: 'single_select',
          correctOptionId: 'legal_now_pr_later',
        },
        external_notify: {
          type: 'single_select',
          correctOptionId: 'counsel_led_plan',
        },
        declare_contained: {
          type: 'single_select',
          correctOptionId: 'not_yet',
        },
      },
      minJustificationLength: 40,
      passThresholdPercent: 100,
      requireAllJustifications: true,
    },
    dcwf_code: '722',
    sort_order: 1,
    ...overrides,
  };
}

describe('breachIncidentCommand', () => {
  it('registers breach_incident_command aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('breach_incident_command');
    expect(registered).toContain('major_breach_simulation');
    expect(registered).toContain('issm_incident_decisions');
    expect(getTicketScorer('major_breach_simulation')).toBe(
      breachIncidentCommandTicketScorer
    );
    expect(getTicketScorer('issm_incident_decisions')).toBe(
      getTicketScorer('breach_incident_command')
    );
  });

  it('recognizes ticket type aliases including dotted prefixes', () => {
    expect(isBreachIncidentCommandTicketType('breach_incident_command')).toBe(
      true
    );
    expect(
      isBreachIncidentCommandTicketType('grc.major_breach_simulation')
    ).toBe(true);
    expect(isBreachIncidentCommandTicketType('issm_incident_decisions')).toBe(
      true
    );
    expect(isBreachIncidentCommandTicketType('triage')).toBe(false);
  });

  it('parses stages, facts, and decision points from initial_state', () => {
    const stages = parseBreachIncidentStages(ticket().initial_state);
    expect(stages).toHaveLength(4);
    expect(stages[0]?.decisionPoints[0]?.id).toBe('notify_immediate');

    const facts = parseBreachIncidentFacts(ticket().initial_state);
    expect(facts?.id).toBe('INC-2026-0847');
    expect(facts?.system).toBe('HarborForge Payments API');

    const points = listBreachDecisionPoints(ticket().initial_state);
    expect(points.map((p) => p.id)).toEqual([
      'notify_immediate',
      'engage_legal_pr',
      'external_notify',
      'declare_contained',
    ]);
  });

  it('parses expected_state with defaults', () => {
    const parsed = parseBreachIncidentCommandExpectedState({
      decisions: {
        notify_immediate: {
          correctOptionIds: ['ciso', 'soc_lead'],
        },
      },
    });
    expect(parsed?.decisions.notify_immediate).toEqual({
      type: 'multi_select',
      correctOptionIds: ['ciso', 'soc_lead'],
    });
    expect(parsed?.minJustificationLength).toBe(40);
    expect(parsed?.passThresholdPercent).toBe(100);
    expect(parsed?.requireAllJustifications).toBe(true);
  });

  it('extracts submission with snake_case aliases', () => {
    const parsed = extractBreachIncidentCommandSubmission({
      decisions: {
        notify_immediate: {
          selected_option_ids: ['ciso', 'isso'],
          rationale: '  need command chain  ',
        },
        engage_legal_pr: {
          selected_option_id: 'legal_now_pr_later',
          justification: 'privilege early',
        },
      },
    });
    expect(parsed?.decisions.notify_immediate).toEqual({
      selectedOptionIds: ['ciso', 'isso'],
      justification: 'need command chain',
    });
    expect(parsed?.decisions.engage_legal_pr).toEqual({
      selectedOptionId: 'legal_now_pr_later',
      justification: 'privilege early',
    });
  });

  it('resolves when all decision points match the answer key', async () => {
    const scored = await breachIncidentCommandTicketScorer.score(
      {
        type: 'breach_incident_command',
        decisions: correctDecisions(),
      },
      ticket()
    );
    expect(scored.status).toBe('resolved');
    expect(scored.structuredResult.percentage).toBe(100);
    expect(scored.structuredResult.passedCount).toBe(4);
    expect(scored.structuredResult.totalCount).toBe(4);
    const decisionResults = scored.structuredResult.decisionResults as Array<{
      passed: boolean;
    }>;
    expect(decisionResults.every((r) => r.passed)).toBe(true);
  });

  it('rejects multi-select with distractors (press / all-staff)', () => {
    const decisions = correctDecisions();
    decisions.notify_immediate = {
      selectedOptionIds: ['ciso', 'isso', 'soc_lead', 'press'],
      justification: JUST,
    };
    const result = evaluateBreachIncidentCommandDeterministic(
      { type: 'breach_incident_command', decisions },
      ticket()
    );
    expect(result.ok).toBe(false);
    const notify = result.structured.decisionResults.find(
      (r) => r.decisionPointId === 'notify_immediate'
    );
    expect(notify?.selectionMatch).toBe(false);
    expect(notify?.extraOptionIds).toEqual(['press']);
    expect(result.structured.percentage).toBe(75);
  });

  it('rejects declaring contained while beaconing remains', () => {
    const decisions = correctDecisions();
    decisions.declare_contained = {
      selectedOptionId: 'declare_now',
      justification: JUST,
    };
    const result = evaluateBreachIncidentCommandDeterministic(
      { decisions },
      ticket()
    );
    expect(result.ok).toBe(false);
    const contain = result.structured.decisionResults.find(
      (r) => r.decisionPointId === 'declare_contained'
    );
    expect(contain?.passed).toBe(false);
    expect(contain?.missingOptionIds).toEqual(['not_yet']);
    expect(contain?.extraOptionIds).toEqual(['declare_now']);
  });

  it('rejects short justifications when requireAllJustifications is true', () => {
    const decisions = correctDecisions();
    decisions.engage_legal_pr = {
      selectedOptionId: 'legal_now_pr_later',
      justification: 'too short',
    };
    const result = evaluateBreachIncidentCommandDeterministic(
      { decisions },
      ticket()
    );
    expect(result.ok).toBe(false);
    const legal = result.structured.decisionResults.find(
      (r) => r.decisionPointId === 'engage_legal_pr'
    );
    expect(legal?.selectionMatch).toBe(true);
    expect(legal?.justificationOk).toBe(false);
    expect(legal?.reason).toBe('justification_too_short');
    expect(result.structured.reason).toBe('justification_too_short');
  });

  it('honors passThresholdPercent below 100', () => {
    const soft = ticket({
      expected_state: {
        ...(ticket().expected_state as Record<string, unknown>),
        passThresholdPercent: 75,
      },
    });
    const decisions = correctDecisions();
    decisions.external_notify = {
      selectedOptionId: 'customers_now',
      justification: JUST,
    };
    const result = evaluateBreachIncidentCommandDeterministic(
      { decisions },
      soft
    );
    expect(result.structured.percentage).toBe(75);
    expect(result.ok).toBe(true);
  });

  it('rejects missing decision points', () => {
    const { declare_contained: _omit, ...partial } = correctDecisions();
    void _omit;
    const result = evaluateBreachIncidentCommandDeterministic(
      { decisions: partial },
      ticket()
    );
    expect(result.ok).toBe(false);
    const contain = result.structured.decisionResults.find(
      (r) => r.decisionPointId === 'declare_contained'
    );
    expect(contain?.reason).toBe('missing_decision');
  });

  it('accepts multi-select in any order', () => {
    const decisions = correctDecisions();
    decisions.notify_immediate = {
      selectedOptionIds: ['soc_lead', 'ciso', 'isso'],
      justification: JUST,
    };
    const result = evaluateBreachIncidentCommandDeterministic(
      { decisions },
      ticket()
    );
    expect(result.ok).toBe(true);
  });
});
