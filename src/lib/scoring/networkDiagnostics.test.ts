import { describe, expect, it } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';
import {
  evaluateNetworkDiagnostics,
  extractNetworkDiagnosticsSubmission,
  parseNetworkDiagnosticsExpectedState,
} from '@/lib/scoring/networkDiagnostics';

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-netdiag-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 1,
    ticket_type: 'network_diagnostics',
    difficulty: 'medium',
    sla_minutes: 25,
    scenario_brief: 'Diagnose the connectivity fault from the command output.',
    initial_state: {
      prompt: 'Review the static command output and identify the fault.',
    },
    expected_state: {
      faultType: 'wrong_default_gateway',
      nextDiagnosticStep: 'verify_gateway_with_peer',
    },
    dcwf_code: null,
    sort_order: 0,
    ...overrides,
  };
}

describe('networkDiagnostics scorer', () => {
  it('registers network_diagnostics and aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('network_diagnostics');
    expect(registered).toContain('pi04');
    expect(registered).toContain('traceroute_fault');
    expect(registered).toContain('command_output_diagnosis');
    expect(getTicketScorer('network_diagnostics')).toBeTruthy();
    expect(getTicketScorer('pi04')).toBe(
      getTicketScorer('network_diagnostics')
    );
  });

  it('parses expected_state faultType and nextDiagnosticStep aliases', () => {
    expect(
      parseNetworkDiagnosticsExpectedState({
        expectedFaultType: 'Wrong Gateway',
        next_step: 'confirm_gateway',
      })
    ).toEqual({
      faultType: 'wrong_default_gateway',
      nextDiagnosticStep: 'verify_gateway_with_peer',
    });
  });

  it('extracts submission fields with snake_case aliases', () => {
    const parsed = extractNetworkDiagnosticsSubmission({
      type: 'network_diagnostics',
      fault_type: 'dns_failure',
      next_step: 'test_dns',
    });

    expect(parsed).toEqual({
      type: 'network_diagnostics',
      faultType: 'dns_failure',
      nextDiagnosticStep: 'test_dns_servers',
    });
  });

  it('fails when expected_state is misconfigured', () => {
    const result = evaluateNetworkDiagnostics(
      {
        faultType: 'wrong_default_gateway',
        nextDiagnosticStep: 'verify_gateway_with_peer',
      },
      ticket({ expected_state: {} })
    );

    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('misconfigured_expected_state');
  });

  it('fails when submission fields are missing', () => {
    const result = evaluateNetworkDiagnostics({}, ticket());
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_fields');
  });

  it('fails when faultType does not match expected_state', () => {
    const result = evaluateNetworkDiagnostics(
      {
        faultType: 'dns_failure',
        nextDiagnosticStep: 'verify_gateway_with_peer',
      },
      ticket()
    );

    expect(result.ok).toBe(false);
    expect(result.structured).toMatchObject({
      style: 'network_diagnostics',
      faultTypeMatch: false,
      nextDiagnosticStepMatch: true,
      reason: 'incorrect_diagnosis',
    });
    expect(result.feedback).toMatch(/wrong default gateway/i);
  });

  it('fails when nextDiagnosticStep does not match', () => {
    const result = evaluateNetworkDiagnostics(
      {
        faultType: 'wrong_default_gateway',
        nextDiagnosticStep: 'renew_dhcp_lease',
      },
      ticket()
    );

    expect(result.ok).toBe(false);
    expect(result.structured.nextDiagnosticStepMatch).toBe(false);
    expect(result.structured.faultTypeMatch).toBe(true);
  });

  it('resolves when both answers match expected_state', () => {
    const result = evaluateNetworkDiagnostics(
      {
        type: 'network_diagnostics',
        faultType: 'wrong_default_gateway',
        nextDiagnosticStep: 'verify_gateway_with_peer',
      },
      ticket()
    );

    expect(result.ok).toBe(true);
    expect(result.structured).toMatchObject({
      style: 'network_diagnostics',
      faultType: 'wrong_default_gateway',
      nextDiagnosticStep: 'verify_gateway_with_peer',
      expectedFaultType: 'wrong_default_gateway',
      expectedNextDiagnosticStep: 'verify_gateway_with_peer',
      faultTypeMatch: true,
      nextDiagnosticStepMatch: true,
    });
    expect(result.feedback).toMatch(/correct diagnosis/i);

    const scored = getTicketScorer('network_diagnostics')!.score(
      {
        faultType: 'wrong_default_gateway',
        nextDiagnosticStep: 'verify_gateway_with_peer',
      },
      ticket()
    );
    expect(scored).toMatchObject({ status: 'resolved' });
  });
});
