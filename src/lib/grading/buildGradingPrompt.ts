import type { ControlText } from '@/lib/oscal/getControl';
import type { CCCERValues } from '@/types';

export function buildGradingPrompt(
  controls: ControlText[],
  submission: CCCERValues
): string {
  const controlSections = controls
    .map(
      (control) => `### ${control.controlId} — ${control.title}

${control.statement.trim() || '(No statement text available in catalog.)'}`
    )
    .join('\n\n');

  return `You are evaluating a student security assessment submission against NIST SP 800-53 control statement text ONLY.

Use only the control title and statement provided below. Do not rely on outside knowledge, parametric values, or assumptions about organizational context.

## Control statement(s)

${controlSections}

## Student submission (CCCER)

**Condition**
${submission.condition}

**Criteria**
${submission.criteria}

**Cause**
${submission.cause}

**Effect**
${submission.effect}

**Recommendation**
${submission.recommendation}

## Instructions

Evaluate whether the submission demonstrates the control requirement based solely on the control statement text above.

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment
- strengths: specific strengths observed in the submission
- gaps: specific gaps, missing evidence, or weaknesses relative to the control statement`;
}
