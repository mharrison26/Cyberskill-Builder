import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  parseOscalCatalog,
  type AssessmentMethodsText,
  type OscalCatalogDocument,
} from '@/lib/oscal/parseCatalog';

export const OSCAL_CATALOG_PATH = 'data/oscal/NIST_SP-800-53_rev5_catalog.json';

export type ControlText = {
  controlId: string;
  title: string;
  family: string;
  statement: string;
  /** Live SP 800-53A assessment objective text from the OSCAL catalog. */
  assessmentObjective: string;
  /** Live SP 800-53A Examine / Interview / Test method object lists. */
  assessmentMethods: AssessmentMethodsText;
};

/** Focused SP 800-53A retrieval payload for assessment-procedure grading (F25/F26). */
export type AssessmentObjectiveText = {
  controlId: string;
  title: string;
  family: string;
  catalogPath: string;
  assessmentObjective: string;
  assessmentMethods: AssessmentMethodsText;
};

type ControlIndexEntry = ControlText & {
  oscalId: string;
};

let controlIndex: Map<string, ControlIndexEntry> | null = null;

function normalizeControlKey(controlId: string): string {
  return controlId.trim().toLowerCase();
}

function loadControlIndex(): Map<string, ControlIndexEntry> {
  if (controlIndex) {
    return controlIndex;
  }

  const catalogPath = path.join(process.cwd(), OSCAL_CATALOG_PATH);
  const raw = readFileSync(catalogPath, 'utf8');
  const document = JSON.parse(raw) as OscalCatalogDocument;
  const entries = parseOscalCatalog(document);

  controlIndex = new Map();

  for (const entry of entries) {
    const record: ControlIndexEntry = {
      oscalId: entry.id,
      controlId: entry.control_id,
      title: entry.title,
      family: entry.family,
      statement: entry.statement,
      assessmentObjective: entry.assessmentObjective,
      assessmentMethods: entry.assessmentMethods,
    };

    controlIndex.set(normalizeControlKey(entry.id), record);
    controlIndex.set(normalizeControlKey(entry.control_id), record);
  }

  return controlIndex;
}

/** Reset cached catalog index (tests only). */
export function resetControlIndexCacheForTests(): void {
  controlIndex = null;
}

function lookupControlEntry(controlId: string): ControlIndexEntry {
  const entry = loadControlIndex().get(normalizeControlKey(controlId));

  if (!entry) {
    throw new Error(`Control not found: ${controlId}`);
  }

  return entry;
}

/**
 * F25-style control text retrieval from the pinned OSCAL catalog.
 * Includes SP 800-53 control statement plus SP 800-53A assessment parts.
 */
export function getControlText(controlId: string): ControlText {
  const entry = lookupControlEntry(controlId);

  return {
    controlId: entry.controlId,
    title: entry.title,
    family: entry.family,
    statement: entry.statement,
    assessmentObjective: entry.assessmentObjective,
    assessmentMethods: {
      examine: entry.assessmentMethods.examine,
      interview: entry.assessmentMethods.interview,
      test: entry.assessmentMethods.test,
    },
  };
}

/**
 * Retrieve live SP 800-53A assessment objective + method text for a control ID.
 * Graders must use this retrieved text only — not model memory of 800-53A.
 */
export function getAssessmentObjectiveText(
  controlId: string
): AssessmentObjectiveText {
  const entry = lookupControlEntry(controlId);

  if (!entry.assessmentObjective.trim()) {
    throw new Error(
      `Assessment objective not found in catalog for control: ${controlId}`
    );
  }

  return {
    controlId: entry.controlId,
    title: entry.title,
    family: entry.family,
    catalogPath: OSCAL_CATALOG_PATH,
    assessmentObjective: entry.assessmentObjective,
    assessmentMethods: {
      examine: entry.assessmentMethods.examine,
      interview: entry.assessmentMethods.interview,
      test: entry.assessmentMethods.test,
    },
  };
}

export function formatAssessmentObjectiveText(
  assessment: AssessmentObjectiveText
): string {
  const methods = [
    ['Examine', assessment.assessmentMethods.examine],
    ['Interview', assessment.assessmentMethods.interview],
    ['Test', assessment.assessmentMethods.test],
  ] as const;

  const methodSections = methods
    .map(([label, prose]) => {
      const body = prose.trim() || '(No assessment objects listed in catalog.)';
      return `### ${label}\n\n${body}`;
    })
    .join('\n\n');

  return `### Assessment objectives — ${assessment.controlId} (${assessment.title})

${assessment.assessmentObjective.trim()}

### Potential assessment methods

${methodSections}`;
}
