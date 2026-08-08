import type { RetrievedIncidentReportRubric } from '@/lib/incident/getIncidentReportRubric';
import { formatRetrievedIncidentReportRubric } from '@/lib/incident/getIncidentReportRubric';

export type IncidentReportForGrading = {
  timeline: string;
  rootCause: string;
  remediation: string;
  prevention: string;
  scenarioBrief?: string;
};

/**
 * F26 RAG grading prompt: include ONLY retrieved incident-report rubric + student report.
 */
export function buildIncidentReportGradingPrompt(
  rubric: RetrievedIncidentReportRubric,
  submission: IncidentReportForGrading
): string {
  const rubricText = formatRetrievedIncidentReportRubric(rubric);

  const disclaimerBlock = rubric.disclaimer
    ? `Disclaimer: ${rubric.disclaimer}\n\n`
    : '';

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  return `You are evaluating a student's post-incident report against an incident-report quality rubric ONLY.

Use only the retrieved rubric sections provided below. Do not invent hostnames, CVE IDs, or IR framework controls that are not present in the student report or scenario brief. Do not rely on outside knowledge of ITIL, NIST SP 800-61, or vendor runbooks beyond what the retrieved rubric and ticket context state.

${disclaimerBlock}Source document: ${rubric.document} — ${rubric.title}
Pinned path: ${rubric.catalogPath}

## Retrieved incident-report rubric

${rubricText}

${scenarioBlock}## Student post-incident report

**Timeline**
${submission.timeline}

**Root cause**
${submission.rootCause}

**Remediation**
${submission.remediation}

**Prevention**
${submission.prevention}

## Instructions

Evaluate whether the report meets the retrieved rubric. Focus on:
- timeline — ordered detection → diagnosis → fix → verification;
- root cause — underlying misconfiguration and/or disk capacity issues, not only symptoms;
- remediation — concrete actions with verification;
- prevention — actionable follow-ups tied to those causes.

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths relative to the retrieved rubric
- gaps: specific gaps relative to the retrieved rubric`;
}
