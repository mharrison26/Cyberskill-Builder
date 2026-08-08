import type { RetrievedSubnettingTcpIpRubric } from '@/lib/networking/getSubnettingTcpIpRubric';
import { formatRetrievedSubnettingTcpIpRubric } from '@/lib/networking/getSubnettingTcpIpRubric';

export type NetworkTopologyFaultForGrading = {
  faultLocation: string;
  faultLocationLabel?: string;
  justification: string;
  scenarioBrief?: string;
  diagram?: string;
  terminalTranscript?: string;
};

/**
 * F26 RAG grading prompt: include ONLY retrieved subnetting/TCP-IP rubric text
 * plus the student's identification and justification. The model must not rely
 * on parametric networking knowledge beyond the retrieved sections and ticket context.
 */
export function buildNetworkTopologyFaultGradingPrompt(
  rubric: RetrievedSubnettingTcpIpRubric,
  submission: NetworkTopologyFaultForGrading
): string {
  const rubricText = formatRetrievedSubnettingTcpIpRubric(rubric);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  const diagramBlock = submission.diagram?.trim()
    ? `## Network diagram (static)

\`\`\`
${submission.diagram.trim()}
\`\`\`

`
    : '';

  const transcriptBlock = submission.terminalTranscript?.trim()
    ? `## Diagnostic command output (static)

\`\`\`
${submission.terminalTranscript.trim()}
\`\`\`

`
    : '';

  const locationLabel = submission.faultLocationLabel?.trim()
    ? `${submission.faultLocation} (${submission.faultLocationLabel.trim()})`
    : submission.faultLocation;

  const disclaimer = rubric.disclaimer?.trim()
    ? `Corpus disclaimer: ${rubric.disclaimer.trim()}`
    : 'Corpus disclaimer: Educational rubric only.';

  return `You are evaluating a student's network topology fault justification against the retrieved subnetting/TCP-IP rubric text ONLY.

Use only the retrieved rubric sections provided below, plus the ticket diagram/output and student answers. Do not rely on outside knowledge, memorized CCNA facts, vendor CLI quirks, or assumptions beyond that material.

Source document: ${rubric.document} — ${rubric.title}
Pinned path: ${rubric.catalogPath}
${disclaimer}

## Retrieved subnetting/TCP-IP rubric

${rubricText}

${scenarioBlock}${diagramBlock}${transcriptBlock}## Student identification (already verified deterministically as correct)

Fault location id: ${locationLabel}

## Student justification

${submission.justification.trim()}

## Instructions

Evaluate whether the justification meets the pinned rubric based solely on the retrieved sections and ticket context above. Check that the student:
1. Explains why the default gateway / addressing is invalid for the host's subnet (on-link gateway rule)
2. Uses subnet mask / prefix boundaries correctly when relevant
3. Cites concrete evidence from the diagram or diagnostic output (does not invent facts)
4. Isolates the named fault location versus blaming unrelated devices without evidence

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths relative to the retrieved rubric
- gaps: specific gaps relative to the retrieved rubric (for example missing on-link gateway reasoning, invented IPs, or blaming the wrong layer of the path)`;
}
