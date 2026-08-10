import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  formatRetrievedGuidance,
  retrieveFromGuidanceDocument,
  type GuidanceDocument,
  type RetrievedGuidance,
} from '@/lib/grading/retrieveGuidance';

/**
 * F26-style retrieval for pinned board-communication rubric guidance.
 * Graders must use retrieved section text only.
 */

export const BOARD_COMMUNICATION_GUIDANCE_PATH =
  'data/grc/board-communication-rubric.json';

export type BoardCommunicationGuidanceSection =
  GuidanceDocument['sections'][number];
export type BoardCommunicationGuidanceDocument = GuidanceDocument;
export type RetrievedBoardCommunicationGuidance = RetrievedGuidance;

let cachedDocument: GuidanceDocument | null = null;

function loadGuidanceDocument(): GuidanceDocument {
  if (cachedDocument) {
    return cachedDocument;
  }

  const filePath = path.join(process.cwd(), BOARD_COMMUNICATION_GUIDANCE_PATH);
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as GuidanceDocument;

  if (!parsed?.sections || !Array.isArray(parsed.sections)) {
    throw new Error(
      `Invalid board communication guidance file: ${BOARD_COMMUNICATION_GUIDANCE_PATH}`
    );
  }

  cachedDocument = parsed;
  return cachedDocument;
}

/** Reset cached document (tests only). */
export function resetBoardCommunicationGuidanceCacheForTests(): void {
  cachedDocument = null;
}

const DEFAULT_CORE_SECTION_IDS = [
  'plain-language',
  'business-impact',
  'clear-ask',
  'avoid-control-dump',
] as const;

/**
 * Retrieve pinned board-communication rubric sections for grading a summary.
 * Always includes plain language / business impact / clear ask / avoid dump,
 * then tops up with keyword-ranked sections from the query.
 */
export function retrieveBoardCommunicationGuidance(
  query: string,
  options?: {
    topK?: number;
    requiredSectionIds?: string[];
  }
): RetrievedBoardCommunicationGuidance {
  const doc = loadGuidanceDocument();
  return retrieveFromGuidanceDocument(
    doc,
    BOARD_COMMUNICATION_GUIDANCE_PATH,
    query,
    {
      topK: options?.topK ?? 5,
      requiredSectionIds: options?.requiredSectionIds ?? [
        ...DEFAULT_CORE_SECTION_IDS,
      ],
    }
  );
}

export function formatRetrievedBoardCommunicationGuidance(
  retrieved: RetrievedBoardCommunicationGuidance
): string {
  return formatRetrievedGuidance(retrieved);
}

export function listBoardCommunicationGuidanceSections(): BoardCommunicationGuidanceSection[] {
  return loadGuidanceDocument().sections.map((section) => ({ ...section }));
}
