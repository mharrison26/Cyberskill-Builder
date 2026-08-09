import type { ControlText } from '@/lib/oscal/getControl';
import { OSCAL_CATALOG_PATH } from '@/lib/oscal/getControl';
import type { ControlImplementationAdequacyJudgment } from '@/lib/scoring/ticketUi';

export type ControlImplementationAdequacyForGrading = {
  judgment: ControlImplementationAdequacyJudgment;
  justification: string;
  implementationStatement: string;
  systemName?: string;
  scenarioBrief?: string;
};

export function formatControlTextForGrading(control: ControlText): string {
  return `### ${control.controlId} — ${control.title}

Family: ${control.family}

${control.statement.trim() || '(No statement text available in catalog.)'}`;
}

/**
 * F25/F26 RAG grading prompt: include ONLY retrieved live control text + student work.
 * The model must not rely on parametric 800-53 knowledge.
 */
export function buildControlImplementationAdequacyGradingPrompt(
  control: ControlText,
  submission: ControlImplementationAdequacyForGrading
): string {
  const controlText = formatControlTextForGrading(control);

  const systemBlock = submission.systemName?.trim()
    ? `## System under review

${submission.systemName.trim()}

`
    : '';

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  return `You are evaluating a student's judgment of whether a written control implementation statement adequately addresses the NIST SP 800-53 control requirements, using the retrieved live control statement text ONLY.

Use only the control title and statement provided below. Do not rely on outside knowledge, memorized SP 800-53 wording, assessment objectives, or assumptions beyond the implementation statement and student justification.

Source catalog: ${OSCAL_CATALOG_PATH}

## Retrieved control statement

${controlText}

${systemBlock}${scenarioBlock}## Implementation statement under review

${submission.implementationStatement}

## Student judgment

**Judgment:** ${submission.judgment}

**Justification**
${submission.justification}

## Instructions

The binary judgment itself is scored separately against an answer key. Focus on whether the justification correctly grounds the student's judgment in the retrieved control statement requirements.

Evaluate whether the justification:
1. References concrete control requirements from the retrieved statement (e.g. account types, managers, create/enable/modify/disable/remove, reviews, termination/transfer notifications) rather than vague "best practice" language
2. Explains how the implementation statement meets or fails those specific requirements
3. Does not invent control clauses that are absent from the retrieved text

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths relative to the retrieved control statement
- gaps: specific gaps relative to the retrieved control statement (for example no control citation, generic adequacy language, or facts that contradict the retrieved requirements)`;
}
