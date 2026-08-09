import type { AuditCommitteeQuestion } from '@/lib/grc/generateAuditCommitteeQuestions';
import type { RetrievedAuditCommitteeGuidance } from '@/lib/grc/getAuditCommitteeGuidance';
import { formatRetrievedAuditCommitteeGuidance } from '@/lib/grc/getAuditCommitteeGuidance';

export type AuditCommitteeBriefGradingSubmission = {
  executiveSummary: string;
  questions: AuditCommitteeQuestion[];
  summaryExcerpts: string;
  priorFindingsNarrative?: string;
  scenarioBrief?: string;
};

/**
 * F26 RAG grading: AC reporting guidance + student summary + generated questions.
 */
export function buildAuditCommitteeBriefGradingPrompt(
  guidance: RetrievedAuditCommitteeGuidance,
  submission: AuditCommitteeBriefGradingSubmission
): string {
  const guidanceText = formatRetrievedAuditCommitteeGuidance(guidance);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  const findingsBlock = submission.priorFindingsNarrative?.trim()
    ? `## Prior findings (AUD-06 / CCCER context)

${submission.priorFindingsNarrative.trim()}

`
    : '';

  const questionsBlock = submission.questions
    .map((question, index) => {
      const focus = question.focus ? ` [${question.focus}]` : '';
      return `${index + 1}. (${question.id})${focus} ${question.prompt}`;
    })
    .join('\n');

  return `You are evaluating a student's audit-committee brief: a short executive summary compiled from prior engagement findings, plus 4–5 audit-committee-style questions generated from that summary.

Use ONLY:
1) The retrieved audit-committee / executive reporting guidance below
2) The retrieved executive-summary excerpts below
3) The student's executive summary and generated questions
4) Optional prior findings context when provided

Do not rely on outside knowledge or invent findings that are not in the excerpts.

Source document: ${guidance.document} — ${guidance.title}
Pinned path: ${guidance.catalogPath}

## Retrieved audit-committee guidance

${guidanceText}

## Retrieved executive-summary excerpts

${submission.summaryExcerpts}

${scenarioBlock}${findingsBlock}## Student executive summary

${submission.executiveSummary.trim()}

## Generated audit-committee questions

${questionsBlock}

## Instructions

Evaluate whether:
1) The executive summary is a non-trivial, committee-ready compilation of the prior findings (severity prioritization, root-cause themes, remediation posture, residual risk; fidelity to prior findings)
2) The questions are suitable audit-committee probes (root cause, remediation timeline, accountability, residual risk / monitoring) grounded in the summary — not generic interview questions and not inventing unsupported facts

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths tied to summary evidence or guidance criteria
- gaps: specific gaps (too vague, missing residual risk, weak prioritization, generic questions, inventing facts, no remediation timeline, etc.)`;
}
