import { OSCAL_CATALOG_PATH, type ControlText } from '@/lib/oscal/getControl';
import type { ControlMappingRow } from '@/lib/control-mappings/types';

export type ControlMappingOverlapGradingSubmission = {
  sourceControlId: string;
  selectedMappings: Partial<Record<string, string[]>>;
  overlapNarrative: string;
  scenarioBrief?: string;
};

/**
 * Format retrieved NIST SP 800-53 control statement text (IAM lab pattern).
 */
export function formatRetrievedControlStatement(control: ControlText): string {
  return `### ${control.controlId} — ${control.title}

${control.statement.trim() || '(No statement text available in catalog.)'}`;
}

/**
 * Format retrieved control_mappings rows (confidence = strong vs partial signal).
 */
export function formatRetrievedMappingRows(rows: ControlMappingRow[]): string {
  if (rows.length === 0) {
    return '(No mapping rows retrieved from control_mappings.)';
  }

  return rows
    .map(
      (row) =>
        `- ${row.source_framework}:${row.source_control_id} → ${row.target_framework}:${row.target_control_id} (confidence: ${row.mapping_confidence})`
    )
    .join('\n');
}

/**
 * RAG grading prompt for GRC-01 overlap narrative.
 *
 * Grounding corpus is ONLY:
 *   1. retrieved NIST SP 800-53 control statement (same getControlText pattern as IAM lab)
 *   2. retrieved control_mappings rows (IDs + confidence)
 *
 * The model must not invent SOC 2 / ISO text or rely on parametric memory.
 */
export function buildControlMappingOverlapGradingPrompt(
  control: ControlText,
  mappingRows: ControlMappingRow[],
  submission: ControlMappingOverlapGradingSubmission
): string {
  const controlSection = formatRetrievedControlStatement(control);
  const mappingsSection = formatRetrievedMappingRows(mappingRows);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  const selectedBlock = Object.entries(submission.selectedMappings)
    .map(([framework, ids]) => {
      const list = (ids ?? []).join(', ') || '(none)';
      return `- ${framework}: ${list}`;
    })
    .join('\n');

  return `You are evaluating a student's cross-framework control-mapping overlap narrative against retrieved control statement text and retrieved control_mappings rows ONLY.

Use only the retrieved NIST SP 800-53 control statement and the retrieved mapping rows below. Do not rely on outside knowledge, memorized SOC 2 Trust Services Criteria text, memorized ISO/IEC 27001 Annex A text, parametric values, or assumptions about organizational context beyond the scenario brief and student narrative.

Source catalog: NIST SP 800-53 Rev. 5 (OSCAL)
Pinned path: ${OSCAL_CATALOG_PATH}
Reference table: public.control_mappings

## Retrieved control statement (IAM lab retrieval pattern)

${controlSection}

## Retrieved control_mappings rows

${mappingsSection}

${scenarioBlock}## Student submission

**Source control**
${submission.sourceControlId}

**Selected equivalents**
${selectedBlock || '(none)'}

**Overlap narrative**
${submission.overlapNarrative}

## Instructions

Evaluate whether the overlap narrative:
1. Characterizes where mappings are strong versus only partially overlapping, grounded in the retrieved AC-2 / source control statement requirements (for example account management / review obligations implied by the statement)
2. Uses the retrieved mapping confidence signal appropriately (high ≈ stronger topical coverage; medium/low ≈ more partial overlap) without inventing framework criteria text not present above
3. Avoids claiming that a SOC 2 or ISO control fully satisfies the retrieved NIST control when the retrieved statement implies obligations those mappings only partially cover

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths relative to the retrieved control statement and mapping rows
- gaps: specific gaps relative to the retrieved text (for example treating partial mappings as full equivalence, or ignoring account-management obligations in the retrieved statement)`;
}
