import type { RetrievedContinuousAuditingGuidance } from '@/lib/grc/getContinuousAuditingGuidance';
import { formatRetrievedContinuousAuditingGuidance } from '@/lib/grc/getContinuousAuditingGuidance';

export type ContinuousAuditingDesignForGrading = {
  controlArea: string;
  frequency: string;
  dataSource: string;
  exceptionHandling: string;
  automationMethod?: string;
  owners?: string;
  escalation?: string;
  falsePositiveHandling?: string;
  scenarioBrief?: string;
  scenarioContextText?: string;
};

/**
 * F26 RAG grading prompt: include ONLY retrieved continuous auditing guidance
 * + ticket context + student design. Do not rely on parametric IIA knowledge.
 */
export function buildContinuousAuditingGradingPrompt(
  guidance: RetrievedContinuousAuditingGuidance,
  submission: ContinuousAuditingDesignForGrading
): string {
  const guidanceText = formatRetrievedContinuousAuditingGuidance(guidance);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  const contextBlock = submission.scenarioContextText?.trim()
    ? `## Control-area scenario (ticket context)

${submission.scenarioContextText.trim()}

`
    : '';

  const optionalBlocks = [
    submission.automationMethod?.trim()
      ? `**Automation method**\n${submission.automationMethod.trim()}`
      : null,
    submission.owners?.trim()
      ? `**Owners**\n${submission.owners.trim()}`
      : null,
    submission.escalation?.trim()
      ? `**Escalation**\n${submission.escalation.trim()}`
      : null,
    submission.falsePositiveHandling?.trim()
      ? `**False-positive handling**\n${submission.falsePositiveHandling.trim()}`
      : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  return `You are evaluating a student's continuous auditing design for a single control area against pinned continuous auditing guidance ONLY.

Use only the retrieved guidance sections provided below. Do not rely on outside knowledge of IIA GTAG, NIST ConMon, or vendor products beyond what the student wrote and the ticket context below.

Source document: ${guidance.document} — ${guidance.title}
Pinned path: ${guidance.catalogPath}

## Retrieved continuous auditing guidance

${guidanceText}

${scenarioBlock}${contextBlock}## Student continuous auditing design

**Control area**
${submission.controlArea}

**Frequency**
${submission.frequency}

**Data source**
${submission.dataSource}

**Exception-handling process**
${submission.exceptionHandling}
${optionalBlocks ? `\n${optionalBlocks}\n` : ''}
## Instructions

Evaluate whether the design is a defensible continuous auditing approach for one control area based solely on the retrieved guidance. Primary checks:
- Frequency is explicit (e.g. daily/weekly/monthly) and risk-aware, not vague ("regularly");
- Data source names concrete systems/fields/feeds that can support the test;
- Exception-handling process covers triage, investigation, ownership, and closure (not just "generate a report");
- The design improves on annual/manual testing pain points described in the scenario when those are present.

Optional fields (automation, owners, escalation, false positives) may strengthen the design but do not replace the three required elements above.

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths observed relative to the guidance
- gaps: specific gaps (for example missing exception ownership, vague data source, no frequency rationale)`;
}
