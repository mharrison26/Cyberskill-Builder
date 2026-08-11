import { normalizeControlId } from '@/lib/oscal/parseCatalog';

/**
 * Matches SP 800-53 style IDs: AC-2, ac-2, IA-5(1), ia-5.1.
 * Trailing `(?![\\w(])` forces IA-5(1) to consume the parenthetical enhancement
 * (a bare `\\b` after `)` fails because `)` is already a non-word character).
 */
const CONTROL_ID_PATTERN =
  /\b([A-Za-z]{2,4})-(\d{1,3})(?:\.(\d{1,3})|\((\d{1,3})\))?(?![\w(])/g;

const CONTROL_KEY_HINTS = new Set([
  'controlid',
  'control_id',
  'controlids',
  'control_ids',
  'source_control_id',
  'sourcecontrolid',
  'target_control_id',
  'targetcontrolid',
  'iacontrols',
]);

function looksLikeControlId(value: string): boolean {
  const normalized = normalizeControlId(value);
  return /^[a-z]{2,4}-\d+(?:\.\d+)?$/.test(normalized);
}

function addId(ids: Set<string>, raw: string): void {
  const trimmed = raw.trim();
  if (!trimmed || !looksLikeControlId(trimmed)) return;
  ids.add(normalizeControlId(trimmed));
}

function extractFromString(text: string, ids: Set<string>): void {
  CONTROL_ID_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CONTROL_ID_PATTERN.exec(text)) !== null) {
    const [, family, base, dotEnh, parenEnh] = match;
    if (!family || !base) continue;
    const enh = dotEnh ?? parenEnh;
    const candidate = enh ? `${family}-${base}.${enh}` : `${family}-${base}`;
    addId(ids, candidate);
  }
}

function walk(value: unknown, ids: Set<string>, keyHint?: string): void {
  if (value == null) return;

  if (typeof value === 'string') {
    if (keyHint && CONTROL_KEY_HINTS.has(keyHint)) {
      addId(ids, value);
    }
    extractFromString(value, ids);
    return;
  }

  if (typeof value === 'number' || typeof value === 'boolean') return;

  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, ids, keyHint);
    }
    return;
  }

  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = key.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
      walk(child, ids, normalizedKey);
    }
  }
}

/**
 * Collect normalized NIST SP 800-53 control IDs referenced by structured
 * ticket/lesson payloads and free-text scenario prose.
 */
export function extractControlRefs(...sources: unknown[]): string[] {
  const ids = new Set<string>();
  for (const source of sources) {
    walk(source, ids);
  }
  return Array.from(ids).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
}

export function referencesControl(
  controlId: string,
  ...sources: unknown[]
): boolean {
  const target = normalizeControlId(controlId);
  return extractControlRefs(...sources).includes(target);
}
