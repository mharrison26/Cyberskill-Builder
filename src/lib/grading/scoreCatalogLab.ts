import { listControlIdsByFamilyPrefix } from '@/lib/oscal/getControl';
import { normalizeControlId } from '@/lib/oscal/parseCatalog';
import type { CatalogLabSubmission } from '@/lib/lessons/catalogLabValidation';
import { CATALOG_LAB_MIN_EXPLANATION_LENGTH } from '@/lib/lessons/catalogLabValidation';
import type { AiFindingState } from '@/lib/grading/mapFindingState';

export type CatalogLabScoreResult = {
  expectedBaseIa: string[];
  submitted: string[];
  truePositives: string[];
  falsePositives: string[];
  missingBase: string[];
  includesAc2InIaList: boolean;
  adjacentAcControls: string[];
  hasAuthAdjacentAc: boolean;
  explanationLength: number;
  explanationLengthOk: boolean;
  mentionsAc2IaDistinction: boolean;
  percentage: number;
  passed: boolean;
  findingState: AiFindingState;
  strengths: string[];
  gaps: string[];
  feedback: string;
};

const AUTH_ADJACENT_AC_HINTS = new Set([
  'ac-7', // unsuccessful logon attempts
  'ac-11', // session lock
  'ac-12', // session termination
  'ac-14', // permitted actions without identification or authentication
  'ac-17', // remote access
]);

function uniqueNormalized(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = normalizeControlId(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function setDiff(left: string[], right: Set<string>): string[] {
  return left.filter((id) => !right.has(id));
}

/**
 * Deterministic OSCAL family-filter scoring for L02 catalog_lab.
 *
 * Lookup accuracy first: submitted IA shortlist vs pinned catalog base IA
 * controls (ia-1…ia-N). Narrative explanation is a secondary gate.
 */
export function scoreCatalogLabSubmission(
  submission: CatalogLabSubmission,
  options?: { expectedBaseIa?: string[] }
): CatalogLabScoreResult {
  const expectedBaseIa =
    options?.expectedBaseIa ??
    listControlIdsByFamilyPrefix('ia', { baseOnly: true });
  const expectedSet = new Set(expectedBaseIa);
  const allIaSet = new Set(listControlIdsByFamilyPrefix('ia'));

  const submitted = uniqueNormalized(submission.controlIds);
  const submittedSet = new Set(submitted);

  const truePositives = submitted.filter((id) => expectedSet.has(id));
  // Enhancements (ia-5.1, …) are valid IA IDs; only non-IA IDs are false positives.
  const falsePositives = submitted.filter((id) => !allIaSet.has(id));
  const missingBase = setDiff(expectedBaseIa, submittedSet);
  const includesAc2InIaList = submittedSet.has('ac-2');

  const adjacentAcControls = uniqueNormalized(submission.adjacentAcControls);
  const hasAuthAdjacentAc = adjacentAcControls.some((id) =>
    AUTH_ADJACENT_AC_HINTS.has(id)
  );

  const explanationLength = submission.explanation.trim().length;
  const explanationLengthOk =
    explanationLength >= CATALOG_LAB_MIN_EXPLANATION_LENGTH;
  const mentionsAc2IaDistinction =
    /\bac[\s-]?2\b/i.test(submission.explanation) &&
    /\bia[\s-]?5\b/i.test(submission.explanation);

  const covered = truePositives.length;
  const total = expectedBaseIa.length || 1;
  const percentage = Math.round((covered / total) * 100);

  const strengths: string[] = [];
  const gaps: string[] = [];

  if (missingBase.length === 0 && falsePositives.length === 0) {
    strengths.push(
      `Listed all ${expectedBaseIa.length} base IA-family controls from the pinned OSCAL catalog.`
    );
  } else if (truePositives.length > 0) {
    strengths.push(
      `Correctly identified ${truePositives.length}/${expectedBaseIa.length} base IA controls.`
    );
  }

  if (!includesAc2InIaList) {
    strengths.push('Correctly kept AC-2 out of the IA-family shortlist.');
  } else {
    gaps.push(
      'AC-2 (Account Management) belongs to the AC family — do not list it as an IA control.'
    );
  }

  if (missingBase.length > 0) {
    gaps.push(
      `Missing base IA controls: ${missingBase.slice(0, 12).join(', ')}${
        missingBase.length > 12 ? '…' : ''
      }.`
    );
  }

  if (falsePositives.length > 0) {
    gaps.push(
      `Non-IA control IDs in the IA shortlist: ${falsePositives.join(', ')}.`
    );
  }

  if (hasAuthAdjacentAc) {
    strengths.push(
      `Identified authentication-adjacent AC control(s): ${adjacentAcControls
        .filter((id) => AUTH_ADJACENT_AC_HINTS.has(id))
        .join(', ')}.`
    );
  } else if (adjacentAcControls.length === 0) {
    gaps.push(
      'List authentication-adjacent AC controls (e.g. AC-7 unsuccessful logon attempts) separately from the IA shortlist.'
    );
  } else {
    gaps.push(
      'Adjacent AC list should include genuinely authentication-adjacent controls such as AC-7, not account-management controls like AC-2.'
    );
  }

  if (explanationLengthOk) {
    if (mentionsAc2IaDistinction) {
      strengths.push(
        'Explanation addresses the AC-2 vs IA-5 family distinction.'
      );
    }
  } else {
    gaps.push(
      `Explanation must be at least ${CATALOG_LAB_MIN_EXPLANATION_LENGTH} characters.`
    );
  }

  const lookupPassed =
    missingBase.length === 0 &&
    falsePositives.length === 0 &&
    !includesAc2InIaList;
  const narrativePassed = explanationLengthOk;
  const adjacentPassed =
    hasAuthAdjacentAc ||
    (adjacentAcControls.length > 0 &&
      adjacentAcControls.every((id) => id.startsWith('ac-') && id !== 'ac-2'));

  const passed = lookupPassed && narrativePassed && adjacentPassed;

  let findingState: AiFindingState;
  if (passed) {
    findingState = 'satisfied';
  } else if (truePositives.length > 0 && !includesAc2InIaList) {
    findingState = 'insufficient_evidence';
  } else {
    findingState = 'not_satisfied';
  }

  const feedback = passed
    ? 'Catalog lookup is accurate: IA-family shortlist matches the pinned OSCAL catalog, AC-2 is excluded, and authentication-adjacent AC controls are explained separately.'
    : `Catalog lookup needs revision. ${gaps.join(' ')}`;

  return {
    expectedBaseIa,
    submitted,
    truePositives,
    falsePositives,
    missingBase,
    includesAc2InIaList,
    adjacentAcControls,
    hasAuthAdjacentAc,
    explanationLength,
    explanationLengthOk,
    mentionsAc2IaDistinction,
    percentage,
    passed,
    findingState,
    strengths,
    gaps,
    feedback,
  };
}
