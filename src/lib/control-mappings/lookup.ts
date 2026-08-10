import { createClient } from '@/lib/supabase/server';
import { normalizeControlId } from '@/lib/control-mappings/normalize';
import type {
  ControlFramework,
  ControlMappingRow,
} from '@/lib/control-mappings/types';

export type ControlMappingLookup = {
  listTargets(
    sourceFramework: ControlFramework,
    sourceControlId: string,
    targetFramework: ControlFramework
  ): Promise<string[]>;
  /** Full mapping rows (includes confidence) for RAG grounding. */
  listMappings(
    sourceFramework: ControlFramework,
    sourceControlId: string,
    targetFramework: ControlFramework
  ): Promise<ControlMappingRow[]>;
};

async function fetchMappingRows(
  sourceFramework: ControlFramework,
  sourceControlId: string,
  targetFramework: ControlFramework
): Promise<ControlMappingRow[]> {
  const supabase = await createClient();
  const needle = normalizeControlId(sourceControlId);

  // Use eq (not ilike): SQL LIKE treats "_" as a wildcard, which breaks
  // NIST ids like AC-2. Seeded control ids are stored in normalized form.
  const { data, error } = await supabase
    .from('control_mappings')
    .select(
      'source_framework, source_control_id, target_framework, target_control_id, mapping_confidence'
    )
    .eq('source_framework', sourceFramework)
    .eq('target_framework', targetFramework)
    .eq('source_control_id', needle);

  if (error) {
    throw new Error(`control_mappings lookup failed: ${error.message}`);
  }

  return ((data ?? []) as ControlMappingRow[]).map((row) => ({
    ...row,
    source_control_id: normalizeControlId(row.source_control_id),
    target_control_id: normalizeControlId(row.target_control_id),
  }));
}

/**
 * Supabase-backed lookup against public.control_mappings.
 * Comparison is case-insensitive on control IDs.
 */
export function createSupabaseControlMappingLookup(): ControlMappingLookup {
  return {
    async listTargets(sourceFramework, sourceControlId, targetFramework) {
      const rows = await fetchMappingRows(
        sourceFramework,
        sourceControlId,
        targetFramework
      );
      const ids = new Set<string>();
      for (const row of rows) {
        ids.add(row.target_control_id);
      }
      return Array.from(ids).sort();
    },
    async listMappings(sourceFramework, sourceControlId, targetFramework) {
      const rows = await fetchMappingRows(
        sourceFramework,
        sourceControlId,
        targetFramework
      );
      return rows.sort((a, b) =>
        a.target_control_id.localeCompare(b.target_control_id)
      );
    },
  };
}

/** In-memory lookup for unit tests. */
export function createMemoryControlMappingLookup(
  rows: ControlMappingRow[]
): ControlMappingLookup {
  function matchingRows(
    sourceFramework: ControlFramework,
    sourceControlId: string,
    targetFramework: ControlFramework
  ): ControlMappingRow[] {
    const needle = normalizeControlId(sourceControlId);
    return rows
      .filter(
        (row) =>
          row.source_framework === sourceFramework &&
          row.target_framework === targetFramework &&
          normalizeControlId(row.source_control_id) === needle
      )
      .map((row) => ({
        ...row,
        source_control_id: normalizeControlId(row.source_control_id),
        target_control_id: normalizeControlId(row.target_control_id),
      }))
      .sort((a, b) => a.target_control_id.localeCompare(b.target_control_id));
  }

  return {
    async listTargets(sourceFramework, sourceControlId, targetFramework) {
      const ids = new Set<string>();
      for (const row of matchingRows(
        sourceFramework,
        sourceControlId,
        targetFramework
      )) {
        ids.add(row.target_control_id);
      }
      return Array.from(ids).sort();
    },
    async listMappings(sourceFramework, sourceControlId, targetFramework) {
      return matchingRows(sourceFramework, sourceControlId, targetFramework);
    },
  };
}
