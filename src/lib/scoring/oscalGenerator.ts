import {
  detectOscalDocumentKind,
  validateOscalDocument,
  type OscalDocumentKind,
  type OscalSchemaError,
} from '@/lib/oscal/validateOscal';
import {
  formatSspSchemaErrors,
  validateOscalSsp,
} from '@/lib/oscal/validateSsp';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

/**
 * GRC-09 / Capstone OSCAL generator scoring (PI-04 WebContainer submissions).
 *
 * Students write a Node/Python script that reads a sample JSON input template
 * and emits an OSCAL SSP. On submit, the browser sandbox re-runs the script
 * against the seeded sample input, then the server validates the resulting
 * JSON against the vendored OSCAL SSP schema.
 *
 * Pass/fail is **schema validation only** (not subjective code quality).
 * Optional static structure checks are advisory feedback only.
 *
 * expected_state (optional knobs):
 * {
 *   documentKind?: 'ssp' | 'assessment-results' | 'either'; // default ssp
 *   scriptPath?: string;
 *   inputPath?: string;    // default: input/system.json
 *   outputPath?: string;   // default: output/ssp.json
 *   minScriptChars?: number; // advisory static check only
 *   requireStaticChecks?: boolean; // default false — when true, gates pass
 * }
 */

export type OscalGeneratorDocumentKind = OscalDocumentKind | 'either';

export type OscalGeneratorExpectedState = {
  documentKind?: OscalGeneratorDocumentKind;
  scriptPath?: string;
  inputPath?: string;
  outputPath?: string;
  minScriptChars?: number;
  /** When true, static structure checks also gate pass/fail. Default false. */
  requireStaticChecks?: boolean;
};

export type StaticCheckResult = {
  id: string;
  passed: boolean;
  summary: string;
};

export type OscalGeneratorStructuredResult = {
  style: 'oscal_generator';
  scriptPath: string | null;
  outputPath: string | null;
  documentKind: OscalDocumentKind | null;
  staticChecks: StaticCheckResult[];
  staticPassed: boolean;
  schemaValid: boolean;
  schemaErrors: OscalSchemaError[];
  /** How the OSCAL document was located for validation. */
  outputSource?: 'file' | 'generatedOscal' | 'stdout' | null;
  reason?: string;
};

const SCRIPT_EXTENSIONS = ['.js', '.mjs', '.cjs', '.py', '.ts'];
const SKIP_SCRIPT_NAMES = new Set([
  'package.json',
  'tsconfig.json',
  'readme.md',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/\/+/g, '/');
}

