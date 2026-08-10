import type { RetrievedProgramMetricsRubric } from '@/lib/grc/getProgramMetricsRubric';
import { formatRetrievedProgramMetricsRubric } from '@/lib/grc/getProgramMetricsRubric';

export type ProgramMetricsBriefForGrading = {
  selectedMetricIds: string[];
  selectedMetricLabels: string[];
  calculations: Record<string, number>;
  rationale: string;
  preferredMetricIds?: string[];
  discouragedMetricIds?: string[];
  scenarioBrief?: string;
  scenarioContextText?: string;
};

/**
 * F26 RAG grading prompt: include ONLY retrieved program-metrics rubric
 * + ticket context + student selection/rationale. Do not grade arithmetic
 * (deterministic scorer already validated calculations).
 */
export function buildProgramMetricsBriefGradingPrompt(
  rubric: RetrievedProgramMetricsRubric,
  submission: ProgramMetricsBriefForGrading
): string {
  const rubricText = formatRetrievedProgramMetricsRubric(rubric);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  const contextBlock = submission.scenarioContextText?.trim()
    ? `## Program / raw-data context (ticket)

${submission.scenarioContextText.trim()}

`
    : '';

  const preferred =
    submission.preferredMetricIds && submission.preferredMetricIds.length > 0
      ? submission.preferredMetricIds.join(', ')
      : '(not specified)';
  const discouraged =
    submission.discouragedMetricIds &&
    submission.discouragedMetricIds.length > 0
      ? submission.discouragedMetricIds.join(', ')
      : '(none listed)';

  const calcLines = Object.entries(submission.calculations)
    .map(([id, value]) => `- ${id}: ${value}`)
    .join('\n');

  const labelLines = submission.selectedMetricIds
    .map((id, index) => {
      const label = submission.selectedMetricLabels[index] ?? id;
      return `- ${id} (${label})`;
    })
    .join('\n');

  return `You are evaluating a student's leadership program-metrics brief against pinned program-metrics best-practices rubric ONLY.

Use only the retrieved rubric sections provided below. Do not rely on outside NIST, FISMA, or dashboard product knowledge beyond what the student wrote and the ticket context.

Arithmetic correctness of the submitted calculations has already been checked deterministically — do NOT fail the student for math. Grade metric *selection* and *rationale quality* for leadership relevance.

Source document: ${rubric.document} — ${rubric.title}
Pinned path: ${rubric.catalogPath}

## Retrieved program-metrics rubric

${rubricText}

${scenarioBlock}${contextBlock}## Ticket answer-key hints (not secrets to reveal verbatim)

Preferred metric ids (leadership-aligned): ${preferred}
Discouraged / vanity metric ids: ${discouraged}

## Student submission

**Selected metrics**
${labelLines || '(none)'}

**Submitted calculations (already validated if present)**
${calcLines || '(none)'}

**Rationale (why these metrics for leadership)**
${submission.rationale}

## Instructions

Evaluate whether the selected metrics and rationale form a defensible leadership-facing program brief based solely on the retrieved rubric. Primary checks:
- Selected metrics are outcome-oriented for program oversight (POA&M aging/overdue, training completion, severity-aware incidents) rather than vanity activity counts;
- The set is a small balanced portfolio (typically covering remediation + workforce + incident posture) when the data supports it;
- Rationale explains why each metric matters to leadership decisions/oversight and references the values or raw-data context;
- Discouraged vanity metrics (e.g. raw helpdesk ticket volume) are not treated as primary leadership KPIs.

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths relative to the rubric
- gaps: specific gaps (for example vanity metric selected, weak leadership "why", missing severity context)`;
}
