import {
  IMAGE_MIME_TYPES,
  SENSITIVE_CONTENT_SCAN_MAX_BYTES,
  SENSITIVE_MARKING_PATTERNS,
  TEXT_SCAN_EXTENSIONS,
  TEXT_SCAN_MIME_PREFIXES,
  TEXT_SCAN_MIME_TYPES,
  UPLOAD_REJECTION_MESSAGE,
} from '@/lib/compliance/sensitivePatterns';

export type ScanUploadInput = {
  filename: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
};

export type ScanUploadResult =
  { ok: true } | { ok: false; error: string; matchedPattern: string };

function extensionOf(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const dot = base.lastIndexOf('.');
  return dot === -1 ? '' : base.slice(dot + 1).toLowerCase();
}

function findSensitivePattern(text: string): string | null {
  for (const pattern of SENSITIVE_MARKING_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }
  return null;
}

export function scanFilename(filename: string): ScanUploadResult {
  const matchedPattern = findSensitivePattern(filename);
  if (matchedPattern) {
    return {
      ok: false,
      error: UPLOAD_REJECTION_MESSAGE,
      matchedPattern,
    };
  }
  return { ok: true };
}

function isTextLikeFile(filename: string, mimeType: string): boolean {
  const extension = extensionOf(filename);
  if (TEXT_SCAN_EXTENSIONS.has(extension)) {
    return true;
  }

  const normalizedMime = mimeType.toLowerCase();
  if (TEXT_SCAN_MIME_TYPES.has(normalizedMime)) {
    return true;
  }

  return TEXT_SCAN_MIME_PREFIXES.some((prefix) =>
    normalizedMime.startsWith(prefix)
  );
}

function isImageFile(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.has(mimeType.toLowerCase());
}

function scanTextBuffer(buffer: Buffer): ScanUploadResult {
  const text = buffer.toString('utf8');
  const matchedPattern = findSensitivePattern(text);
  if (matchedPattern) {
    return {
      ok: false,
      error: UPLOAD_REJECTION_MESSAGE,
      matchedPattern,
    };
  }
  return { ok: true };
}

/**
 * Image OCR is not enabled. We scan embedded ASCII strings in the raw buffer as a
 * lightweight fallback; compressed image payloads usually require OCR (e.g. tesseract.js).
 */
function scanImageBuffer(buffer: Buffer): ScanUploadResult {
  const asciiRuns = buffer.toString('latin1').match(/[\x20-\x7E]{8,}/g);

  if (!asciiRuns) {
    return { ok: true };
  }

  for (const run of asciiRuns) {
    const matchedPattern = findSensitivePattern(run);
    if (matchedPattern) {
      return {
        ok: false,
        error: UPLOAD_REJECTION_MESSAGE,
        matchedPattern,
      };
    }
  }

  return { ok: true };
}

export function scanUpload(input: ScanUploadInput): ScanUploadResult {
  const filenameResult = scanFilename(input.filename);
  if (!filenameResult.ok) {
    return filenameResult;
  }

  if (input.size > SENSITIVE_CONTENT_SCAN_MAX_BYTES) {
    return { ok: true };
  }

  if (isTextLikeFile(input.filename, input.mimeType)) {
    return scanTextBuffer(input.buffer);
  }

  if (isImageFile(input.mimeType)) {
    return scanImageBuffer(input.buffer);
  }

  return { ok: true };
}
