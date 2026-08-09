import Anthropic from '@anthropic-ai/sdk';

import {
  formatRetrievedAuditCommitteeGuidance,
  retrieveAuditCommitteeGuidance,
} from '@/lib/grc/getAuditCommitteeGuidance';
import {
  formatSummaryForPrompt,
  retrieveSummarySections,
  type ExecutiveSummaryDocument,
} from '@/lib/grc/summaryCorpus';
import { MissingAnthropicApiKeyError } from '@/lib/grading/callClaudeGrading';

export const AC_QUESTION_MIN = 4;
export const AC_QUESTION_MAX = 5;

export type AuditCommitteeQuestion = {
  id: string;
  prompt: string;
  /** Optional focus hint for grading (not shown as required). */
  focus?: string;
};

export type AuditCommitteeQuestionsPayload = {
  questions: AuditCommitteeQuestion[];
  generatedAt: string;
  source: 'llm' | 'deterministic_fallback';
  retrievedSummarySectionIds: string[];
  retrievedGuidanceSectionIds: string[];
};

const QUESTIONS_TOOL_NAME = 'submit_audit_committee_questions';

const questionsTool: Anthropic.Tool = {
  name: QUESTIONS_TOOL_NAME,
  description:
    'Submit 4–5 audit-committee-style questions grounded in the student executive summary.',
  input_schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        minItems: AC_QUESTION_MIN,
        maxItems: AC_QUESTION_MAX,
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Stable id like q1, q2, …',
            },
            prompt: {
              type: 'string',
              description:
                'Pointed audit-committee question grounded in the executive summary.',
            },
            focus: {
              type: 'string',
              description:
                'Short focus tag (e.g. root-cause, remediation-timeline, residual-risk).',
            },
          },
          required: ['id', 'prompt'],
        },
      },
    },
    required: ['questions'],
  },
};

function resolveAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514';
}

function buildGenerationPrompt(
  summary: ExecutiveSummaryDocument,
  summarySectionsText: string,
  guidanceText: string,
  priorFindingsNarrative?: string
): string {
  const findingsBlock = priorFindingsNarrative?.trim()
    ? `## Prior findings context (AUD-06 / CCCER)

${priorFindingsNarrative.trim()}

`
    : '';

  return `You are simulating an audit committee reviewing a student's short executive summary of engagement findings.

Generate ${AC_QUESTION_MIN}–${AC_QUESTION_MAX} pointed written questions. Questions MUST be specific to the retrieved executive-summary excerpts — not generic interview questions.

Use ONLY:
1) Retrieved audit-committee / executive reporting guidance
2) Retrieved executive-summary excerpts
3) Optional prior findings context when provided

Do not invent systems, findings, owners, or dollar impacts that do not appear in the summary/findings excerpts. You may ask about gaps the student left unaddressed when those gaps are implied by the guidance and the excerpts.

## Retrieved audit-committee guidance

${guidanceText}

## Retrieved executive-summary excerpts

${summarySectionsText}

${findingsBlock}## Full executive summary (for continuity; prefer excerpts above)

${formatSummaryForPrompt(summary)}

## Instructions

Return structured JSON via the ${QUESTIONS_TOOL_NAME} tool with ${AC_QUESTION_MIN}–${AC_QUESTION_MAX} questions. Each question should press on root cause, remediation timeline / milestones, accountability / ownership, residual risk, or monitoring if dates slip.`;
}

function normalizeQuestions(raw: unknown): AuditCommitteeQuestion[] | null {
  if (!Array.isArray(raw)) return null;
  const questions: AuditCommitteeQuestion[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const entry = raw[index];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const prompt =
      typeof record.prompt === 'string'
        ? record.prompt.trim()
        : typeof record.question === 'string'
          ? record.question.trim()
          : '';
    if (!prompt) continue;
    const id =
      typeof record.id === 'string' && record.id.trim()
        ? record.id.trim()
        : `q${index + 1}`;
    const focus =
      typeof record.focus === 'string' && record.focus.trim()
        ? record.focus.trim()
        : undefined;
    questions.push({ id, prompt, focus });
  }
  if (
    questions.length < AC_QUESTION_MIN ||
    questions.length > AC_QUESTION_MAX
  ) {
    return null;
  }
  return questions;
}

