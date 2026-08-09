import type { RetrievedAuditWorkpaperGuidance } from '@/lib/grc/getAuditWorkpaperGuidance';
import { formatRetrievedAuditWorkpaperGuidance } from '@/lib/grc/getAuditWorkpaperGuidance';

export type AuditWorkpaperForGrading = {
  objective: string;
  procedurePerformed: string;
  evidenceObtained: string;
  conclusion: string;
  preparer: string;
  reviewer: string;
  statedTestObjective: string;
  scenarioBrief?: string;
  scenarioContextText?: string;
};

/**
 * F26 RAG grading prompt: include ONLY retrieved workpaper guidance + ticket
 * stated test objective + student work. Do not rely on parametric audit knowledge.
 */
export function buildAuditWorkpaperGradingPrompt(
  guidance: RetrievedAuditWorkpaperGuidance,
  submission: AuditWorkpaperForGrading
): string {
  const guidanceText = formatRetrievedAuditWorkpaperGuidance(guidance);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  const contextBlock = submission.scenarioContextText?.trim()
    ? `## Control test scenario (ticket context)

${submission.scenarioContextText.trim()}

`
    : '';

  return `You are evaluating a student's structured audit workpaper, focusing on whether the Conclusion answers the stated test objective, using pinned workpaper guidance ONLY.

Use only the retrieved guidance sections and the stated test objective provided below. Do not rely on outside knowledge of IIA standards, NIST, or organizational policy beyond what the student wrote and the ticket context below.

Source document: ${guidance.document} — ${guidance.title}
Pinned path: ${guidance.catalogPath}

## Stated test objective (must drive conclusion grading)

${submission.statedTestObjective.trim()}

## Retrieved workpaper guidance

${guidanceText}

${scenarioBlock}${contextBlock}## Student workpaper

**Objective**
${submission.objective}

**Procedure performed**
${submission.procedurePerformed}

**Evidence obtained**
${submission.evidenceObtained}

**Conclusion**
${submission.conclusion}

**Preparer**
${submission.preparer}

**Reviewer**
${submission.reviewer}

## Instructions

Primary focus: grade whether the student's Conclusion quality answers the stated test objective above, based solely on the retrieved guidance. Also consider whether:
- the Objective mirrors the stated test objective without inventing unrelated scope;
- Procedure performed and Evidence obtained are concrete enough to support the Conclusion;
- the Conclusion states a clear opinion (effective / exceptions / not effective) tied to that objective;
- preparer and reviewer are identifiable names (not placeholders).

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths observed relative to the stated test objective and guidance
- gaps: specific gaps (for example conclusion ignores the objective, no clear opinion, unsupported exceptions, vague procedures)`;
}
