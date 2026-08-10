import type { RetrievedPolicyWritingGuidance } from '@/lib/grc/getPolicyWritingGuidance';
import { formatRetrievedPolicyWritingGuidance } from '@/lib/grc/getPolicyWritingGuidance';

export type PolicySectionDraftForGrading = {
  sectionTitle: string;
  draft: string;
  scenarioBrief?: string;
  organizationText?: string;
  requirement?: string;
  prompt?: string;
};

/**
 * F26 RAG grading prompt: include ONLY retrieved policy-writing rubric
 * + ticket context + student draft. Do not rely on parametric policy templates.
 */
export function buildPolicySectionDraftGradingPrompt(
  guidance: RetrievedPolicyWritingGuidance,
  submission: PolicySectionDraftForGrading
): string {
  const guidanceText = formatRetrievedPolicyWritingGuidance(guidance);

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

  const requirementBlock = submission.requirement?.trim()
    ? `## One-paragraph requirement

${submission.requirement.trim()}

`
    : '';

  const promptBlock = submission.prompt?.trim()
    ? `## Student instructions

${submission.prompt.trim()}

`
    : '';

  return `You are evaluating a student's policy section draft against the pinned policy-writing rubric ONLY.

Use only the retrieved guidance sections provided below. Do not rely on outside knowledge of NIST, ISO, CIS Controls, or vendor policy packs beyond what the student wrote and the ticket context below.

Source document: ${guidance.document} — ${guidance.title}
Pinned path: ${guidance.catalogPath}

## Retrieved policy-writing rubric

${guidanceText}

${scenarioBlock}${orgBlock}${requirementBlock}${promptBlock}## Student policy section draft

**Section title**
${submission.sectionTitle}

**Draft**
${submission.draft}

## Instructions

Evaluate whether the draft is a defensible policy section based solely on the retrieved rubric. Primary checks:
1. Clear scope — names who (roles/workforce) and what systems/contexts are covered, aligned to the org profile;
2. Enforceable language — uses must/shall/required/prohibited (not only soft "should"/"encouraged") with specific, testable obligations tied to the requirement;
3. Defined exceptions process — request path, approver role, required request content, and time bound / review;
4. Organization fit — reflects the given requirement and org systems/constraints rather than generic boilerplate.

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths observed relative to the rubric
- gaps: specific gaps (for example missing scope, soft-only language, or no exceptions approval path)`;
}
