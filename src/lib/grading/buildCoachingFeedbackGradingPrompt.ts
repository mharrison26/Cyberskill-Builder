import type { RetrievedCoachingQualityRubric } from '@/lib/helpdesk/getCoachingQualityRubric';
import { formatRetrievedCoachingQualityRubric } from '@/lib/helpdesk/getCoachingQualityRubric';

export type CoachingFeedbackForGrading = {
  strengths: string;
  gaps: string;
  actionItems: string;
  delivery: string;
  juniorNotes?: string;
  scenarioBrief?: string;
  ticketContextText?: string;
};

/**
 * F26 RAG grading prompt: include ONLY retrieved coaching-quality rubric text + student work.
 * The model must not rely on parametric knowledge of management / HR coaching practice.
 */
export function buildCoachingFeedbackGradingPrompt(
  rubric: RetrievedCoachingQualityRubric,
  submission: CoachingFeedbackForGrading
): string {
  const rubricText = formatRetrievedCoachingQualityRubric(rubric);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  const contextBlock = submission.ticketContextText?.trim()
    ? `## Ticket context (for reference)

${submission.ticketContextText.trim()}

`
    : '';

  const juniorNotes =
    submission.juniorNotes?.trim() || '(junior notes not provided)';

  const disclaimer = rubric.disclaimer?.trim()
    ? `Corpus disclaimer: ${rubric.disclaimer.trim()}`
    : 'Corpus disclaimer: Educational rubric only.';

  return `You are evaluating a student's structured coaching feedback for a junior technician's ticket notes against the retrieved coaching-quality rubric text ONLY.

Use only the retrieved rubric sections provided below. Do not rely on outside knowledge, memorized management frameworks, HR scripts, or assumptions beyond the junior notes and student coaching fields.

Source document: ${rubric.document} — ${rubric.title}
Pinned path: ${rubric.catalogPath}
${disclaimer}

## Retrieved coaching-quality rubric

${rubricText}

${scenarioBlock}${contextBlock}## Junior technician ticket notes (subject of coaching)

${juniorNotes}

## Student structured coaching feedback

**Strengths observed**
${submission.strengths}

**Gaps / missed steps / tone issues**
${submission.gaps}

**Actionable coaching items**
${submission.actionItems}

**Respectful delivery (how you would say it)**
${submission.delivery}

## Instructions

Evaluate whether the coaching feedback meets the pinned rubric based solely on the retrieved sections above. Focus on whether the student is:
1. specific — cites concrete evidence from the junior notes (missing steps, vague language, unprofessional tone);
2. actionable — gives the junior clear next behaviors, templates, or practice habits;
3. respectful — critiques the work without shaming, sarcasm, or personal attacks; delivery models a professional 1:1.

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths relative to the retrieved rubric
- gaps: specific gaps relative to the retrieved rubric (for example vague criticism, missing action items, or disrespectful tone)`;
}
