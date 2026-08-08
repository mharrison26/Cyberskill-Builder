import {
  formatAssessmentObjectiveText,
  type AssessmentObjectiveText,
} from '@/lib/oscal/getControl';

export type AssessmentProcedureSubmission = {
  examine: string;
  interview: string;
  test: string;
  scenarioBrief?: string;
};

/**
 * F26 RAG grading prompt: include ONLY retrieved SP 800-53A text + student work.
 * The model must not rely on parametric knowledge of assessment procedures.
 */
export function buildAssessmentProcedureGradingPrompt(
  assessment: AssessmentObjectiveText,
  submission: AssessmentProcedureSubmission
): string {
  const retrieved = formatAssessmentObjectiveText(assessment);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  return `You are evaluating a student's NIST SP 800-53A assessment procedures (Examine / Interview / Test) against the retrieved SP 800-53A assessment objective and method text ONLY.

Use only the retrieved SP 800-53A text provided below. Do not rely on outside knowledge, memorized NIST content, parametric values, or assumptions about organizational context beyond what the student wrote.

Source catalog: ${assessment.catalogPath}
Control: ${assessment.controlId} — ${assessment.title}

## Retrieved SP 800-53A assessment content

${retrieved}

${scenarioBlock}## Student submission

**Examine**
${submission.examine}

**Interview**
${submission.interview}

**Test**
${submission.test}

## Instructions

Evaluate whether the student's Examine, Interview, and Test procedures appropriately assess the control based solely on the retrieved assessment objectives and potential assessment methods above.

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths observed relative to the retrieved 800-53A text
- gaps: specific gaps or weaknesses relative to the retrieved assessment objectives / methods (for example missing objectives, wrong method category, or procedures that do not exercise listed assessment objects)`;
}
