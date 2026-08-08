import Anthropic from '@anthropic-ai/sdk';

import { captureFeatureException } from '@/lib/observability/sentry';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

/**
 * Deterministic config-diff scoring (PI-03).
 *
 * Pass / fail / percentage are computed only from `expected_state` rules vs the
 * submission filesystem / command history. The LLM receives that structured
 * diff only and writes narrative feedback — never grades correctness.
 *
 * Pass threshold: default 100% (every rule must pass → `resolved`). Override
 * with `expected_state.passThresholdPercent` (0–100).
 *
 * expected_state JSON shape:
 * {
 *   rules: Array<
 *     | { id, type: 'file_equals', path, content }
 *     | { id, type: 'file_contains', path, pattern, regex?: boolean }
 *     | { id, type: 'file_absent', path }
 *     | { id, type: 'file_permission', path, mode }
 *     | { id, type: 'command_history', pattern, regex?: boolean }
 *   >;
 *   passThresholdPercent?: number; // default 100
 * }
 *
 * Submission (CodeSandbox / submit route): typically `{ files: { [path]: content } }`.
 * Also accepts `filesystem`, `final_state.files`, optional `fileModes` / `modes`,
 * and `commandHistory` / `command_history` (string or string[]).
 */

export type ConfigDiffRule =
  | {
      id: string;
      type: 'file_equals';
      path: string;
      content: string;
    }
  | {
      id: string;
      type: 'file_contains';
      path: string;
      pattern: string;
      regex?: boolean;
    }
  | {
      id: string;
      type: 'file_absent';
      path: string;
    }
  | {
      id: string;
      type: 'file_permission';
      path: string;
      mode: string;
    }
  | {
      id: string;
      type: 'command_history';
      pattern: string;
      regex?: boolean;
    };

export type ExpectedState = {
  rules?: ConfigDiffRule[];
  /** Minimum percentage of rules that must pass (default 100). */
  passThresholdPercent?: number;
};

export type ConfigDiffRuleResult = {
  id: string;
  type: ConfigDiffRule['type'];
  passed: boolean;
  summary: string;
  detail: string;
};

export type ConfigDiffStructuredResult = {
  style: 'config_diff';
  percentage: number;
  passedCount: number;
  totalCount: number;
  passThresholdPercent: number;
  rules: ConfigDiffRuleResult[];
  reason?: string;
};

const DEFAULT_PASS_THRESHOLD = 100;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/\/+/g, '/');
}

function normalizeMode(mode: string): string {
  const trimmed = mode.trim();
  // Accept "644", "0644", or "rw-r--r--" — compare digit forms when both numeric.
  if (/^[0-7]{3,4}$/.test(trimmed)) {
    return trimmed.slice(-3);
  }
  return trimmed;
}

function asStringRecord(value: unknown): Record<string, string> | null {
  if (!isPlainObject(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      out[normalizePath(key)] = entry;
    } else if (isPlainObject(entry) && typeof entry.content === 'string') {
      out[normalizePath(key)] = entry.content;
    }
  }
  return out;
}

