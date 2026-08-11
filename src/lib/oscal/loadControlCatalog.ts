import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  CONTROL_CATALOG_PATH,
  type ProcessedControlCatalog,
  type ProcessedControlEntry,
} from '@/lib/oscal/controlCatalogTypes';
import { normalizeControlId } from '@/lib/oscal/parseCatalog';

export {
  formatBaselineLabel,
} from '@/lib/oscal/controlCatalogTypes';
export { controlDetailPath } from '@/lib/oscal/controlPaths';

const EMPTY_CATALOG: ProcessedControlCatalog = {
  source: {
    catalog: CONTROL_CATALOG_PATH,
    version: 'unavailable',
    title: 'Control catalog unavailable',
    baselines: [],
  },
  families: [],
  controls: [],
};

let cachedCatalog: ProcessedControlCatalog | null = null;
let cachedLookup: Map<string, ProcessedControlEntry> | null = null;

export function loadProcessedControlCatalog(): ProcessedControlCatalog {
  if (cachedCatalog) return cachedCatalog;

  try {
    const filePath = path.join(process.cwd(), CONTROL_CATALOG_PATH);
    const raw = readFileSync(filePath, 'utf8');
    cachedCatalog = JSON.parse(raw) as ProcessedControlCatalog;
    return cachedCatalog;
  } catch (error) {
    // Missing at deploy (file not traced / not committed) must not take down
    // every ticket workbench that resolves control refs for the rail.
    console.error('[control-catalog] failed to load processed catalog:', error);
    cachedCatalog = EMPTY_CATALOG;
    return cachedCatalog;
  }
}

/** Reset caches (tests only). */
export function resetProcessedCatalogCacheForTests(): void {
  cachedCatalog = null;
  cachedLookup = null;
}

function buildLookup(): Map<string, ProcessedControlEntry> {
  if (cachedLookup) return cachedLookup;

  const catalog = loadProcessedControlCatalog();
  cachedLookup = new Map();

  for (const entry of catalog.controls) {
    if (!entry?.id || !entry.control_id) continue;
    cachedLookup.set(entry.id, entry);
    cachedLookup.set(normalizeControlId(entry.id), entry);
    cachedLookup.set(normalizeControlId(entry.control_id), entry);
    cachedLookup.set(entry.control_id.toLowerCase(), entry);
  }

  return cachedLookup;
}

export function getProcessedControl(
  controlId: string | null | undefined
): ProcessedControlEntry | null {
  if (typeof controlId !== 'string' || !controlId.trim()) return null;
  const lookup = buildLookup();
  const key = normalizeControlId(controlId);
  return (
    lookup.get(key) ?? lookup.get(controlId.trim().toLowerCase()) ?? null
  );
}

export function listProcessedControls(): ProcessedControlEntry[] {
  return loadProcessedControlCatalog().controls;
}

export function listControlFamilies(): string[] {
  return loadProcessedControlCatalog().families;
}
