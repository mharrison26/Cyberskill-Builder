import Anthropic from '@anthropic-ai/sdk';

import {
  formatCompiledPackageForPrompt,
  type CompiledAuthorizationPackage,
} from '@/lib/capstone/compilePackage';
import { retrievePackageSections } from '@/lib/capstone/packageCorpus';
import {
  formatRetrievedRiskAcceptanceGuidance,
  retrieveRiskAcceptanceGuidance,
} from '@/lib/nist/getRiskAcceptanceGuidance';
import { MissingAnthropicApiKeyError } from '@/lib/grading/callClaudeGrading';

export const AO_QUESTION_MIN = 5;
export const AO_QUESTION_MAX = 7;

export type AoQuestion = {
  id: string;
  prompt: string;
  /** Optional focus hint for grading (not shown as required). */
  focus?: string;
};

export type AoQuestionsPayload = {
  questions: AoQuestion[];
  generatedAt: string;
  source: 'llm' | 'deterministic_fallback';
  retrievedPackageSectionIds: string[];
  retrievedGuidanceSectionIds: string[];
};

const QUESTIONS_TOOL_NAME = 'submit_ao_questions';

const questionsTool: Anthropic.Tool = {
  name: QUESTIONS_TOOL_NAME,
  description:
    'Submit 5–7 Authorizing Official review questions specific to the student authorization package.',
  input_schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        minItems: AO_QUESTION_MIN,
        maxItems: AO_QUESTION_MAX,
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
                'Pointed AO question about risk acceptance grounded in the package.',
            },
            focus: {
              type: 'string',
              description: 'Short focus tag (e.g. residual risk, POA&M date).',
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
  return process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';
}

function buildGenerationPrompt(
  pkg: CompiledAuthorizationPackage,
  packageSectionsText: string,
  guidanceText: string
): string {
  return `You are simulating an Authorizing Official (AO) reviewing a student's compiled ATO package (sheet GRC-10 / ISSO-05; sources GRC-03 SSP, GRC-04 POA&M, GRC-09 OSCAL).

Generate ${AO_QUESTION_MIN}–${AO_QUESTION_MAX} pointed written questions. The set MUST cover BOTH:
1) Residual risk acceptance (what risk remains, why it is tolerable, compensating controls, revisit conditions)
2) POA&M adequacy (milestone realism, scheduled completion credibility, risk_accepted vs remediate disposition, ownership)

Questions MUST be specific to the retrieved package excerpts (control gaps, POA&M items, SSP/SAR claims, OSCAL artifacts) — not generic interview questions.

Use ONLY:
1) Retrieved risk-acceptance guidance
2) Retrieved package excerpts

Do not invent systems, findings, or controls that do not appear in the package excerpts. If an artifact is missing, you may ask one question about the impact of that gap on authorization.

## Retrieved risk-acceptance guidance

${guidanceText}

## Retrieved package excerpts

${packageSectionsText}

## Package completeness snapshot

${pkg.artifacts
  .map((a) => `- ${a.code} ${a.label}: ${a.status} — ${a.summary}`)
  .join('\n')}
${pkg.packageSource && pkg.packageSource !== 'prior_submission' ? `\nPackage source note: ${pkg.packageSource} (prefer live student package when present).\n` : ''}
## Instructions

Return structured JSON via the ${QUESTIONS_TOOL_NAME} tool with ${AO_QUESTION_MIN}–${AO_QUESTION_MAX} questions. At least two questions must focus on residual risk acceptance and at least two on POA&M adequacy. Remaining questions may press SSP vs POA&M consistency, compensating controls, or monitoring/revisit conditions.`;
}

function normalizeQuestions(raw: unknown): AoQuestion[] | null {
  if (!Array.isArray(raw)) return null;
  const questions: AoQuestion[] = [];
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
    questions.length < AO_QUESTION_MIN ||
    questions.length > AO_QUESTION_MAX
  ) {
    return null;
  }
  return questions;
}

/**
 * Deterministic fallback when Anthropic is unavailable.
 * Still grounded in package summaries (not a fixed generic list only).
 */
