import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  SECURITY_BUDGET_ALLOCATION_MIN_JUSTIFICATION_LENGTH,
  evaluateSecurityBudgetAllocationDeterministic,
  extractSecurityBudgetAllocationSubmission,
  parseBudgetRequests,
  resolveTotalBudget,
  securityBudgetAllocationTicketScorer,
} from '@/lib/scoring/securityBudgetAllocation';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';

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

const REQUESTS = [
  {
    id: 'req_edr',
    title: 'EDR expansion',
    category: 'tooling',
    amountRequested: 80000,
    riskContext: 'Unmanaged endpoints lack detection.',
  },
  {
    id: 'req_isso_fte',
    title: 'Additional ISSO FTE',
    category: 'staffing',
    amountRequested: 120000,
    riskContext: 'ConMon/POA&M backlog on High systems.',
  },
  {
    id: 'req_training',
    title: 'Role-based security training',
    category: 'training',
    amountRequested: 25000,
    riskContext: 'Privileged users fail phishing simulations.',
  },
  {
    id: 'req_vanity_dashboard',
    title: 'Executive dashboard redesign',
    category: 'tooling',
    amountRequested: 40000,
    riskContext: 'Cosmetic executive reporting only.',
  },
  {
    id: 'req_pentest',
    title: 'Annual penetration test',
    category: 'tooling',
    amountRequested: 45000,
    riskContext: 'Internet-facing apps untested since migration.',
  },
  {
    id: 'req_awareness_swag',
    title: 'Awareness campaign swag',
    category: 'training',
    amountRequested: 15000,
    riskContext: 'Low risk reduction; promotional items.',
  },
];

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-budget-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'security_budget_allocation',
    difficulty: 'medium',
    sla_minutes: 60,
    scenario_brief:
      'Security budget: Allocate FY2027 security investment portfolio under a $250k ceiling',
    initial_state: {
      prompt:
        'Allocate the FY security budget across competing requests. Total allocated must not exceed the budget. Justify the allocation based on risk reduction.',
      organization: {
        name: 'HarborForge Logistics',
        mission:
          'Regional freight and customs brokerage with hybrid workforce.',
      },
      fiscalYear: 'FY2027',
      totalBudget: 250000,
      currency: 'USD',
      requests: REQUESTS,
      minJustificationLength: 250,
      allocationMode: 'partial_ok',
    },
    expected_state: {
      totalBudget: 250000,
      minJustificationLength: 250,
      mustNotExceedBudget: true,
      requirePositiveAllocation: true,
      discouragedRequestIds: ['req_vanity_dashboard', 'req_awareness_swag'],
      preferredHighValueIds: ['req_edr', 'req_isso_fte', 'req_pentest'],
      guidanceTopics: [
        'risk-based budgeting',
        'risk reduction',
        'security investment prioritization',
      ],
      minPercentBudgetUsed: 0.7,
    },
    dcwf_code: '722',
    sort_order: 1,
    ...overrides,
  };
}

const solidJustification = [
  'Fund full EDR expansion ($80k) to close undetected ransomware dwell time on unmanaged field endpoints that currently lack agent coverage.',
  'Fund a partial ISSO FTE bridge ($100k) so ConMon and POA&M backlog on High-impact systems can be worked down before the next ATO milestone.',
  'Fund the annual pentest ($45k) because internet-facing apps have not been independently validated since the cloud migration.',
  'Fund role-based training ($25k) for privileged admins after repeated phishing failures.',
  'Zero the executive dashboard redesign and awareness swag — they are cosmetic/low risk reduction relative to detection, assessment, and workforce capacity this FY.',
].join(' ');

const solidSubmission = {
  type: 'security_budget_allocation',
  allocations: {
    req_edr: 80000,
    req_isso_fte: 100000,
    req_training: 25000,
    req_vanity_dashboard: 0,
    req_pentest: 45000,
    req_awareness_swag: 0,
  },
  justification: solidJustification,
};

