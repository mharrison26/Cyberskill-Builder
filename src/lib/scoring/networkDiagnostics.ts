import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import {
  isNetworkFaultType,
  isNetworkNextDiagnosticStep,
  NETWORK_FAULT_TYPE_LABELS,
  NETWORK_NEXT_DIAGNOSTIC_STEP_LABELS,
  type NetworkFaultType,
  type NetworkNextDiagnosticStep,
} from '@/lib/scoring/ticketUi';

/**
 * Network diagnostics ticket scoring (PI-04).
 *
 * Fully deterministic: student identifies root-cause faultType and the
 * next diagnostic step. Answers are compared to expected_state.
 *
 * initial_state:
 *   {
 *     prompt?: string,
 *     terminalOutput?: string, // combined static transcript
 *     commands?: Array<{ command: string, output: string }>,
 *     faultOptions?: string[],      // UI option ids (defaults to all)
 *     nextStepOptions?: string[],   // UI option ids (defaults to all)
 *   }
 *
 * expected_state:
 *   {
 *     faultType: NetworkFaultType,           // required
 *     nextDiagnosticStep: NetworkNextDiagnosticStep, // required
 *     // aliases: expectedFaultType, nextStep, expectedNextStep
 *   }
 *
 * submission:
 *   {
 *     type: 'network_diagnostics',
 *     faultType: string,
 *     nextDiagnosticStep: string,
 *   }
 */

export {
  NETWORK_FAULT_TYPES,
  NETWORK_FAULT_TYPE_LABELS,
  NETWORK_NEXT_DIAGNOSTIC_STEPS,
  NETWORK_NEXT_DIAGNOSTIC_STEP_LABELS,
  isNetworkFaultType,
  isNetworkNextDiagnosticStep,
  isNetworkDiagnosticsTicketType,
  type NetworkFaultType,
  type NetworkNextDiagnosticStep,
} from '@/lib/scoring/ticketUi';

export type NetworkDiagnosticsExpectedState = {
  faultType?: NetworkFaultType;
  nextDiagnosticStep?: NetworkNextDiagnosticStep;
};

export type NetworkDiagnosticsSubmission = {
  type?: string;
  faultType: NetworkFaultType;
  nextDiagnosticStep: NetworkNextDiagnosticStep;
};

export type NetworkDiagnosticsStructuredResult = {
  style: 'network_diagnostics';
  faultType: NetworkFaultType | null;
  nextDiagnosticStep: NetworkNextDiagnosticStep | null;
  expectedFaultType: NetworkFaultType | null;
  expectedNextDiagnosticStep: NetworkNextDiagnosticStep | null;
  faultTypeMatch: boolean;
  nextDiagnosticStepMatch: boolean;
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return trimmed || null;
}

function normalizeFaultType(value: unknown): NetworkFaultType | null {
  const key = normalizeKey(value);
  if (!key) return null;
  if (isNetworkFaultType(key)) return key;
  // Common aliases
  if (key === 'wrong_gateway' || key === 'incorrect_gateway') {
    return 'wrong_default_gateway';
  }
  if (key === 'apipa' || key === 'no_dhcp' || key === 'dhcp_failure') {
    return 'dhcp_apipa';
  }
  if (key === 'dns' || key === 'dns_misconfiguration') {
    return 'dns_failure';
  }
  if (key === 'routing_failure' || key === 'upstream_failure') {
    return 'upstream_routing_failure';
  }
  if (key === 'firewall' || key === 'firewall_block') {
    return 'local_firewall_block';
  }
  if (key === 'link_down' || key === 'cable' || key === 'nic_down') {
    return 'nic_link_down';
  }
  return null;
}

function normalizeNextStep(value: unknown): NetworkNextDiagnosticStep | null {
  const key = normalizeKey(value);
  if (!key) return null;
  if (isNetworkNextDiagnosticStep(key)) return key;
  if (
    key === 'verify_gateway' ||
    key === 'check_peer_gateway' ||
    key === 'confirm_gateway'
  ) {
    return 'verify_gateway_with_peer';
  }
  if (key === 'renew_dhcp' || key === 'dhcp_renew') {
    return 'renew_dhcp_lease';
  }
  if (key === 'test_dns' || key === 'check_dns') {
    return 'test_dns_servers';
  }
  if (key === 'check_firewall' || key === 'firewall_rules') {
    return 'check_firewall_rules';
  }
  if (key === 'upstream_hop' || key === 'check_upstream') {
    return 'inspect_upstream_hop';
  }
  if (key === 'physical_link' || key === 'check_cable') {
    return 'check_physical_link';
  }
  if (key === 'packet_capture' || key === 'pcap') {
    return 'capture_packets';
  }
  return null;
}

export function parseNetworkDiagnosticsExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): NetworkDiagnosticsExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }

  const faultType = normalizeFaultType(
    expectedState.faultType ??
      expectedState.expectedFaultType ??
      expectedState.fault_type ??
      expectedState.expected_fault_type
  );

  const nextDiagnosticStep = normalizeNextStep(
    expectedState.nextDiagnosticStep ??
      expectedState.expectedNextDiagnosticStep ??
      expectedState.nextStep ??
      expectedState.expectedNextStep ??
      expectedState.next_diagnostic_step ??
      expectedState.next_step
  );

  return {
    faultType: faultType ?? undefined,
    nextDiagnosticStep: nextDiagnosticStep ?? undefined,
  };
}

export function extractNetworkDiagnosticsSubmission(
  submission: TicketSubmission
): NetworkDiagnosticsSubmission | null {
  const faultType = normalizeFaultType(
    submission.faultType ??
      submission.fault_type ??
      submission.rootCause ??
      submission.root_cause
  );
  const nextDiagnosticStep = normalizeNextStep(
    submission.nextDiagnosticStep ??
      submission.next_diagnostic_step ??
      submission.nextStep ??
      submission.next_step
  );

  if (!faultType || !nextDiagnosticStep) {
    return null;
  }

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'network_diagnostics',
    faultType,
    nextDiagnosticStep,
  };
}

export function evaluateNetworkDiagnostics(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: NetworkDiagnosticsSubmission | null;
  structured: NetworkDiagnosticsStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseNetworkDiagnosticsExpectedState(ticket.expected_state);
  const expectedFaultType = expected.faultType ?? null;
  const expectedNextDiagnosticStep = expected.nextDiagnosticStep ?? null;
  const parsed = extractNetworkDiagnosticsSubmission(submission);

  const baseStructured: NetworkDiagnosticsStructuredResult = {
    style: 'network_diagnostics',
    faultType: parsed?.faultType ?? null,
    nextDiagnosticStep: parsed?.nextDiagnosticStep ?? null,
    expectedFaultType,
    expectedNextDiagnosticStep,
    faultTypeMatch: false,
    nextDiagnosticStepMatch: false,
  };

  if (!expectedFaultType || !expectedNextDiagnosticStep) {
    return {
      parsed,
      structured: {
        ...baseStructured,
        reason: 'misconfigured_expected_state',
      },
      ok: false,
      feedback:
        'This network diagnostics ticket is missing faultType or nextDiagnosticStep in expected_state. Ask an admin to fix the seed.',
    };
  }

  if (!parsed) {
    return {
      parsed: null,
      structured: { ...baseStructured, reason: 'missing_fields' },
      ok: false,
      feedback:
        'Submission must include faultType (root cause) and nextDiagnosticStep.',
    };
  }

  const faultTypeMatch = parsed.faultType === expectedFaultType;
  const nextDiagnosticStepMatch =
    parsed.nextDiagnosticStep === expectedNextDiagnosticStep;

  const structured: NetworkDiagnosticsStructuredResult = {
    ...baseStructured,
    faultType: parsed.faultType,
    nextDiagnosticStep: parsed.nextDiagnosticStep,
    faultTypeMatch,
    nextDiagnosticStepMatch,
  };

  if (!faultTypeMatch || !nextDiagnosticStepMatch) {
    const parts: string[] = [];
    if (!faultTypeMatch) {
      parts.push(
        `Root cause should be "${NETWORK_FAULT_TYPE_LABELS[expectedFaultType]}" (${expectedFaultType}).`
      );
    }
    if (!nextDiagnosticStepMatch) {
      parts.push(
        `Next diagnostic step should be "${NETWORK_NEXT_DIAGNOSTIC_STEP_LABELS[expectedNextDiagnosticStep]}" (${expectedNextDiagnosticStep}).`
      );
    }
    structured.reason = 'incorrect_diagnosis';
    return {
      parsed,
      structured,
      ok: false,
      feedback: parts.join(' '),
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback: `Correct diagnosis: ${NETWORK_FAULT_TYPE_LABELS[expectedFaultType]}. Next step: ${NETWORK_NEXT_DIAGNOSTIC_STEP_LABELS[expectedNextDiagnosticStep]}.`,
  };
}

export const networkDiagnosticsTicketScorer: TicketScorer = {
  score(submission, ticket): TicketScoreResult {
    const result = evaluateNetworkDiagnostics(submission, ticket);
    return {
      status: result.ok ? 'resolved' : 'needs_revision',
      structuredResult: result.structured,
      feedback: result.feedback,
    };
  },
};
