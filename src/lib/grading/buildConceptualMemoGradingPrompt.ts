export type ConceptualMemoGradingInput = {
  lessonTitle: string;
  scenarioBrief?: string;
  gradingFocus?: string;
  memo: string;
};

/**
 * RAG-style prompt for conceptual synthesis memos.
 * Rubric text comes from lessons.content.gradingFocus — not model memory.
 */
export function buildConceptualMemoGradingPrompt(
  input: ConceptualMemoGradingInput
): string {
  const scenarioBlock = input.scenarioBrief?.trim()
    ? `## Scenario brief

${input.scenarioBrief.trim()}

`
    : '';

  const rubricBlock = input.gradingFocus?.trim()
    ? `## Grading focus (authoring rubric)

${input.gradingFocus.trim()}

`
    : `## Grading focus (authoring rubric)

(No gradingFocus was stored on this lesson. Grade whether the memo substantively addresses the scenario brief.)

`;

  return `You are evaluating a student's conceptual GRC orientation memo against the authoring rubric below ONLY.

Use only the scenario brief and grading focus provided. Do not rely on outside knowledge, memorized framework catalogs, or assumptions beyond that material and the student memo.

Lesson: ${input.lessonTitle}

${scenarioBlock}${rubricBlock}## Student memo

${input.memo.trim()}

## Instructions

Evaluate whether the memo demonstrates the distinctions called for in the grading focus (when present) and the scenario ask.

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment
- strengths: specific strengths observed in the memo
- gaps: specific gaps relative to the grading focus / scenario`;
}
