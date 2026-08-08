import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildScriptRemediationGradingPrompt } from '@/lib/grading/buildScriptRemediationGradingPrompt';
import { captureFeatureException } from '@/lib/observability/sentry';
import { retrieveScriptRemediationRubric } from '@/lib/scripting/getScriptRemediationRubric';
import {
  deterministicFeedback,
  evaluateConfigDiff,
  type ConfigDiffStructuredResult,
} from '@/lib/scoring/configDiff';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

/**
 * Script remediation scoring (WebContainer / PI-04 sandbox + PI-06 config-diff).
 *
 * Students write a short Bash or PowerShell script, run it in the CodeSandbox
 * WebContainer so the filesystem reaches the expected fix, then submit.
 *
 * Composition:
 *   1. Deterministic config-diff (evaluateConfigDiff) gates pass/fail
 *   2. RAG grades script quality / side effects against a pinned rubric only
 *      (F26 anti-hallucination) — advisory feedback, does not override state checks
 *
 * expected_state:
 * {
 *   rules: ConfigDiffRule[];           // required — same shape as config_diff
 *   passThresholdPercent?: number;
 *   scriptPath?: string;               // default: auto-detect *.sh|*.bash|*.ps1
 *   minScriptChars?: number;           // default 40
 *   guidanceTopics?: string[];         // optional rubric section ids
 *   topKGuidanceSections?: number;
 * }
 */

export type ScriptRemediationExpectedState = {
  scriptPath?: string;
  minScriptChars?: number;
  guidanceTopics?: string[];
  topKGuidanceSections?: number;
};

export type ScriptRemediationStructuredResult = {
  style: 'script_remediation';
  config: ConfigDiffStructuredResult;
  scriptPath: string | null;
  scriptChars: number;
  minScriptChars: number;
  scriptOk: boolean;
  guidancePath: string | null;
  retrievedSectionIds: string[];
  grading?: {
    finding_state: ClaudeGradingResult['finding_state'];
    strengths: string[];
    gaps: string[];
  };
  reason?: string;
};

const SCRIPT_EXTENSIONS = ['.sh', '.bash', '.ps1', '.psm1'];
const SKIP_SCRIPT_NAMES = new Set(['readme.md', 'package.json']);

const DEFAULT_MIN_SCRIPT_CHARS = 40;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/\/+/g, '/');
}