describe('securityBudgetAllocation scorer shape', () => {
  it('registers security_budget_allocation and aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('security_budget_allocation');
    expect(registered).toContain('budget_allocation');
    expect(registered).toContain('risk_based_budget');
    expect(getTicketScorer('security_budget_allocation')).toBeTruthy();
    expect(getTicketScorer('budget_allocation')).toBe(
      getTicketScorer('security_budget_allocation')
    );
    expect(getTicketScorer('risk_based_budget')).toBe(
      getTicketScorer('security_budget_allocation')
    );
  });

  it('parses requests and resolves total budget', () => {
    const t = ticket();
    expect(parseBudgetRequests(t.initial_state)).toHaveLength(6);
    expect(resolveTotalBudget(t)).toBe(250000);
  });

  it('extracts camelCase and snake_case fields', () => {
    expect(
      extractSecurityBudgetAllocationSubmission(solidSubmission)
    ).toMatchObject({
      allocations: solidSubmission.allocations,
      justification: solidJustification,
    });

    const snake = extractSecurityBudgetAllocationSubmission({
      budget_allocations: solidSubmission.allocations,
      rationale: solidJustification,
    });
    expect(snake?.allocations.req_edr).toBe(80000);
    expect(snake?.justification).toBe(solidJustification);
  });

  it('fails when allocations or justification are missing', () => {
    const missing = evaluateSecurityBudgetAllocationDeterministic({}, ticket());
    expect(missing.ok).toBe(false);
    expect(missing.structured.reason).toBe('missing_fields');
  });

  it('fails when total exceeds budget', () => {
    const result = evaluateSecurityBudgetAllocationDeterministic(
      {
        ...solidSubmission,
        allocations: {
          req_edr: 80000,
          req_isso_fte: 120000,
          req_training: 25000,
          req_vanity_dashboard: 40000,
          req_pentest: 45000,
          req_awareness_swag: 15000,
        },
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('over_budget');
    expect(result.structured.overBudget).toBe(true);
  });

  it('fails when a line exceeds amountRequested', () => {
    const result = evaluateSecurityBudgetAllocationDeterministic(
      {
        ...solidSubmission,
        allocations: {
          ...solidSubmission.allocations,
          req_edr: 90000,
        },
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('exceeds_amount_requested');
    expect(result.structured.overRequestIds).toContain('req_edr');
  });

  it('fails when budget utilization is below minPercentBudgetUsed', () => {
    const result = evaluateSecurityBudgetAllocationDeterministic(
      {
        ...solidSubmission,
        allocations: {
          req_edr: 80000,
          req_isso_fte: 0,
          req_training: 0,
          req_vanity_dashboard: 0,
          req_pentest: 0,
          req_awareness_swag: 0,
        },
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('underutilized_budget');
  });

  it('fails when justification is too short', () => {
    const result = evaluateSecurityBudgetAllocationDeterministic(
      {
        ...solidSubmission,
        justification: 'Fund EDR and ISSO because risk.',
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('justification_too_short');
    expect(result.structured.minJustificationLength).toBe(
      SECURITY_BUDGET_ALLOCATION_MIN_JUSTIFICATION_LENGTH
    );
  });

  it('passes deterministic gates with a risk-based mix under budget', () => {
    const result = evaluateSecurityBudgetAllocationDeterministic(
      solidSubmission,
      ticket()
    );

    expect(result.ok).toBe(true);
    expect(result.structured).toMatchObject({
      style: 'security_budget_allocation',
      fieldsOk: true,
      overBudget: false,
      budgetUsed: 250000,
      totalBudget: 250000,
    });
    expect(result.structured.percentBudgetUsed).toBeGreaterThanOrEqual(0.7);
    expect(callClaudeGrading).not.toHaveBeenCalled();
  });

  it('does not hard-fail when vanity items are funded if gates otherwise pass', () => {
    // Soft preferences must not hard-fail; RAG decides risk quality.
    const result = evaluateSecurityBudgetAllocationDeterministic(
      {
        type: 'security_budget_allocation',
        allocations: {
          req_edr: 80000,
          req_isso_fte: 90000,
          req_training: 0,
          req_vanity_dashboard: 40000,
          req_pentest: 40000,
          req_awareness_swag: 0,
        },
        justification: solidJustification,
      },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.fieldsOk).toBe(true);
  });
});

describe('securityBudgetAllocationTicketScorer', () => {
  beforeEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  afterEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  it('returns needs_revision before calling the grader when gates fail', async () => {
    const result = await securityBudgetAllocationTicketScorer.score(
      {},
      ticket()
    );
    expect(result.status).toBe('needs_revision');
    expect(callClaudeGrading).not.toHaveBeenCalled();
  });

  it('resolves when RAG grading is satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'satisfied',
      feedback:
        'Risk-based mix funds detection, capacity, and assessment; vanity deferred with clear rationale.',
      strengths: [
        'Links EDR and ISSO spend to residual risk',
        'Zeros vanity with explicit deferral',
      ],
      gaps: [],
    });

    const result = await securityBudgetAllocationTicketScorer.score(
      solidSubmission,
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(callClaudeGrading).toHaveBeenCalledOnce();
    expect(result.structuredResult).toMatchObject({
      style: 'security_budget_allocation',
      fieldsOk: true,
      grading: { finding_state: 'satisfied' },
    });
  });

  it('needs_revision when API key is missing after gates pass', async () => {
    const { MissingAnthropicApiKeyError } =
      await import('@/lib/grading/callClaudeGrading');
    vi.mocked(callClaudeGrading).mockRejectedValue(
      new MissingAnthropicApiKeyError()
    );

    const result = await securityBudgetAllocationTicketScorer.score(
      solidSubmission,
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult).toMatchObject({
      reason: 'grading_unavailable_missing_api_key',
    });
    expect(result.feedback).toMatch(/ANTHROPIC_API_KEY/i);
  });
});
