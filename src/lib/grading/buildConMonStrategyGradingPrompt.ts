import type { RetrievedSp800137Guidance } from '@/lib/nist/getSp800137Guidance';
import { formatRetrievedSp800137Guidance } from '@/lib/nist/getSp800137Guidance';

export type ConMonStrategyMemoForGrading = {
  familyCadencesText: string;
  toolCoverageText: string;
  escalationReporting: string;
  scenarioBrief?: string;
  systemProfileText?: string;
};

/**
 * F26 RAG grading prompt: include ONLY retrieved SP 800-137 text + student work.
 * The model must not rely on parametric knowledge of NIST ConMon / ISCM.
 */
export function buildConMonStrategyGradingPrompt(
  guidance: RetrievedSp800137Guidance,
  submission: ConMonStrategyMemoForGrading
): string {
  const guidanceText = formatRetrievedSp800137Guidance(guidance);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  const profileBlock = submission.systemProfileText?.trim()
    ? `## Fictional system profile (ticket context)

${submission.systemProfileText.trim()}

`
    : '';

  return `You are evaluating a student's continuous monitoring (ConMon / ISCM) strategy memo against NIST SP 800-137 guidance text ONLY.

Use only the retrieved SP 800-137 guidance sections provided below. Do not rely on outside knowledge, memorized NIST content, or assumptions about organizational context beyond what the student wrote and the ticket context below.

Source document: ${guidance.document} — ${guidance.title}
Pinned path: ${guidance.catalogPath}

## Retrieved SP 800-137 guidance

${guidanceText}

${scenarioBlock}${profileBlock}## Student submission

**Monitoring cadence by control family**
${submission.familyCadencesText}

**Free/open-source tool → control family coverage**
${submission.toolCoverageText}

**Escalation / reporting cadence**
${submission.escalationReporting}

## Instructions

Evaluate whether the memo demonstrates a defensible system-level continuous monitoring strategy based solely on the retrieved guidance above. Consider whether the student:
- sets monitoring/assessment cadences using risk-based factors (for example volatility, impact, weaknesses, threat/vulnerability information, reporting needs) rather than arbitrary schedules alone;
- maps tools (DefectDojo, CloudSploit, Scuba) to control families in a way that supports status monitoring / control-effectiveness evidence collection;
- defines reporting audiences, cadence, and escalation/response when findings indicate risk outside tolerance.

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths observed relative to the guidance
- gaps: specific gaps or weaknesses relative to the guidance (for example missing frequency rationale, no reporting/escalation path, tools listed without control-family coverage)`;
}