function excerptSnippet(text: string, max = 160): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

/**
 * Deterministic fallback when Anthropic is unavailable.
 * Still grounded in summary / findings excerpts (not a fixed generic list only).
 */
export function buildDeterministicAuditCommitteeQuestions(
  summary: ExecutiveSummaryDocument,
  priorFindingsNarrative?: string
): AuditCommitteeQuestion[] {
  const body = summary.body.trim();
  const findings = priorFindingsNarrative?.trim() ?? '';
  const snippet = excerptSnippet(body || findings || 'the engagement findings');

  const questions: AuditCommitteeQuestion[] = [
    {
      id: 'q1',
      prompt: `Based on your executive summary (${snippet}), what is the most plausible root cause of the highest-severity finding, and what evidence from the engagement supports that cause analysis?`,
      focus: 'root-cause',
    },
    {
      id: 'q2',
      prompt:
        'What remediation milestones and target dates has management committed to for the key exceptions, and why should the audit committee consider those dates realistic?',
      focus: 'remediation-timeline',
    },
    {
      id: 'q3',
      prompt:
        'Which function owns each significant remediation item, and how will accountability be enforced if owners miss interim milestones?',
      focus: 'accountability',
    },
    {
      id: 'q4',
      prompt:
        'What residual risk remains until remediation completes, and which compensating controls or monitoring activities make continued operations acceptable in the interim?',
      focus: 'residual-risk',
    },
  ];

  if (body.length > 200 || findings.length > 200) {
    questions.push({
      id: 'q5',
      prompt: `If the conditions described in "${excerptSnippet(body || findings, 120)}" recur next quarter, what early-warning metrics or revisit triggers should the audit committee require management to report?`,
      focus: 'monitoring',
    });
  }

  return questions.slice(0, AC_QUESTION_MAX);
}

export async function generateAuditCommitteeQuestionsFromSummary(
  summary: ExecutiveSummaryDocument,
  options?: { priorFindingsNarrative?: string }
): Promise<AuditCommitteeQuestionsPayload> {
  const query =
    'audit committee executive summary root cause remediation timeline accountability residual risk monitoring';
  const summarySections = retrieveSummarySections(summary, query, 4);
  const guidance = retrieveAuditCommitteeGuidance(query, { topK: 5 });

  const summarySectionsText =
    summarySections
      .map((s) => `### ${s.id} — ${s.title}\n\n${s.text}`)
      .join('\n\n') || formatSummaryForPrompt(summary);

  const guidanceText = formatRetrievedAuditCommitteeGuidance(guidance);

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new MissingAnthropicApiKeyError();
    }

    const anthropic = new Anthropic({ apiKey });
    const prompt = buildGenerationPrompt(
      summary,
      summarySectionsText,
      guidanceText,
      options?.priorFindingsNarrative
    );

    const response = await anthropic.messages.create({
      model: resolveAnthropicModel(),
      max_tokens: 2048,
      tools: [questionsTool],
      tool_choice: { type: 'tool', name: QUESTIONS_TOOL_NAME },
      messages: [{ role: 'user', content: prompt }],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    if (!toolUse || toolUse.name !== QUESTIONS_TOOL_NAME) {
      throw new Error(
        'Claude did not return audit committee questions tool output.'
      );
    }

    const input = toolUse.input as Record<string, unknown>;
    const questions = normalizeQuestions(input.questions);
    if (!questions) {
      throw new Error(
        'Claude returned an invalid audit committee questions payload.'
      );
    }

    return {
      questions,
      generatedAt: new Date().toISOString(),
      source: 'llm',
      retrievedSummarySectionIds: summarySections.map((s) => s.id),
      retrievedGuidanceSectionIds: guidance.sections.map((s) => s.id),
    };
  } catch (error) {
    if (!(error instanceof MissingAnthropicApiKeyError)) {
      console.error(
        'Audit committee question generation failed; using fallback:',
        error
      );
    }

    return {
      questions: buildDeterministicAuditCommitteeQuestions(
        summary,
        options?.priorFindingsNarrative
      ),
      generatedAt: new Date().toISOString(),
      source: 'deterministic_fallback',
      retrievedSummarySectionIds: summarySections.map((s) => s.id),
      retrievedGuidanceSectionIds: guidance.sections.map((s) => s.id),
    };
  }
}