function asStringRecord(value: unknown): Record<string, string> | null {
  if (!isPlainObject(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      out[normalizePath(key)] = entry;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Extract flat path→content map from a CodeSandbox-style submission. */
export function extractSubmissionFiles(
  submission: TicketSubmission
): Record<string, string> {
  const direct =
    asStringRecord(submission.files) ??
    asStringRecord(submission.filesystem) ??
    asStringRecord(submission.final_files);

  if (direct) return direct;

  if (isPlainObject(submission.final_state)) {
    const nested =
      asStringRecord(submission.final_state.files) ??
      asStringRecord(submission.final_state.filesystem);
    if (nested) return nested;
  }

  return {};
}

function parseExpectedState(
  ticket: ScorableTicket
): OscalGeneratorExpectedState {
  const expected = ticket.expected_state;
  if (!isPlainObject(expected)) return {};

  const documentKind = expected.documentKind;
  const kind =
    documentKind === 'ssp' ||
    documentKind === 'assessment-results' ||
    documentKind === 'either'
      ? documentKind
      : undefined;

  return {
    documentKind: kind,
    scriptPath:
      typeof expected.scriptPath === 'string'
        ? normalizePath(expected.scriptPath)
        : undefined,
    inputPath:
      typeof expected.inputPath === 'string'
        ? normalizePath(expected.inputPath)
        : undefined,
    outputPath:
      typeof expected.outputPath === 'string'
        ? normalizePath(expected.outputPath)
        : undefined,
    minScriptChars:
      typeof expected.minScriptChars === 'number' &&
      Number.isFinite(expected.minScriptChars) &&
      expected.minScriptChars > 0
        ? expected.minScriptChars
        : undefined,
    requireStaticChecks: expected.requireStaticChecks === true,
  };
}

function basename(filePath: string): string {
  const parts = normalizePath(filePath).split('/');
  return parts[parts.length - 1] ?? filePath;
}

function isScriptPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  if (SKIP_SCRIPT_NAMES.has(basename(lower))) return false;
  return SCRIPT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Prefer generate_*.{js,py} then any script under the lab root. */
export function resolveScriptPath(
  files: Record<string, string>,
  configured?: string
): string | null {
  if (configured && files[configured] !== undefined) {
    return configured;
  }

  const paths = Object.keys(files).filter(isScriptPath).sort();
  const preferred = paths.find((p) =>
    /(?:^|\/)generate[_-].+\.(?:js|mjs|cjs|py|ts)$/i.test(p)
  );
  return preferred ?? paths[0] ?? null;
}

export function resolveInputPath(
  files: Record<string, string>,
  configured?: string
): string | null {
  if (configured && files[configured] !== undefined) {
    return configured;
  }
  const underInput = Object.keys(files)
    .filter((p) => p.startsWith('input/') && p.toLowerCase().endsWith('.json'))
    .sort();
  return underInput[0] ?? null;
}

function tryParseJson(content: string): unknown | null {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return null;
  }
}

/** Best-effort extract of a JSON object from script stdout. */
export function parseJsonFromStdout(stdout: unknown): unknown | null {
  if (typeof stdout !== 'string' || !stdout.trim()) return null;
  const trimmed = stdout.trim();
  const direct = tryParseJson(trimmed);
  if (direct !== null) return direct;

  // Brace-match objects in the stream. Prefer OSCAL roots, then longest JSON
  // (scripts often log a line, then print the full document).
  let found: unknown | null = null;
  let foundScore = -1;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] !== '{') continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let j = i; j < trimmed.length; j++) {
      const ch = trimmed[j]!;
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          const candidate = tryParseJson(trimmed.slice(i, j + 1));
          if (candidate !== null) {
            const oscalBonus =
              isPlainObject(candidate) &&
              ('system-security-plan' in candidate ||
                'assessment-results' in candidate)
                ? 1_000_000
                : 0;
            const score = oscalBonus + (j + 1 - i);
            if (score > foundScore) {
              found = candidate;
              foundScore = score;
            }
          }
          break;
        }
      }
    }
  }
  return found;
}

export function resolveOutputPath(
  files: Record<string, string>,
  configured?: string
): string | null {
  if (configured && files[configured] !== undefined) {
    return configured;
  }

  const candidates = Object.keys(files)
    .filter((p) => p.toLowerCase().endsWith('.json'))
    .filter((p) => !p.startsWith('input/'))
    .filter((p) => basename(p).toLowerCase() !== 'package.json')
    .sort();

  for (const path of candidates) {
    const parsed = tryParseJson(files[path] ?? '');
    if (detectOscalDocumentKind(parsed)) {
      return path;
    }
  }

  const underOutput = candidates.filter((p) => p.startsWith('output/'));
  return underOutput[0] ?? candidates[0] ?? null;
}

/**
 * Resolve the OSCAL document to validate from submission files / stdout /
 * generatedOscal fields (in that priority for configured outputPath).
 */
export function resolveGeneratedOscal(args: {
  submission: TicketSubmission;
  files: Record<string, string>;
  outputPath: string | null;
}): { document: unknown | null; source: 'file' | 'generatedOscal' | 'stdout' | null; outputPath: string | null } {
  const { submission, files, outputPath } = args;

  if (outputPath && files[outputPath] !== undefined) {
    const parsed = tryParseJson(files[outputPath] ?? '');
    if (parsed !== null) {
      return { document: parsed, source: 'file', outputPath };
    }
    return { document: null, source: 'file', outputPath };
  }

  if (isPlainObject(submission.generatedOscal)) {
    return {
      document: submission.generatedOscal,
      source: 'generatedOscal',
      outputPath,
    };
  }
  if (isPlainObject(submission.oscalDocument)) {
    return {
      document: submission.oscalDocument,
      source: 'generatedOscal',
      outputPath,
    };
  }

  const fromStdout = parseJsonFromStdout(submission.stdout);
  if (fromStdout !== null) {
    return { document: fromStdout, source: 'stdout', outputPath };
  }

  // Fall back to auto-detected output file even without configured path.
  const autoPath = resolveOutputPath(files, undefined);
  if (autoPath && files[autoPath] !== undefined) {
    const parsed = tryParseJson(files[autoPath] ?? '');
    if (parsed !== null) {
      return { document: parsed, source: 'file', outputPath: autoPath };
    }
    return { document: null, source: 'file', outputPath: autoPath };
  }

  return { document: null, source: null, outputPath: autoPath };
}