function asStringRecord(value: unknown): Record<string, string> | null {
  if (!isPlainObject(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      out[normalizePath(key)] = entry;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function extractSubmissionFiles(
  submission: TicketSubmission
): Record<string, string> {
  const direct =
    asStringRecord(submission.files) ??
    asStringRecord(submission.filesystem) ??
    asStringRecord(submission.final_files);

  if (direct) return direct;

  if (isPlainObject(submission.final_state)) {
    const nested =
      asStringRecord(submission.final_state.files) ??
      asStringRecord(submission.final_state.filesystem);
    if (nested) return nested;
  }

  return {};
}

function parseExpectedKnobs(
  ticket: ScorableTicket
): ScriptRemediationExpectedState {
  const expected = ticket.expected_state;
  if (!isPlainObject(expected)) return {};
  return {
    scriptPath:
      typeof expected.scriptPath === 'string'
        ? expected.scriptPath
        : typeof expected.script_path === 'string'
          ? expected.script_path
          : undefined,
    minScriptChars:
      typeof expected.minScriptChars === 'number'
        ? expected.minScriptChars
        : typeof expected.min_script_chars === 'number'
          ? expected.min_script_chars
          : undefined,
    guidanceTopics: Array.isArray(expected.guidanceTopics)
      ? expected.guidanceTopics.filter(
          (t): t is string => typeof t === 'string'
        )
      : Array.isArray(expected.guidance_topics)
        ? expected.guidance_topics.filter(
            (t): t is string => typeof t === 'string'
          )
        : undefined,
    topKGuidanceSections:
      typeof expected.topKGuidanceSections === 'number'
        ? expected.topKGuidanceSections
        : typeof expected.top_k_guidance_sections === 'number'
          ? expected.top_k_guidance_sections
          : undefined,
  };
}

function looksLikeScriptPath(path: string): boolean {
  const lower = path.toLowerCase();
  const base = lower.includes('/')
    ? lower.slice(lower.lastIndexOf('/') + 1)
    : lower;
  if (SKIP_SCRIPT_NAMES.has(base)) return false;
  return SCRIPT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function resolveScript(
  files: Record<string, string>,
  knobs: ScriptRemediationExpectedState
): { path: string | null; content: string; expectedMissing: boolean } {
  if (knobs.scriptPath) {
    const path = normalizePath(knobs.scriptPath);
    const content = files[path];
    if (typeof content === 'string') {
      return { path, content, expectedMissing: false };
    }
    // Expected script path configured but not present in submission FS.
    return { path: null, content: '', expectedMissing: true };
  }

  const candidates = Object.keys(files).filter(looksLikeScriptPath).sort();

  // Prefer remediation-ish names.
  const preferred = candidates.find((p) =>
    /fix|remediat|spooler|restart|clear/i.test(p)
  );
  const path = preferred ?? candidates[0] ?? null;
  if (!path) return { path: null, content: '', expectedMissing: false };
  return { path, content: files[path] ?? '', expectedMissing: false };
}

function configMeetsThreshold(result: ConfigDiffStructuredResult): boolean {
  return (
    result.totalCount > 0 &&
    result.percentage >= result.passThresholdPercent &&
    !result.reason
  );
}

async function gradeScriptQuality(
  scriptPath: string,
  scriptContent: string,
  ticket: ScorableTicket,
  knobs: ScriptRemediationExpectedState,
  configSummary: string
): Promise<{
  grading: ClaudeGradingResult;
  retrievedSectionIds: string[];
  guidancePath: string;
}> {
  const retrieved = retrieveScriptRemediationRubric(scriptContent, {
    topK: knobs.topKGuidanceSections ?? 4,
    requiredSectionIds: knobs.guidanceTopics,
  });

  const prompt = buildScriptRemediationGradingPrompt(retrieved, {
    scriptPath,
    scriptContent,
    scenarioBrief: ticket.scenario_brief,
    configDiffSummary: configSummary,
  });

  const grading = await callClaudeGrading(prompt);

  return {
    grading,
    retrievedSectionIds: retrieved.sections.map((section) => section.id),
    guidancePath: retrieved.catalogPath,
  };
}

function composeFeedback(parts: {
  configFeedback: string;
  scriptOk: boolean;
  scriptPath: string | null;
  minScriptChars: number;
  scriptMissing?: boolean;
  grading?: ClaudeGradingResult;
  ragNote?: string;
}): string {
  const chunks = [parts.configFeedback];

  if (!parts.scriptOk) {
    if (parts.scriptMissing || !parts.scriptPath) {
      chunks.push(
        parts.scriptPath
          ? `Expected remediation script at ${parts.scriptPath} was not found. Add a Bash (.sh/.bash) or PowerShell (.ps1) script and run it in the sandbox before submitting.`
          : 'No Bash (.sh/.bash) or PowerShell (.ps1) remediation script was found in the submission.'
      );
    } else {
      chunks.push(
        `Script at ${parts.scriptPath} is too short (min ${parts.minScriptChars} characters). Expand the remediation steps.`
      );
    }
  }

  if (parts.grading) {
    chunks.push(`Script quality feedback: ${parts.grading.feedback}`);
    if (parts.grading.gaps.length > 0) {
      chunks.push(`Gaps: ${parts.grading.gaps.slice(0, 3).join(' ')}`);
    }
  } else if (parts.ragNote) {
    chunks.push(parts.ragNote);
  }

  return chunks.join('\n\n');
}

export function isScriptRemediationTicketType(ticketType: string): boolean {
  const t = ticketType.trim().toLowerCase();
  const base = t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
  return (
    base === 'script_remediation' ||
    base === 'spooler_fix' ||
    base === 'sandbox_script' ||
    base === 'service_restart'
  );
}

export const scriptRemediationTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const knobs = parseExpectedKnobs(ticket);
    const minScriptChars =
      typeof knobs.minScriptChars === 'number' && knobs.minScriptChars > 0
        ? Math.floor(knobs.minScriptChars)
        : DEFAULT_MIN_SCRIPT_CHARS;

    const config = evaluateConfigDiff(submission, ticket);
    const configFeedback = deterministicFeedback(config);
    const stateOk = configMeetsThreshold(config);

    const files = extractSubmissionFiles(submission);
    const {
      path: scriptPath,
      content: scriptContent,
      expectedMissing,
    } = resolveScript(files, knobs);
    const scriptChars = scriptContent.trim().length;
    const scriptOk =
      Boolean(scriptPath) && !expectedMissing && scriptChars >= minScriptChars;
    const displayScriptPath =
      scriptPath ??
      (expectedMissing && knobs.scriptPath
        ? normalizePath(knobs.scriptPath)
        : null);

    const baseStructured: ScriptRemediationStructuredResult = {
      style: 'script_remediation',
      config,
      scriptPath: displayScriptPath,
      scriptChars,
      minScriptChars,
      scriptOk,
      guidancePath: null,
      retrievedSectionIds: [],
    };

    // Gate: resulting sandbox state must match expected_state rules.
    if (!stateOk) {
      return {
        status: 'needs_revision',
        structuredResult: {
          ...baseStructured,
          reason: config.reason ?? 'config_diff_below_threshold',
        },
        feedback: composeFeedback({
          configFeedback,
          scriptOk,
          scriptPath: displayScriptPath,
          minScriptChars,
          scriptMissing: expectedMissing || !scriptPath,
        }),
      };
    }

    // Soft gate: require a real remediation script once state looks fixed.
    if (!scriptOk) {
      const scriptMissing = expectedMissing || !scriptPath;
      return {
        status: 'needs_revision',
        structuredResult: {
          ...baseStructured,
          reason: scriptMissing ? 'missing_script' : 'script_too_short',
        },
        feedback: composeFeedback({
          configFeedback,
          scriptOk,
          scriptPath: displayScriptPath,
          minScriptChars,
          scriptMissing,
        }),
      };
    }

    try {
      const { grading, retrievedSectionIds, guidancePath } =
        await gradeScriptQuality(
          scriptPath!,
          scriptContent,
          ticket,
          knobs,
          configFeedback
        );

      const structured: ScriptRemediationStructuredResult = {
        ...baseStructured,
        guidancePath,
        retrievedSectionIds,
        grading: {
          finding_state: grading.finding_state,
          strengths: grading.strengths,
          gaps: grading.gaps,
        },
      };

      // Config-diff (+ script presence) gates resolve; RAG is quality feedback.
      return {
        status: 'resolved',
        structuredResult: structured,
        feedback: composeFeedback({
          configFeedback,
          scriptOk: true,
          scriptPath,
          minScriptChars,
          grading,
        }),
      };
    } catch (error) {
      if (error instanceof MissingAnthropicApiKeyError) {
        return {
          status: 'resolved',
          structuredResult: {
            ...baseStructured,
            reason: 'rag_feedback_unavailable_missing_api_key',
          },
          feedback: composeFeedback({
            configFeedback,
            scriptOk: true,
            scriptPath,
            minScriptChars,
            ragNote:
              'AI script-quality feedback is unavailable (ANTHROPIC_API_KEY not configured). State checks still passed.',
          }),
        };
      }

      console.error('Script remediation RAG grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-06',
        operation: 'script_remediation_rag_grade',
        ticketId: ticket.id,
        ticketType: ticket.ticket_type,
        level: 'warning',
      });

      return {
        status: 'resolved',
        structuredResult: {
          ...baseStructured,
          reason: 'rag_feedback_error',
        },
        feedback: composeFeedback({
          configFeedback,
          scriptOk: true,
          scriptPath,
          minScriptChars,
          ragNote:
            'Could not retrieve script-quality feedback right now; filesystem state checks still passed.',
        }),
      };
    }
  },
};
