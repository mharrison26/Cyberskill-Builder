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
 * F26-style retrieval for pinned POA&M / remediation guidance.
 * Graders must use retrieved section text only — not model memory of POA&M practice.
 */

export const POAM_GUIDANCE_PATH = 'data/nist/poam-remediation-guidance.json';

export type PoamGuidanceSection = GuidanceSection;
export type RetrievedPoamGuidance = RetrievedGuidance;

let cachedDocument: GuidanceDocument | null = null;

function loadGuidanceDocument(): GuidanceDocument {
  if (cachedDocument) {
    return cachedDocument;
  }

  const filePath = path.join(process.cwd(), POAM_GUIDANCE_PATH);
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as GuidanceDocument;

  if (!parsed?.sections || !Array.isArray(parsed.sections)) {
    throw new Error(`Invalid POA&M guidance file: ${POAM_GUIDANCE_PATH}`);
  }

  cachedDocument = parsed;
  return cachedDocument;
}

/** Reset cached document (tests only). */
export function resetPoamGuidanceCacheForTests(): void {
  cachedDocument = null;
}

export function getPoamGuidanceSection(sectionId: string): PoamGuidanceSection {
  const doc = loadGuidanceDocument();
  const key = sectionId.trim().toLowerCase();
  const section = doc.sections.find((entry) => entry.id.toLowerCase() === key);

  if (!section) {
    throw new Error(`POA&M guidance section not found: ${sectionId}`);
  }

  return section;
}

export function listPoamGuidanceSections(): PoamGuidanceSection[] {
  return loadGuidanceDocument().sections.map((section) => ({ ...section }));
}

const DEFAULT_CORE_SECTION_IDS = [
  'poam-purpose',
  'milestone-quality',
  'scheduled-completion',
] as const;

/**
 * Retrieve pinned POA&M guidance for a student remediation plan narrative.
 */
export function retrievePoamGuidance(
  query: string,
  options?: {
    topK?: number;
    requiredSectionIds?: string[];
  }
): RetrievedPoamGuidance {
  const doc = loadGuidanceDocument();
  return retrieveFromGuidanceDocument(doc, POAM_GUIDANCE_PATH, query, {
    topK: options?.topK ?? 4,
    requiredSectionIds: options?.requiredSectionIds ?? [
      ...DEFAULT_CORE_SECTION_IDS,
    ],
  });
}

export function formatRetrievedPoamGuidance(
  retrieved: RetrievedPoamGuidance
): string {
  return formatRetrievedGuidance(retrieved);
}
