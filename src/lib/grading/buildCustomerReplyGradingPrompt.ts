import type { RetrievedCustomerCommunicationRubric } from '@/lib/helpdesk/getCustomerCommunicationRubric';
import { formatRetrievedCustomerCommunicationRubric } from '@/lib/helpdesk/getCustomerCommunicationRubric';

export type CustomerReplyForGrading = {
  reply: string;
  customerEmailBody?: string;
  customerEmailSubject?: string;
  scenarioBrief?: string;
};

/**
 * F26 RAG grading prompt: include ONLY retrieved communication rubric text + student reply.
 * The model must not rely on parametric knowledge of support / de-escalation practice.
 */
export function buildCustomerReplyGradingPrompt(
  rubric: RetrievedCustomerCommunicationRubric,
  submission: CustomerReplyForGrading
): string {
  const rubricText = formatRetrievedCustomerCommunicationRubric(rubric);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  const emailSubject =
    submission.customerEmailSubject?.trim() || '(not provided)';
  const emailBody =
    submission.customerEmailBody?.trim() || '(customer email not provided)';

  const disclaimer = rubric.disclaimer?.trim()
    ? `Corpus disclaimer: ${rubric.disclaimer.trim()}`
    : 'Corpus disclaimer: Educational rubric only.';

  return `You are evaluating a student's drafted reply to an angry customer email against the retrieved customer-communication rubric text ONLY.

Use only the retrieved rubric sections provided below. Do not rely on outside knowledge, memorized support scripts, ITIL/HDI frameworks, or assumptions beyond the customer email and student reply.

Source document: ${rubric.document} — ${rubric.title}
Pinned path: ${rubric.catalogPath}
${disclaimer}

## Retrieved customer-communication rubric

${rubricText}

${scenarioBlock}## Angry customer email

**Subject:** ${emailSubject}

${emailBody}

## Student drafted reply

${submission.reply.trim()}

## Instructions

Evaluate whether the reply meets the pinned rubric based solely on the retrieved sections above. Check that the student:
1. Acknowledges the customer's frustration or inconvenience (do not skip empathy)
2. States clear next steps with ownership and/or timing
3. Avoids unexplained jargon / internal tooling language
4. Maintains a calm, professional, de-escalating tone

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths relative to the retrieved rubric
- gaps: specific gaps relative to the retrieved rubric (for example missing acknowledgment, vague next steps, unexplained jargon, or unprofessional tone)`;
}
