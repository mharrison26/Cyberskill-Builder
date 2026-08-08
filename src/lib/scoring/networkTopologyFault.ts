import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildNetworkTopologyFaultGradingPrompt } from '@/lib/grading/buildNetworkTopologyFaultGradingPrompt';
import {
  DEFAULT_NETWORK_TOPOLOGY_FAULT_RUBRIC_SECTION_IDS,
  retrieveSubnettingTcpIpRubric,
} from '@/lib/networking/getSubnettingTcpIpRubric';
import { captureFeatureException } from '@/lib/observability/sentry';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import { NETWORK_TOPOLOGY_FAULT_MIN_JUSTIFICATION_LENGTH } from '@/lib/scoring/ticketUi';

/**
 * Network topology fault scoring.
 *
 * Students review a small static network diagram + diagnostic command output,
 * identify which device/subnet is misconfigured, and justify using basic
 * subnetting / TCP-IP reasoning.
 *
 * Composition:
 *   1. Deterministic match of faultLocation against expected_state
 *   2. RAG grades justification against pinned subnetting/TCP-IP rubric only
 *      (F26 anti-hallucination) — gates final resolved status
 *
 * initial_state:
 *   {
 *     prompt?: string,
 *     diagram?: string,              // ASCII / structured text diagram
 *     terminalOutput?: string,
 *     commands?: Array<{ command: string, output: string }>,
 *     faultLocations?: Array<{ id: string, label: string }> | string[],
 *   }
 *
 * expected_state:
 *   {
 *     faultLocation: string,         // required — device/subnet id
 *     minJustificationLength?: number,
 *     guidanceTopics?: string[],
 *     topKGuidanceSections?: number,
 *   }
 *
 * submission:
 *   {
 *     type: 'network_topology_fault',
 *     faultLocation: string,
 *     justification: string,
 *   }
 */

export type NetworkTopologyFaultExpectedState = {
  faultLocation?: string;
  minJustificationLength?: number;
  guidanceTopics?: string[];
  topKGuidanceSections?: number;
};

export type NetworkTopologyFaultSubmission = {
  type?: string;
  faultLocation: string;
  justification: string;
};

export type NetworkTopologyFaultStructuredResult = {
  style: 'network_topology_fault';
  faultLocation: string | null;
  expectedFaultLocation: string | null;
  faultLocationMatch: boolean;
  justificationLength: number;
  minJustificationLength: number;
  justificationLengthOk: boolean;
  guidancePath: string | null;
  retrievedSectionIds: string[];
  grading?: {
    finding_state: ClaudeGradingResult['finding_state'];
    strengths: string[];
    gaps: string[];
  };
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeLocationId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return trimmed || null;
}

export function parseNetworkTopologyFaultExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): NetworkTopologyFaultExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }

  const faultLocation = normalizeLocationId(
    expectedState.faultLocation ??
      expectedState.expectedFaultLocation ??
      expectedState.fault_location ??
      expectedState.misconfiguredDevice ??
      expectedState.misconfigured_device ??
      expectedState.faultDevice ??
      expectedState.fault_device
  );

  const minJustificationLength =
    typeof expectedState.minJustificationLength === 'number'
      ? expectedState.minJustificationLength
      : typeof expectedState.min_justification_length === 'number'
        ? expectedState.min_justification_length
        : undefined;

  const guidanceTopics = Array.isArray(expectedState.guidanceTopics)
    ? expectedState.guidanceTopics.filter(
        (t): t is string => typeof t === 'string'
      )
    : Array.isArray(expectedState.guidance_topics)
      ? expectedState.guidance_topics.filter(
          (t): t is string => typeof t === 'string'
        )
      : undefined;

  const topKGuidanceSections =
    typeof expectedState.topKGuidanceSections === 'number'
      ? expectedState.topKGuidanceSections
      : typeof expectedState.top_k_guidance_sections === 'number'
        ? expectedState.top_k_guidance_sections
        : undefined;

  return {
    faultLocation: faultLocation ?? undefined,
    minJustificationLength,
    guidanceTopics,
    topKGuidanceSections,
  };
}

export function extractNetworkTopologyFaultSubmission(
  submission: TicketSubmission
): NetworkTopologyFaultSubmission | null {
  const faultLocation = normalizeLocationId(
    submission.faultLocation ??
      submission.fault_location ??
      submission.misconfiguredDevice ??
      submission.misconfigured_device ??
      submission.device ??
      submission.subnet
  );

  const justificationRaw =
    submission.justification ??
    submission.explanation ??
    submission.reasoning ??
    submission.rationale;

  if (!faultLocation || typeof justificationRaw !== 'string') {
    return null;
  }

  const justification = justificationRaw.trim();
  if (!justification) {
    return null;
  }

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'network_topology_fault',
    faultLocation,
    justification,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (isPlainObject(value)) return value;
  return {};
}

