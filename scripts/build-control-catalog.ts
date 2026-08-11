/**
 * Build a processed NIST SP 800-53 Rev 5 control catalog index from the pinned
 * OSCAL catalog + SP 800-53B Low/Moderate/High baseline profiles.
 *
 * Usage: npx tsx scripts/build-control-catalog.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  normalizeControlId,
  parseOscalCatalog,
  type OscalCatalogDocument,
} from '../src/lib/oscal/parseCatalog';
import {
  CONTROL_CATALOG_PATH,
  OSCAL_BASELINE_PROFILE_PATHS,
  type ControlBaseline,
  type ProcessedControlCatalog,
  type ProcessedControlEntry,
} from '../src/lib/oscal/controlCatalogTypes';
import { OSCAL_CATALOG_PATH } from '../src/lib/oscal/getControl';

type OscalProfileDocument = {
  profile?: {
    imports?: Array<{
      'include-controls'?: Array<{ 'with-ids'?: string[] }>;
    }>;
  };
};

type OscalControlNode = {
  id: string;
  props?: Array<{ name: string; value: string; class?: string }>;
  controls?: OscalControlNode[];
};

type OscalCatalogWithNodes = {
  catalog: {
    metadata?: { title?: string; version?: string };
    groups?: Array<{ controls?: OscalControlNode[] }>;
  };
};

function loadBaselineIds(profilePath: string): Set<string> {
  const absolute = path.join(process.cwd(), profilePath);
  const ids = new Set<string>();
  if (!existsSync(absolute)) {
    console.warn(
      `[build-control-catalog] missing baseline profile: ${profilePath}`
    );
    return ids;
  }

  const raw = JSON.parse(
    readFileSync(absolute, 'utf8')
  ) as OscalProfileDocument;

  for (const imp of raw.profile?.imports ?? []) {
    for (const include of imp['include-controls'] ?? []) {
      for (const id of include['with-ids'] ?? []) {
        ids.add(normalizeControlId(id));
      }
    }
  }

  return ids;
}

function collectWithdrawnAndParents(raw: OscalCatalogWithNodes): {
  withdrawn: Set<string>;
  parentById: Map<string, string | null>;
  enhancementIdsById: Map<string, string[]>;
} {
  const withdrawn = new Set<string>();
  const parentById = new Map<string, string | null>();
  const enhancementIdsById = new Map<string, string[]>();

  function walk(control: OscalControlNode, parentId: string | null): void {
    parentById.set(control.id, parentId);
    enhancementIdsById.set(
      control.id,
      (control.controls ?? []).map((child) => child.id)
    );

    const status = control.props?.find((p) => p.name === 'status')?.value;
    if (status?.toLowerCase() === 'withdrawn') {
      withdrawn.add(control.id);
    }

    for (const child of control.controls ?? []) {
      walk(child, control.id);
    }
  }

  for (const group of raw.catalog.groups ?? []) {
    for (const control of group.controls ?? []) {
      walk(control, null);
    }
  }

  return { withdrawn, parentById, enhancementIdsById };
}

function main(): void {
  const catalogPath = path.join(process.cwd(), OSCAL_CATALOG_PATH);
  const rawText = readFileSync(catalogPath, 'utf8');
  const document = JSON.parse(rawText) as OscalCatalogDocument &
    OscalCatalogWithNodes;
  const parsed = parseOscalCatalog(document);
  const { withdrawn, parentById, enhancementIdsById } =
    collectWithdrawnAndParents(document);

  const baselineSets: Record<ControlBaseline, Set<string>> = {
    low: loadBaselineIds(OSCAL_BASELINE_PROFILE_PATHS.low),
    moderate: loadBaselineIds(OSCAL_BASELINE_PROFILE_PATHS.moderate),
    high: loadBaselineIds(OSCAL_BASELINE_PROFILE_PATHS.high),
  };

  const controls: ProcessedControlEntry[] = parsed.map((entry) => {
    const normalized = normalizeControlId(entry.id);
    const baselines: ControlBaseline[] = (
      ['low', 'moderate', 'high'] as const
    ).filter((b) => baselineSets[b].has(normalized));

    return {
      id: entry.id,
      control_id: entry.control_id,
      title: entry.title,
      family: entry.family,
      statement: entry.statement,
      baselines,
      withdrawn: withdrawn.has(entry.id),
      parent_id: parentById.get(entry.id) ?? null,
      enhancement_ids: enhancementIdsById.get(entry.id) ?? [],
    };
  });

  const output: ProcessedControlCatalog = {
    source: {
      catalog: OSCAL_CATALOG_PATH,
      version: document.catalog.metadata?.version ?? 'unknown',
      title: document.catalog.metadata?.title ?? 'NIST SP 800-53',
      baselines: [
        OSCAL_BASELINE_PROFILE_PATHS.low,
        OSCAL_BASELINE_PROFILE_PATHS.moderate,
        OSCAL_BASELINE_PROFILE_PATHS.high,
      ],
    },
    families: Array.from(new Set(controls.map((c) => c.family))).sort((a, b) =>
      a.localeCompare(b)
    ),
    controls,
  };

  const outPath = path.join(process.cwd(), CONTROL_CATALOG_PATH);
  writeFileSync(outPath, `${JSON.stringify(output)}\n`, 'utf8');

  console.log(
    `Wrote ${controls.length} controls → ${CONTROL_CATALOG_PATH} ` +
      `(low=${baselineSets.low.size}, moderate=${baselineSets.moderate.size}, high=${baselineSets.high.size})`
  );
}

main();
