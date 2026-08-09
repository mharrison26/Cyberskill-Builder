import type { RetrievedAuditFindingCccerGuidance } from '@/lib/grc/getAuditFindingCccerGuidance';
import { formatRetrievedAuditFindingCccerGuidance } from '@/lib/grc/getAuditFindingCccerGuidance';
import type { CCCERValues } from '@/types';

export type CccerFindingForGrading = {
  submission: CCCERValues;
  scenarioBrief?: string;
  exceptionContextText?: string;
};

/**
 * F26 RAG grading prompt: include ONLY retrieved IIA/GAO finding-writing text
 * + ticket exception context + student CCCER. No parametric IIA/GAO knowledge.
 */
export function buildCccerFindingGradingPrompt(
  guidance: RetrievedAuditFindingCccerGuidance,
  input: CccerFindingForGrading
): string {
  const guidanceText = formatRetrievedAuditFindingCccerGuidance(guidance);
  const { submission } = input;

  const scenarioBlock = input.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${input.scenarioBrief.trim()}

`
    : '';

  const exceptionBlock = input.exceptionContextText?.trim()
    ? `## Audit exception facts / evidence summary (ticket context)

${input.exceptionContextText.trim()}

`
    : '';

  return `You are evaluating a student's audit-exception write-up using the Condition / Criteria / Cause / Effect / Recommendation (CCCER) structure against IIA- and GAO-aligned finding-writing guidance text ONLY.

Use only the retrieved guidance sections and ticket exception context provided below. Do not rely on outside knowledge, memorized IIA/GAO standards, or facts not present in the ticket context or student submission.

Source document: ${guidance.document} — ${guidance.title}
Pinned path: ${guidance.catalogPath}

## Retrieved finding-writing guidance

${guidanceText}

${scenarioBlock}${exceptionBlock}## Student submission (CCCER)

**Condition**
${submission.condition}

**Criteria**
${submission.criteria}

**Cause**
${submission.cause}

**Effect**
${submission.effect}

**Recommendation**
${submission.recommendation}

## Instructions

Evaluate whether the write-up is a defensible audit finding based solely on the retrieved guidance and ticket exception context. Consider whether the student:
- states a factual, evidence-based Condition that reflects the provided exception scenario (who/what/when/how many) rather than vague assertions;
- cites specific Criteria (policy, SLA, control objective) consistent with the ticket context;
- explains a plausible Cause that is more than a restatement of the condition;
- describes a logical Effect / risk consequence tied to the exception;
- offers actionable Recommendations that address the cause and close the gap to criteria;
- maintains logical linkage across the five CCCER elements without inventing unsupported facts.

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths observed relative to the guidance
- gaps: specific gaps or weaknesses relative to the guidance (for example missing quantification, criteria without a source, cause restates condition, vague recommendation)`;
}
