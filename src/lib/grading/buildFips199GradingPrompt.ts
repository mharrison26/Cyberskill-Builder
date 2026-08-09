import type { RetrievedFips199Guidance } from '@/lib/nist/getFips199Guidance';
import { formatRetrievedFips199Guidance } from '@/lib/nist/getFips199Guidance';
import type { Fips199ImpactLevel } from '@/lib/scoring/ticketUi';

export type Fips199ForGrading = {
  confidentiality: Fips199ImpactLevel;
  integrity: Fips199ImpactLevel;
  availability: Fips199ImpactLevel;
  overall: Fips199ImpactLevel;
  justification: string;
  scenarioBrief?: string;
  systemProfileText?: string;
};

/**
 * F26 RAG grading prompt: include ONLY retrieved FIPS 199 guidance + student work.
 * The model must not rely on parametric NIST / FIPS knowledge.
 */
export function buildFips199GradingPrompt(
  guidance: RetrievedFips199Guidance,
  submission: Fips199ForGrading
): string {
  const guidanceText = formatRetrievedFips199Guidance(guidance);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  const systemBlock = submission.systemProfileText?.trim()
    ? `## Information system profile

${submission.systemProfileText.trim()}

`
    : '';

  return `You are evaluating a student's FIPS 199 security categorization justification against the retrieved FIPS 199 guidance text ONLY.

Use only the retrieved guidance sections provided below. Do not rely on outside knowledge, memorized NIST publications, SP 800-60 catalogs, or assumptions beyond the system profile and student justification.

Source document: ${guidance.document} — ${guidance.title}
Pinned path: ${guidance.catalogPath}

## Retrieved FIPS 199 guidance

${guidanceText}

${scenarioBlock}${systemBlock}## Student categorization

**Confidentiality:** ${submission.confidentiality}
**Integrity:** ${submission.integrity}
**Availability:** ${submission.availability}
**Overall (high-water mark):** ${submission.overall}

**Justification**
${submission.justification}

## Instructions

The C/I/A/overall level selections themselves are scored separately against a seeded answer key. Focus on justification quality relative to the retrieved guidance. Check that the student:
1. Uses Low / Moderate / High in the sense of limited / serious / severe-or-catastrophic adverse effects from the retrieved impact definitions
2. Ties each objective to concrete information types and mission consequences from the system profile
3. Explains the overall category using the high-water mark rule (highest of C/I/A), not an average
4. Does not invent FIPS clauses that are absent from the retrieved text

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths relative to the retrieved guidance
- gaps: specific gaps relative to the retrieved guidance (for example generic "critical system" language, missing high-water mark explanation, or no link from data types to adverse-effect severity)`;
}
