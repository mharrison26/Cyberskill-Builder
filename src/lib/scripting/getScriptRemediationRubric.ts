import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  formatRetrievedGuidance,
  retrieveFromGuidanceDocument,
  type GuidanceDocument,
  type GuidanceSection,
  type RetrievedGuidance,
} from '@/lib/grading/retrieveGuidance';

/**
 * F26-style retrieval for the pinned script-remediation quality rubric.
 * Graders must use retrieved section text only — not model memory of OS runbooks.
 */

export const SCRIPT_REMEDIATION_RUBRIC_PATH =
  'data/scripting/script-remediation-rubric.json';

export type ScriptRemediationRubricSection = GuidanceSection;
export type RetrievedScriptRemediationRubric = RetrievedGuidance & {
  disclaimer: string | null;
};

let cachedDocument: (GuidanceDocument & { disclaimer?: string }) | null = null;

function loadRubricDocument(): GuidanceDocument & { disclaimer?: string } {
  if (cachedDocument) {
    return cachedDocument;
  }

  const filePath = path.join(process.cwd(), SCRIPT_REMEDIATION_RUBRIC_PATH);
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as GuidanceDocument & { disclaimer?: string };

  if (!parsed?.sections || !Array.isArray(parsed.sections)) {
    throw new Error(
      `Invalid script remediation rubric file: ${SCRIPT_REMEDIATION_RUBRIC_PATH}`
    );
  }

  cachedDocument = parsed;
  return cachedDocument;
}

/** Reset cached document (tests only). */
export function resetScriptRemediationRubricCacheForTests(): void {
  cachedDocument = null;
}

/** Core criteria — always pinned for anti-hallucination grading. */
export const DEFAULT_SCRIPT_REMEDIATION_RUBRIC_SECTION_IDS = [
  'targeted-fix',
  'side-effects',
  'idempotent-verify',
  'clarity-ops',
] as const;

/**
 * Retrieve pinned script-remediation rubric sections for a student script.
 * Defaults to requiring all four criteria so the full rubric is pinned.
 */
export function retrieveScriptRemediationRubric(
  query: string,
  options?: {
    topK?: number;
    requiredSectionIds?: string[];
  }
): RetrievedScriptRemediationRubric {
  const doc = loadRubricDocument();
  const retrieved = retrieveFromGuidanceDocument(
    doc,
    SCRIPT_REMEDIATION_RUBRIC_PATH,
    query,
    {
      topK: options?.topK ?? 4,
      requiredSectionIds: options?.requiredSectionIds ?? [
        ...DEFAULT_SCRIPT_REMEDIATION_RUBRIC_SECTION_IDS,
      ],
    }
  );

  return {
    ...retrieved,
    disclaimer:
      typeof doc.disclaimer === 'string' && doc.disclaimer.trim()
        ? doc.disclaimer.trim()
        : null,
  };
}

export function formatRetrievedScriptRemediationRubric(
  retrieved: RetrievedScriptRemediationRubric
): string {
  return formatRetrievedGuidance(retrieved);
}

export function listScriptRemediationRubricSections(): ScriptRemediationRubricSection[] {
  return loadRubricDocument().sections.map((section) => ({ ...section }));
}
