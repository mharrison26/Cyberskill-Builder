import type { RetrievedScriptRemediationRubric } from '@/lib/scripting/getScriptRemediationRubric';
import { formatRetrievedScriptRemediationRubric } from '@/lib/scripting/getScriptRemediationRubric';

export type ScriptRemediationForGrading = {
  scriptPath: string;
  scriptContent: string;
  scenarioBrief?: string;
  /** Deterministic config-diff summary — context only; do not re-grade pass/fail. */
  configDiffSummary?: string;
};

/**
 * F26 RAG grading prompt: include ONLY retrieved script-quality rubric + student script.
 * Pass/fail of the lab is already decided by config-diff; this grades quality / side effects.
 */
export function buildScriptRemediationGradingPrompt(
  rubric: RetrievedScriptRemediationRubric,
  submission: ScriptRemediationForGrading
): string {
  const rubricText = formatRetrievedScriptRemediationRubric(rubric);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  const configBlock = submission.configDiffSummary?.trim()
    ? `## Deterministic state check (already graded — do not override)

${submission.configDiffSummary.trim()}

`
    : '';

  const disclaimerBlock = rubric.disclaimer
    ? `Disclaimer: ${rubric.disclaimer}\n\n`
    : '';

  return `You are evaluating a student's PowerShell or Bash remediation script against a script-quality rubric ONLY.

Use only the retrieved rubric sections provided below. Do not invent OS commands, service names, or file paths that are not present in the student script or scenario brief. Do not rely on outside knowledge of Windows print spooler or CUPS internals beyond what the retrieved rubric and ticket context state.

${disclaimerBlock}Source document: ${rubric.document} — ${rubric.title}
Pinned path: ${rubric.catalogPath}

## Retrieved script-remediation rubric

${rubricText}

${scenarioBlock}${configBlock}## Student script (\`${submission.scriptPath}\`)

\`\`\`
${submission.scriptContent}
\`\`\`

## Instructions

The student's lab pass/fail was already decided by deterministic filesystem/state checks. Your job is quality feedback only — especially side effects and operator safety.

Evaluate whether the script meets the retrieved rubric. Focus on:
- targeted-fix — narrow remediation of the reported stuck spooler / service issue;
- side-effects — avoids destructive blast radius (config wipes, broad rm -rf, host reboot);
- idempotent-verify — safe re-run and post-fix verification when those sections were retrieved;
- clarity-ops — readable, short, operator-friendly script when that section was retrieved.

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student (2–4 sentences)
- strengths: specific strengths relative to the retrieved rubric
- gaps: specific gaps or side-effect risks relative to the retrieved rubric`;
}
