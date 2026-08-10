import { describe, expect, it } from 'vitest';

import {
  evaluateRaciMatrixDeterministic,
  extractRaciMatrixSubmission,
  isRaciMatrixTicketType,
  parseRaciActivities,
  parseRaciMatrixExpectedState,
  parseRaciOrgUnits,
  parseRaciRoles,
  raciMatrixTicketScorer,
} from '@/lib/scoring/raciMatrix';
import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-raci-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'raci_matrix',
    difficulty: 'medium',
    sla_minutes: 40,
    scenario_brief:
      'Assign RACI roles for HarborForge annual risk assessment activities.',
    initial_state: {
      prompt:
        'Using the org chart, assign R/A/C/I for each annual risk assessment activity.',
      activitySummary:
        'HarborForge is running its annual risk assessment for the billing platform.',
      orgUnits: [
        {
          id: 'ao',
          title: 'Authorizing Official',
          name: 'Dana Ortega',
          reportsTo: null,
        },
        {
          id: 'ciso',
          title: 'CISO',
          name: 'Marcus Hale',
          reportsTo: 'ao',
        },
        {
          id: 'issm',
          title: 'ISSM',
          name: 'Priya Shah',
          reportsTo: 'ciso',
        },
        {
          id: 'isso',
          title: 'ISSO',
          name: 'Chris Nguyen',
          reportsTo: 'issm',
        },
        {
          id: 'system_owner',
          title: 'System Owner',
          name: 'Avery Kim',
          reportsTo: 'ao',
        },
      ],
      roles: [
        { id: 'isso', title: 'ISSO' },
        { id: 'issm', title: 'ISSM' },
        { id: 'system_owner', title: 'System Owner' },
        { id: 'ao', title: 'Authorizing Official' },
        { id: 'ciso', title: 'CISO' },
      ],
      activities: [
        {
          id: 'conduct_assessment',
          label: 'Conduct annual risk assessment',
        },
        {
          id: 'accept_residual_risk',
          label: 'Accept residual risk',
        },
      ],
    },
    expected_state: {
      assignments: {
        conduct_assessment: {
          isso: 'R',
          issm: 'A',
          system_owner: 'C',
          ao: 'I',
          ciso: 'C',
        },
        accept_residual_risk: {
          isso: 'C',
          issm: 'C',
          system_owner: 'R',
          ao: 'A',
          ciso: 'I',
        },
      },
      passThresholdPercent: 100,
      requireSingleAccountable: true,
      requireAtLeastOneResponsible: true,
    },
    dcwf_code: '722',
    sort_order: 1,
    ...overrides,
  };
}

const correctSubmission = {
  type: 'raci_matrix',
  assignments: {
    conduct_assessment: {
      isso: 'R',
      issm: 'A',
      system_owner: 'C',
      ao: 'I',
      ciso: 'C',
    },
    accept_residual_risk: {
      isso: 'C',
      issm: 'C',
      system_owner: 'R',
      ao: 'A',
      ciso: 'I',
    },
  },
};

describe('raciMatrix parsers', () => {
  it('registers raci_matrix aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('raci_matrix');
    expect(registered).toContain('raci');
    expect(registered).toContain('responsibility_matrix');
    expect(getTicketScorer('raci_matrix')).toBe(raciMatrixTicketScorer);
  });

  it('detects ticket type aliases', () => {
    expect(isRaciMatrixTicketType('raci_matrix')).toBe(true);
    expect(isRaciMatrixTicketType('grc.raci')).toBe(true);
    expect(isRaciMatrixTicketType('responsibility_matrix')).toBe(true);
    expect(isRaciMatrixTicketType('triage')).toBe(false);
  });

  it('parses org units, roles, and activities from initial_state', () => {
    const t = ticket();
    expect(parseRaciOrgUnits(t.initial_state)).toHaveLength(5);
    expect(parseRaciRoles(t.initial_state).map((r) => r.id)).toEqual([
      'isso',
      'issm',
      'system_owner',
      'ao',
      'ciso',
    ]);
    expect(parseRaciActivities(t.initial_state).map((a) => a.id)).toEqual([
      'conduct_assessment',
      'accept_residual_risk',
    ]);
  });

  it('parses expected assignments and extracts submission', () => {
    const expected = parseRaciMatrixExpectedState(ticket().expected_state);
    expect(expected?.assignments.conduct_assessment.isso).toBe('R');
    expect(expected?.passThresholdPercent).toBe(100);

    const parsed = extractRaciMatrixSubmission(correctSubmission);
    expect(parsed?.assignments.accept_residual_risk.ao).toBe('A');
  });
});

describe('raciMatrix scoring', () => {
  it('resolves a perfect RACI mapping', async () => {
    const result = evaluateRaciMatrixDeterministic(correctSubmission, ticket());
    expect(result.ok).toBe(true);
    expect(result.structured.percentage).toBe(100);
    expect(result.structured.mismatchedCells).toHaveLength(0);

    const scored = await Promise.resolve(
      raciMatrixTicketScorer.score(correctSubmission, ticket())
    );
    expect(scored.status).toBe('resolved');
  });

  it('needs revision when a cell is wrong', () => {
    const submission = {
      ...correctSubmission,
      assignments: {
        ...correctSubmission.assignments,
        conduct_assessment: {
          ...correctSubmission.assignments.conduct_assessment,
          isso: 'A',
          issm: 'R',
        },
      },
    };
    const result = evaluateRaciMatrixDeterministic(submission, ticket());
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('below_threshold');
    expect(result.structured.mismatchedCells.length).toBeGreaterThan(0);
  });

  it('rejects rows without exactly one Accountable', () => {
    const submission = {
      type: 'raci_matrix',
      assignments: {
        conduct_assessment: {
          isso: 'R',
          issm: 'C',
          system_owner: 'C',
          ao: 'I',
          ciso: 'C',
        },
        accept_residual_risk:
          correctSubmission.assignments.accept_residual_risk,
      },
    };
    const result = evaluateRaciMatrixDeterministic(submission, ticket());
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('structural_rules_failed');
    expect(result.feedback).toMatch(/exactly one Accountable/);
  });

  it('honors passThresholdPercent below 100', () => {
    const softTicket = ticket({
      expected_state: {
        ...(ticket().expected_state as Record<string, unknown>),
        passThresholdPercent: 80,
      },
    });
    const almost = {
      ...correctSubmission,
      assignments: {
        ...correctSubmission.assignments,
        conduct_assessment: {
          ...correctSubmission.assignments.conduct_assessment,
          ciso: 'I',
        },
      },
    };
    const result = evaluateRaciMatrixDeterministic(almost, softTicket);
    expect(result.structured.percentage).toBeGreaterThanOrEqual(80);
    expect(result.ok).toBe(true);
  });
});
