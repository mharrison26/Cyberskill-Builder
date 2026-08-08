import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  formatRetrievedGuidance,
  retrieveFromGuidanceDocument,
  type GuidanceDocument,
  type RetrievedGuidance,
} from '@/lib/grading/retrieveGuidance';

/**
 * F26-style retrieval for the pinned backup / disaster recovery checklist.
 * Graders must use retrieved checklist section text only.
 */

export const BACKUP_DR_CHECKLIST_PATH =
  'data/backup/backup-dr-best-practices-checklist.json';

export type BackupDrChecklistSection = GuidanceDocument['sections'][number];
export type BackupDrChecklistDocument = GuidanceDocument;
export type RetrievedBackupDrChecklist = RetrievedGuidance;

let cachedDocument: GuidanceDocument | null = null;

function loadChecklistDocument(): GuidanceDocument {
  if (cachedDocument) {
    return cachedDocument;
  }

  const filePath = path.join(process.cwd(), BACKUP_DR_CHECKLIST_PATH);
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as GuidanceDocument;

  if (!parsed?.sections || !Array.isArray(parsed.sections)) {
    throw new Error(
      `Invalid backup/DR checklist file: ${BACKUP_DR_CHECKLIST_PATH}`
    );
  }

  cachedDocument = parsed;
  return cachedDocument;
}

/** Reset cached document (tests only). */
export function resetBackupDrChecklistCacheForTests(): void {
  cachedDocument = null;
}

const DEFAULT_CORE_SECTION_IDS = [
  'backup-frequency',
  'retention',
  'rpo-targets',
  'rto-targets',
  'restore-testing',
] as const;

/**
 * Retrieve pinned backup/DR checklist sections for a student plan.
 * Always includes core frequency / retention / RPO / RTO / restore-testing
 * sections, then tops up with keyword-ranked sections from the query.
 */
export function retrieveBackupDrChecklist(
  query: string,
  options?: {
    topK?: number;
    requiredSectionIds?: string[];
  }
): RetrievedBackupDrChecklist {
  const doc = loadChecklistDocument();
  return retrieveFromGuidanceDocument(doc, BACKUP_DR_CHECKLIST_PATH, query, {
    topK: options?.topK ?? 6,
    requiredSectionIds: options?.requiredSectionIds ?? [
      ...DEFAULT_CORE_SECTION_IDS,
    ],
  });
}

export function formatRetrievedBackupDrChecklist(
  retrieved: RetrievedBackupDrChecklist
): string {
  return formatRetrievedGuidance(retrieved);
}

export function listBackupDrChecklistSections(): BackupDrChecklistSection[] {
  return loadChecklistDocument().sections.map((section) => ({ ...section }));
}
