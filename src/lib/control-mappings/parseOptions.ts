import { normalizeControlId } from '@/lib/control-mappings/normalize';
import type { ControlMappingOption } from '@/lib/control-mappings/types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normalize candidate options from ticket initial_state.
 * Accepts plain strings or `{ id|controlId, label?, rationale?, controlId? }`.
 */
export function parseControlMappingOptions(
  raw: unknown
): ControlMappingOption[] {
  if (!Array.isArray(raw)) return [];

  const options: ControlMappingOption[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (typeof entry === 'string' && entry.trim()) {
      const id = normalizeControlId(entry);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      options.push({ id });
      continue;
    }

    if (!isPlainObject(entry)) continue;
    const idRaw =
      typeof entry.id === 'string' && entry.id.trim()
        ? entry.id
        : typeof entry.controlId === 'string' && entry.controlId.trim()
          ? entry.controlId
          : typeof entry.control_id === 'string'
            ? entry.control_id
            : '';
    if (!idRaw.trim()) continue;
    const id = normalizeControlId(idRaw);
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const rationale =
      typeof entry.rationale === 'string' && entry.rationale.trim()
        ? entry.rationale.trim()
        : typeof entry.explanation === 'string' && entry.explanation.trim()
          ? entry.explanation.trim()
          : undefined;

    const controlId =
      typeof entry.controlId === 'string' && entry.controlId.trim()
        ? normalizeControlId(entry.controlId)
        : typeof entry.control_id === 'string' && entry.control_id.trim()
          ? normalizeControlId(entry.control_id)
          : undefined;

    options.push({
      id,
      label:
        typeof entry.label === 'string' && entry.label.trim()
          ? entry.label.trim()
          : undefined,
      rationale,
      controlId,
    });
  }

  return options;
}

export function controlMappingOptionIds(
  options: Array<string | ControlMappingOption> | undefined
): string[] {
  if (!options || options.length === 0) return [];
  return parseControlMappingOptions(options).map((o) => o.id);
}

export function controlMappingOptionMetaMap(
  options: Array<string | ControlMappingOption> | undefined
): Map<string, ControlMappingOption> {
  const map = new Map<string, ControlMappingOption>();
  for (const option of parseControlMappingOptions(options)) {
    map.set(option.id, option);
  }
  return map;
}