function stripCommentsAndStrings(
  source: string,
  language: 'js' | 'py'
): string {
  // Best-effort for static checks — not a full lexer.
  let text = source;
  if (language === 'js') {
    text = text.replace(/\/\*[\s\S]*?\*\//g, ' ');
    text = text.replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  } else {
    text = text.replace(/'''[\s\S]*?'''/g, ' ');
    text = text.replace(/"""[\s\S]*?"""/g, ' ');
    text = text.replace(/(^|[^'"])#[^\n]*/gm, '$1');
  }
  text = text.replace(/(['"`])(?:\\.|(?!\1)[\s\S])*?\1/g, '""');
  return text;
}

function languageFromPath(scriptPath: string): 'js' | 'py' {
  return scriptPath.toLowerCase().endsWith('.py') ? 'py' : 'js';
}

/**
 * Basic static structure / I/O intent checks (advisory; not a full code review).
 * Exported for focused unit tests.
 */
export function runStaticScriptChecks(args: {
  scriptPath: string;
  scriptSource: string;
  inputPath: string | null;
  outputPath: string | null;
  minScriptChars?: number;
}): StaticCheckResult[] {
  const minChars = args.minScriptChars ?? 80;
  const language = languageFromPath(args.scriptPath);
  const source = args.scriptSource;
  const stripped = stripCommentsAndStrings(source, language);
  const compact = stripped.replace(/\s+/g, ' ').trim();
  const nonEmptyLines = source
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));

  const checks: StaticCheckResult[] = [];

  checks.push({
    id: 'script_exists',
    passed: source.trim().length > 0,
    summary: 'Script file is present and non-empty',
  });

  checks.push({
    id: 'min_length',
    passed: source.trim().length >= minChars,
    summary: `Script has at least ${minChars} characters of content`,
  });

  const looksLikeStub =
    /TODO|pass\s*$|NotImplemented|raise NotImplementedError|throw new Error\(['"]TODO/i.test(
      source
    ) && source.trim().length < minChars * 2;

  checks.push({
    id: 'not_trivial_stub',
    passed: !looksLikeStub && compact.length >= Math.min(40, minChars),
    summary: 'Script is not an empty/trivial stub',
  });

  const hasStructure =
    nonEmptyLines.length >= 5 ||
    (language === 'py'
      ? /\bdef\s+\w+\s*\(/.test(stripped) || /\bclass\s+\w+/.test(stripped)
      : /\bfunction\s+\w+\s*\(/.test(stripped) ||
        /\b(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\(/.test(stripped) ||
        /\bexport\s+(?:async\s+)?function\b/.test(stripped));

  checks.push({
    id: 'has_structure',
    passed: hasStructure,
    summary:
      'Script has basic structure (functions/modules or multiple statements)',
  });

  const inputNeedle = args.inputPath
    ? basename(args.inputPath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    : null;
  const readsInput =
    (language === 'py'
      ? /\bopen\s*\(|\bjson\.load\b|\bPath\s*\(/.test(stripped)
      : /\breadFileSync\b|\breadFile\b|\bfs\.read|\brequire\s*\(\s*['"]fs['"]/.test(
          stripped
        )) ||
    (inputNeedle
      ? new RegExp(inputNeedle, 'i').test(source)
      : /input\/|\.json/.test(source));

  checks.push({
    id: 'reads_input',
    passed: readsInput,
    summary: args.inputPath
      ? `Script appears to read input (${args.inputPath})`
      : 'Script appears to read a JSON input file',
  });

  const writesJson =
    /\bJSON\.stringify\b|\bjson\.dump\b|\bjson\.dumps\b/.test(stripped) ||
    (language === 'py'
      ? /\bopen\s*\([^)]*['"]w/.test(source) || /\bwrite_text\b/.test(stripped)
      : /\bwriteFileSync\b|\bwriteFile\b|\bcreateWriteStream\b/.test(
          stripped
        )) ||
    (args.outputPath
      ? new RegExp(
          basename(args.outputPath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'i'
        ).test(source)
      : false);

  checks.push({
    id: 'writes_json',
    passed: writesJson,
    summary: args.outputPath
      ? `Script appears to write/print JSON output (${args.outputPath})`
      : 'Script appears to write or serialize JSON output',
  });

  return checks;
}

function feedbackFromResult(
  result: OscalGeneratorStructuredResult,
  requireStaticChecks: boolean
): string {
  const parts: string[] = [];

  if (result.reason === 'missing_files') {
    return 'No sandbox files were submitted. Open the lab sandbox, complete the script, submit so it runs against the sample input, then try again.';
  }
  if (result.reason === 'missing_script') {
    return 'Could not find a Python or Node generator script in the submission. Add generate_ssp.js / generate_ssp.py (or set expected_state.scriptPath).';
  }
  if (result.reason === 'missing_output') {
    return 'Could not find generated OSCAL JSON output (file, stdout, or generatedOscal). The sandbox should run your script against the sample input on submit — fix the generator and resubmit.';
  }
  if (result.reason === 'invalid_json') {
    return `Generator output${
      result.outputPath ? ` (${result.outputPath})` : ''
    } is not valid JSON. Fix the generator and resubmit.`;
  }
  if (result.reason === 'sandbox_run_failed') {
    return 'The sandbox failed to run your script against the sample input. Check the terminal output, fix runtime errors, and resubmit.';
  }

  if (requireStaticChecks && !result.staticPassed) {
    const failed = result.staticChecks
      .filter((c) => !c.passed)
      .map((c) => c.summary);
    parts.push(`Script structure checks failed: ${failed.join('; ')}.`);
  } else if (!result.staticPassed && result.staticChecks.length > 0) {
    const failed = result.staticChecks
      .filter((c) => !c.passed)
      .map((c) => c.summary);
    if (failed.length > 0) {
      parts.push(
        `Advisory script notes (not graded): ${failed.join('; ')}.`
      );
    }
  }

  if (!result.schemaValid) {
    const detail = formatSspSchemaErrors(result.schemaErrors);
    parts.push(
      `Generated OSCAL document failed SSP schema validation${
        result.documentKind ? ` (${result.documentKind})` : ''
      }.`
    );
    if (detail) parts.push(detail);
    return parts.join(' ');
  }

  parts.unshift(
    `Generated OSCAL SSP validates against the NIST OSCAL SSP JSON Schema${
      result.outputSource ? ` (via ${result.outputSource})` : ''
    }.`
  );
  return `Capstone accepted. ${parts.join(' ')}`;
}

function validateAgainstSchema(
  document: unknown,
  preferred: OscalGeneratorDocumentKind
): {
  valid: boolean;
  errors: OscalSchemaError[];
  documentKind: OscalDocumentKind | null;
} {
  const detected = detectOscalDocumentKind(document);

  // GRC-09 primary path: SSP schema via validateOscalSsp (same as GRC-03).
  if (preferred === 'ssp') {
    const ssp = validateOscalSsp(document);
    return {
      valid: ssp.valid,
      errors: ssp.errors,
      documentKind: ssp.valid || detected === 'ssp' ? 'ssp' : detected,
    };
  }

  if (preferred === 'assessment-results') {
    const result = validateOscalDocument(document, 'assessment-results');
    return {
      valid: result.valid,
      errors: result.errors,
      documentKind: result.kind,
    };
  }

  // preferred === 'either'
  if (detected === 'assessment-results') {
    const result = validateOscalDocument(document, 'assessment-results');
    return {
      valid: result.valid,
      errors: result.errors,
      documentKind: result.kind,
    };
  }

  const ssp = validateOscalSsp(document);
  return {
    valid: ssp.valid,
    errors: ssp.errors,
    documentKind: ssp.valid || detected === 'ssp' ? 'ssp' : detected,
  };
}

export function evaluateOscalGenerator(
  submission: TicketSubmission,
  ticket: ScorableTicket
): OscalGeneratorStructuredResult {
  const expected = parseExpectedState(ticket);
  const files = extractSubmissionFiles(submission);

  if (
    Object.keys(files).length === 0 &&
    !isPlainObject(submission.generatedOscal) &&
    !isPlainObject(submission.oscalDocument) &&
    typeof submission.stdout !== 'string'
  ) {
    return {
      style: 'oscal_generator',
      scriptPath: null,
      outputPath: null,
      documentKind: null,
      staticChecks: [],
      staticPassed: false,
      schemaValid: false,
      schemaErrors: [],
      outputSource: null,
      reason: 'missing_files',
    };
  }

  if (submission.sandboxRunFailed === true) {
    const scriptPath = resolveScriptPath(files, expected.scriptPath);
    return {
      style: 'oscal_generator',
      scriptPath,
      outputPath: expected.outputPath ?? null,
      documentKind: null,
      staticChecks: [],
      staticPassed: false,
      schemaValid: false,
      schemaErrors: [],
      outputSource: null,
      reason: 'sandbox_run_failed',
    };
  }

  const scriptPath = resolveScriptPath(files, expected.scriptPath);
  // Allow schema-only grading from generatedOscal/stdout without a script file
  // (e.g. tests), but normal sandbox submits include the script.
  const inputPath = resolveInputPath(files, expected.inputPath);
  const configuredOutput = expected.outputPath ?? null;
  const outputPath =
    configuredOutput && files[configuredOutput] !== undefined
      ? configuredOutput
      : resolveOutputPath(files, expected.outputPath);

  const staticChecks = scriptPath
    ? runStaticScriptChecks({
        scriptPath,
        scriptSource: files[scriptPath] ?? '',
        inputPath,
        outputPath: outputPath ?? configuredOutput,
        minScriptChars: expected.minScriptChars,
      })
    : [];
  const staticPassed =
    staticChecks.length === 0 ? true : staticChecks.every((c) => c.passed);

  if (!scriptPath && Object.keys(files).length > 0 && !submission.generatedOscal && !submission.oscalDocument && typeof submission.stdout !== 'string') {
    return {
      style: 'oscal_generator',
      scriptPath: null,
      outputPath: null,
      documentKind: null,
      staticChecks: [],
      staticPassed: false,
      schemaValid: false,
      schemaErrors: [],
      outputSource: null,
      reason: 'missing_script',
    };
  }

  const resolved = resolveGeneratedOscal({
    submission,
    files,
    outputPath: outputPath ?? configuredOutput,
  });

  if (resolved.document === null && resolved.source === null) {
    return {
      style: 'oscal_generator',
      scriptPath,
      outputPath: resolved.outputPath,
      documentKind: null,
      staticChecks,
      staticPassed,
      schemaValid: false,
      schemaErrors: [],
      outputSource: null,
      reason: 'missing_output',
    };
  }

  if (resolved.document === null) {
    return {
      style: 'oscal_generator',
      scriptPath,
      outputPath: resolved.outputPath,
      documentKind: null,
      staticChecks,
      staticPassed,
      schemaValid: false,
      schemaErrors: [
        {
          instancePath: '/',
          schemaPath: '',
          message: 'Output is not valid JSON',
        },
      ],
      outputSource: resolved.source,
      reason: 'invalid_json',
    };
  }

  const preferred = expected.documentKind ?? 'ssp';
  const schemaResult = validateAgainstSchema(resolved.document, preferred);

  return {
    style: 'oscal_generator',
    scriptPath,
    outputPath: resolved.outputPath,
    documentKind: schemaResult.documentKind,
    staticChecks,
    staticPassed,
    schemaValid: schemaResult.valid,
    schemaErrors: schemaResult.errors,
    outputSource: resolved.source,
  };
}

export const oscalGeneratorTicketScorer: TicketScorer = {
  score(submission, ticket): TicketScoreResult {
    const expected = parseExpectedState(ticket);
    const structured = evaluateOscalGenerator(submission, ticket);
    const resolved = expected.requireStaticChecks
      ? structured.staticPassed && structured.schemaValid
      : structured.schemaValid;

    return {
      status: resolved ? 'resolved' : 'needs_revision',
      structuredResult: structured,
      feedback: feedbackFromResult(structured, expected.requireStaticChecks === true),
    };
  },
};