function extractFiles(submission: TicketSubmission): Record<string, string> {
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

function extractFileModes(
  submission: TicketSubmission
): Record<string, string> {
  const direct =
    asStringRecord(submission.fileModes) ??
    asStringRecord(submission.modes) ??
    asStringRecord(submission.permissions);

  if (direct) return direct;

  if (isPlainObject(submission.final_state)) {
    const nested =
      asStringRecord(submission.final_state.fileModes) ??
      asStringRecord(submission.final_state.modes) ??
      asStringRecord(submission.final_state.permissions);
    if (nested) return nested;
  }

  // Allow modes nested on file entries: { files: { path: { content, mode } } }
  const filesRaw =
    submission.files ??
    submission.filesystem ??
    (isPlainObject(submission.final_state)
      ? submission.final_state.files
      : undefined);
  if (!isPlainObject(filesRaw)) return {};

  const modes: Record<string, string> = {};
  for (const [key, entry] of Object.entries(filesRaw)) {
    if (
      isPlainObject(entry) &&
      (typeof entry.mode === 'string' || typeof entry.permissions === 'string')
    ) {
      const mode =
        typeof entry.mode === 'string' ? entry.mode : String(entry.permissions);
      modes[normalizePath(key)] = mode;
    }
  }
  return modes;
}

function extractCommandHistory(submission: TicketSubmission): string {
  const candidates = [
    submission.commandHistory,
    submission.command_history,
    submission.history,
    isPlainObject(submission.final_state)
      ? (submission.final_state.commandHistory ??
        submission.final_state.command_history ??
        submission.final_state.history)
      : undefined,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string') return candidate;
    if (Array.isArray(candidate)) {
      return candidate
        .filter((line): line is string => typeof line === 'string')
        .join('\n');
    }
  }

  return '';
}

function parseExpectedState(raw: unknown): ExpectedState | null {
  if (!isPlainObject(raw)) return null;
  return raw as ExpectedState;
}

function resolveExpectedState(ticket: ScorableTicket): ExpectedState | null {
  const fromColumn = parseExpectedState(ticket.expected_state);
  if (
    fromColumn &&
    Array.isArray(fromColumn.rules) &&
    fromColumn.rules.length > 0
  ) {
    return fromColumn;
  }

  const fromInitial = parseExpectedState(ticket.initial_state?.expected_state);
  if (
    fromInitial &&
    Array.isArray(fromInitial.rules) &&
    fromInitial.rules.length > 0
  ) {
    return fromInitial;
  }

  // Legacy stub shape: initial_state.expected_config vs submission.config
  if (ticket.initial_state?.expected_config !== undefined) {
    return {
      rules: [
        {
          id: 'legacy_expected_config',
          type: 'file_equals',
          path: '__config__',
          content: stableStringify(ticket.initial_state.expected_config),
        },
      ],
      passThresholdPercent: 100,
    };
  }

  if (fromColumn) return fromColumn;
  if (fromInitial) return fromInitial;
  return null;
}

function resolvePassThreshold(expected: ExpectedState): number {
  const raw = expected.passThresholdPercent;
  if (typeof raw !== 'number' || Number.isNaN(raw)) {
    return DEFAULT_PASS_THRESHOLD;
  }
  return Math.min(100, Math.max(0, raw));
}

function matchPattern(
  haystack: string,
  pattern: string,
  asRegex: boolean | undefined
): boolean {
  if (asRegex) {
    try {
      return new RegExp(pattern).test(haystack);
    } catch {
      return haystack.includes(pattern);
    }
  }
  return haystack.includes(pattern);
}

function evaluateRule(
  rule: ConfigDiffRule,
  files: Record<string, string>,
  modes: Record<string, string>,
  commandHistory: string,
  submission: TicketSubmission
): ConfigDiffRuleResult {
  switch (rule.type) {
    case 'file_equals': {
      // Legacy expected_config path uses synthetic __config__
      if (rule.path === '__config__') {
        const actual = submission.config ?? submission.final_config;
        const passed =
          actual !== undefined &&
          (stableStringify(actual) === rule.content ||
            (typeof actual === 'string' && actual === rule.content));
        return {
          id: rule.id,
          type: rule.type,
          passed,
          summary: 'config equals expected_config',
          detail: passed
            ? 'Configuration matches expected_config.'
            : actual === undefined
              ? 'Submission missing config / final_config.'
              : 'Configuration does not match expected_config.',
        };
      }

      const path = normalizePath(rule.path);
      const actual = files[path];
      if (actual === undefined) {
        return {
          id: rule.id,
          type: rule.type,
          passed: false,
          summary: `file_equals: ${path}`,
          detail: 'File is missing from the sandbox filesystem.',
        };
      }
      const passed = actual === rule.content;
      return {
        id: rule.id,
        type: rule.type,
        passed,
        summary: `file_equals: ${path}`,
        detail: passed
          ? 'File contents match exactly.'
          : 'File contents do not match the required value.',
      };
    }
    case 'file_contains': {
      const path = normalizePath(rule.path);
      const actual = files[path];
      if (actual === undefined) {
        return {
          id: rule.id,
          type: rule.type,
          passed: false,
          summary: `file_contains: ${path}`,
          detail: 'File is missing from the sandbox filesystem.',
        };
      }
      const passed = matchPattern(actual, rule.pattern, rule.regex);
      return {
        id: rule.id,
        type: rule.type,
        passed,
        summary: `file_contains: ${path}`,
        detail: passed
          ? 'Required pattern found in file.'
          : 'Required pattern was not found in the file.',
      };
    }
    case 'file_absent': {
      const path = normalizePath(rule.path);
      const passed = files[path] === undefined;
      return {
        id: rule.id,
        type: rule.type,
        passed,
        summary: `file_absent: ${path}`,
        detail: passed
          ? 'File is correctly absent from the sandbox filesystem.'
          : 'File is still present; it should have been removed.',
      };
    }
    case 'file_permission': {
      const path = normalizePath(rule.path);
      const actual = modes[path];
      if (actual === undefined) {
        return {
          id: rule.id,
          type: rule.type,
          passed: false,
          summary: `file_permission: ${path}`,
          detail:
            'No permission/mode metadata was included for this path in the submission.',
        };
      }
      const passed = normalizeMode(actual) === normalizeMode(rule.mode);
      return {
        id: rule.id,
        type: rule.type,
        passed,
        summary: `file_permission: ${path}`,
        detail: passed
          ? 'File mode matches the required value.'
          : `File mode does not match (expected ${normalizeMode(rule.mode)}).`,
      };
    }
    case 'command_history': {
      if (!commandHistory.trim()) {
        return {
          id: rule.id,
          type: rule.type,
          passed: false,
          summary: 'command_history',
          detail: 'Submission did not include command history.',
        };
      }
      const passed = matchPattern(commandHistory, rule.pattern, rule.regex);
      return {
        id: rule.id,
        type: rule.type,
        passed,
        summary: 'command_history',
        detail: passed
          ? 'Required command-history pattern was found.'
          : 'Required command-history pattern was not found.',
      };
    }
    default: {
      const unknown = rule as { id?: string; type?: string };
      return {
        id: typeof unknown.id === 'string' ? unknown.id : 'unknown',
        type: (unknown.type as ConfigDiffRule['type']) ?? 'file_equals',
        passed: false,
        summary: `unsupported_rule: ${String(unknown.type)}`,
        detail: 'Unsupported rule type; treated as failed.',
      };
    }
  }
}

function isConfigDiffRule(value: unknown): value is ConfigDiffRule {
  if (!isPlainObject(value) || typeof value.id !== 'string') return false;
  const type = value.type;
  if (type === 'file_equals') {
    return typeof value.path === 'string' && typeof value.content === 'string';
  }
  if (type === 'file_contains' || type === 'command_history') {
    const hasPattern = typeof value.pattern === 'string';
    if (type === 'command_history') return hasPattern;
    return hasPattern && typeof value.path === 'string';
  }
  if (type === 'file_absent') {
    return typeof value.path === 'string';
  }
  if (type === 'file_permission') {
    return typeof value.path === 'string' && typeof value.mode === 'string';
  }
  return false;
}

export function evaluateConfigDiff(
  submission: TicketSubmission,
  ticket: ScorableTicket
): ConfigDiffStructuredResult {
  const expected = resolveExpectedState(ticket);

  if (!expected) {
    return {
      style: 'config_diff',
      percentage: 0,
      passedCount: 0,
      totalCount: 0,
      passThresholdPercent: DEFAULT_PASS_THRESHOLD,
      rules: [],
      reason: 'missing_expected_state',
    };
  }

  const rules = Array.isArray(expected.rules)
    ? expected.rules.filter(isConfigDiffRule)
    : [];

  if (rules.length === 0) {
    return {
      style: 'config_diff',
      percentage: 0,
      passedCount: 0,
      totalCount: 0,
      passThresholdPercent: resolvePassThreshold(expected),
      rules: [],
      reason: 'empty_rules',
    };
  }

  const files = extractFiles(submission);
  const modes = extractFileModes(submission);
  const commandHistory = extractCommandHistory(submission);

  // Legacy path: inject synthetic config file from submission when needed
  if (
    rules.some((r) => r.type === 'file_equals' && r.path === '__config__') &&
    files['__config__'] === undefined
  ) {
    const actual = submission.config ?? submission.final_config;
    if (actual !== undefined) {
      files['__config__'] =
        typeof actual === 'string' ? actual : JSON.stringify(actual);
    }
  }

  const results = rules.map((rule) =>
    evaluateRule(rule, files, modes, commandHistory, submission)
  );
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  const percentage =
    totalCount === 0 ? 0 : Math.round((passedCount / totalCount) * 100);
  const passThresholdPercent = resolvePassThreshold(expected);

  return {
    style: 'config_diff',
    percentage,
    passedCount,
    totalCount,
    passThresholdPercent,
    rules: results,
  };
}

export function deterministicFeedback(
  result: ConfigDiffStructuredResult
): string {
  if (result.reason === 'missing_expected_state') {
    return 'This ticket has no expected_state ruleset; cannot score a config diff.';
  }
  if (result.reason === 'empty_rules' || result.totalCount === 0) {
    return 'This ticket expected_state has no valid scoring rules.';
  }

  const failed = result.rules.filter((r) => !r.passed);
  if (failed.length === 0) {
    return `All ${result.totalCount} configuration checks passed (${result.percentage}%).`;
  }

  const lines = failed.map((r) => `- ${r.summary}: ${r.detail}`);
  return [
    `Configuration checks: ${result.passedCount}/${result.totalCount} passed (${result.percentage}%; need ${result.passThresholdPercent}%).`,
    'Failed checks:',
    ...lines,
  ].join('\n');
}

/** Prompt payload: structured rule results only — never raw student files. */
function buildFeedbackPrompt(
  result: ConfigDiffStructuredResult,
  scenarioBrief: string
): string {
  return [
    'You write short, helpful feedback for a cybersecurity lab ticket.',
    'The student already received a deterministic grade. You do NOT decide pass/fail.',
    'Use only the structured rule results below. Do not invent file contents or commands.',
    'Write 2–4 sentences: what went well, what still needs fixing, and a concrete next step.',
    'Do not mention that you are an AI. Do not output JSON.',
    '',
    `Scenario brief: ${scenarioBrief.trim() || '(none)'}`,
    `Score: ${result.passedCount}/${result.totalCount} rules passed (${result.percentage}%).`,
    `Pass threshold: ${result.passThresholdPercent}%.`,
    `Outcome: ${
      result.percentage >= result.passThresholdPercent
        ? 'resolved'
        : 'needs_revision'
    }`,
    '',
    'Rule results (JSON):',
    JSON.stringify(result.rules, null, 2),
  ].join('\n');
}

async function callClaudeConfigDiffFeedback(
  result: ConfigDiffStructuredResult,
  scenarioBrief: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const anthropic = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514';

  const response = await anthropic.messages.create({
    model,
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: buildFeedbackPrompt(result, scenarioBrief),
      },
    ],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('Claude returned empty feedback.');
  }

  return text;
}

