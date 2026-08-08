/**
 * Helpers for preloading / capturing guest filesystem state on Fly sandboxes.
 * Used by CIS hardening (and other shell tickets) so config-diff can grade
 * real Linux file contents after the student works in the web terminal.
 */

import type { ConfigDiffRule } from '@/lib/scoring/configDiff';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Normalize to relative path used by config-diff (no leading slash). */
export function guestRelativePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/\/+/g, '/');
}

/** Absolute guest path for a relative lab path. */
export function guestAbsolutePath(path: string): string {
  const rel = guestRelativePath(path);
  return rel.startsWith('/') ? rel : `/${rel}`;
}

function asStringRecord(value: unknown): Record<string, string> | null {
  if (!isPlainObject(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      out[guestRelativePath(key)] = entry;
    } else if (isPlainObject(entry) && typeof entry.content === 'string') {
      out[guestRelativePath(key)] = entry.content;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Baseline files to write into the guest before the student starts.
 * Accepts initial_state.preloadFiles | baselineFiles | files.
 */
export function extractPreloadFiles(
  initialState: Record<string, unknown> | null | undefined
): Record<string, string> {
  if (!initialState) return {};
  return (
    asStringRecord(initialState.preloadFiles) ??
    asStringRecord(initialState.baselineFiles) ??
    asStringRecord(initialState.files) ??
    {}
  );
}

/** Optional octal modes (e.g. intentionally world-readable /etc/shadow). */
export function extractPreloadModes(
  initialState: Record<string, unknown> | null | undefined
): Record<string, string> {
  if (!initialState) return {};
  return (
    asStringRecord(initialState.preloadModes) ??
    asStringRecord(initialState.baselineModes) ??
    asStringRecord(initialState.fileModes) ??
    {}
  );
}

/** Paths that config-diff rules need for file_* checks. */
export function pathsFromConfigDiffRules(rules: unknown): string[] {
  if (!Array.isArray(rules)) return [];
  const paths = new Set<string>();
  for (const rule of rules) {
    if (!isPlainObject(rule)) continue;
    const type = rule.type;
    if (
      (type === 'file_equals' ||
        type === 'file_contains' ||
        type === 'file_absent' ||
        type === 'file_permission') &&
      typeof rule.path === 'string' &&
      rule.path.trim() &&
      rule.path !== '__config__'
    ) {
      paths.add(guestRelativePath(rule.path));
    }
  }
  return Array.from(paths).sort();
}

export function collectSnapshotPaths(options: {
  expectedState?: Record<string, unknown> | null;
  initialState?: Record<string, unknown> | null;
}): string[] {
  const fromRules = pathsFromConfigDiffRules(options.expectedState?.rules);
  if (fromRules.length > 0) return fromRules;

  const preload = extractPreloadFiles(options.initialState);
  return Object.keys(preload).sort();
}

export type GuestSnapshot = {
  files: Record<string, string>;
  fileModes: Record<string, string>;
};

export function parseGuestSnapshotJson(stdout: string): GuestSnapshot | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isPlainObject(parsed)) return null;
    const files = asStringRecord(parsed.files) ?? {};
    const fileModes =
      asStringRecord(parsed.fileModes) ??
      asStringRecord(parsed.modes) ??
      asStringRecord(parsed.permissions) ??
      {};
    return { files, fileModes };
  } catch {
    return null;
  }
}

/** Build a python3 one-liner payload (base64) that writes preload files/modes. */
export function buildPreloadPythonSource(
  files: Record<string, string>,
  modes: Record<string, string>
): string {
  const payload = JSON.stringify({ files, modes });
  return `
import json, os
data = json.loads(${JSON.stringify(payload)})
for path, content in data.get("files", {}).items():
    rel = path.lstrip("/")
    abs_path = "/" + rel
    parent = os.path.dirname(abs_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(abs_path, "w", encoding="utf-8") as fh:
        fh.write(content)
for path, mode in data.get("modes", {}).items():
    rel = path.lstrip("/")
    abs_path = "/" + rel
    if os.path.exists(abs_path):
        os.chmod(abs_path, int(str(mode), 8))
`.trim();
}

/** Build a python3 source that dumps selected paths as JSON for config-diff. */
export function buildSnapshotPythonSource(paths: string[]): string {
  return `
import json, os
paths = ${JSON.stringify(paths.map(guestRelativePath))}
files = {}
modes = {}
for rel in paths:
    abs_path = "/" + rel.lstrip("/")
    if os.path.isfile(abs_path):
        with open(abs_path, "r", encoding="utf-8", errors="replace") as fh:
            files[rel] = fh.read()
        modes[rel] = oct(os.stat(abs_path).st_mode)[-3:]
print(json.dumps({"files": files, "fileModes": modes}))
`.trim();
}

export function pythonExecCommand(source: string): string[] {
  const b64 = Buffer.from(source, 'utf8').toString('base64');
  return [
    'python3',
    '-c',
    `import base64; exec(base64.b64decode('${b64}').decode('utf-8'))`,
  ];
}

/** Type guard for ConfigDiffRule arrays used when wiring scorers/UI. */
export function asConfigDiffRules(value: unknown): ConfigDiffRule[] {
  if (!Array.isArray(value)) return [];
  return value.filter((rule): rule is ConfigDiffRule => {
    if (!isPlainObject(rule) || typeof rule.id !== 'string') return false;
    const type = rule.type;
    if (type === 'file_equals') {
      return typeof rule.path === 'string' && typeof rule.content === 'string';
    }
    if (type === 'file_contains' || type === 'command_history') {
      if (typeof rule.pattern !== 'string') return false;
      return type === 'command_history' ? true : typeof rule.path === 'string';
    }
    if (type === 'file_absent' || type === 'file_permission') {
      return typeof rule.path === 'string';
    }
    return false;
  });
}
