import { readFileSync } from 'node:fs';
import path from 'node:path';

import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

/** Vendored NIST OSCAL JSON Schemas (v1.1.2) under data/oscal/. */
export const OSCAL_SCHEMA_PATHS = {
  ssp: 'data/oscal/oscal_ssp_schema.json',
  'assessment-results': 'data/oscal/oscal_assessment-results_schema.json',
} as const;

export type OscalDocumentKind = keyof typeof OSCAL_SCHEMA_PATHS;

export type OscalSchemaError = {
  instancePath: string;
  schemaPath: string;
  message: string;
  keyword?: string;
};

export type OscalValidationResult =
  | { valid: true; errors: []; kind: OscalDocumentKind }
  | { valid: false; errors: OscalSchemaError[]; kind: OscalDocumentKind };

const validatorCache = new Map<OscalDocumentKind, ValidateFunction>();

function loadSchema(kind: OscalDocumentKind): Record<string, unknown> {
  const schemaPath = path.join(process.cwd(), OSCAL_SCHEMA_PATHS[kind]);
  const raw = readFileSync(schemaPath, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function getValidator(kind: OscalDocumentKind): ValidateFunction {
  const cached = validatorCache.get(kind);
  if (cached) return cached;

  // NIST OSCAL schemas declare JSON Schema draft-07.
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    validateFormats: true,
  });
  addFormats(ajv);
  const validate = ajv.compile(loadSchema(kind));
  validatorCache.set(kind, validate);
  return validate;
}

function formatError(error: ErrorObject): OscalSchemaError {
  const instancePath = error.instancePath || '/';
  const message = error.message ?? 'Failed schema constraint';
  return {
    instancePath,
    schemaPath: error.schemaPath,
    message,
    keyword: error.keyword,
  };
}

/** Detect root OSCAL document kind from a parsed JSON object. */
export function detectOscalDocumentKind(
  document: unknown
): OscalDocumentKind | null {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return null;
  }
  const obj = document as Record<string, unknown>;
  if ('system-security-plan' in obj) return 'ssp';
  if ('assessment-results' in obj) return 'assessment-results';
  return null;
}

/** Validate an OSCAL document against the matching vendored NIST JSON Schema. */
export function validateOscalDocument(
  document: unknown,
  kind: OscalDocumentKind
): OscalValidationResult {
  const validate = getValidator(kind);
  const ok = validate(document);
  if (ok) {
    return { valid: true, errors: [], kind };
  }

  const errors = (validate.errors ?? []).map(formatError);
  return { valid: false, errors, kind };
}

/**
 * Infer document kind (or use `preferred`) and validate.
 * When `preferred` is `'either'`, kind is detected from the document root.
 */
export function validateOscal(
  document: unknown,
  preferred: OscalDocumentKind | 'either' = 'either'
):
  | OscalValidationResult
  | { valid: false; errors: OscalSchemaError[]; kind: null } {
  const kind =
    preferred === 'either' ? detectOscalDocumentKind(document) : preferred;

  if (!kind) {
    return {
      valid: false,
      kind: null,
      errors: [
        {
          instancePath: '/',
          schemaPath: '',
          message:
            'Document must be an OSCAL SSP (system-security-plan) or Assessment Results (assessment-results) root object.',
        },
      ],
    };
  }

  return validateOscalDocument(document, kind);
}

/** Human-readable multi-line feedback for ticket scoring / UI. */
export function formatOscalSchemaErrors(errors: OscalSchemaError[]): string {
  if (errors.length === 0) return '';
  const lines = errors.slice(0, 12).map((error, index) => {
    const pathLabel = error.instancePath === '' ? '/' : error.instancePath;
    return `${index + 1}. ${pathLabel}: ${error.message}`;
  });
  const remaining = errors.length - lines.length;
  if (remaining > 0) {
    lines.push(`…and ${remaining} more schema error(s).`);
  }
  return lines.join('\n');
}

/** Test helper — clears compiled Ajv validator caches. */
export function resetOscalValidatorCache(): void {
  validatorCache.clear();
}
