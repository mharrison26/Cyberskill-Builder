import { getControlText } from '@/lib/oscal/getControl';

import type { ControlLinkRef } from '@/lib/feedback/types';

const DEFAULT_CATALOG_BASE = '/tracks/grc/catalog';

function excerptStatement(statement: string, maxLen = 220): string {
  const cleaned = statement.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen - 1).trimEnd()}…`;
}

/**
 * Build a Control Catalog deep link that pre-fills search for the control ID.
 */
export function controlCatalogHref(
  controlId: string,
  catalogBase: string = DEFAULT_CATALOG_BASE
): string {
  const id = controlId.trim();
  if (!id) return catalogBase;
  const params = new URLSearchParams({ q: id });
  return `${catalogBase}?${params.toString()}`;
}

/**
 * Resolve NIST SP 800-53 control text for inline feedback.
 * Non-NIST IDs (SOC 2 / ISO) return a lightweight link without statement text.
 */
export function resolveControlLink(
  controlId: string | null | undefined,
  options?: { catalogBase?: string; titleFallback?: string }
): ControlLinkRef | undefined {
  const id = typeof controlId === 'string' ? controlId.trim() : '';
  if (!id) return undefined;

  const catalogHref = controlCatalogHref(id, options?.catalogBase);

  try {
    const control = getControlText(id);
    return {
      controlId: control.controlId,
      title: control.title,
      statementExcerpt: excerptStatement(control.statement),
      catalogHref,
    };
  } catch {
    return {
      controlId: id,
      title: options?.titleFallback?.trim() || id,
      statementExcerpt: '',
      catalogHref,
    };
  }
}

/** Pull a control id from gap labels like "Missing AC-6 (Least Privilege)". */
export function extractControlIdFromText(text: string): string | null {
  const match = text.match(/\b([A-Z]{2}-\d+(?:\.\d+)?(?:\(\d+\))?)\b/i);
  return match?.[1]?.toUpperCase() ?? null;
}
