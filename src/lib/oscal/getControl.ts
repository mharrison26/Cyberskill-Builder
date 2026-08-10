import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  normalizeControlId,
  parseOscalCatalog,
  type AssessmentMethodsText,
  type OscalCatalogDocument,
} from '@/lib/oscal/parseCatalog';

/**
 * Pinned NIST SP 800-53 Rev 5 OSCAL catalog (usnistgov/oscal-content).
 * Rev 5 embeds the SP 800-53A assessment layer as separate OSCAL parts
 * (`assessment-objective`, `assessment-method`) alongside control statements —
 * NIST does not publish a separate 53A JSON catalog for rev5.
 */
export const OSCAL_CATALOG_PATH = 'data/oscal/NIST_SP-800-53_rev5_catalog.json';

export type ControlText = {
  controlId: string;
  title: string;
  family: string;
  /** SP 800-53 control statement prose (catalog statement parts). */
  statement: string;
  /**
   * SP 800-53A assessment-objective prose from the OSCAL assessment layer
   * (distinct from the control statement).
   */
  assessmentObjective: string;
  /** SP 800-53A Examine / Interview / Test assessment-method object lists. */
  assessmentMethods: AssessmentMethodsText;
};

/**
 * Focused SP 800-53A retrieval payload for assessment-procedure grading (F25/F26).
 * Contains assessment-objective + method text only — not the 53 control statement.
 */
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
 * Returns the SP 800-53 control statement and the SP 800-53A assessment
 * layer (`assessmentObjective` / `assessmentMethods`) for the same control id.
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
 * List control IDs from the pinned OSCAL catalog whose OSCAL id starts with
 * `{familyPrefix}-` (e.g. "ia" → ia-1, ia-2, ia-5.1, …).
 */
export function listControlIdsByFamilyPrefix(
  familyPrefix: string,
  options?: { baseOnly?: boolean }
): string[] {
  const prefix = familyPrefix.trim().toLowerCase().replace(/-+$/, '');
  if (!prefix) return [];

  const needle = `${prefix}-`;
  const ids = new Set<string>();

  Array.from(loadControlIndex().values()).forEach((entry) => {
    // Prefer OSCAL id (dot enhancements) then normalize label forms like IA-5(1).
    const id = normalizeControlId(entry.oscalId || entry.controlId);
    if (!id.startsWith(needle)) return;
    if (options?.baseOnly && !new RegExp(`^${prefix}-\\d+$`).test(id)) {
      return;
    }
    ids.add(id);
  });

  return Array.from(ids).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
}

/**
 * Retrieve live SP 800-53A assessment-objective + method text for a control ID.
 * Assessment-procedure graders must use this payload (not `statement`) so
 * scoring is against 53A objectives specifically, not the 53 control statement.
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
