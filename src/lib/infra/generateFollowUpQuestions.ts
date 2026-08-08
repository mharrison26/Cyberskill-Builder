import Anthropic from '@anthropic-ai/sdk';

import {
  formatDesignDocForPrompt,
  retrieveDesignDocSections,
  type InfraDesignDocument,
} from '@/lib/infra/designDocCorpus';
import {
  formatRetrievedArchitectureDecisionRubric,
  retrieveArchitectureDecisionRubric,
} from '@/lib/infra/getArchitectureDecisionRubric';
import { MissingAnthropicApiKeyError } from '@/lib/grading/callClaudeGrading';

export const INFRA_FOLLOWUP_QUESTION_MIN = 4;
export const INFRA_FOLLOWUP_QUESTION_MAX = 5;

export type InfraFollowUpQuestion = {
  id: string;
  prompt: string;
  /** Optional focus hint for grading (not shown as required). */
  focus?: string;
};

export type InfraFollowUpQuestionsPayload = {
  questions: InfraFollowUpQuestion[];
  generatedAt: string;
  source: 'llm' | 'deterministic_fallback';
  retrievedDesignSectionIds: string[];
  retrievedRubricSectionIds: string[];
};

const QUESTIONS_TOOL_NAME = 'submit_infra_followup_questions';

const questionsTool: Anthropic.Tool = {
  name: QUESTIONS_TOOL_NAME,
  description:
    'Submit 4–5 follow-up questions that probe tradeoffs in the student infrastructure design decision.',
  input_schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        minItems: INFRA_FOLLOWUP_QUESTION_MIN,
        maxItems: INFRA_FOLLOWUP_QUESTION_MAX,
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
                'Pointed tradeoff question grounded in the student design doc.',
            },
            focus: {
              type: 'string',
              description:
                'Short focus tag (e.g. ransomware, budget, restore testing).',
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
  doc: InfraDesignDocument,
  designSectionsText: string,
  rubricText: string
): string {
  return `You are a senior infrastructure engineer reviewing a student's architecture decision record (ADR) about backup topology.

Generate ${INFRA_FOLLOWUP_QUESTION_MIN}–${INFRA_FOLLOWUP_QUESTION_MAX} pointed written follow-up questions that probe tradeoffs. Questions MUST be specific to the retrieved design-document excerpts — not generic interview questions.

Use ONLY:
1) Retrieved architecture-decision / tradeoff rubric
2) Retrieved design-document excerpts

Do not invent systems, budgets, or constraints that do not appear in the design excerpts. You may ask about gaps the student left unaddressed when those gaps are implied by the rubric and the excerpts.

## Retrieved tradeoff rubric

${rubricText}

## Retrieved design-document excerpts

${designSectionsText}

## Full design document (for continuity; prefer excerpts above)

${formatDesignDocForPrompt(doc)}

## Instructions

Return structured JSON via the ${QUESTIONS_TOOL_NAME} tool with ${INFRA_FOLLOWUP_QUESTION_MIN}–${INFRA_FOLLOWUP_QUESTION_MAX} questions. Each question should press on constraints fit, alternatives rejected, explicit tradeoffs (cost/complexity/recovery), failure modes (ransomware / site loss), or operability / restore realism.`;
}

function normalizeQuestions(raw: unknown): InfraFollowUpQuestion[] | null {
  if (!Array.isArray(raw)) return null;
  const questions: InfraFollowUpQuestion[] = [];
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
    questions.length < INFRA_FOLLOWUP_QUESTION_MIN ||
    questions.length > INFRA_FOLLOWUP_QUESTION_MAX
  ) {
    return null;
  }
  return questions;
}

/**
 * Deterministic fallback when Anthropic is unavailable.
 * Still grounded in the student design doc (not a fixed generic list only).
 */
