import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import { isFlagshipEligibleTicketType } from '@/lib/helpdesk/ticketCodes';
import {
  buildStrategyMemoPreview,
  evaluateSecurityStrategyCapstoneDeterministic,
  isSecurityStrategyCapstoneTicketType,
  securityStrategyCapstoneTicketScorer,
} from '@/lib/scoring/securityStrategyCapstone';
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

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-strategy',
    tenant_id: 'ten1',
    track_id: 'tr-issm',
    tier: 3,
    ticket_type: 'security_strategy_capstone',
    difficulty: 'high',
    sla_minutes: 120,
    scenario_brief:
      'ISSM-07: Draft a one-year security strategy memo for HarborLedger (flagship portfolio)',
    initial_state: {
      ticketCode: 'ISSM-07',
      flagship: true,
      flagshipPortfolio: true,
      minMemoLength: 600,
      organization: {
        name: 'HarborLedger',
        mission: 'Financial reporting for municipal ports',
        size: '420 employees',
      },
      riskProfile: {
        overall: 'high',
        topRisks: ['Privileged MFA gaps', 'Aging High POA&Ms'],
        threatContext: 'Ransomware against finance admins',
      },
      budget: {
        fiscalYear: 'FY2027',
        totalBudget: 400000,
        constraints: ['No new headcount until Q3'],
        mustFund: ['Annual assessment contract'],
      },
      priorFindings: [
        {
          id: 'f1',
          title: 'Privileged MFA not enforced',
          severity: 'high',
          source: 'OA',
          status: 'open',
        },
      ],
    },
    expected_state: {
      minMemoLength: 600,
      minPriorities: 3,
      minOutcomes: 3,
      requiredSectionKeys: ['priorities', 'resourcing', 'expected_outcomes'],
      flagshipOnResolve: true,
      flagshipPortfolio: true,
      passThreshold: 'satisfied',
    },
    dcwf_code: '722',
    sort_order: 1,
    ...overrides,
  };
}

const solidPriorityRationale =
  'Closes the open OA finding on privileged finance MFA and cuts ransomware dwell time on HarborLedger admin paths.';

function solidSubmission() {
  return {
    type: 'security_strategy_capstone',
    priorities: [
      {
        rank: 1,
        title:
          'Enforce phishing-resistant MFA on privileged HarborLedger roles',
        rationale: solidPriorityRationale,
      },
      {
        rank: 2,
        title: 'Clear High POA&Ms older than 90 days on finance systems',
        rationale:
          'Aging High POA&Ms are the top residual-risk driver in the enterprise register and block clean ATO packages.',
      },
      {
        rank: 3,
        title: 'Fund ConMon tooling coverage for High-impact finance apps',
        rationale:
          'Threat context shows ransomware against finance admins; detection coverage gaps leave residual risk high after MFA.',
      },
    ],
    resourcing:
      'FY2027 envelope is $400k. Must-fund the annual assessment contract (~$90k). Allocate ~$120k to identity Conditional Access / phishing-resistant MFA rollout for privileged roles, ~$100k to DefectDojo + CSPM expansion for HarborLedger, and ~$50k contractor surge for POA&M closure. No new FTE until Q3; ISSO capacity absorbs ConMon ownership. Defer vanity dashboard redesign.',
    expectedOutcomes: [
      {
        title: 'Privileged MFA coverage',
        metric:
          '100% of HarborLedger privileged roles under phishing-resistant MFA by Q2',
      },
      {
        title: 'POA&M aging',
        metric:
          'Reduce High POA&Ms >90 days from current backlog to under 15% by year end',
      },
      {
        title: 'ConMon coverage',
        metric:
          'Weekly automated findings digest for HarborLedger with criticals escalated <24h',
      },
    ],
  };
}

