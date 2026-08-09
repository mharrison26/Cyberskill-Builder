import type { RetrievedRiskBasedAuditPlanGuidance } from '@/lib/grc/getRiskBasedAuditPlanGuidance';
import { formatRetrievedRiskBasedAuditPlanGuidance } from '@/lib/grc/getRiskBasedAuditPlanGuidance';

export type RiskBasedAuditPlanEntryForGrading = {
  priority: number;
  areaId: string;
  areaName: string;
  residualRisk?: string;
  inherentRisk?: string;
  lastAuditDate?: string;
  justification: string;
};

export type RiskBasedAuditPlanForGrading = {
  planEntries: RiskBasedAuditPlanEntryForGrading[];
  capacityNotes?: string;
  auditCapacity: number;
  organizationName?: string;
  scenarioBrief?: string;
  riskRegisterSummary?: string;
};

/**
 * F26 RAG grading prompt: include ONLY retrieved risk-based planning guidance
 * + ticket risk register context + student plan. Do not rely on parametric
 * IIA / audit methodology knowledge.
 */
export function buildRiskBasedAuditPlanGradingPrompt(
  guidance: RetrievedRiskBasedAuditPlanGuidance,
  submission: RiskBasedAuditPlanForGrading
): string {
  const guidanceText = formatRetrievedRiskBasedAuditPlanGuidance(guidance);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  const orgBlock = submission.organizationName?.trim()
    ? `Organization: ${submission.organizationName.trim()}\n`
    : '';

  const registerBlock = submission.riskRegisterSummary?.trim()
    ? `## Risk register summary (ticket context)

${submission.riskRegisterSummary.trim()}

`
    : '';

  const planLines = submission.planEntries
    .map((entry) => {
      const riskBits = [
        entry.inherentRisk ? `inherent=${entry.inherentRisk}` : null,
        entry.residualRisk ? `residual=${entry.residualRisk}` : null,
        entry.lastAuditDate ? `lastAudit=${entry.lastAuditDate}` : null,
      ]
        .filter(Boolean)
        .join(', ');
      return `${entry.priority}. [${entry.areaId}] ${entry.areaName}${riskBits ? ` (${riskBits})` : ''}
   Justification: ${entry.justification}`;
    })
    .join('\n');

  const capacityNotesBlock = submission.capacityNotes?.trim()
    ? `**Capacity / deferral notes**
${submission.capacityNotes.trim()}

`
    : '';

  return `You are evaluating a student's prioritized annual internal audit plan built from a fictional organization's risk register, using pinned risk-based planning guidance ONLY.

Use only the retrieved guidance sections and the ticket risk-register context provided below. Do not rely on outside knowledge of IIA standards, NIST, or organizational policy beyond what the student wrote and the ticket context below.

Source document: ${guidance.document} — ${guidance.title}
Pinned path: ${guidance.catalogPath}

${scenarioBlock}${orgBlock}Audit capacity constraint: ${submission.auditCapacity} engagements this year.

${registerBlock}## Retrieved risk-based audit planning guidance

${guidanceText}

## Student annual audit plan (priority order)

${planLines}

${capacityNotesBlock}## Instructions

Primary focus: grade whether the plan is risk-based — higher residual-risk / assurance-need areas are prioritized and justified — based solely on the retrieved guidance and register context. Also consider whether:
- ordering reflects residual risk, known issues, materiality/impact, and last-audit recency (not convenience or low-risk bias);
- each justification cites concrete register factors rather than vague importance claims;
- capacity tradeoffs / deferred areas are acknowledged when notes are provided;
- low residual-risk areas are not elevated ahead of Critical/High residual areas without exceptional rationale.

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths observed relative to risk-based planning guidance
- gaps: specific gaps (for example high-risk areas deprioritized, weak justifications, low-risk bias, ignored known issues or stale coverage)`;
}
