import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  evaluateSlaEscalationDeterministic,
  slaEscalationTicketScorer,
} from '@/lib/scoring/slaEscalation';

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
    id: 't-sla',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 1,
    ticket_type: 'sla_escalation',
    difficulty: 'medium',
    sla_minutes: 30,
    scenario_brief:
      'Multi-user VPN outage during business hours; Tier-1 runbooks exhausted.',
    initial_state: {
      scenario: {
        title: 'VPN outage — East campus',
        summary:
          'About 40 users cannot reach the corporate VPN. Security has no compromise indicators yet.',
        impact: 'Production remote access degraded for an entire campus.',
      },
    },
    expected_state: {
      expectedDecision: 'escalate',
      minJustificationLength: 80,
      guidanceTopics: [
        'tier1-scope',
        'escalate-triggers',
        'decision-test',
        'escalation-path',
      ],
    },
    dcwf_code: '411',
    sort_order: 1,
    ...overrides,
  };
}

const solidJustification =
  'This is a multi-user production access outage affecting ~40 campus users after Tier-1 VPN reset steps failed. Per the mandatory escalation triggers for site-wide / multi-user production outages, I escalate to on-call infrastructure with symptoms, impact scope, and steps already tried rather than closing as Tier 1.';

describe('evaluateSlaEscalationDeterministic', () => {
  it('rejects missing expectedDecision', () => {
    const result = evaluateSlaEscalationDeterministic(
      { decision: 'escalate', justification: solidJustification },
      ticket({ expected_state: {} })
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('misconfigured_expected_state');
  });

  it('rejects missing fields', () => {
    const result = evaluateSlaEscalationDeterministic({}, ticket());
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_fields');
  });

  it('rejects incorrect decision even with a long justification', () => {
    const result = evaluateSlaEscalationDeterministic(
      {
        decision: 'resolve',
        justification: solidJustification,
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('incorrect_decision');
    expect(result.structured.decisionMatch).toBe(false);
    expect(result.structured.expectedDecision).toBe('escalate');
  });

  it('rejects short justification when decision matches', () => {
    const result = evaluateSlaEscalationDeterministic(
      {
        decision: 'escalate',
        justification: 'Looks big, escalate.',
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('justification_too_short');
  });

  it('passes when decision matches and justification meets length', () => {
    const result = evaluateSlaEscalationDeterministic(
      {
        type: 'sla_escalation',
        decision: 'escalate',
        justification: solidJustification,
      },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.decisionMatch).toBe(true);
    expect(result.structured.justificationLengthOk).toBe(true);
  });

  it('accepts resolve answer key when configured', () => {
    const result = evaluateSlaEscalationDeterministic(
      {
        decision: 'resolve',
        justification:
          'Single-user password lockout after identity verification fits Tier-1 resolve scope in the policy; no multi-user outage, security, VIP, or SLA-breach trigger applies, so I reset the password per runbook and confirm the user can sign in.',
      },
      ticket({
        expected_state: {
          expectedDecision: 'resolve',
          minJustificationLength: 80,
        },
      })
    );
    expect(result.ok).toBe(true);
    expect(result.structured.decision).toBe('resolve');
  });
});

describe('slaEscalationTicketScorer', () => {
  beforeEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves when Claude returns satisfied against retrieved policy', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'satisfied',
      feedback:
        'Justification cites the multi-user production outage escalation trigger.',
      strengths: ['Clear policy citation', 'Scenario facts tied to trigger'],
      gaps: [],
    });

    const result = await slaEscalationTicketScorer.score(
      {
        type: 'sla_escalation',
        decision: 'escalate',
        justification: solidJustification,
      },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      style: 'sla_escalation',
      decision: 'escalate',
      decisionMatch: true,
    });
    expect(
      (result.structuredResult as { retrievedSectionIds: string[] })
        .retrievedSectionIds
    ).toContain('escalate-triggers');
    expect(callClaudeGrading).toHaveBeenCalledOnce();
    const prompt = vi.mocked(callClaudeGrading).mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('Retrieved SLA / escalation policy');
    expect(prompt).toContain('Use only the retrieved policy');
    expect(prompt).toContain('mandatory escalation');
  });

  it('needs revision when grading is not satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'insufficient_evidence',
      feedback: 'No specific policy trigger is cited.',
      strengths: ['Chose escalate'],
      gaps: ['Missing citation to multi-user outage trigger'],
    });

    const result = await slaEscalationTicketScorer.score(
      {
        decision: 'escalate',
        justification: solidJustification,
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.feedback).toContain('No specific policy trigger');
  });

  it('needs revision when API key is missing after deterministic pass', async () => {
    const { MissingAnthropicApiKeyError } = await import(
      '@/lib/grading/callClaudeGrading'
    );
    vi.mocked(callClaudeGrading).mockRejectedValue(
      new MissingAnthropicApiKeyError()
    );

    const result = await slaEscalationTicketScorer.score(
      {
        decision: 'escalate',
        justification: solidJustification,
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult).toMatchObject({
      reason: 'grading_unavailable_missing_api_key',
    });
  });
});
