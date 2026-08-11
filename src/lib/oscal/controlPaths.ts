import { normalizeControlId } from '@/lib/oscal/parseCatalog';

/** Canonical public URL segment for a control (lowercase OSCAL id). */
export function controlDetailPath(controlId: string): string {
  return `/catalog/${normalizeControlId(controlId)}`;
}
