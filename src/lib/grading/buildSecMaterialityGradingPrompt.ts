import type { RetrievedSecMaterialityGuidance } from '@/lib/sec/getSecMaterialityGuidance';
import { formatRetrievedSecMaterialityGuidance } from '@/lib/sec/getSecMaterialityGuidance';

export type SecMaterialityMemoForGrading = {
  determination: 'material' | 'not_material';
  determinationRationale: string;
  factorSections: Record<string, string>;
  scenarioBrief?: string;
  /** Structured breach facts from ticket initial_state (when present). */
  breachScenarioText?: string;
  /** Sheet grading focus (factor reasoning over a binary answer key). */
  gradingFocus?: string;
};

/**
 * F26 RAG grading prompt: include ONLY retrieved SEC educational summary + student memo.
 * The model must not rely on parametric knowledge of SEC cybersecurity disclosure rules.
 */
export function buildSecMaterialityGradingPrompt(
  guidance: RetrievedSecMaterialityGuidance,
  submission: SecMaterialityMemoForGrading
): string {
  const guidanceText = formatRetrievedSecMaterialityGuidance(guidance);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  const breachBlock = submission.breachScenarioText?.trim()
    ? `## Breach scenario details (ticket facts)

${submission.breachScenarioText.trim()}

`
    : '';

  const gradingFocusBlock = submission.gradingFocus?.trim()
    ? `Grading focus from the lesson: ${submission.gradingFocus.trim()}
`
    : '';

  const factorBlock = Object.entries(submission.factorSections)
    .map(
      ([key, value]) => `### ${key}

${value.trim()}`
    )
    .join('\n\n');

  const disclaimer = guidance.disclaimer?.trim()
    ? `Corpus disclaimer: ${guidance.disclaimer.trim()}`
    : 'Corpus disclaimer: Educational summary only. Not legal advice.';

  return `You are evaluating a student's SEC cybersecurity incident materiality determination memo against the retrieved educational SEC disclosure summary text ONLY.

Use only the retrieved guidance sections provided below. Do not rely on outside knowledge, memorized SEC rules, EDGAR practice, or assumptions beyond the scenario brief, breach facts, and student memo.

Source document: ${guidance.document} — ${guidance.title}
Pinned path: ${guidance.catalogPath}
${disclaimer}

## Retrieved SEC materiality guidance

${guidanceText}

${scenarioBlock}${breachBlock}## Student materiality memo

**8-K Item 1.05 determination:** ${submission.determination}

**Determination / four-business-day rationale**
${submission.determinationRationale}

**Factor analyses**
${factorBlock}

## Instructions

Evaluate whether the memo demonstrates a defensible materiality analysis for Form 8-K Item 1.05 based solely on the retrieved guidance above (and the ticket scenario/breach facts when provided). ${gradingFocusBlock}
Important: this scenario is deliberately ambiguous — it is a vendor breach (not a direct Northwind/issuer system breach) and the exposure is a subset of customers. Real materiality determinations are judgment calls, not obvious yes/no answers. Do NOT grade against a single forced correct material / not_material answer key. Either determination may be "satisfied" when the memo applies the retrieved materiality factors with scenario-specific reasoning that grapples with the vendor-vs-direct and subset-scope facts.

Check that the student:
1. Applies the reasonable-investor / qualitative-and-quantitative materiality lens
2. Addresses nature/scope, data compromise, operational impact, financial impact, and reputational/legal considerations with scenario-specific reasoning (including vendor boundary and subset scope where relevant)
3. States a clear material / not_material determination with a coherent four-business-day clock rationale — evaluate the quality of that reasoning, not whether it matches a predetermined answer

Penalize memos that only assert a conclusion, ignore the vendor/subset facts, or skip materiality factors.

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths relative to the retrieved guidance
- gaps: specific gaps relative to the retrieved guidance (for example missing investor lens, empty factor analysis, ignored vendor/subset ambiguity, or unsupported timing conclusions)`;
}
