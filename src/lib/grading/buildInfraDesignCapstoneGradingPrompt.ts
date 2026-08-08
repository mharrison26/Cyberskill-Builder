import type { InfraFollowUpQuestion } from '@/lib/infra/generateFollowUpQuestions';
import type { RetrievedArchitectureDecisionRubric } from '@/lib/infra/getArchitectureDecisionRubric';
import { formatRetrievedArchitectureDecisionRubric } from '@/lib/infra/getArchitectureDecisionRubric';

export type InfraDesignCapstoneGradingSubmission = {
  designTitle: string;
  designBody: string;
  topologyChoice?: string;
  questions: InfraFollowUpQuestion[];
  answers: Record<string, string>;
  designExcerpts: string;
  scenarioBrief?: string;
};

/**
 * F26 RAG grading: architecture-decision rubric + student design excerpts + Q&A.
 */
export function buildInfraDesignCapstoneGradingPrompt(
  rubric: RetrievedArchitectureDecisionRubric,
  submission: InfraDesignCapstoneGradingSubmission
): string {
  const rubricText = formatRetrievedArchitectureDecisionRubric(rubric);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  const topologyBlock = submission.topologyChoice?.trim()
    ? `Topology choice: ${submission.topologyChoice.trim()}\n`
    : '';

  const qaBlock = submission.questions
    .map((question, index) => {
      const answer = submission.answers[question.id]?.trim() || '(no answer)';
      return `### Q${index + 1} (${question.id})

**Follow-up question:** ${question.prompt}

**Student answer:**
${answer}`;
    })
    .join('\n\n');

  return `You are evaluating a student's infrastructure architecture decision (backup topology ADR) and their answers to tradeoff follow-up questions.

Use ONLY:
1) The retrieved architecture-decision / tradeoff rubric below
2) The retrieved design-document excerpts below
3) The student's design document and answers

Do not rely on outside knowledge or invent design facts that are not in the excerpts.

Source document: ${rubric.document} — ${rubric.title}
Pinned path: ${rubric.catalogPath}

## Retrieved tradeoff rubric

${rubricText}

## Retrieved design-document excerpts

${submission.designExcerpts}

${scenarioBlock}## Student design document

Title: ${submission.designTitle.trim() || '(untitled)'}
${topologyBlock}
${submission.designBody.trim()}

## Student follow-up Q&A

${qaBlock}

## Instructions

Evaluate whether the design decision plus follow-up answers demonstrate a defensible infrastructure tradeoff analysis grounded in the student's own design doc and the rubric above.

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths tied to design evidence or rubric criteria
- gaps: specific gaps (vague decision, ignored constraints, no alternative comparison, no failure-mode thinking, contradictions with the design doc, operability hand-waving)`;
}
