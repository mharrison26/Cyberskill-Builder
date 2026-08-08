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
 * F26-style retrieval for the pinned incident-report quality rubric.
 * Graders must use retrieved section text only — not model memory of IR frameworks.
 */

export const INCIDENT_REPORT_RUBRIC_PATH =
  'data/incident/incident-report-quality-rubric.json';

export type IncidentReportRubricSection = GuidanceSection;
export type RetrievedIncidentReportRubric = RetrievedGuidance & {
  disclaimer: string | null;
};

let cachedDocument: (GuidanceDocument & { disclaimer?: string }) | null = null;

function loadRubricDocument(): GuidanceDocument & { disclaimer?: string } {
  if (cachedDocument) {
    return cachedDocument;
  }

  const filePath = path.join(process.cwd(), INCIDENT_REPORT_RUBRIC_PATH);
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as GuidanceDocument & { disclaimer?: string };

  if (!parsed?.sections || !Array.isArray(parsed.sections)) {
    throw new Error(
      `Invalid incident report rubric file: ${INCIDENT_REPORT_RUBRIC_PATH}`
    );
  }

  cachedDocument = parsed;
  return cachedDocument;
}

/** Reset cached document (tests only). */
export function resetIncidentReportRubricCacheForTests(): void {
  cachedDocument = null;
}

/** Core criteria — always pinned for anti-hallucination grading. */
export const DEFAULT_INCIDENT_REPORT_RUBRIC_SECTION_IDS = [
  'timeline',
  'root-cause',
  'remediation',
  'prevention',
] as const;

/**
 * Retrieve pinned incident-report rubric sections for a student report.
 * Defaults to requiring all four criteria so the full rubric is pinned.
 */
export function retrieveIncidentReportRubric(
  query: string,
  options?: {
    topK?: number;
    requiredSectionIds?: string[];
  }
): RetrievedIncidentReportRubric {
  const doc = loadRubricDocument();
  const retrieved = retrieveFromGuidanceDocument(
    doc,
    INCIDENT_REPORT_RUBRIC_PATH,
    query,
    {
      topK: options?.topK ?? 4,
      requiredSectionIds: options?.requiredSectionIds ?? [
        ...DEFAULT_INCIDENT_REPORT_RUBRIC_SECTION_IDS,
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

export function formatRetrievedIncidentReportRubric(
  retrieved: RetrievedIncidentReportRubric
): string {
  return formatRetrievedGuidance(retrieved);
}

export function listIncidentReportRubricSections(): IncidentReportRubricSection[] {
  return loadRubricDocument().sections.map((section) => ({ ...section }));
}
