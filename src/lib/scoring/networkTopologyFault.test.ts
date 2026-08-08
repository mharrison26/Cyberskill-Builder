import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  evaluateNetworkTopologyFaultDeterministic,
  extractNetworkTopologyFaultSubmission,
  parseNetworkTopologyFaultExpectedState,
  networkTopologyFaultTicketScorer,
} from '@/lib/scoring/networkTopologyFault';
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
    id: 't-network-topology-fault',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 1,
    ticket_type: 'network_topology_fault',
    difficulty: 'medium',
    sla_minutes: 25,
    scenario_brief:
      'Network topology fault: VLAN10 workstation cannot reach internet — locate misconfigured device',
    initial_state: {
      prompt:
        'Identify which device or subnet is misconfigured and justify using the diagram and command output.',
      diagram:
        'Internet — R1 — CoreSW — VLAN10 10.20.30.0/24 (WS-A) / VLAN20 10.20.40.0/24',
      faultLocations: [
        { id: 'ws_a', label: 'WS-A (VLAN10 workstation)' },
        { id: 'vlan10_svi', label: 'R1 VLAN10 SVI (10.20.30.1)' },
        { id: 'vlan20_svi', label: 'R1 VLAN20 SVI (10.20.40.1)' },
        { id: 'fs_b', label: 'FS-B (VLAN20 file server)' },
      ],
      commands: [
        {
          command: 'ip addr show eth0',
          output: 'inet 10.20.30.45/24 ...\n default via 10.20.40.1',
        },
      ],
    },
    expected_state: {
      faultLocation: 'ws_a',
      minJustificationLength: 80,
      guidanceTopics: [
        'gateway-same-subnet',
        'subnet-mask-boundaries',
        'evidence-from-diagnostics',
        'isolate-fault-location',
      ],
    },
    dcwf_code: '411',
    sort_order: 1,
    ...overrides,
  };
}

const solidJustification =
  'WS-A is misconfigured: ip addr shows 10.20.30.45/24 with default via 10.20.40.1, which is outside the 10.20.30.0/24 on-link subnet. The host cannot ARP for that gateway, matching Destination host unreachable. VLAN SVIs and FS-B look consistent with the diagram.';

describe('network_topology_fault registration', () => {
  it('registers network_topology_fault and aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('network_topology_fault');
    expect(registered).toContain('subnet_fault_diagnosis');
    expect(registered).toContain('topology_misconfig');
    expect(getTicketScorer('network_topology_fault')).toBeTruthy();
    expect(getTicketScorer('subnet_fault_diagnosis')).toBe(
      getTicketScorer('network_topology_fault')
    );
  });
});

describe('parseNetworkTopologyFaultExpectedState', () => {
  it('reads faultLocation aliases', () => {
    expect(
      parseNetworkTopologyFaultExpectedState({
        misconfigured_device: 'WS-A',
        min_justification_length: 90,
      })
    ).toEqual({
      faultLocation: 'ws_a',
      minJustificationLength: 90,
      guidanceTopics: undefined,
      topKGuidanceSections: undefined,
    });
  });
});

describe('extractNetworkTopologyFaultSubmission', () => {
  it('normalizes location ids and requires justification', () => {
    expect(
      extractNetworkTopologyFaultSubmission({
        type: 'network_topology_fault',
        faultLocation: 'WS-A',
        justification: solidJustification,
      })
    ).toEqual({
      type: 'network_topology_fault',
      faultLocation: 'ws_a',
      justification: solidJustification,
    });

    expect(
      extractNetworkTopologyFaultSubmission({
        faultLocation: 'ws_a',
        justification: '   ',
      })
    ).toBeNull();
  });
});

