import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
  coerceStringList,
  parseClaudeGradingToolInput,
  callClaudeGrading,
  MissingAnthropicApiKeyError,
} from '@/lib/grading/callClaudeGrading';

describe('coerceStringList', () => {
  it('returns empty array for nullish values', () => {
    expect(coerceStringList(null)).toEqual([]);
    expect(coerceStringList(undefined)).toEqual([]);
  });

  it('accepts a clean string array', () => {
    expect(coerceStringList([' Cited MFA ', 'Clear scope'])).toEqual([
      'Cited MFA',
      'Clear scope',
    ]);
  });

  it('coerces a single string into a one-item array', () => {
    expect(coerceStringList('Cited MFA and scoped the system')).toEqual([
      'Cited MFA and scoped the system',
    ]);
  });

  it('splits bullet / numbered multiline strings', () => {
    expect(
      coerceStringList('- Cited MFA\n* Clear scope\n1. Named the system')
    ).toEqual(['Cited MFA', 'Clear scope', 'Named the system']);
  });

  it('extracts text from object-shaped items', () => {
    expect(
      coerceStringList([
        { text: 'Cited MFA' },
        { value: 'Clear scope' },
        { content: 'Named the boundary' },
      ])
    ).toEqual(['Cited MFA', 'Clear scope', 'Named the boundary']);
  });

  it('coerces a single object with a text field', () => {
    expect(coerceStringList({ strength: 'Cited MFA' })).toEqual(['Cited MFA']);
  });

  it('drops null entries and keeps numbers/booleans as strings', () => {
    expect(coerceStringList(['ok', null, 12, true, ''])).toEqual([
      'ok',
      '12',
      'true',
    ]);
  });

  it('returns null for unusable shapes', () => {
    expect(coerceStringList({ foo: 1 })).toBeNull();
    expect(coerceStringList([Symbol('x')])).toBeNull();
  });
});

describe('parseClaudeGradingToolInput', () => {
  it('parses a well-formed payload', () => {
    expect(
      parseClaudeGradingToolInput({
        finding_state: 'satisfied',
        feedback: 'Solid memo.',
        strengths: ['Cited MFA'],
        gaps: [],
      })
    ).toEqual({
      finding_state: 'satisfied',
      feedback: 'Solid memo.',
      strengths: ['Cited MFA'],
      gaps: [],
    });
  });

  it('normalizes finding_state case and coerces string strengths/gaps', () => {
    expect(
      parseClaudeGradingToolInput({
        finding_state: ' Insufficient_Evidence ',
        feedback: ' Needs more evidence. ',
        strengths: 'Cited the system boundary',
        gaps: 'Missing AC-2 evidence\n- No inheritance statement',
      })
    ).toEqual({
      finding_state: 'insufficient_evidence',
      feedback: 'Needs more evidence.',
      strengths: ['Cited the system boundary'],
      gaps: ['Missing AC-2 evidence', 'No inheritance statement'],
    });
  });

  it('throws on invalid strengths that cannot be coerced', () => {
    expect(() =>
      parseClaudeGradingToolInput({
        finding_state: 'satisfied',
        feedback: 'ok',
        strengths: [{ foo: 1 }],
        gaps: [],
      })
    ).toThrow('Claude returned invalid strengths.');
  });

  it('throws on invalid gaps that cannot be coerced', () => {
    expect(() =>
      parseClaudeGradingToolInput({
        finding_state: 'not_satisfied',
        feedback: 'ok',
        strengths: [],
        gaps: [{ foo: 1 }],
      })
    ).toThrow('Claude returned invalid gaps.');
  });

  it('throws on empty feedback', () => {
    expect(() =>
      parseClaudeGradingToolInput({
        finding_state: 'satisfied',
        feedback: '   ',
        strengths: [],
        gaps: [],
      })
    ).toThrow('Claude returned invalid feedback.');
  });
});

const createMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = { create: createMock };
  }
  return { default: Anthropic };
});

describe('callClaudeGrading retry-once', () => {
  const prevKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    createMock.mockReset();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  afterEach(() => {
    if (prevKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = prevKey;
    }
  });

  it('throws MissingAnthropicApiKeyError when unset', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(callClaudeGrading('grade this')).rejects.toBeInstanceOf(
      MissingAnthropicApiKeyError
    );
  });

  it('retries once when the first tool payload has invalid strengths shape', async () => {
    createMock
      .mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            name: 'submit_grading',
            input: {
              finding_state: 'satisfied',
              feedback: 'ok',
              // Unusable shape → parse failure → retry
              strengths: [{ foo: 1 }],
              gaps: [],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            name: 'submit_grading',
            input: {
              finding_state: 'satisfied',
              feedback: 'ok',
              strengths: ['Cited MFA'],
              gaps: [],
            },
          },
        ],
      });

    const result = await callClaudeGrading('grade this memo');
    expect(result.strengths).toEqual(['Cited MFA']);
    expect(createMock).toHaveBeenCalledTimes(2);
    const retryPrompt = createMock.mock.calls[1]?.[0]?.messages?.[0]?.content;
    expect(String(retryPrompt)).toContain('array of strings');
  });

  it('succeeds without retry when strengths arrive as a bare string', async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'submit_grading',
          input: {
            finding_state: 'satisfied',
            feedback: 'ok',
            strengths: 'Cited MFA',
            gaps: 'Missing inheritance',
          },
        },
      ],
    });

    const result = await callClaudeGrading('grade this memo');
    expect(result).toEqual({
      finding_state: 'satisfied',
      feedback: 'ok',
      strengths: ['Cited MFA'],
      gaps: ['Missing inheritance'],
    });
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
