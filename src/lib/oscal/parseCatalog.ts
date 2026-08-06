export interface ControlCatalogEntry {
  /** Stable row key (OSCAL control id, e.g. "ac-1") */
  id: string;
  /** Display control identifier (e.g. "AC-1", "AC-2(1)") */
  control_id: string;
  title: string;
  family: string;
  statement: string;
}

type OscalProp = {
  name: string;
  value: string;
  class?: string;
};

type OscalPart = {
  name?: string;
  prose?: string;
  parts?: OscalPart[];
  props?: OscalProp[];
};

type OscalControl = {
  id: string;
  title: string;
  props?: OscalProp[];
  parts?: OscalPart[];
  controls?: OscalControl[];
};

type OscalGroup = {
  id: string;
  title: string;
  controls?: OscalControl[];
};

export type OscalCatalogDocument = {
  catalog: {
    groups?: OscalGroup[];
  };
};

function stripLeadingZeros(num: string): string {
  return num.replace(/^0+/, '') || '0';
}

/**
 * Normalize a control identifier to the OSCAL id form (e.g. "ia-5.1", "ac-2").
 * Accepts dot notation (ia-5.1), parenthetical (IA-5(1)), and zero-padded variants.
 */
export function normalizeControlId(input: string): string {
  const trimmed = input.trim().toLowerCase();

  const parenMatch = trimmed.match(/^([a-z]+)-(\d+)\((\d+)\)$/);
  if (parenMatch) {
    const [, family, base, enh] = parenMatch;
    return `${family}-${stripLeadingZeros(base)}.${stripLeadingZeros(enh)}`;
  }

  const dotMatch = trimmed.match(/^([a-z]+)-(\d+)\.(\d+)$/);
  if (dotMatch) {
    const [, family, base, enh] = dotMatch;
    return `${family}-${stripLeadingZeros(base)}.${stripLeadingZeros(enh)}`;
  }

  const baseMatch = trimmed.match(/^([a-z]+)-(\d+)$/);
  if (baseMatch) {
    const [, family, num] = baseMatch;
    return `${family}-${stripLeadingZeros(num)}`;
  }

  return trimmed;
}

export function getControlLabel(control: OscalControl): string {
  const labels = control.props?.filter((p) => p.name === 'label') ?? [];
  const standard = labels.find((p) => !p.class);
  if (standard) return standard.value;

  return control.id.toUpperCase();
}

function collectStatementLines(part: OscalPart, lines: string[]): void {
  if (part.prose) {
    const label = part.props?.find((p) => p.name === 'label')?.value;
    lines.push(label ? `${label} ${part.prose}` : part.prose);
  }

  for (const child of part.parts ?? []) {
    collectStatementLines(child, lines);
  }
}

export function extractStatement(control: OscalControl): string {
  const statementPart = control.parts?.find((p) => p.name === 'statement');
  if (!statementPart) return '';

  const lines: string[] = [];
  collectStatementLines(statementPart, lines);
  return lines.join('\n\n');
}

/**
 * Flatten a control and its enhancements into catalog rows.
 * Enhancements are included as separate rows so each is searchable independently.
 */
function appendControlRows(
  control: OscalControl,
  family: string,
  entries: ControlCatalogEntry[]
): void {
  entries.push({
    id: control.id,
    control_id: getControlLabel(control),
    title: control.title,
    family,
    statement: extractStatement(control),
  });

  for (const enhancement of control.controls ?? []) {
    appendControlRows(enhancement, family, entries);
  }
}

export function parseOscalCatalog(
  raw: OscalCatalogDocument
): ControlCatalogEntry[] {
  const entries: ControlCatalogEntry[] = [];

  for (const group of raw.catalog.groups ?? []) {
    const family = group.title;
    for (const control of group.controls ?? []) {
      appendControlRows(control, family, entries);
    }
  }

  return entries;
}

/** Build a case-insensitive lookup map keyed by normalized control ids and labels. */
export function buildControlLookup(
  entries: ControlCatalogEntry[]
): Map<string, ControlCatalogEntry> {
  const lookup = new Map<string, ControlCatalogEntry>();

  for (const entry of entries) {
    lookup.set(entry.id, entry);
    lookup.set(normalizeControlId(entry.id), entry);
    lookup.set(normalizeControlId(entry.control_id), entry);
  }

  return lookup;
}
