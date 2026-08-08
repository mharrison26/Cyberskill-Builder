import { parseControlMappingInitialState } from '@/lib/control-mappings/parseInitialState';
import {
  createSupabaseControlMappingLookup,
  type ControlMappingLookup,
} from '@/lib/control-mappings/lookup';
import { normalizeControlIdList } from '@/lib/control-mappings/normalize';
import type {
  ControlFramework,
  ControlMappingSubmission,
} from '@/lib/control-mappings/types';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

export type ControlMappingOptionResult = {
  controlId: string;
  shouldSelect: boolean;
  selected: boolean;
  passed: boolean;
};

export type ControlMappingTargetResult = {
  framework: ControlFramework;
  selected: string[];
  expected: string[];
  truePositives: string[];
  falsePositives: string[];
  falseNegatives: string[];
  optionResults: ControlMappingOptionResult[];
  passedCount: number;
  totalCount: number;
  percentage: number;
  passed: boolean;
};

export type ControlMappingStructuredResult = {
  style: 'control_mapping';
  sourceFramework: ControlFramework;
  sourceControlId: string;
  passThresholdPercent: number;
  percentage: number;
  passedCount: number;
  totalCount: number;
  targets: ControlMappingTargetResult[];
};

function parseAnswers(
  submission: TicketSubmission
): Partial<Record<ControlFramework, string[]>> {
  const nested = submission.answers ?? submission.mappings;
  const raw =
    nested && typeof nested === 'object' && !Array.isArray(nested)
      ? nested
      : submission;

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const obj = raw as Record<string, unknown>;
  const answers: Partial<Record<ControlFramework, string[]>> = {};
  for (const key of ['nist_800_53', 'soc2', 'iso27001'] as const) {
    if (key in obj) {
      answers[key] = normalizeControlIdList(obj[key]);
    }
  }
  return answers;
}

function passThresholdFromExpected(expectedState: unknown): number {
  if (
    expectedState &&
    typeof expectedState === 'object' &&
    !Array.isArray(expectedState)
  ) {
    const value = (expectedState as { passThresholdPercent?: unknown })
      .passThresholdPercent;
    if (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 100
    ) {
      return value;
    }
  }
  return 100;
}

function scoreTargetWithOptions(args: {
  framework: ControlFramework;
  selected: string[];
  mappedIds: string[];
  options: string[];
}): ControlMappingTargetResult {
  const mappedSet = new Set(args.mappedIds);
  const selectedSet = new Set(args.selected);
  const options = normalizeControlIdList(args.options);

  const optionResults: ControlMappingOptionResult[] = options.map(
    (controlId) => {
      const shouldSelect = mappedSet.has(controlId);
      const selected = selectedSet.has(controlId);
      return {
        controlId,
        shouldSelect,
        selected,
        passed: shouldSelect === selected,
      };
    }
  );

  const expected = options.filter((id) => mappedSet.has(id)).sort();
  const selected = options.filter((id) => selectedSet.has(id)).sort();
  const truePositives = selected.filter((id) => mappedSet.has(id)).sort();
  const falsePositives = selected.filter((id) => !mappedSet.has(id)).sort();
  const falseNegatives = expected.filter((id) => !selectedSet.has(id)).sort();

  const passedCount = optionResults.filter((r) => r.passed).length;
  const totalCount = optionResults.length;
  const percentage =
    totalCount === 0 ? 0 : Math.round((passedCount / totalCount) * 100);

  return {
    framework: args.framework,
    selected,
    expected,
    truePositives,
    falsePositives,
    falseNegatives,
    optionResults,
    passedCount,
    totalCount,
    percentage,
    passed: totalCount > 0 && passedCount === totalCount,
  };
}

/** Free-text mode when a target has no options list. */
function scoreTargetFreeText(args: {
  framework: ControlFramework;
  selected: string[];
  mappedIds: string[];
}): ControlMappingTargetResult {
  const mappedSet = new Set(args.mappedIds);
  const selected = [...args.selected].sort();
  const expected = [...args.mappedIds].sort();
  const truePositives = selected.filter((id) => mappedSet.has(id)).sort();
  const falsePositives = selected.filter((id) => !mappedSet.has(id)).sort();
  const falseNegatives = expected.filter((id) => !selected.includes(id)).sort();

  // Each mapped ID is a recall check; each false positive is a failed precision check.
  const totalCount = expected.length + falsePositives.length;
  const passedCount = truePositives.length;
  const percentage =
    totalCount === 0
      ? selected.length === 0
        ? 100
        : 0
      : Math.round((passedCount / totalCount) * 100);

  const passed =
    falsePositives.length === 0 &&
    (expected.length === 0
      ? selected.length === 0
      : truePositives.length === expected.length);

  return {
    framework: args.framework,
    selected,
    expected,
    truePositives,
    falsePositives,
    falseNegatives,
    optionResults: [],
    passedCount,
    totalCount: Math.max(totalCount, 1),
    percentage,
    passed,
  };
}

