import type { RetrievedSecurityBudgetGuidance } from '@/lib/grc/getSecurityBudgetGuidance';
import { formatRetrievedSecurityBudgetGuidance } from '@/lib/grc/getSecurityBudgetGuidance';

export type SecurityBudgetRequestForGrading = {
  id: string;
  title: string;
  category: string;
  amountRequested: number;
  riskContext: string;
  allocated: number;
};

export type SecurityBudgetAllocationForGrading = {
  fiscalYear?: string;
  totalBudget: number;
  currency: string;
  budgetUsed: number;
  requests: SecurityBudgetRequestForGrading[];
  justification: string;
  preferredHighValueIds?: string[];
  discouragedRequestIds?: string[];
  scenarioBrief?: string;
  organizationText?: string;
  prompt?: string;
};

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

/**
 * F26 RAG grading prompt: include ONLY retrieved security-budget rubric
 * + ticket context + student allocation/justification.
 * Do not require an exact dollar match to a single correct portfolio.
 */
export function buildSecurityBudgetAllocationGradingPrompt(
  guidance: RetrievedSecurityBudgetGuidance,
  submission: SecurityBudgetAllocationForGrading
): string {
  const guidanceText = formatRetrievedSecurityBudgetGuidance(guidance);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  const orgBlock = submission.organizationText?.trim()
    ? `## Organization profile

${submission.organizationText.trim()}

`
    : '';

  const promptBlock = submission.prompt?.trim()
    ? `## Student instructions

${submission.prompt.trim()}

`
    : '';

  const preferred =
    submission.preferredHighValueIds &&
    submission.preferredHighValueIds.length > 0
      ? submission.preferredHighValueIds.join(', ')
      : '(none seeded)';
  const discouraged =
    submission.discouragedRequestIds &&
    submission.discouragedRequestIds.length > 0
      ? submission.discouragedRequestIds.join(', ')
      : '(none seeded)';

  const allocationLines = submission.requests
    .map((req) => {
      const funded =
        req.allocated <= 0
          ? 'UNFUNDED'
          : req.allocated >= req.amountRequested
            ? 'FULL'
            : 'PARTIAL';
      return `- ${req.id} | ${req.title} (${req.category}) | requested ${formatCurrency(req.amountRequested, submission.currency)} | allocated ${formatCurrency(req.allocated, submission.currency)} [${funded}]\n  Risk context: ${req.riskContext}`;
    })
    .join('\n');

  const fy = submission.fiscalYear?.trim()
    ? `Fiscal year: ${submission.fiscalYear.trim()}\n`
    : '';

  return `You are evaluating a student's FY security budget allocation against the pinned security-budget risk rubric ONLY.

Use only the retrieved guidance sections provided below. Do not rely on outside knowledge of NIST RMF budgeting, FAIR, CISA investment boards, or vendor ROI calculators beyond what the student wrote and the ticket context below.

Source document: ${guidance.document} — ${guidance.title}
Pinned path: ${guidance.catalogPath}

## Retrieved security-budget risk rubric

${guidanceText}

${scenarioBlock}${orgBlock}${promptBlock}## Soft preference hints (do NOT hard-fail solely on these)

These IDs are soft scenario hints for typically higher / lower risk-reduction value. A reasonable alternative mix can still be satisfied if the justification is risk-based and coherent.
- Preferred higher-value request IDs: ${preferred}
- Discouraged / vanity / low-impact request IDs: ${discouraged}

## Student allocation

${fy}Total budget: ${formatCurrency(submission.totalBudget, submission.currency)}
Budget used: ${formatCurrency(submission.budgetUsed, submission.currency)}

### Line items
${allocationLines}

### Justification
${submission.justification}

## Instructions

Evaluate whether the allocation is justified by risk reduction based solely on the retrieved rubric. Primary checks:
1. Justification links funded (and cut/zeroed) items to residual-risk outcomes — not merely a restated shopping list of dollars;
2. Higher risk-reduction requests (detection/tooling that closes real gaps, staffing capacity for ConMon/POA&M, independent assessment, role-based training) are preferred over vanity/cosmetic spend unless the student makes a credible risk argument;
3. Heavy vanity funding (cosmetic dashboards, awareness swag) without risk rationale should be graded not_satisfied or insufficient_evidence;
4. Staffing vs tooling vs training tradeoffs are explained when relevant;
5. Cuts / zeros / partial funding are acknowledged with risk-based deferral language when material.

Do NOT require an exact dollar match to one "correct" portfolio. Different mixes can be satisfied if the risk rationale is sound.

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths relative to the rubric (risk linkage, sensible tradeoffs, vanity deferred)
- gaps: specific gaps (shopping-list justification, vanity overfunded, missing cut rationale, weak risk linkage)`;
}
