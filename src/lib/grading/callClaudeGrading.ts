import Anthropic from '@anthropic-ai/sdk';

import {
  isAiFindingState,
  type AiFindingState,
} from '@/lib/grading/mapFindingState';

export class MissingAnthropicApiKeyError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY is not configured');
    this.name = 'MissingAnthropicApiKeyError';
  }
}

export type ClaudeGradingResult = {
  finding_state: AiFindingState;
  feedback: string;
  strengths: string[];
  gaps: string[];
};

const GRADING_TOOL_NAME = 'submit_grading';

const gradingTool: Anthropic.Tool = {
  name: GRADING_TOOL_NAME,
  description:
    'Submit structured grading results for a CCCER control assessment.',
  input_schema: {
    type: 'object',
    properties: {
      finding_state: {
        type: 'string',
        enum: ['satisfied', 'insufficient_evidence', 'not_satisfied'],
        description:
          'Overall assessment relative to the provided control statement only.',
      },
      feedback: {
        type: 'string',
        description: 'Concise overall assessment for the student.',
      },
      strengths: {
        type: 'array',
        items: { type: 'string' },
        description:
          'JSON array of strings only (not a single string). Each item is one specific strength. Use [] if none.',
      },
      gaps: {
        type: 'array',
        items: { type: 'string' },
        description:
          'JSON array of strings only (not a single string). Each item is one specific gap or weakness. Use [] if none.',
      },
    },
    required: ['finding_state', 'feedback', 'strengths', 'gaps'],
  },
};

const SCHEMA_RETRY_SUFFIX = `

IMPORTANT: Call ${GRADING_TOOL_NAME} with valid JSON types only:
- finding_state: one of "satisfied" | "insufficient_evidence" | "not_satisfied"
- feedback: non-empty string
- strengths: array of strings (e.g. ["point one","point two"]), never a bare string
- gaps: array of strings (e.g. ["gap one"]), never a bare string`;

function resolveAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';
}

function extractStringFromObject(
  value: Record<string, unknown>
): string | null {
  for (const key of [
    'text',
    'value',
    'content',
    'description',
    'strength',
    'gap',
    'item',
    'summary',
  ]) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

/**
 * Coerce Claude tool-output shapes into a clean string[].
 * Accepts arrays, a single string, newline/bullet lists, and simple
 * `{ text | value | content | ... }` objects. Returns null when the value
 * cannot be interpreted as a list of strings.
 */
export function coerceStringList(value: unknown): string[] | null {
  if (value == null) {
    return [];
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    // Markdown / prose bullet or numbered lists → multiple items
    const lines = trimmed
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
      .filter(Boolean);

    if (lines.length > 1) {
      return lines;
    }

    return [trimmed];
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }

  if (!Array.isArray(value)) {
    if (typeof value === 'object') {
      const extracted = extractStringFromObject(
        value as Record<string, unknown>
      );
      return extracted ? [extracted] : null;
    }
    return null;
  }

  const items: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed) items.push(trimmed);
      continue;
    }
    if (typeof item === 'number' || typeof item === 'boolean') {
      items.push(String(item));
      continue;
    }
    if (item == null) {
      continue;
    }
    if (typeof item === 'object') {
      const extracted = extractStringFromObject(
        item as Record<string, unknown>
      );
      if (extracted) {
        items.push(extracted);
        continue;
      }
      // Nested one-element arrays occasionally appear
      if (Array.isArray(item)) {
        const nested = coerceStringList(item);
        if (nested) {
          items.push(...nested);
          continue;
        }
      }
      return null;
    }
    return null;
  }

  return items;
}

/**
 * Parse / normalize Claude tool_use input into a grading result.
 * Exported for unit tests.
 */
export function parseClaudeGradingToolInput(
  input: unknown
): ClaudeGradingResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Claude did not return structured grading output.');
  }

  const record = input as Record<string, unknown>;
  const findingStateRaw = record.finding_state;
  const feedbackRaw = record.feedback;
  const strengths = coerceStringList(record.strengths);
  const gaps = coerceStringList(record.gaps);

  const findingState =
    typeof findingStateRaw === 'string'
      ? findingStateRaw.trim().toLowerCase()
      : findingStateRaw;

  if (typeof findingState !== 'string' || !isAiFindingState(findingState)) {
    throw new Error('Claude returned an invalid finding_state value.');
  }

  if (typeof feedbackRaw !== 'string' || !feedbackRaw.trim()) {
    throw new Error('Claude returned invalid feedback.');
  }

  if (strengths === null) {
    throw new Error('Claude returned invalid strengths.');
  }

  if (gaps === null) {
    throw new Error('Claude returned invalid gaps.');
  }

  return {
    finding_state: findingState,
    feedback: feedbackRaw.trim(),
    strengths,
    gaps,
  };
}

async function requestGradingToolInput(
  anthropic: Anthropic,
  prompt: string
): Promise<unknown> {
  const response = await anthropic.messages.create({
    model: resolveAnthropicModel(),
    max_tokens: 2048,
    tools: [gradingTool],
    tool_choice: { type: 'tool', name: GRADING_TOOL_NAME },
    messages: [{ role: 'user', content: prompt }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
  );

  if (!toolUse || toolUse.name !== GRADING_TOOL_NAME) {
    throw new Error('Claude did not return structured grading output.');
  }

  return toolUse.input;
}

function isSchemaParseError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message === 'Claude returned invalid strengths.' ||
    error.message === 'Claude returned invalid gaps.' ||
    error.message === 'Claude returned invalid feedback.' ||
    error.message === 'Claude returned an invalid finding_state value.' ||
    error.message === 'Claude did not return structured grading output.'
  );
}

export async function callClaudeGrading(
  prompt: string
): Promise<ClaudeGradingResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new MissingAnthropicApiKeyError();
  }

  const anthropic = new Anthropic({ apiKey });

  try {
    const input = await requestGradingToolInput(anthropic, prompt);
    return parseClaudeGradingToolInput(input);
  } catch (error) {
    if (!isSchemaParseError(error)) {
      throw error;
    }

    // One retry with an explicit type reminder — models occasionally return
    // strengths/gaps as a bare string instead of string[].
    const input = await requestGradingToolInput(
      anthropic,
      `${prompt}${SCHEMA_RETRY_SUFFIX}`
    );
    return parseClaudeGradingToolInput(input);
  }
}