export function buildDeterministicAoQuestions(
  pkg: CompiledAuthorizationPackage
): AoQuestion[] {
  const questions: AoQuestion[] = [];
  const byCode = new Map(pkg.artifacts.map((a) => [a.code, a]));

  const ssp = byCode.get('GRC-03');
  const poam = byCode.get('GRC-04');
  const oscal = byCode.get('GRC-09');

  if (ssp?.payload) {
    questions.push({
      id: 'q1',
      prompt: `Based on your SSP fragment (${ssp.summary}), which control implementation claims carry the most residual risk if related weaknesses remain open, and why is that residual risk acceptable for authorization?`,
      focus: 'ssp-residual-risk',
    });
  } else {
    questions.push({
      id: 'q1',
      prompt:
        'Your SSP fragment is missing from the compiled package. How can an Authorizing Official accept residual risk without a control implementation narrative, and what would you provide before requesting authorization?',
      focus: 'missing-ssp',
    });
  }

  if (poam?.payload) {
    const items = Array.isArray(poam.payload.poamItems)
      ? poam.payload.poamItems
      : [];
    const entries = Array.isArray(poam.payload.entries)
      ? poam.payload.entries
      : [];
    const sample = (items[0] ?? entries[0]) as
      Record<string, unknown> | undefined;
    const weakness =
      typeof sample?.weakness_description === 'string'
        ? sample.weakness_description
        : typeof sample?.weaknessDescription === 'string'
          ? sample.weaknessDescription
          : null;
    questions.push({
      id: 'q2',
      prompt: weakness
        ? `For the POA&M weakness described as "${weakness.slice(0, 180)}${weakness.length > 180 ? '…' : ''}", defend whether the milestone and scheduled completion date justify continued operation, or whether risk should be formally accepted instead.`
        : `Your package includes ${poam.summary}. Identify the highest-risk open POA&M item and explain the residual risk the AO would be accepting until remediation completes.`,
      focus: 'poam-timeline',
    });
    questions.push({
      id: 'q3',
      prompt:
        'Which POA&M items (if any) should be dispositioned as risk_accepted rather than remediated immediately, and what compensating controls or monitoring conditions support that acceptance?',
      focus: 'risk-accepted-status',
    });
  } else {
    questions.push({
      id: 'q2',
      prompt:
        'No POA&M entries were found in your package. How would you justify authorization without a remediation plan for known weaknesses?',
      focus: 'missing-poam',
    });
    questions.push({
      id: 'q3',
      prompt:
        'If assessment findings exist but POA&M is empty, what residual risks remain untracked and how should the AO treat them?',
      focus: 'untracked-findings',
    });
  }

  if (oscal?.payload) {
    questions.push({
      id: 'q4',
      prompt: `Your OSCAL generator artifact (${oscal.summary}) should align with the SSP and POA&M. Identify one potential inconsistency an AO might challenge and how you would reconcile it before risk acceptance.`,
      focus: 'oscal-consistency',
    });
  } else {
    questions.push({
      id: 'q4',
      prompt:
        'Machine-readable OSCAL artifacts are missing. What confidence gap does that create for the AO, and how do you still support a risk-acceptance decision with the narrative package?',
      focus: 'missing-oscal',
    });
  }

  questions.push({
    id: 'q5',
    prompt:
      'What continuous monitoring metrics or revisit triggers would you attach to this authorization so accepted residual risk is re-evaluated if POA&M dates slip or control posture degrades?',
    focus: 'monitoring-conditions',
  });

  questions.push({
    id: 'q6',
    prompt:
      'Summarize the residual risk you are asking the AO to accept in one paragraph, citing specific package evidence (SSP claims, POA&M items, and/or OSCAL artifacts).',
    focus: 'residual-risk-summary',
  });

  if (pkg.missingCodes.length > 0) {
    questions.push({
      id: 'q7',
      prompt: `The compiled package is incomplete (missing: ${pkg.missingCodes.join(', ')}). Explain how that incompleteness changes the AO's risk-acceptance decision and what interim constraints you would propose.`,
      focus: 'package-gaps',
    });
  }

  return questions.slice(0, AO_QUESTION_MAX);
}

export async function generateAoQuestionsFromPackage(
  pkg: CompiledAuthorizationPackage
): Promise<AoQuestionsPayload> {
  const query =
    'authorizing official risk acceptance residual risk POA&M SSP OSCAL compensating controls monitoring';
  const packageSections = retrievePackageSections(pkg, query, 6);
  const guidance = retrieveRiskAcceptanceGuidance(query, { topK: 5 });

  const packageSectionsText =
    packageSections
      .map((s) => `### ${s.id} — ${s.title}\n\n${s.text}`)
      .join('\n\n') || formatCompiledPackageForPrompt(pkg);

  const guidanceText = formatRetrievedRiskAcceptanceGuidance(guidance);

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new MissingAnthropicApiKeyError();
    }

    const anthropic = new Anthropic({ apiKey });
    const prompt = buildGenerationPrompt(
      pkg,
      packageSectionsText,
      guidanceText
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
      throw new Error('Claude did not return AO questions tool output.');
    }

    const input = toolUse.input as Record<string, unknown>;
    const questions = normalizeQuestions(input.questions);
    if (!questions) {
      throw new Error('Claude returned an invalid AO questions payload.');
    }

    return {
      questions,
      generatedAt: new Date().toISOString(),
      source: 'llm',
      retrievedPackageSectionIds: packageSections.map((s) => s.id),
      retrievedGuidanceSectionIds: guidance.sections.map((s) => s.id),
    };
  } catch (error) {
    if (!(error instanceof MissingAnthropicApiKeyError)) {
      console.error('AO question generation failed; using fallback:', error);
    }

    return {
      questions: buildDeterministicAoQuestions(pkg),
      generatedAt: new Date().toISOString(),
      source: 'deterministic_fallback',
      retrievedPackageSectionIds: packageSections.map((s) => s.id),
      retrievedGuidanceSectionIds: guidance.sections.map((s) => s.id),
    };
  }
}