async function feedbackForDiff(
  result: ConfigDiffStructuredResult,
  ticket: ScorableTicket
): Promise<string> {
  if (result.reason || result.totalCount === 0) {
    return deterministicFeedback(result);
  }

  try {
    return await callClaudeConfigDiffFeedback(result, ticket.scenario_brief);
  } catch (error) {
    console.warn(
      'Config-diff LLM feedback unavailable; using deterministic summary.',
      error
    );
    captureFeatureException(error, {
      feature: 'scoring',
      pi: 'PI-03',
      operation: 'llm_feedback_fallback',
      ticketId: ticket.id,
      ticketType: ticket.ticket_type,
      level: 'warning',
      extras: {
        passedCount: result.passedCount,
        totalCount: result.totalCount,
        percentage: result.percentage,
      },
    });
    return deterministicFeedback(result);
  }
}

export const configDiffTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const structuredResult = evaluateConfigDiff(submission, ticket);
    const meetsThreshold =
      structuredResult.totalCount > 0 &&
      structuredResult.percentage >= structuredResult.passThresholdPercent &&
      !structuredResult.reason;

    const feedback = await feedbackForDiff(structuredResult, ticket);

    return {
      status: meetsThreshold ? 'resolved' : 'needs_revision',
      structuredResult,
      feedback,
    };
  },
};