describe('evaluateNetworkTopologyFaultDeterministic', () => {
  it('rejects missing fields', () => {
    const result = evaluateNetworkTopologyFaultDeterministic({}, ticket());
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_fields');
  });

  it('rejects incorrect fault location', () => {
    const result = evaluateNetworkTopologyFaultDeterministic(
      {
        faultLocation: 'vlan10_svi',
        justification: solidJustification,
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.faultLocationMatch).toBe(false);
    expect(result.structured.reason).toBe('incorrect_fault_location');
  });

  it('rejects short justification even when location matches', () => {
    const result = evaluateNetworkTopologyFaultDeterministic(
      {
        faultLocation: 'ws_a',
        justification: 'Wrong gateway.',
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.faultLocationMatch).toBe(true);
    expect(result.structured.justificationLengthOk).toBe(false);
    expect(result.structured.reason).toBe('justification_too_short');
  });

  it('passes when location matches and justification meets minimum length', () => {
    const result = evaluateNetworkTopologyFaultDeterministic(
      {
        type: 'network_topology_fault',
        faultLocation: 'ws-a',
        justification: solidJustification,
      },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured).toMatchObject({
      style: 'network_topology_fault',
      faultLocation: 'ws_a',
      expectedFaultLocation: 'ws_a',
      faultLocationMatch: true,
      justificationLengthOk: true,
    });
  });

  it('fails closed when expected_state omits faultLocation', () => {
    const result = evaluateNetworkTopologyFaultDeterministic(
      {
        faultLocation: 'ws_a',
        justification: solidJustification,
      },
      ticket({ expected_state: {} })
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('misconfigured_expected_state');
  });
});

describe('networkTopologyFaultTicketScorer', () => {
  beforeEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not call RAG when deterministic identification fails', async () => {
    const result = await networkTopologyFaultTicketScorer.score(
      {
        faultLocation: 'fs_b',
        justification: solidJustification,
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(callClaudeGrading).not.toHaveBeenCalled();
  });

  it('resolves when Claude returns satisfied against pinned rubric', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'satisfied',
      feedback:
        'Justification correctly ties the off-subnet gateway to WS-A using the /24 boundary and ping evidence.',
      strengths: ['On-link gateway reasoning', 'Cites command output'],
      gaps: [],
    });

    const result = await networkTopologyFaultTicketScorer.score(
      {
        type: 'network_topology_fault',
        faultLocation: 'ws_a',
        justification: solidJustification,
      },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      style: 'network_topology_fault',
      faultLocationMatch: true,
      justificationLengthOk: true,
    });
    expect(
      (result.structuredResult as { retrievedSectionIds: string[] })
        .retrievedSectionIds
    ).toEqual(
      expect.arrayContaining([
        'gateway-same-subnet',
        'subnet-mask-boundaries',
        'evidence-from-diagnostics',
        'isolate-fault-location',
      ])
    );
    expect(callClaudeGrading).toHaveBeenCalledOnce();
    const prompt = vi.mocked(callClaudeGrading).mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('Retrieved subnetting/TCP-IP rubric');
    expect(prompt).toContain('Use only the retrieved rubric sections');
    expect(prompt).toContain('Do not rely on outside knowledge');
    expect(prompt).toContain('Pinned path:');
    expect(prompt).toContain(solidJustification.slice(0, 40));
  });

  it('needs revision when grading is not satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'insufficient_evidence',
      feedback: 'Does not explain why 10.20.40.1 is off-subnet for /24.',
      strengths: ['Names WS-A'],
      gaps: ['Missing on-link gateway reasoning'],
    });

    const result = await networkTopologyFaultTicketScorer.score(
      {
        faultLocation: 'ws_a',
        justification: solidJustification,
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.feedback).toContain('off-subnet');
    expect(result.feedback).toContain('Gaps:');
  });

  it('needs revision when Anthropic API key is missing', async () => {
    const { MissingAnthropicApiKeyError } =
      await import('@/lib/grading/callClaudeGrading');
    vi.mocked(callClaudeGrading).mockRejectedValue(
      new MissingAnthropicApiKeyError()
    );

    const result = await networkTopologyFaultTicketScorer.score(
      {
        faultLocation: 'ws_a',
        justification: solidJustification,
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.feedback).toContain('ANTHROPIC_API_KEY');
    expect(
      (result.structuredResult as { reason?: string }).reason
    ).toBe('grading_unavailable_missing_api_key');
  });
});
