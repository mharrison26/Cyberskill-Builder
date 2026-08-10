/**
 * F26-style RAG grading prompt for tool_walkthrough lessons that map OSS
 * tracker fields onto the student's own prior oscal_findings row.
 *
 * The retrieved corpus is ONLY that prior finding — not a generic answer key
 * and not external framework text.
 */

export type PriorFindingForFieldMapping = {
  id: string;
  controlId: string;
  findingState: string;
  studentNarrative: string | null;
  observation: unknown;
  sourceLessonTitle?: string | null;
};

export type ToolWalkthroughFieldMappingSubmission = {
  externalReference: string;
  reflection: string;
  storagePath: string;
  lessonTitle?: string | null;
};

function formatObservation(observation: unknown): string {
  if (observation == null) {
    return '(No observation recorded.)';
  }
  if (typeof observation === 'string') {
    const trimmed = observation.trim();
    return trimmed || '(No observation recorded.)';
  }
  try {
    return JSON.stringify(observation, null, 2);
  } catch {
    return String(observation);
  }
}

export function formatPriorFindingForFieldMapping(
  finding: PriorFindingForFieldMapping
): string {
  const narrative = finding.studentNarrative?.trim()
    ? finding.studentNarrative.trim()
    : '(No student narrative recorded.)';

  const source = finding.sourceLessonTitle?.trim()
    ? finding.sourceLessonTitle.trim()
    : 'prerequisite lesson';

  return `### Prior finding ${finding.id}

Source lesson: ${source}
Control: ${finding.controlId}
Finding state: ${finding.findingState}

**Student narrative**
${narrative}

**Observation**
${formatObservation(finding.observation)}`;
}

/**
 * Build a grading prompt that evaluates the student's field-mapping reflection
 * against ONLY their retrieved prior finding text.
 */
export function buildToolWalkthroughFieldMappingPrompt(
  priorFinding: PriorFindingForFieldMapping,
  submission: ToolWalkthroughFieldMappingSubmission
): string {
  const priorBlock = formatPriorFindingForFieldMapping(priorFinding);
  const lessonLabel = submission.lessonTitle?.trim() || 'Open-Source Tracking Workflows';

  return `You are evaluating a student's open-source compliance tracking walkthrough. They must explain how fields in their tracking tool map to elements of THEIR OWN prior assessment finding.

Use ONLY the retrieved prior finding text below as the grounding corpus. Do not invent a generic answer key, substitute a canonical finding, or rely on outside knowledge about what the finding "should" say. Grade fidelity of the field-mapping explanation to this student's prior finding.

Lesson: ${lessonLabel}

## Retrieved prior finding (student's own oscal_findings row)

${priorBlock}

## Student tool-walkthrough submission

**External reference** (tool record ID or URL)
${submission.externalReference.trim()}

**Evidence storage path** (screenshot upload)
${submission.storagePath.trim()}

**Field-mapping reflection**
${submission.reflection.trim()}

## Instructions

Evaluate whether the reflection demonstrates a concrete field-mapping from the open-source tracking tool onto the retrieved prior finding (for example mapping finding condition/criteria/cause/effect/recommendation or observation details into named tool fields). The screenshot path confirms evidence was uploaded; focus narrative grading on the reflection's mapping quality relative to THIS prior finding.

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths in how the reflection maps tool fields to the prior finding
- gaps: specific gaps (vague mapping, inventing facts not in the prior finding, missing field names, or ignoring key finding elements)`;
}
