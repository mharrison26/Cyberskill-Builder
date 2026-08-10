import { buildControlMappingOverlapGradingPrompt } from '@/lib/grading/buildControlMappingOverlapGradingPrompt';
import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { parseControlMappingInitialState } from '@/lib/control-mappings/parseInitialState';
import {
  createSupabaseControlMappingLookup,
  type ControlMappingLookup,
} from '@/lib/control-mappings/lookup';
import { normalizeControlIdList } from '@/lib/control-mappings/normalize';
import type {
  ControlFramework,
  ControlMappingRow,
  ControlMappingSubmission,
} from '@/lib/control-mappings/types';
import { getControlText } from '@/lib/oscal/getControl';
import { captureFeatureException } from '@/lib/observability/sentry';
import { CONTROL_MAPPING_MIN_OVERLAP_NARRATIVE_LENGTH } from '@/lib/scoring/ticketUi';
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

export type ControlMappingExpectedState = {
  passThresholdPercent?: number;
  scoringMode?: string;
  gradeOverlapNarrative?: boolean;
  minOverlapNarrativeLength?: number;
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
  overlapNarrativeLength?: number;
  minOverlapNarrativeLength?: number;
  overlapNarrativeLengthOk?: boolean;
  gradeOverlapNarrative?: boolean;
  catalogPath?: string | null;
  retrievedControlId?: string | null;
  retrievedMappingCount?: number;
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

export function parseControlMappingExpectedState(
  expectedState: unknown
): ControlMappingExpectedState {
  if (!isPlainObject(expectedState)) return {};
  return expectedState as ControlMappingExpectedState;
}

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

export function parseOverlapNarrative(submission: TicketSubmission): string {
  for (const key of [
    'overlapNarrative',
    'overlap_narrative',
    'narrative',
    'justification',
  ] as const) {
    const value = submission[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function passThresholdFromExpected(expected: ControlMappingExpectedState): number {
  const value = expected.passThresholdPercent;
  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
  ) {
    return value;
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
  const expected = parseControlMappingExpectedState(ticket.expected_state);
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
      reason: 'invalid_initial_state',
    };
  }

  const answers = parseAnswers(submission);
  const passThresholdPercent = passThresholdFromExpected(expected);

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
    gradeOverlapNarrative: expected.gradeOverlapNarrative === true,
  };
}

async function collectRetrievedMappingRows(
  lookup: ControlMappingLookup,
  sourceFramework: ControlFramework,
  sourceControlId: string,
  targetFrameworks: ControlFramework[]
): Promise<ControlMappingRow[]> {
  const rows: ControlMappingRow[] = [];
  for (const framework of targetFrameworks) {
    const batch = await lookup.listMappings(
      sourceFramework,
      sourceControlId,
      framework
    );
    rows.push(...batch);
  }
  return rows;
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

      const expected = parseControlMappingExpectedState(ticket.expected_state);
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

      const idsResolved =
        structured.percentage >= structured.passThresholdPercent;

      if (!idsResolved) {
        return {
          status: 'needs_revision',
          structuredResult: {
            ...structured,
            reason: 'control_ids_mismatch',
          },
          feedback: controlMappingFeedback(structured),
        };
      }

      // Legacy tickets: deterministic ID match only.
      if (expected.gradeOverlapNarrative !== true) {
        return {
          status: 'resolved',
          structuredResult: structured,
          feedback: controlMappingFeedback(structured),
        };
      }

      const overlapNarrative = parseOverlapNarrative(submission);
      const minOverlapNarrativeLength =
        typeof expected.minOverlapNarrativeLength === 'number' &&
        Number.isFinite(expected.minOverlapNarrativeLength) &&
        expected.minOverlapNarrativeLength > 0
          ? Math.floor(expected.minOverlapNarrativeLength)
          : CONTROL_MAPPING_MIN_OVERLAP_NARRATIVE_LENGTH;

      const overlapNarrativeLength = overlapNarrative.length;
      const overlapNarrativeLengthOk =
        overlapNarrativeLength >= minOverlapNarrativeLength;

      structured.overlapNarrativeLength = overlapNarrativeLength;
      structured.minOverlapNarrativeLength = minOverlapNarrativeLength;
      structured.overlapNarrativeLengthOk = overlapNarrativeLengthOk;
      structured.gradeOverlapNarrative = true;

      if (!overlapNarrativeLengthOk) {
        structured.reason = 'overlap_narrative_too_short';
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback: `Control IDs match the crosswalk, but the overlap narrative must be at least ${minOverlapNarrativeLength} characters. Explain where mappings are strong versus only partially overlapping.`,
        };
      }

      try {
        const control = getControlText(prompt.source_control_id);
        const mappingRows = await collectRetrievedMappingRows(
          lookup,
          prompt.source_framework,
          prompt.source_control_id,
          prompt.targets.map((t) => t.framework)
        );

        const answers = parseAnswers(submission);
        const gradingPrompt = buildControlMappingOverlapGradingPrompt(
          control,
          mappingRows,
          {
            sourceControlId: prompt.source_control_id,
            selectedMappings: answers,
            overlapNarrative,
            scenarioBrief: ticket.scenario_brief,
          }
        );

        const grading = await callClaudeGrading(gradingPrompt);

        structured.catalogPath = 'data/oscal/NIST_SP-800-53_rev5_catalog.json';
        structured.retrievedControlId = control.controlId;
        structured.retrievedMappingCount = mappingRows.length;
        structured.grading = {
          finding_state: grading.finding_state,
          strengths: grading.strengths,
          gaps: grading.gaps,
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
          structured.reason = 'grading_unavailable_missing_api_key';
          return {
            status: 'needs_revision',
            structuredResult: structured,
            feedback:
              'Control IDs match, but overlap-narrative grading is unavailable (missing Anthropic API key). Try again once grading is configured.',
          };
        }

        captureFeatureException(error, {
          feature: 'scoring',
          pi: 'PI-06',
          operation: 'control_mapping_overlap_grading',
          ticketId: ticket.id,
          ticketType: ticket.ticket_type,
          extras: { sourceControlId: prompt.source_control_id },
        });
        structured.reason = 'grading_error';
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback:
            'Control IDs match, but overlap-narrative grading failed unexpectedly. Please retry.',
        };
      }
    },
  };
}

export const controlMappingTicketScorer: TicketScorer =
  createControlMappingTicketScorer();

/** Type guard helper for tests / API consumers. */
export function asControlMappingSubmission(
  answers: ControlMappingSubmission['answers'],
  overlapNarrative?: string
): ControlMappingSubmission {
  return { answers, overlapNarrative };
}
