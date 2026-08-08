/**
 * SSP-focused helpers over the shared OSCAL Ajv validator.
 * Prefer `@/lib/oscal/validateOscal` for multi-model validation.
 */

import {
  formatOscalSchemaErrors,
  resetOscalValidatorCache,
  validateOscalDocument,
  type OscalSchemaError,
} from '@/lib/oscal/validateOscal';

export const OSCAL_SSP_SCHEMA_PATH = 'data/oscal/oscal_ssp_schema.json';

export type SspSchemaError = OscalSchemaError;

export type SspValidationResult =
  { valid: true; errors: [] } | { valid: false; errors: SspSchemaError[] };

/** Validate an OSCAL SSP document against the vendored NIST SSP JSON Schema. */
export function validateOscalSsp(document: unknown): SspValidationResult {
  const result = validateOscalDocument(document, 'ssp');
  if (result.valid) {
    return { valid: true, errors: [] };
  }
  return { valid: false, errors: result.errors };
}

/** Human-readable multi-line feedback for ticket scoring. */
export function formatSspSchemaErrors(errors: SspSchemaError[]): string {
  return formatOscalSchemaErrors(errors);
}

/** Test helper — clears the shared Ajv validator cache. */
export function resetOscalSspValidatorCache(): void {
  resetOscalValidatorCache();
}
