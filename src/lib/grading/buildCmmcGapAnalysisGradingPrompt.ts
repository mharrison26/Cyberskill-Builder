import type { RetrievedCmmcPractices } from '@/lib/cmmc/getCmmcPractices';
import { formatRetrievedCmmcPractices } from '@/lib/cmmc/getCmmcPractices';

export type CmmcPracticeScoreValue = 'met' | 'partial' | 'not_met';

export type CmmcGapAnalysisGradingSubmission = {
  practiceScores: Array<{
    practiceId: string;
    score: CmmcPracticeScoreValue;
  }>;
  gapAnalysis: string;
  readinessPercent: number;
  companyName?: string;
  scenarioBrief?: string;
};

/**
 * F26 RAG grading prompt: include ONLY retrieved CMMC practice text + student work.
 * The model must not rely on parametric knowledge of CMMC / NIST SP 800-171.
 */
export function buildCmmcGapAnalysisGradingPrompt(
  practices: RetrievedCmmcPractices,
  submission: CmmcGapAnalysisGradingSubmission
): string {
  const practicesText = formatRetrievedCmmcPractices(practices);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  const companyBlock = submission.companyName?.trim()
    ? `**Company:** ${submission.companyName.trim()}\n`
    : '';

  const scoresBlock = submission.practiceScores
    .map((entry) => `- ${entry.practiceId}: ${entry.score.replace(/_/g, ' ')}`)
    .join('\n');

  return `You are evaluating a student's CMMC 2.0 Level 2 gap analysis against pinned practice description text ONLY.

Use only the retrieved CMMC practice descriptions provided below. Do not rely on outside knowledge, memorized CMMC or NIST SP 800-171 content, parametric practice lists, or assumptions about organizational context beyond what the student wrote and the scenario brief.

Source document: ${practices.document} — ${practices.title}
Pinned path: ${practices.catalogPath}

## Retrieved CMMC practice descriptions

${practicesText}

${scenarioBlock}## Student submission

${companyBlock}**Practice scores**
${scoresBlock}

**Overall readiness percentage**
${submission.readinessPercent}%

**Gap analysis narrative**
${submission.gapAnalysis}

## Instructions

Evaluate whether the gap analysis:
1. Correctly grounds gaps and strengths in the retrieved practice requirements (not generic security advice)
2. Explains why practices marked partial / not met fall short of the retrieved practice text
3. Presents a readiness percentage that is plausible relative to the practice scores and narrative
4. Identifies concrete control gaps (or confirms met practices) using the practice language above

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths relative to the retrieved practices
- gaps: specific weaknesses relative to the retrieved practices (for example missing practice linkage, unsupported readiness %, or overlooked requirements in retrieved text)`;
}
