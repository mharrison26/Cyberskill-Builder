import type { AoQuestion } from '@/lib/capstone/generateAoQuestions';
import type { RetrievedRiskAcceptanceGuidance } from '@/lib/nist/getRiskAcceptanceGuidance';
import { formatRetrievedRiskAcceptanceGuidance } from '@/lib/nist/getRiskAcceptanceGuidance';

export type AoReviewGradingSubmission = {
  questions: AoQuestion[];
  answers: Record<string, string>;
  packageExcerpts: string;
  scenarioBrief?: string;
};

/**
 * F26 RAG grading: risk-acceptance guidance + student package excerpts + AO answers.
 */
export function buildAoReviewGradingPrompt(
  guidance: RetrievedRiskAcceptanceGuidance,
  submission: AoReviewGradingSubmission
): string {
  const guidanceText = formatRetrievedRiskAcceptanceGuidance(guidance);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  const qaBlock = submission.questions
    .map((question, index) => {
      const answer = submission.answers[question.id]?.trim() || '(no answer)';
      return `### Q${index + 1} (${question.id})

**AO question:** ${question.prompt}

**Student answer:**
${answer}`;
    })
    .join('\n\n');

  return `You are evaluating a student's written responses to an Authorizing Official (AO) residual-risk / POA&M adequacy review (ISSO-05 flagship).

Use ONLY:
1) The retrieved risk-acceptance guidance below
2) The retrieved authorization package excerpts below
3) The student's answers

Do not rely on outside knowledge or invent package facts that are not in the excerpts.

Source document: ${guidance.document} — ${guidance.title}
Pinned path: ${guidance.catalogPath}

## Retrieved risk-acceptance guidance

${guidanceText}

## Retrieved authorization package excerpts

${submission.packageExcerpts}

${scenarioBlock}## Student AO Q&A

${qaBlock}

## Instructions

Grade each answer on whether it DIRECTLY addresses the specific risk or POA&M concern raised in that question — not generic security platitudes.

For finding_state = "satisfied", the student must generally:
- Tie residual risk acceptance to concrete package evidence (SSP/SAR claims, named weaknesses, compensating controls, revisit conditions)
- Address POA&M adequacy where asked (milestones, dates, disposition, ownership) instead of vague "we will remediate"
- Answer the question that was asked (topic match), not a canned risk-management essay

Mark "not_satisfied" or "insufficient_evidence" when answers are generic fluff, ignore the named risk/POA&M item, contradict package excerpts, or fail to justify residual risk acceptance.

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student (call out any question that was not directly addressed)
- strengths: specific strengths tied to package evidence or guidance
- gaps: specific gaps (off-topic answers, generic platitudes, missing residual-risk linkage, ignored POA&M items, no monitoring conditions, contradictions with package excerpts)`;
}
