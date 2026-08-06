import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  parseOscalCatalog,
  type OscalCatalogDocument,
} from '@/lib/oscal/parseCatalog';

export const OSCAL_CATALOG_PATH = 'data/oscal/NIST_SP-800-53_rev5_catalog.json';

export type ControlText = {
  controlId: string;
  title: string;
  family: string;
  statement: string;
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
    };

    controlIndex.set(normalizeControlKey(entry.id), record);
    controlIndex.set(normalizeControlKey(entry.control_id), record);
  }

  return controlIndex;
}

export function getControlText(controlId: string): ControlText {
  const entry = loadControlIndex().get(normalizeControlKey(controlId));

  if (!entry) {
    throw new Error(`Control not found: ${controlId}`);
  }

  return {
    controlId: entry.controlId,
    title: entry.title,
    family: entry.family,
    statement: entry.statement,
  };
}
