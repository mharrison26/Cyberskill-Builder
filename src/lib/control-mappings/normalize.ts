/**
 * Normalize a control ID for set comparison.
 * Case-insensitive; collapses internal whitespace; preserves punctuation
 * used by NIST (AC-2), SOC 2 (CC6.1), and ISO (A.5.15).
 */
export function normalizeControlId(raw: string): string {
  return raw.trim().replace(/\s+/g, '').toUpperCase();
}

/** Deduplicate while preserving first-seen order after normalization. */
export function normalizeControlIdList(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of ids) {
    if (typeof value !== 'string') continue;
    const normalized = normalizeControlId(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}
