import type { RetrievedKbQualityRubric } from '@/lib/kb/getKbQualityRubric';
import { formatRetrievedKbQualityRubric } from '@/lib/kb/getKbQualityRubric';

export type KbWriteupForGrading = {
  problem: string;
  rootCause: string;
  resolutionSteps: string;
  preventionTip: string;
  scenarioBrief?: string;
  ticketContextText?: string;
};

/**
 * F26 RAG grading prompt: include ONLY retrieved KB-quality rubric text + student work.
 * This is a writing-quality check — not compliance-framework grading.
 */
export function buildKbWriteupGradingPrompt(
  rubric: RetrievedKbQualityRubric,
  submission: KbWriteupForGrading
): string {
  const rubricText = formatRetrievedKbQualityRubric(rubric);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  const contextBlock = submission.ticketContextText?.trim()
    ? `## Resolved ticket context (for reference)

${submission.ticketContextText.trim()}

`
    : '';

  return `You are evaluating a student's post-resolution knowledge-base (KB) write-up against a writing-quality rubric ONLY.

Use only the retrieved rubric sections provided below. Do not treat this as NIST, CMMC, SEC, or any other compliance framework. Do not rely on outside knowledge of helpdesk tooling beyond what the student wrote and the ticket context below.

Source document: ${rubric.document} — ${rubric.title}
Pinned path: ${rubric.catalogPath}

## Retrieved KB-quality rubric

${rubricText}

${scenarioBlock}${contextBlock}## Student KB write-up

**Problem**
${submission.problem}

**Root cause**
${submission.rootCause}

**Resolution steps**
${submission.resolutionSteps}

**Prevention tip**
${submission.preventionTip}

## Instructions

Evaluate whether the write-up meets the retrieved writing-quality rubric. Focus on:
- clarity — readable, concrete problem statement and structure;
- completeness — problem, root cause, ordered resolution with verification, and a useful prevention tip;
- jargon — technical terms and acronyms explained on first use so a new Tier-1 agent can follow;
- actionable steps and prevention quality when those rubric sections were retrieved.

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths observed relative to the rubric
- gaps: specific gaps or weaknesses relative to the rubric (for example unexplained acronyms, missing verification step, vague prevention tip)`;
}
