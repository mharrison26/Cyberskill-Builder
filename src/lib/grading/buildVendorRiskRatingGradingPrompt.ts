import type { RetrievedSp800161Guidance } from '@/lib/nist/getSp800161Guidance';
import { formatRetrievedSp800161Guidance } from '@/lib/nist/getSp800161Guidance';
import type { VendorRiskRatingLevel } from '@/lib/scoring/ticketUi';

export type VendorRiskRatingForGrading = {
  rating: VendorRiskRatingLevel;
  justification: string;
  scenarioBrief?: string;
  vendorProfileText?: string;
  questionnaireSummaryText?: string;
};

/**
 * F26 RAG grading prompt: include ONLY retrieved SP 800-161 guidance + student work.
 * The model must not rely on parametric NIST / SCRM knowledge.
 */
export function buildVendorRiskRatingGradingPrompt(
  guidance: RetrievedSp800161Guidance,
  submission: VendorRiskRatingForGrading
): string {
  const guidanceText = formatRetrievedSp800161Guidance(guidance);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  const vendorBlock = submission.vendorProfileText?.trim()
    ? `## Vendor / access criticality profile

${submission.vendorProfileText.trim()}

`
    : '';

  const questionnaireBlock = submission.questionnaireSummaryText?.trim()
    ? `## Questionnaire packet summary (context only)

${submission.questionnaireSummaryText.trim()}

`
    : '';

  return `You are evaluating a student's vendor risk rating justification against the retrieved NIST SP 800-161 C-SCRM guidance text ONLY.

Use only the retrieved guidance sections provided below. Do not rely on outside knowledge, memorized NIST publications, or assumptions beyond the vendor profile, questionnaire summary, and student justification.

Source document: ${guidance.document} — ${guidance.title}
Pinned path: ${guidance.catalogPath}

## Retrieved SP 800-161 C-SCRM guidance

${guidanceText}

${scenarioBlock}${vendorBlock}${questionnaireBlock}## Student vendor risk rating

**Rating:** ${submission.rating}

**Justification**
${submission.justification}

## Instructions

The rating band itself may already be checked against an acceptable High/Critical answer key. Focus on justification quality relative to the retrieved guidance. Check that the student:
1. Elevates risk based on access criticality / inherent risk (production privilege, sensitive data classes, business impact, replaceability) — not only questionnaire hygiene
2. Treats SOC 2, MFA/encryption attestations, and limited breach history as assurance inputs that do not by themselves justify a Low/Moderate rating for a high-privilege production vendor
3. References C-SCRM / supply chain concepts from the retrieved text (inherent vs residual, supplier access, subprocessors when relevant)
4. Does not invent SP 800-161 clauses absent from the retrieved text

Mark finding_state "not_satisfied" or "insufficient_evidence" when the justification is questionnaire-only (for example praises SOC 2 Type II and clean breach history while ignoring production API access, PII/financial processing, or switching costs).

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths relative to the retrieved guidance
- gaps: specific gaps relative to the retrieved guidance (for example questionnaire-only reasoning, missing access criticality, no inherent-risk discussion)`;
}
