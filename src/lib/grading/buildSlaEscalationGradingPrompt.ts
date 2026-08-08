import type { RetrievedSlaEscalationPolicy } from '@/lib/helpdesk/getSlaEscalationPolicy';
import { formatRetrievedSlaEscalationPolicy } from '@/lib/helpdesk/getSlaEscalationPolicy';
import type { SlaEscalationDecision } from '@/lib/scoring/ticketUi';

export type SlaEscalationForGrading = {
  decision: SlaEscalationDecision;
  justification: string;
  scenarioBrief?: string;
  scenarioText?: string;
};

/**
 * F26 RAG grading prompt: include ONLY retrieved SLA/escalation policy + student work.
 * The model must not rely on parametric ITIL / vendor SLA knowledge.
 */
export function buildSlaEscalationGradingPrompt(
  policy: RetrievedSlaEscalationPolicy,
  submission: SlaEscalationForGrading
): string {
  const policyText = formatRetrievedSlaEscalationPolicy(policy);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  const scenarioDetailBlock = submission.scenarioText?.trim()
    ? `## Support scenario details

${submission.scenarioText.trim()}

`
    : '';

  return `You are evaluating a student's escalate-or-resolve decision justification against the retrieved helpdesk SLA/escalation policy text ONLY.

Use only the retrieved policy sections provided below. Do not rely on outside knowledge, memorized ITIL practice, vendor SLA defaults, or assumptions beyond the scenario and student justification.

Source document: ${policy.document} — ${policy.title}
Pinned path: ${policy.catalogPath}

## Retrieved SLA / escalation policy

${policyText}

${scenarioBlock}${scenarioDetailBlock}## Student decision

**Decision:** ${submission.decision}

**Justification**
${submission.justification}

## Instructions

Evaluate whether the justification correctly grounds the student's decision in the retrieved policy. Check that the student:
1. Cites the matching policy rule (Tier-1 resolve scope vs a mandatory escalation trigger)
2. Ties concrete scenario facts (impact scope, security signals, VIP/customer impact, SLA pressure, runbook fit) to that rule
3. Does not invent policy clauses that are absent from the retrieved text

The binary decision itself is scored separately; focus on justification quality relative to the retrieved policy.

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths relative to the retrieved policy
- gaps: specific gaps relative to the retrieved policy (for example no policy citation, generic "important" language, or facts that contradict the cited rule)`;
}
