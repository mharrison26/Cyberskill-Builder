import type { RetrievedSp80030Guidance } from '@/lib/nist/getSp80030Guidance';
import { formatRetrievedSp80030Guidance } from '@/lib/nist/getSp80030Guidance';

export type RiskJustificationSubmission = {
  riskRegisterId: string;
  justification: string;
  scenarioBrief?: string;
};

/**
 * F26 RAG grading prompt: include ONLY retrieved SP 800-30 text + student work.
 * The model must not rely on parametric knowledge of NIST risk assessment.
 */
export function buildRiskJustificationGradingPrompt(
  guidance: RetrievedSp80030Guidance,
  submission: RiskJustificationSubmission
): string {
  const guidanceText = formatRetrievedSp80030Guidance(guidance);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  return `You are evaluating a student's likelihood/impact justification for a risk register entry against NIST SP 800-30 Rev. 1 guidance text ONLY.

Use only the retrieved SP 800-30 guidance sections provided below. Do not rely on outside knowledge, memorized NIST content, parametric values, or assumptions about organizational context beyond what the student wrote.

Source document: ${guidance.document} — ${guidance.title}
Pinned path: ${guidance.catalogPath}

## Retrieved SP 800-30 guidance

${guidanceText}

${scenarioBlock}## Student submission

**Risk register entry ID**
${submission.riskRegisterId}

**Likelihood / impact justification**
${submission.justification}

## Instructions

Evaluate whether the justification demonstrates a defensible likelihood and impact assessment based solely on the retrieved guidance above.

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths observed in the justification relative to the guidance
- gaps: specific gaps or weaknesses relative to the guidance (for example missing likelihood factors, missing impact harm categories, or unsupported risk labels)`;
}
