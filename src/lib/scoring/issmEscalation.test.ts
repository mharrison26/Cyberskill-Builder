import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  evaluateIssmEscalationDeterministic,
  issmEscalationTicketScorer,
} from '@/lib/scoring/issmEscalation';
import { isIssmEscalationTicketType } from '@/lib/scoring/ticketUi';

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
    id: 't-issm',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'issm_escalation',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief:
      'ISSM escalation: Shared IdP misconfiguration affects High and Moderate systems under two ISSOs; enterprise CAB/budget required.',
    initial_state: {
      scenario: {
        title: 'HarborForge shared Entra ID MFA policy drift',
        summary:
          'A misconfigured conditional-access baseline on the enterprise IdP weakens MFA for HarborLedger (High) and RiverOps (Moderate), owned by different ISSOs.',
        sharedDependency:
          'Corporate Entra ID tenant (enterprise identity service)',
        impact:
          'Cross-system authentication assurance degraded for a High-impact finance system and a Moderate ops system.',
        resourceNeeds:
          'Enterprise identity budget and CAB approval for IdP baseline change; beyond single-ISSO authority.',
      },
    },
    expected_state: {
      expectedDecision: 'escalate',
      minMemoLength: 120,
      guidanceTopics: [
        'cross-system-impact',
        'resource-authority',
        'escalation-criteria',
      ],
      topKGuidanceSections: 5,
    },
    dcwf_code: '612',
    sort_order: 1,
    ...overrides,
  };
}

const solidMemo =
  'Escalate to the ISSM. HarborLedger (High, ISSO Patel) and RiverOps (Moderate, ISSO Okonkwo) both depend on the shared Entra ID tenant; the MFA policy drift is a cross-system impact that neither ISSO can fix alone. Remediation needs enterprise identity budget and CAB change authority beyond ISSO scope, and residual risk on the High system remains above tolerance with only local compensating controls.';

describe('isIssmEscalationTicketType', () => {
  it('matches primary and alias ticket types', () => {
    expect(isIssmEscalationTicketType('issm_escalation')).toBe(true);
    expect(isIssmEscalationTicketType('cross_system_escalation')).toBe(true);
    expect(isIssmEscalationTicketType('isso_to_issm_escalation')).toBe(true);
    expect(isIssmEscalationTicketType('grc.issm_escalation')).toBe(true);
    expect(isIssmEscalationTicketType('sla_escalation')).toBe(false);
  });
});

describe('evaluateIssmEscalationDeterministic', () => {
  it('rejects missing expectedDecision', () => {
    const result = evaluateIssmEscalationDeterministic(
      { decision: 'escalate', memo: solidMemo },
      ticket({ expected_state: {} })
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('misconfigured_expected_state');
  });

  it('rejects missing fields', () => {
    const result = evaluateIssmEscalationDeterministic({}, ticket());
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_fields');
  });

  it('rejects incorrect decision even with a long memo', () => {
    const result = evaluateIssmEscalationDeterministic(
      {
        decision: 'handle_at_isso',
        memo: solidMemo,
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('incorrect_decision');
    expect(result.structured.decisionMatch).toBe(false);
    expect(result.structured.expectedDecision).toBe('escalate');
  });

  it('rejects short memo when decision matches', () => {
    const result = evaluateIssmEscalationDeterministic(
      {
        decision: 'escalate',
        memo: 'Cross-system IdP issue — escalate.',
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('memo_too_short');
  });

  it('passes when decision matches and memo meets length', () => {
    const result = evaluateIssmEscalationDeterministic(
      {
        type: 'issm_escalation',
        decision: 'escalate',
        memo: solidMemo,
      },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.decisionMatch).toBe(true);
    expect(result.structured.memoLengthOk).toBe(true);
  });

  it('accepts handle_at_isso answer key when configured', () => {
    const result = evaluateIssmEscalationDeterministic(
      {
        decision: 'handle_at_isso',
        memo: 'Retain at ISSO level because the weakness is confined to HarborLedger only, remediation is within ISSO Patel budget and change authority, residual risk can be reduced with local compensating MFA for that boundary, and no second ISSO system depends on the flawed component.',
      },
      ticket({
        expected_state: {
          expectedDecision: 'handle_at_isso',
          minMemoLength: 120,
        },
      })
    );
    expect(result.ok).toBe(true);
    expect(result.structured.decision).toBe('handle_at_isso');
  });

  it('normalizes escalate_to_issm alias', () => {
    const result = evaluateIssmEscalationDeterministic(
      {
        decision: 'escalate_to_issm',
        memo: solidMemo,
      },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.decision).toBe('escalate');
  });
});

describe('issmEscalationTicketScorer', () => {
  beforeEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves when Claude returns satisfied against retrieved guidance', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'satisfied',
      feedback:
        'Memo cites cross-system IdP impact and enterprise resource/authority limits.',
      strengths: [
        'Names both systems and ISSOs',
        'Links CAB/budget needs to ISSM escalation',
      ],
      gaps: [],
    });

    const result = await issmEscalationTicketScorer.score(
      {
        type: 'issm_escalation',
        decision: 'escalate',
        memo: solidMemo,
      },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      style: 'issm_escalation',
      decision: 'escalate',
      decisionMatch: true,
    });
    expect(
      (result.structuredResult as { retrievedSectionIds: string[] })
        .retrievedSectionIds
    ).toContain('cross-system-impact');
    expect(callClaudeGrading).toHaveBeenCalledOnce();
    const prompt = vi.mocked(callClaudeGrading).mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('Retrieved ISSM escalation criteria');
    expect(prompt).toContain('Use only the retrieved guidance');
    expect(prompt).toContain('cross-system');
  });

  it('needs revision when grading is not satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'insufficient_evidence',
      feedback: 'No resource/authority discussion relative to ISSO limits.',
      strengths: ['Chose escalate'],
      gaps: ['Missing enterprise CAB/budget authority criterion'],
    });

    const result = await issmEscalationTicketScorer.score(
      {
        decision: 'escalate',
        memo: solidMemo,
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.feedback).toContain('No resource/authority discussion');
  });

  it('needs revision when API key is missing after deterministic pass', async () => {
    const { MissingAnthropicApiKeyError } =
      await import('@/lib/grading/callClaudeGrading');
    vi.mocked(callClaudeGrading).mockRejectedValue(
      new MissingAnthropicApiKeyError()
    );

    const result = await issmEscalationTicketScorer.score(
      {
        decision: 'escalate',
        memo: solidMemo,
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult).toMatchObject({
      reason: 'grading_unavailable_missing_api_key',
    });
  });
});
