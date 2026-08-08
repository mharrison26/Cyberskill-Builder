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

  return `You are evaluating a student's written responses to an Authorizing Official (AO) risk-acceptance review.

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

Evaluate whether the answers demonstrate defensible risk acceptance reasoning grounded in the student's own package (SSP / POA&M / OSCAL) and the guidance above.

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths tied to package evidence or guidance
- gaps: specific gaps (generic platitudes, missing residual-risk linkage, ignored POA&M items, no monitoring conditions, contradictions with package excerpts)`;
}