function parseCommands(
  initialState: Record<string, unknown>
): Array<{ command: string; output: string }> {
  const raw = initialState.commands;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const command =
        typeof record.command === 'string'
          ? record.command.trim()
          : typeof record.cmd === 'string'
            ? record.cmd.trim()
            : '';
      const output =
        typeof record.output === 'string'
          ? record.output
          : typeof record.result === 'string'
            ? record.result
            : '';
      if (!command && !output.trim()) return null;
      return { command, output };
    })
    .filter((entry): entry is { command: string; output: string } =>
      Boolean(entry)
    );
}

export function buildNetworkTopologyTerminalTranscript(
  initialState: Record<string, unknown> | null | undefined
): string {
  const root = asRecord(initialState);
  const combined =
    typeof root.terminalOutput === 'string'
      ? root.terminalOutput
      : typeof root.terminal_output === 'string'
        ? root.terminal_output
        : typeof root.output === 'string'
          ? root.output
          : '';

  if (combined.trim()) {
    return combined.replace(/\r\n/g, '\n');
  }

  const commands = parseCommands(root);
  if (commands.length === 0) return '';

  return commands
    .map((block) => {
      const promptLine = block.command
        ? `analyst@ws-a:~$ ${block.command}`
        : '';
      return [promptLine, block.output.replace(/\r\n/g, '\n')]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

export function resolveFaultLocationLabel(
  initialState: Record<string, unknown> | null | undefined,
  faultLocationId: string
): string | undefined {
  const root = asRecord(initialState);
  const raw =
    root.faultLocations ??
    root.fault_locations ??
    root.devices ??
    root.options;

  if (!Array.isArray(raw)) return undefined;

  for (const entry of raw) {
    if (typeof entry === 'string') {
      if (normalizeLocationId(entry) === faultLocationId) {
        return entry.replace(/[_-]+/g, ' ');
      }
      continue;
    }
    if (!isPlainObject(entry)) continue;
    const id = normalizeLocationId(entry.id ?? entry.value ?? entry.key);
    if (id !== faultLocationId) continue;
    if (typeof entry.label === 'string' && entry.label.trim()) {
      return entry.label.trim();
    }
    if (typeof entry.name === 'string' && entry.name.trim()) {
      return entry.name.trim();
    }
  }

  return undefined;
}

export function evaluateNetworkTopologyFaultDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: NetworkTopologyFaultSubmission | null;
  structured: NetworkTopologyFaultStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseNetworkTopologyFaultExpectedState(ticket.expected_state);
  const expectedFaultLocation = expected.faultLocation ?? null;
  const minJustificationLength =
    typeof expected.minJustificationLength === 'number' &&
    Number.isFinite(expected.minJustificationLength) &&
    expected.minJustificationLength > 0
      ? Math.floor(expected.minJustificationLength)
      : NETWORK_TOPOLOGY_FAULT_MIN_JUSTIFICATION_LENGTH;

  const parsed = extractNetworkTopologyFaultSubmission(submission);

  const baseStructured: NetworkTopologyFaultStructuredResult = {
    style: 'network_topology_fault',
    faultLocation: parsed?.faultLocation ?? null,
    expectedFaultLocation,
    faultLocationMatch: false,
    justificationLength: parsed?.justification.length ?? 0,
    minJustificationLength,
    justificationLengthOk: false,
    guidancePath: null,
    retrievedSectionIds: [],
  };

  if (!expectedFaultLocation) {
    return {
      parsed,
      structured: {
        ...baseStructured,
        reason: 'misconfigured_expected_state',
      },
      ok: false,
      feedback:
        'This network topology fault ticket is missing faultLocation in expected_state. Ask an admin to fix the seed.',
    };
  }

  if (!parsed) {
    return {
      parsed: null,
      structured: { ...baseStructured, reason: 'missing_fields' },
      ok: false,
      feedback:
        'Submission must include faultLocation (misconfigured device/subnet) and a justification.',
    };
  }

  const faultLocationMatch = parsed.faultLocation === expectedFaultLocation;
  const justificationLengthOk =
    parsed.justification.length >= minJustificationLength;

  const structured: NetworkTopologyFaultStructuredResult = {
    ...baseStructured,
    faultLocation: parsed.faultLocation,
    faultLocationMatch,
    justificationLength: parsed.justification.length,
    justificationLengthOk,
  };

  if (!faultLocationMatch) {
    structured.reason = 'incorrect_fault_location';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Incorrect fault location. Re-check which device or subnet is misconfigured using the diagram and command output.`,
    };
  }

  if (!justificationLengthOk) {
    structured.reason = 'justification_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Justification must be at least ${minJustificationLength} characters. Explain the subnetting/TCP-IP evidence for why ${expectedFaultLocation} is misconfigured.`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback:
      'Fault location matches. Grading justification against pinned subnetting/TCP-IP rubric…',
  };
}

async function gradeJustificationWithSubnettingRubric(
  parsed: NetworkTopologyFaultSubmission,
  ticket: ScorableTicket,
  expected: NetworkTopologyFaultExpectedState
): Promise<{
  grading: ClaudeGradingResult;
  retrievedSectionIds: string[];
  guidancePath: string;
}> {
  const requiredSectionIds =
    expected.guidanceTopics && expected.guidanceTopics.length > 0
      ? expected.guidanceTopics
      : [...DEFAULT_NETWORK_TOPOLOGY_FAULT_RUBRIC_SECTION_IDS];

  const retrieved = retrieveSubnettingTcpIpRubric(parsed.justification, {
    topK: expected.topKGuidanceSections ?? 4,
    requiredSectionIds,
  });

  const initialState = asRecord(ticket.initial_state);
  const diagram =
    typeof initialState.diagram === 'string'
      ? initialState.diagram
      : typeof initialState.networkDiagram === 'string'
        ? initialState.networkDiagram
        : typeof initialState.topology === 'string'
          ? initialState.topology
          : undefined;

  const prompt = buildNetworkTopologyFaultGradingPrompt(retrieved, {
    faultLocation: parsed.faultLocation,
    faultLocationLabel: resolveFaultLocationLabel(
      initialState,
      parsed.faultLocation
    ),
    justification: parsed.justification,
    scenarioBrief: ticket.scenario_brief,
    diagram,
    terminalTranscript: buildNetworkTopologyTerminalTranscript(initialState),
  });

  const grading = await callClaudeGrading(prompt);

  return {
    grading,
    retrievedSectionIds: retrieved.sections.map((section) => section.id),
    guidancePath: retrieved.catalogPath,
  };
}

export const networkTopologyFaultTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const deterministic = evaluateNetworkTopologyFaultDeterministic(
      submission,
      ticket
    );

    if (!deterministic.ok || !deterministic.parsed) {
      return {
        status: 'needs_revision',
        structuredResult: deterministic.structured,
        feedback: deterministic.feedback,
      };
    }

    const expected = parseNetworkTopologyFaultExpectedState(
      ticket.expected_state
    );

    try {
      const { grading, retrievedSectionIds, guidancePath } =
        await gradeJustificationWithSubnettingRubric(
          deterministic.parsed,
          ticket,
          expected
        );

      const structured: NetworkTopologyFaultStructuredResult = {
        ...deterministic.structured,
        guidancePath,
        retrievedSectionIds,
        grading: {
          finding_state: grading.finding_state,
          strengths: grading.strengths,
          gaps: grading.gaps,
        },
      };

      if (grading.finding_state === 'satisfied') {
        return {
          status: 'resolved',
          structuredResult: structured,
          feedback: grading.feedback,
        };
      }

      structured.reason = `grading_${grading.finding_state}`;
      const gapHint =
        grading.gaps.length > 0
          ? ` Gaps: ${grading.gaps.slice(0, 3).join(' ')}`
          : '';

      return {
        status: 'needs_revision',
        structuredResult: structured,
        feedback: `${grading.feedback}${gapHint}`,
      };
    } catch (error) {
      if (error instanceof MissingAnthropicApiKeyError) {
        const structured: NetworkTopologyFaultStructuredResult = {
          ...deterministic.structured,
          reason: 'grading_unavailable_missing_api_key',
        };
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback:
            'Fault location looks correct, but AI grading against the pinned subnetting/TCP-IP rubric is unavailable (ANTHROPIC_API_KEY not configured). Ask an admin to enable grading, then resubmit.',
        };
      }

      console.error('Network topology fault rubric grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-04',
        operation: 'network_topology_fault_rubric_grade',
        ticketId: ticket.id,
        ticketType: ticket.ticket_type,
        level: 'error',
      });

      return {
        status: 'needs_revision',
        structuredResult: {
          ...deterministic.structured,
          reason: 'grading_error',
        },
        feedback:
          'Could not grade your justification against the subnetting/TCP-IP rubric. Please try again shortly.',
      };
    }
  },
};
