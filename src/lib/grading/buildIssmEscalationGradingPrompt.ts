import type { RetrievedIssmEscalationGuidance } from '@/lib/nist/getIssmEscalationGuidance';
import { formatRetrievedIssmEscalationGuidance } from '@/lib/nist/getIssmEscalationGuidance';
import type { IssmEscalationDecision } from '@/lib/scoring/ticketUi';

export type IssmEscalationForGrading = {
  decision: IssmEscalationDecision;
  memo: string;
  scenarioBrief?: string;
  scenarioText?: string;
};

/**
 * F26 RAG grading prompt: include ONLY retrieved ISSM escalation criteria + student work.
 * The model must not rely on parametric RMF / ISSO–ISSM practice knowledge.
 */
export function buildIssmEscalationGradingPrompt(
  guidance: RetrievedIssmEscalationGuidance,
  submission: IssmEscalationForGrading
): string {
  const guidanceText = formatRetrievedIssmEscalationGuidance(guidance);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  const scenarioDetailBlock = submission.scenarioText?.trim()
    ? `## Risk scenario details

${submission.scenarioText.trim()}

`
    : '';

  const memoLabel =
    submission.decision === 'escalate'
      ? 'Escalation memo'
      : 'Non-escalation rationale';

  return `You are evaluating a student's ISSO→ISSM escalation decision memo against the retrieved escalation-criteria guidance text ONLY.

Use only the retrieved guidance sections provided below. Do not rely on outside knowledge, memorized NIST RMF role practice, agency SOPs, or assumptions beyond the scenario and student memo.

Source document: ${guidance.document} — ${guidance.title}
Pinned path: ${guidance.catalogPath}

## Retrieved ISSM escalation criteria

${guidanceText}

${scenarioBlock}${scenarioDetailBlock}## Student decision

**Decision:** ${submission.decision}

**${memoLabel}**
${submission.memo}

## Instructions

Evaluate whether the memo correctly grounds the student's decision in the retrieved escalation criteria. Check that the student:
1. Addresses cross-system / multi-ISSO impact (or explains why impact is confined to one ISSO boundary)
2. Addresses resource needs or change authority relative to ISSO vs ISSM authority
3. Ties concrete scenario facts (systems, ISSOs, shared dependency, residual risk, conflicting priorities) to the matching criteria
4. Does not invent escalation rules absent from the retrieved text

The binary decision itself is scored separately; focus on memo quality relative to the retrieved guidance.

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths relative to the retrieved guidance
- gaps: specific gaps relative to the retrieved guidance (for example no cross-system impact, missing resource/authority discussion, generic "important risk" language, or facts that contradict the cited criteria)`;
}
