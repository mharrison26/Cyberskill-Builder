import type { RetrievedPoamGuidance } from '@/lib/nist/getPoamGuidance';
import { formatRetrievedPoamGuidance } from '@/lib/nist/getPoamGuidance';

export type PoamEntryForGrading = {
  findingId: string;
  findingSummary?: string;
  weaknessDescription: string;
  milestone: string;
  scheduledCompletionDate: string;
  status: string;
};

export type PoamGradingSubmission = {
  entries: PoamEntryForGrading[];
  scenarioBrief?: string;
};

/**
 * F26 RAG grading prompt: include ONLY retrieved POA&M guidance + student work.
 * The model must not rely on parametric knowledge of POA&M practice.
 */
export function buildPoamGradingPrompt(
  guidance: RetrievedPoamGuidance,
  submission: PoamGradingSubmission
): string {
  const guidanceText = formatRetrievedPoamGuidance(guidance);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  const entriesBlock = submission.entries
    .map((entry, index) => {
      const findingContext = entry.findingSummary?.trim()
        ? `Prior finding summary: ${entry.findingSummary.trim()}`
        : 'Prior finding summary: (not provided)';

      return `### Entry ${index + 1} — finding ${entry.findingId}

${findingContext}

**Weakness description**
${entry.weaknessDescription}

**Remediation milestone**
${entry.milestone}

**Scheduled completion date**
${entry.scheduledCompletionDate}

**Status**
${entry.status}`;
    })
    .join('\n\n');

  return `You are evaluating a student's Plan of Action & Milestones (POA&M) remediation entries against the retrieved POA&M guidance text ONLY.

Use only the retrieved guidance sections provided below. Do not rely on outside knowledge, memorized NIST/RMF content, parametric values, or assumptions about organizational context beyond what the student wrote and the prior finding summaries.

Source document: ${guidance.document} — ${guidance.title}
Pinned path: ${guidance.catalogPath}

## Retrieved POA&M guidance

${guidanceText}

${scenarioBlock}## Student POA&M submission

${entriesBlock}

## Instructions

Evaluate whether the remediation plans are realistic, specific, and aligned to the prior findings based solely on the retrieved guidance above.

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student (mention milestone realism and date reasonableness)
- strengths: specific strengths observed in the POA&M entries relative to the guidance
- gaps: specific gaps or weaknesses (for example vague milestones, unrealistic dates, weak weakness descriptions, or missing traceability to findings)`;
}
