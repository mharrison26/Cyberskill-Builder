import type { RetrievedBoardCommunicationGuidance } from '@/lib/grc/getBoardCommunicationGuidance';
import { formatRetrievedBoardCommunicationGuidance } from '@/lib/grc/getBoardCommunicationGuidance';
import type { BoardFindingsAskType } from '@/lib/scoring/ticketUi';

export type BoardFindingsSummaryForGrading = {
  summary: string;
  askType: BoardFindingsAskType;
  askStatement?: string;
  technicalFindingsNarrative?: string;
  scenarioBrief?: string;
  organizationText?: string;
  audience?: string;
  requiredThemes?: string[];
};

/**
 * F26 RAG grading prompt: retrieved board-communication rubric + ticket
 * findings + student one-page summary. No parametric board templates.
 */
export function buildBoardFindingsSummaryGradingPrompt(
  guidance: RetrievedBoardCommunicationGuidance,
  submission: BoardFindingsSummaryForGrading
): string {
  const guidanceText = formatRetrievedBoardCommunicationGuidance(guidance);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  const orgBlock = submission.organizationText?.trim()
    ? `## Organization

${submission.organizationText.trim()}

`
    : '';

  const audienceBlock = submission.audience?.trim()
    ? `## Audience

${submission.audience.trim()}

`
    : '';

  const findingsBlock = submission.technicalFindingsNarrative?.trim()
    ? `## Technical findings to translate (source material)

${submission.technicalFindingsNarrative.trim()}

`
    : '';

  const themesBlock =
    submission.requiredThemes && submission.requiredThemes.length > 0
      ? `## Required themes (must be evidenced in the summary)

${submission.requiredThemes.map((theme) => `- ${theme}`).join('\n')}

`
      : '';

  const askStatementBlock = submission.askStatement?.trim()
    ? `**Ask statement (explicit)**
${submission.askStatement.trim()}

`
    : '';

  return `You are evaluating a student's one-page board-level summary that translates technical GRC/ISSO findings into plain language for directors / the audit committee.

Use ONLY:
1) The retrieved board-communication rubric below
2) The technical findings / ticket context below
3) The student's summary and declared ask type

Do not rely on outside knowledge or invent findings that are not in the source material.

Source document: ${guidance.document} — ${guidance.title}
Pinned path: ${guidance.catalogPath}

## Retrieved board-communication rubric

${guidanceText}

${scenarioBlock}${orgBlock}${audienceBlock}${findingsBlock}${themesBlock}## Student board-level summary

**Ask type:** ${submission.askType}

${askStatementBlock}**Summary**
${submission.summary.trim()}

## Instructions

Evaluate whether the summary is board-ready based solely on the retrieved rubric and source findings. Primary checks:
1) Plain-language framing — technical jargon (control IDs, CVEs, POA&M codes, assessment refs) is translated for non-technical directors; fail if jargon-heavy without translation
2) Business impact — each finding theme (or a clear overall package) states operational/financial/customer/regulatory/reputational consequence, not only technical severity
3) Clear ask — the declared ask type (budget, decision, or awareness) is reflected in a concrete closing request; fail if there is no clear ask
4) Finding fidelity — covers the provided technical findings without inventing unrelated incidents
5) One-page discipline — concise board narrative, not a control dump

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths tied to plain language, impact, ask, or finding coverage
- gaps: specific gaps (jargon without translation, missing business impact, no clear ask, control-ID dump, invented findings, etc.)`;
}