describe('securityStrategyCapstone', () => {
  beforeEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('recognizes aliases and flagship eligibility', () => {
    expect(
      isSecurityStrategyCapstoneTicketType('security_strategy_capstone')
    ).toBe(true);
    expect(
      isSecurityStrategyCapstoneTicketType('one_year_security_strategy')
    ).toBe(true);
    expect(
      isSecurityStrategyCapstoneTicketType('issm_strategy_memo_capstone')
    ).toBe(true);
    expect(
      isSecurityStrategyCapstoneTicketType('issm.security_strategy_capstone')
    ).toBe(true);
    expect(isFlagshipEligibleTicketType('security_strategy_capstone')).toBe(
      true
    );
    expect(isFlagshipEligibleTicketType('one_year_security_strategy')).toBe(
      true
    );
    expect(isFlagshipEligibleTicketType('triage')).toBe(false);
  });

  it('registers security_strategy_capstone aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('security_strategy_capstone');
    expect(registered).toContain('one_year_security_strategy');
    expect(registered).toContain('issm_strategy_memo_capstone');
    expect(getTicketScorer('security_strategy_capstone')).toBe(
      securityStrategyCapstoneTicketScorer
    );
  });

  it('fails deterministic gates when sections are missing or thin', () => {
    const missing = evaluateSecurityStrategyCapstoneDeterministic({}, ticket());
    expect(missing.ok).toBe(false);
    expect(missing.structured.reason).toBe('missing_fields');
    expect(missing.structured.flagshipEligible).toBe(true);

    const thin = evaluateSecurityStrategyCapstoneDeterministic(
      {
        type: 'security_strategy_capstone',
        priorities: '1. MFA\n2. POA&M\n3. ConMon',
        resourcing: 'Spend the budget wisely on security tools and people.',
        expectedOutcomes:
          '1. Better security\n2. Fewer findings\n3. Happier AO',
      },
      ticket()
    );
    expect(thin.ok).toBe(false);
    expect(['sections_too_short', 'memo_too_short']).toContain(
      thin.structured.reason
    );
  });

  it('passes deterministic checks for a solid structured memo', () => {
    const result = evaluateSecurityStrategyCapstoneDeterministic(
      solidSubmission(),
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.fieldsOk).toBe(true);
    expect(result.structured.priorityCount).toBe(3);
    expect(result.structured.outcomeCount).toBe(3);
    expect(result.structured.flagshipEligible).toBe(true);
    expect(result.structured.memoLength).toBeGreaterThanOrEqual(600);
  });

  it('builds a cohesive memo preview from structured fields', () => {
    const preview = buildStrategyMemoPreview(solidSubmission());
    expect(preview).toContain('## Top priorities');
    expect(preview).toContain('## Resourcing');
    expect(preview).toContain('## Expected outcomes');
    expect(preview).toContain('Enforce phishing-resistant MFA');
  });

  it('resolves when RAG grading is satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'satisfied',
      feedback: 'Risk-aligned strategy with budget-realistic resourcing.',
      strengths: ['Tied priorities to MFA finding'],
      gaps: [],
    });

    const result = await securityStrategyCapstoneTicketScorer.score(
      solidSubmission(),
      ticket()
    );
    expect(result.status).toBe('resolved');
    expect(result.structuredResult.style).toBe('security_strategy_capstone');
    expect(result.structuredResult.flagshipEligible).toBe(true);
    expect(callClaudeGrading).toHaveBeenCalledOnce();
    expect(result.feedback).toMatch(/flagship portfolio item \(ISSM-07\)/);
  });

  it('needs revision when RAG grading is not satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'not_satisfied',
      feedback: 'Priorities are generic platitudes.',
      strengths: [],
      gaps: ['No link to prior findings'],
    });

    const result = await securityStrategyCapstoneTicketScorer.score(
      solidSubmission(),
      ticket()
    );
    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult.reason).toBe('grading_not_satisfied');
  });

  it('resolves without API key after deterministic gates (flagship path)', async () => {
    const { MissingAnthropicApiKeyError } =
      await import('@/lib/grading/callClaudeGrading');
    vi.mocked(callClaudeGrading).mockRejectedValue(
      new MissingAnthropicApiKeyError()
    );

    const result = await securityStrategyCapstoneTicketScorer.score(
      solidSubmission(),
      ticket()
    );
    expect(result.status).toBe('resolved');
    expect(result.structuredResult.reason).toBe(
      'rag_feedback_unavailable_missing_api_key'
    );
    expect(result.feedback).toMatch(/ANTHROPIC_API_KEY/);
    expect(result.feedback).toMatch(/flagship/);
  });
});
