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
};

/**
 * Supabase-backed lookup against public.control_mappings.
 * Comparison is case-insensitive on control IDs.
 */
export function createSupabaseControlMappingLookup(): ControlMappingLookup {
  return {
    async listTargets(sourceFramework, sourceControlId, targetFramework) {
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

      const rows = (data ?? []) as ControlMappingRow[];
      const ids = new Set<string>();
      for (const row of rows) {
        ids.add(normalizeControlId(row.target_control_id));
      }
      return Array.from(ids).sort();
    },
  };
}

/** In-memory lookup for unit tests. */
export function createMemoryControlMappingLookup(
  rows: ControlMappingRow[]
): ControlMappingLookup {
  return {
    async listTargets(sourceFramework, sourceControlId, targetFramework) {
      const needle = normalizeControlId(sourceControlId);
      const ids = new Set<string>();
      for (const row of rows) {
        if (row.source_framework !== sourceFramework) continue;
        if (row.target_framework !== targetFramework) continue;
        if (normalizeControlId(row.source_control_id) !== needle) continue;
        ids.add(normalizeControlId(row.target_control_id));
      }
      return Array.from(ids).sort();
    },
  };
}
