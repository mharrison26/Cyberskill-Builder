import type { RetrievedSecurityStrategyPlanningRubric } from '@/lib/grc/getSecurityStrategyPlanningRubric';
import { formatRetrievedSecurityStrategyPlanningRubric } from '@/lib/grc/getSecurityStrategyPlanningRubric';

export type SecurityStrategyCapstoneForGrading = {
  prioritiesText: string;
  resourcingText: string;
  expectedOutcomesText: string;
  memoText?: string;
  organizationName?: string;
  scenarioBrief?: string;
  riskProfileText?: string;
  budgetText?: string;
  priorFindingsText?: string;
};

/**
 * F26 RAG grading prompt: include ONLY retrieved strategic-planning rubric
 * + ticket scenario context + student memo sections.
 */
export function buildSecurityStrategyCapstoneGradingPrompt(
  rubric: RetrievedSecurityStrategyPlanningRubric,
  submission: SecurityStrategyCapstoneForGrading
): string {
  const rubricText = formatRetrievedSecurityStrategyPlanningRubric(rubric);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  const orgBlock = submission.organizationName?.trim()
    ? `Organization: ${submission.organizationName.trim()}\n`
    : '';

  const riskBlock = submission.riskProfileText?.trim()
    ? `## Risk profile (ticket context)

${submission.riskProfileText.trim()}

`
    : '';

  const budgetBlock = submission.budgetText?.trim()
    ? `## Budget constraints (ticket context)

${submission.budgetText.trim()}

`
    : '';

  const findingsBlock = submission.priorFindingsText?.trim()
    ? `## Prior findings / open POA&Ms (ticket context)

${submission.priorFindingsText.trim()}

`
    : '';

  const memoBlock = submission.memoText?.trim()
    ? `**Full memo (optional concatenated preview)**
${submission.memoText.trim()}

`
    : '';

  return `You are evaluating a student's one-year security strategy memo for leadership against pinned strategic-planning quality criteria ONLY.

Use only the retrieved rubric sections and the ticket scenario context provided below. Do not rely on outside knowledge of NIST RMF, CMMI, FAIR, or vendor frameworks beyond what the student wrote and the ticket context.

Source document: ${rubric.document} — ${rubric.title}
Pinned path: ${rubric.catalogPath}

${scenarioBlock}${orgBlock}${riskBlock}${budgetBlock}${findingsBlock}## Retrieved strategic-planning rubric

${rubricText}

## Student strategy memo sections

**Top priorities (ranked)**
${submission.prioritiesText.trim() || '(empty)'}

**Resourcing (budget / people mapped to priorities)**
${submission.resourcingText.trim() || '(empty)'}

**Expected outcomes (measurable within the year)**
${submission.expectedOutcomesText.trim() || '(empty)'}

${memoBlock}## Instructions

Primary focus: grade whether the memo is a defensible one-year program strategy based solely on the retrieved rubric and ticket context. Also consider whether:
- priorities are risk-aligned and ranked against the stated residual risks / threat context;
- resourcing is budget-realistic under the FY envelope and must-fund constraints;
- expected outcomes are measurable within the year and tied to the priorities;
- prior findings / open POA&Ms are addressed rather than ignored;
- the memo avoids generic platitudes and unprioritized tool shopping lists;
- priorities, resourcing, and outcomes form one coherent plan.

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths relative to the strategic-planning rubric
- gaps: specific gaps (for example generic priorities, budget-unrealistic resourcing, non-measurable outcomes, ignored findings)`;
}