export function controlMappingFeedback(
  result: ControlMappingStructuredResult
): string {
  if (result.percentage >= result.passThresholdPercent) {
    return `Control mapping accepted (${result.percentage}%). Equivalents match the reference crosswalk.`;
  }

  const parts: string[] = [
    `Control mapping needs revision (${result.percentage}% < ${result.passThresholdPercent}% threshold).`,
  ];
  for (const target of result.targets) {
    if (target.passed) continue;
    const bits: string[] = [];
    if (target.falsePositives.length > 0) {
      bits.push(`incorrect: ${target.falsePositives.join(', ')}`);
    }
    if (target.falseNegatives.length > 0) {
      bits.push(`missing: ${target.falseNegatives.join(', ')}`);
    }
    if (bits.length === 0) {
      bits.push('incomplete');
    }
    parts.push(`${target.framework}: ${bits.join('; ')}.`);
  }
  return parts.join(' ');
}

/**
 * Deterministic control-mapping evaluation against a lookup of
 * public.control_mappings (no LLM).
 */
export async function evaluateControlMapping(
  submission: TicketSubmission,
  ticket: ScorableTicket,
  lookup: ControlMappingLookup
): Promise<ControlMappingStructuredResult> {
  const prompt = parseControlMappingInitialState(ticket.initial_state);
  if (!prompt) {
    return {
      style: 'control_mapping',
      sourceFramework: 'nist_800_53',
      sourceControlId: '',
      passThresholdPercent: 100,
      percentage: 0,
      passedCount: 0,
      totalCount: 0,
      targets: [],
    };
  }

  const answers = parseAnswers(submission);
  const passThresholdPercent = passThresholdFromExpected(ticket.expected_state);

  const targets: ControlMappingTargetResult[] = [];
  for (const target of prompt.targets) {
    const mappedIds = await lookup.listTargets(
      prompt.source_framework,
      prompt.source_control_id,
      target.framework
    );
    const selected = answers[target.framework] ?? [];
    if (target.options && target.options.length > 0) {
      targets.push(
        scoreTargetWithOptions({
          framework: target.framework,
          selected,
          mappedIds,
          options: target.options,
        })
      );
    } else {
      targets.push(
        scoreTargetFreeText({
          framework: target.framework,
          selected,
          mappedIds,
        })
      );
    }
  }

  const passedCount = targets.reduce((sum, t) => sum + t.passedCount, 0);
  const totalCount = targets.reduce((sum, t) => sum + t.totalCount, 0);
  const percentage =
    totalCount === 0 ? 0 : Math.round((passedCount / totalCount) * 100);

  return {
    style: 'control_mapping',
    sourceFramework: prompt.source_framework,
    sourceControlId: prompt.source_control_id,
    passThresholdPercent,
    percentage,
    passedCount,
    totalCount,
    targets,
  };
}

export function createControlMappingTicketScorer(
  lookup: ControlMappingLookup = createSupabaseControlMappingLookup()
): TicketScorer {
  return {
    async score(submission, ticket): Promise<TicketScoreResult> {
      const prompt = parseControlMappingInitialState(ticket.initial_state);
      if (!prompt) {
        return {
          status: 'needs_revision',
          structuredResult: {
            style: 'control_mapping',
            reason: 'invalid_initial_state',
          },
          feedback:
            'Ticket is missing a valid control_mapping initial_state (source control + targets).',
        };
      }

      const structured = await evaluateControlMapping(
        submission,
        ticket,
        lookup
      );

      if (structured.targets.length === 0) {
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback: 'No target frameworks configured for this mapping ticket.',
        };
      }

      const resolved = structured.percentage >= structured.passThresholdPercent;

      return {
        status: resolved ? 'resolved' : 'needs_revision',
        structuredResult: structured,
        feedback: controlMappingFeedback(structured),
      };
    },
  };
}

export const controlMappingTicketScorer: TicketScorer =
  createControlMappingTicketScorer();

/** Type guard helper for tests / API consumers. */
export function asControlMappingSubmission(
  answers: ControlMappingSubmission['answers']
): ControlMappingSubmission {
  return { answers };
}
