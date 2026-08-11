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
        description: 'Specific strengths in the submission.',
      },
      gaps: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Specific gaps, missing evidence, or weaknesses relative to the control statement.',
      },
    },
    required: ['finding_state', 'feedback', 'strengths', 'gaps'],
  },
};

function resolveAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';
}

export async function callClaudeGrading(
  prompt: string
): Promise<ClaudeGradingResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new MissingAnthropicApiKeyError();
  }

  const anthropic = new Anthropic({ apiKey });

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

  const input = toolUse.input as Record<string, unknown>;
  const findingState = input.finding_state;
  const feedback = input.feedback;
  const strengths = input.strengths;
  const gaps = input.gaps;

  if (typeof findingState !== 'string' || !isAiFindingState(findingState)) {
    throw new Error('Claude returned an invalid finding_state value.');
  }

  if (typeof feedback !== 'string' || !feedback.trim()) {
    throw new Error('Claude returned invalid feedback.');
  }

  if (
    !Array.isArray(strengths) ||
    !strengths.every((item) => typeof item === 'string')
  ) {
    throw new Error('Claude returned invalid strengths.');
  }

  if (!Array.isArray(gaps) || !gaps.every((item) => typeof item === 'string')) {
    throw new Error('Claude returned invalid gaps.');
  }

  return {
    finding_state: findingState,
    feedback: feedback.trim(),
    strengths,
    gaps,
  };
}
