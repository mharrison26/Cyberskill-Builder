import {
  detectOscalDocumentKind,
  formatOscalSchemaErrors,
  validateOscal,
  type OscalDocumentKind,
  type OscalSchemaError,
} from '@/lib/oscal/validateOscal';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

/**
 * Capstone OSCAL generator scoring (PI-04 CodeSandbox submissions).
 *
 * Students write a Python or Node script that reads a JSON input file and
 * emits a minimal OSCAL SSP or Assessment Results document. The WebContainer
 * sandbox submits `{ files: { [path]: content } }`. Grading is deterministic:
 *
 * 1. Basic static checks on the submitted script (structure, I/O intent)
 * 2. JSON Schema validation of the generated OSCAL output file
 *
 * The scorer does **not** execute student code on the server — students must
 * run their script in the sandbox so the output file is present at submit time.
 *
 * expected_state (optional knobs):
 * {
 *   documentKind?: 'ssp' | 'assessment-results' | 'either'; // default either
 *   scriptPath?: string;   // default: auto-detect *.js|*.mjs|*.cjs|*.py|*.ts
 *   inputPath?: string;    // default: input/*.json or first *.json under input/
 *   outputPath?: string;   // default: output/*.json or auto-detect OSCAL JSON
 *   minScriptChars?: number; // default 80
 * }
 */

export type OscalGeneratorDocumentKind = OscalDocumentKind | 'either';

export type OscalGeneratorExpectedState = {
  documentKind?: OscalGeneratorDocumentKind;
  scriptPath?: string;
  inputPath?: string;
  outputPath?: string;
  minScriptChars?: number;
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

function stripCommentsAndStrings(source: string, language: 'js' | 'py'): string {
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
 * Basic static structure / I/O intent checks (not a full code review).
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
      : /\bwriteFileSync\b|\bwriteFile\b|\bcreateWriteStream\b/.test(stripped)) ||
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

function feedbackFromResult(result: OscalGeneratorStructuredResult): string {
  const parts: string[] = [];

  if (result.reason === 'missing_files') {
    return 'No sandbox files were submitted. Open the lab sandbox, complete the script, run it to generate OSCAL JSON, then submit.';
  }
  if (result.reason === 'missing_script') {
    return 'Could not find a Python or Node generator script in the submission. Add generate_ssp.js / generate_ssp.py (or set expected_state.scriptPath).';
  }
  if (result.reason === 'missing_output') {
    return 'Could not find generated OSCAL JSON output. Run your script in the sandbox so it writes the output file, then submit again.';
  }
  if (result.reason === 'invalid_json') {
    return `Output file ${result.outputPath ?? '(unknown)'} is not valid JSON. Fix the generator and re-run it before submitting.`;
  }

  if (!result.staticPassed) {
    const failed = result.staticChecks
      .filter((c) => !c.passed)
      .map((c) => c.summary);
    parts.push(`Script structure checks failed: ${failed.join('; ')}.`);
  } else {
    parts.push('Script structure checks passed.');
  }

  if (!result.schemaValid) {
    const detail = formatOscalSchemaErrors(result.schemaErrors);
    parts.push(
      `Generated OSCAL document failed schema validation${
        result.documentKind ? ` (${result.documentKind})` : ''
      }.`
    );
    if (detail) parts.push(detail);
  } else {
    parts.push(
      `Generated OSCAL ${result.documentKind ?? 'document'} validates against the schema.`
    );
  }

  if (result.staticPassed && result.schemaValid) {
    return `Capstone accepted. ${parts.join(' ')}`;
  }

  return parts.join(' ');
}

export function evaluateOscalGenerator(
  submission: TicketSubmission,
  ticket: ScorableTicket
): OscalGeneratorStructuredResult {
  const expected = parseExpectedState(ticket);
  const files = extractSubmissionFiles(submission);

  if (Object.keys(files).length === 0) {
    return {
      style: 'oscal_generator',
      scriptPath: null,
      outputPath: null,
      documentKind: null,
      staticChecks: [],
      staticPassed: false,
      schemaValid: false,
      schemaErrors: [],
      reason: 'missing_files',
    };
  }

  const scriptPath = resolveScriptPath(files, expected.scriptPath);
  if (!scriptPath) {
    return {
      style: 'oscal_generator',
      scriptPath: null,
      outputPath: null,
      documentKind: null,
      staticChecks: [],
      staticPassed: false,
      schemaValid: false,
      schemaErrors: [],
      reason: 'missing_script',
    };
  }

  const inputPath = resolveInputPath(files, expected.inputPath);
  const outputPath = resolveOutputPath(files, expected.outputPath);

  const staticChecks = runStaticScriptChecks({
    scriptPath,
    scriptSource: files[scriptPath] ?? '',
    inputPath,
    outputPath,
    minScriptChars: expected.minScriptChars,
  });
  const staticPassed = staticChecks.every((c) => c.passed);

  if (!outputPath) {
    return {
      style: 'oscal_generator',
      scriptPath,
      outputPath: null,
      documentKind: null,
      staticChecks,
      staticPassed,
      schemaValid: false,
      schemaErrors: [],
      reason: 'missing_output',
    };
  }

  const parsed = tryParseJson(files[outputPath] ?? '');
  if (parsed === null) {
    return {
      style: 'oscal_generator',
      scriptPath,
      outputPath,
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
      reason: 'invalid_json',
    };
  }

  const preferred = expected.documentKind ?? 'either';
  const schemaResult = validateOscal(parsed, preferred);
  const documentKind =
    schemaResult.kind ?? detectOscalDocumentKind(parsed) ?? null;

  return {
    style: 'oscal_generator',
    scriptPath,
    outputPath,
    documentKind,
    staticChecks,
    staticPassed,
    schemaValid: schemaResult.valid,
    schemaErrors: schemaResult.errors,
  };
}

export const oscalGeneratorTicketScorer: TicketScorer = {
  score(submission, ticket): TicketScoreResult {
    const structured = evaluateOscalGenerator(submission, ticket);
    const resolved = structured.staticPassed && structured.schemaValid;

    return {
      status: resolved ? 'resolved' : 'needs_revision',
      structuredResult: structured,
      feedback: feedbackFromResult(structured),
    };
  },
};