export function buildDeterministicInfraFollowUpQuestions(
  doc: InfraDesignDocument
): InfraFollowUpQuestion[] {
  const title = doc.title.trim() || 'your design decision';
  const topologyFromBody = doc.body
    .match(/(?:chose|choose|recommend(?:ed)?|selected)\s+([^.!?\n]{8,80})/i)?.[1]
    ?.trim();
  const topology = doc.topologyChoice?.trim() || topologyFromBody || null;
  const bodyLower = doc.body.toLowerCase();
  const mentionsRansomware = bodyLower.includes('ransomware');
  const mentionsBudget =
    bodyLower.includes('budget') || bodyLower.includes('$');
  const mentionsRestore =
    bodyLower.includes('restore') || bodyLower.includes('rto');

  const questions: InfraFollowUpQuestion[] = [
    {
      id: 'q1',
      prompt: topology
        ? `In "${title}", you chose ${topology}. Which constraint (budget, staffing, RPO/RTO, or ransomware resilience) most strongly forced that choice, and what capability did you consciously give up?`
        : `In "${title}", state the primary backup topology you are defending and which single constraint most strongly forced that choice over a simpler alternative.`,
      focus: 'constraints-fit',
    },
    {
      id: 'q2',
      prompt:
        'Name one credible alternative topology you rejected for this organization. Compare it to your choice on monthly cost, restore speed, and operational complexity.',
      focus: 'alternatives-rejected',
    },
    {
      id: 'q3',
      prompt: mentionsRansomware
        ? 'Your design mentions ransomware. If ransomware encrypts the file server and any backup targets reachable with the same credentials, what residual risk remains and what control keeps an immutable or offline copy safe?'
        : 'Assume ransomware encrypts the on-prem file server and any always-online backup shares. How does your topology limit blast radius, and what residual risk remains?',
      focus: 'failure-modes',
    },
    {
      id: 'q4',
      prompt: mentionsRestore
        ? 'Walk through a realistic restore of the patient-image share under your stated RTO: who performs it, which copy is used first, and what “restored” means for clinical staff.'
        : 'Who operates day-to-day backup monitoring and a quarterly restore drill under the “no dedicated IT” constraint, and what evidence would show the topology still meets your RTO?',
      focus: 'operability',
    },
  ];

  if (mentionsBudget || questions.length < INFRA_FOLLOWUP_QUESTION_MAX) {
    questions.push({
      id: 'q5',
      prompt: mentionsBudget
        ? 'Given the stated budget ceiling, which part of your topology would you cut first if costs spiked 30%, and how would that change residual risk?'
        : 'What is the largest operational burden your topology places on non-specialist staff, and how would you simplify it without abandoning offsite protection?',
      focus: 'tradeoffs-explicit',
    });
  }

  return questions.slice(0, INFRA_FOLLOWUP_QUESTION_MAX);
}

export async function generateInfraFollowUpQuestionsFromDesignDoc(
  doc: InfraDesignDocument
): Promise<InfraFollowUpQuestionsPayload> {
  const query =
    'backup topology tradeoff ransomware RPO RTO budget restore testing immutable offsite alternatives';
  const designSections = retrieveDesignDocSections(doc, query, 5);
  const rubric = retrieveArchitectureDecisionRubric(query, { topK: 5 });

  const designSectionsText =
    designSections
      .map((s) => `### ${s.id} — ${s.title}\n\n${s.text}`)
      .join('\n\n') || formatDesignDocForPrompt(doc);

  const rubricText = formatRetrievedArchitectureDecisionRubric(rubric);

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new MissingAnthropicApiKeyError();
    }

    const anthropic = new Anthropic({ apiKey });
    const prompt = buildGenerationPrompt(doc, designSectionsText, rubricText);

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
      throw new Error('Claude did not return infra follow-up questions tool output.');
    }

    const input = toolUse.input as Record<string, unknown>;
    const questions = normalizeQuestions(input.questions);
    if (!questions) {
      throw new Error('Claude returned an invalid infra follow-up questions payload.');
    }

    return {
      questions,
      generatedAt: new Date().toISOString(),
      source: 'llm',
      retrievedDesignSectionIds: designSections.map((s) => s.id),
      retrievedRubricSectionIds: rubric.sections.map((s) => s.id),
    };
  } catch (error) {
    if (!(error instanceof MissingAnthropicApiKeyError)) {
      console.error(
        'Infra follow-up question generation failed; using fallback:',
        error
      );
    }

    return {
      questions: buildDeterministicInfraFollowUpQuestions(doc),
      generatedAt: new Date().toISOString(),
      source: 'deterministic_fallback',
      retrievedDesignSectionIds: designSections.map((s) => s.id),
      retrievedRubricSectionIds: rubric.sections.map((s) => s.id),
    };
  }
}
