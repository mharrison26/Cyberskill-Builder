/** Max bytes for reading file content during sensitive-marking scans. */
export const SENSITIVE_CONTENT_SCAN_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Markings commonly associated with CUI, classified, or export-controlled material.
 * Patterns are case-insensitive; some allow flexible whitespace.
 */
export const SENSITIVE_MARKING_PATTERNS: RegExp[] = [
  /\bCUI\s*\/\//i,
  /\bCUI\s*\/\s*SP-/i,
  /\bCONTROLLED\s+UNCLASSIFIED\s+INFORMATION\b/i,
  /\bSECRET\s*\/\//i,
  /\bTOP\s+SECRET\b/i,
  /\bCONFIDENTIAL\b/i,
  /\bITAR\b/i,
  /\bNOFORN\b/i,
  /\bPROPIN\b/i,
  /\bREL\s+TO\b/i,
  /\bFOUO\b/i,
  /\bSBU\b/i,
  /\bLIMDIS\b/i,
];

export const TEXT_SCAN_EXTENSIONS = new Set([
  'txt',
  'md',
  'csv',
  'json',
  'xml',
  'html',
  'htm',
  'log',
  'yaml',
  'yml',
  'rtf',
  'tsv',
]);

export const TEXT_SCAN_MIME_PREFIXES = ['text/'] as const;

export const TEXT_SCAN_MIME_TYPES = new Set([
  'application/json',
  'application/xml',
  'application/yaml',
  'application/x-yaml',
]);

export const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const UPLOAD_REJECTION_MESSAGE =
  'Upload rejected: the file name or contents appear to contain CUI, classified, or export-controlled markings. This training environment accepts only synthetic or publicly available materials.';
