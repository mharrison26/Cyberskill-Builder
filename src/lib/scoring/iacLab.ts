import type { Ticket } from '@/types';

/** Narrow ticket shape used by IaC scoring (avoids circular import via scoring/index). */
type ScorableTicket = Pick<
  Ticket,
  | 'id'
  | 'tenant_id'
  | 'track_id'
  | 'tier'
  | 'ticket_type'
  | 'difficulty'
  | 'sla_minutes'
  | 'scenario_brief'
  | 'initial_state'
  | 'expected_state'
  | 'dcwf_code'
  | 'sort_order'
>;

type TicketSubmission = Record<string, unknown>;

type TicketScoreResult = {
  status: 'resolved' | 'needs_revision';
  structuredResult: Record<string, unknown>;
  feedback: string;
};

type TicketScorer = {
  score(
    submission: TicketSubmission,
    ticket: ScorableTicket
  ): TicketScoreResult | Promise<TicketScoreResult>;
};

/**
 * IaC lab scoring (Ansible playbook / structural declarations).
 *
 * Students edit a short playbook in CodeSandbox and submit the file contents.
 * Scoring parses the YAML structurally for required hosts / package / service
 * declarations — tolerant of module aliases (package|yum|apt|dnf,
 * service|systemd), FQCNs, inline `key=value` args, task order, and extra
 * unrelated tasks. Exact whitespace / full-file equality is NOT required.
 *
 * expected_state:
 * {
 *   playbookPath?: string;              // default: auto-detect *.yml|*.yaml
 *   passThresholdPercent?: number;      // default 100
 *   declarations: Array<
 *     | { id: string; kind: 'hosts'; hosts: string }
 *     | { id: string; kind: 'package'; name: string; state?: string;
 *         modules?: string[] }
 *     | { id: string; kind: 'service'; name: string; state?: string;
 *         enabled?: boolean; modules?: string[] }
 *   >;
 * }
 *
 * submission: CodeSandbox-style `{ files: { [path]: content } }`.
 */

const DEFAULT_PACKAGE_MODULES = [
  'package',
  'yum',
  'apt',
  'dnf',
  'apt_package',
  'yum_package',
] as const;

const DEFAULT_SERVICE_MODULES = ['service', 'systemd'] as const;

const PLAYBOOK_EXTENSIONS = ['.yml', '.yaml'];
const SKIP_PLAYBOOK_NAMES = new Set(['readme.md', 'package.json', 'inventory']);

export type IacHostsDeclaration = {
  id: string;
  kind: 'hosts';
  hosts: string;
};

export type IacPackageDeclaration = {
  id: string;
  kind: 'package';
  name: string;
  state?: string;
  modules?: string[];
};

export type IacServiceDeclaration = {
  id: string;
  kind: 'service';
  name: string;
  state?: string;
  enabled?: boolean;
  modules?: string[];
};

export type IacDeclaration =
  | IacHostsDeclaration
  | IacPackageDeclaration
  | IacServiceDeclaration;

export type IacLabExpectedState = {
  playbookPath?: string;
  declarations: IacDeclaration[];
  passThresholdPercent: number;
};

export type IacDeclarationResult = {
  id: string;
  kind: IacDeclaration['kind'];
  passed: boolean;
  detail: string;
};

export type IacLabStructuredResult = {
  style: 'iac_lab';
  playbookPath: string | null;
  declarationResults: IacDeclarationResult[];
  matchedCount: number;
  totalCount: number;
  percentage: number;
  passThresholdPercent: number;
  reason?: string;
};

export type ParsedModuleInvocation = {
  module: string;
  args: Record<string, string>;
};

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

function extractSubmissionFiles(
  submission: TicketSubmission
): Record<string, string> {
  const direct =
    asStringRecord(submission.files) ??
    asStringRecord(submission.filesystem) ??
    asStringRecord(submission.final_files) ??
    asStringRecord(submission.playbook);

  if (direct) return direct;

  if (typeof submission.content === 'string') {
    return { 'playbook.yml': submission.content };
  }

  if (isPlainObject(submission.final_state)) {
    const nested =
      asStringRecord(submission.final_state.files) ??
      asStringRecord(submission.final_state.filesystem);
    if (nested) return nested;
  }

  return {};
}

function stripYamlComments(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => {
      let inSingle = false;
      let inDouble = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]!;
        if (ch === "'" && !inDouble) inSingle = !inSingle;
        else if (ch === '"' && !inSingle) inDouble = !inDouble;
        else if (ch === '#' && !inSingle && !inDouble) {
          return line.slice(0, i).trimEnd();
        }
      }
      return line;
    })
    .join('\n');
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizeScalar(value: string): string {
  return unquote(value).trim().toLowerCase();
}

function normalizeModuleName(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const parts = trimmed.split('.');
  return parts[parts.length - 1] ?? trimmed;
}

function parseInlineArgs(inline: string): Record<string, string> {
  const args: Record<string, string> = {};
  const trimmed = inline.trim();
  if (!trimmed || trimmed === '{}' || trimmed === '~') return args;

  // key=value pairs (Ansible shorthand)
  const kvPairs =
    trimmed.match(
      /([A-Za-z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/g
    ) ?? [];
  if (kvPairs.length > 0) {
    for (const pair of kvPairs) {
      const m = pair.match(
        /^([A-Za-z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))$/
      );
      if (!m) continue;
      const key = m[1]!.toLowerCase();
      args[key] = normalizeScalar(m[2] ?? m[3] ?? m[4] ?? '');
    }
    return args;
  }

  // Single bare value → treat as name=
  if (!trimmed.includes(':') && !trimmed.includes('{')) {
    args.name = normalizeScalar(trimmed);
  }
  return args;
}

function leadingIndent(line: string): number {
  const m = line.match(/^(\s*)/);
  return m?.[1]?.length ?? 0;
}

/**
 * Extract Ansible module invocations from playbook YAML without a full parser.
 * Supports:
 *   - package: / ansible.builtin.package:
 *   - indented name/state/enabled maps
 *   - inline `package: name=nginx state=present`
 *   - `- package: ...` list-item form
 */
export function extractModuleInvocations(
  playbookSource: string
): ParsedModuleInvocation[] {
  const text = stripYamlComments(playbookSource);
  const lines = text.split(/\r?\n/);
  const invocations: ParsedModuleInvocation[] = [];

  // Matches short names and FQCNs: package: / ansible.builtin.package:
  const moduleLine =
    /^(\s*)(?:-\s+)?((?:[A-Za-z_][\w]*\.)*)(package|yum|apt|dnf|apt_package|yum_package|service|systemd)\s*:(?:\s*(.*))?$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const match = line.match(moduleLine);
    if (!match) continue;

    const indent = leadingIndent(line);
    const module = normalizeModuleName(match[3]!);
    const inline = (match[4] ?? '').trim();
    const args: Record<string, string> = { ...parseInlineArgs(inline) };

    // Collect following indented key: value pairs belonging to this module.
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j]!;
      if (next.trim() === '') {
        j++;
        continue;
      }
      const nextIndent = leadingIndent(next);
      if (nextIndent <= indent) break;

      // Stop if another list item / task starts at a sibling-ish indent with `- `
      if (/^\s*-\s+\S/.test(next) && nextIndent <= indent + 2) {
        // Child list under module args (rare) — still parse key:value under it
        const childKv = next.match(
          /^\s*-\s+([A-Za-z_][\w-]*)\s*:\s*(.+?)\s*$/
        );
        if (childKv) {
          args[childKv[1]!.toLowerCase()] = normalizeScalar(childKv[2]!);
          j++;
          continue;
        }
        break;
      }

      const kv = next.match(/^\s*([A-Za-z_][\w-]*)\s*:\s*(.*?)\s*$/);
      if (kv) {
        const key = kv[1]!.toLowerCase();
        // Nested module under a task `name:` line is handled when we hit that line.
        if (
          key === 'package' ||
          key === 'yum' ||
          key === 'apt' ||
          key === 'dnf' ||
          key === 'service' ||
          key === 'systemd'
        ) {
          break;
        }
        const rawVal = kv[2] ?? '';
        if (rawVal !== '') {
          args[key] = normalizeScalar(rawVal);
        }
      }
      j++;
    }

    invocations.push({ module, args });
    i = j - 1;
  }

  return invocations;
}

/** Find play-level `hosts:` values (string or simple YAML list items). */
export function extractHostsValues(playbookSource: string): string[] {
  const text = stripYamlComments(playbookSource);
  const lines = text.split(/\r?\n/);
  const hosts: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Play dict key or list-item play: `hosts: webservers` / `- hosts: webservers`
    const m = line.match(/^(\s*)(?:-\s+)?hosts\s*:\s*(.*?)\s*$/i);
    if (!m) continue;

    const inline = (m[2] ?? '').trim();
    const indent = leadingIndent(line);

    if (inline && inline !== '|' && inline !== '>') {
      // `hosts: webservers` or `hosts: [webservers, db]`
      const cleaned = inline.replace(/^\[/, '').replace(/\]$/, '');
      for (const part of cleaned.split(/[,]/)) {
        const v = normalizeScalar(part);
        if (v) hosts.push(v);
      }
      continue;
    }

    // Block list:
    // hosts:
    //   - webservers
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j]!;
      if (next.trim() === '') {
        j++;
        continue;
      }
      if (leadingIndent(next) <= indent) break;
      const item = next.match(/^\s*-\s+(.+?)\s*$/);
      if (item) {
        hosts.push(normalizeScalar(item[1]!));
        j++;
        continue;
      }
      break;
    }
    i = j - 1;
  }

  return hosts;
}

function truthyEnabled(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.toLowerCase();
  return v === 'true' || v === 'yes' || v === 'on' || v === '1';
}

function packageNameMatches(
  args: Record<string, string>,
  expectedName: string
): boolean {
  const want = normalizeScalar(expectedName);
  const candidates = [args.name, args.pkg, args.package].filter(Boolean);
  return candidates.some((c) => c === want);
}

function serviceNameMatches(
  args: Record<string, string>,
  expectedName: string
): boolean {
  const want = normalizeScalar(expectedName);
  const candidates = [args.name, args.service, args.unit].filter(Boolean);
  return candidates.some((c) => {
    if (!c) return false;
    // systemd unit may be nginx.service
    return c === want || c === `${want}.service`;
  });
}

function modulesAllow(
  module: string,
  allowed: string[] | undefined,
  defaults: readonly string[]
): boolean {
  const list = (allowed?.length ? allowed : [...defaults]).map((m) =>
    normalizeModuleName(m)
  );
  return list.includes(normalizeModuleName(module));
}

export function evaluateHostsDeclaration(
  hostsValues: string[],
  declaration: IacHostsDeclaration
): IacDeclarationResult {
  const want = normalizeScalar(declaration.hosts);
  const passed = hostsValues.some(
    (h) => h === want || h.split(/[,:&]/).map((p) => p.trim()).includes(want)
  );
  return {
    id: declaration.id,
    kind: 'hosts',
    passed,
    detail: passed
      ? `hosts includes "${declaration.hosts}"`
      : `expected hosts group "${declaration.hosts}"`,
  };
}

export function evaluatePackageDeclaration(
  invocations: ParsedModuleInvocation[],
  declaration: IacPackageDeclaration
): IacDeclarationResult {
  const wantState = declaration.state
    ? normalizeScalar(declaration.state)
    : undefined;

  const match = invocations.find((inv) => {
    if (!modulesAllow(inv.module, declaration.modules, DEFAULT_PACKAGE_MODULES)) {
      return false;
    }
    if (!packageNameMatches(inv.args, declaration.name)) return false;
    if (wantState && inv.args.state !== wantState) return false;
    return true;
  });

  return {
    id: declaration.id,
    kind: 'package',
    passed: Boolean(match),
    detail: match
      ? `package "${declaration.name}" via ${match.module}`
      : `expected package/yum/apt task for "${declaration.name}"${
          wantState ? ` state=${wantState}` : ''
        }`,
  };
}

export function evaluateServiceDeclaration(
  invocations: ParsedModuleInvocation[],
  declaration: IacServiceDeclaration
): IacDeclarationResult {
  const wantState = declaration.state
    ? normalizeScalar(declaration.state)
    : undefined;
  const wantEnabled = declaration.enabled === true;

  const relevant = invocations.filter(
    (inv) =>
      modulesAllow(inv.module, declaration.modules, DEFAULT_SERVICE_MODULES) &&
      serviceNameMatches(inv.args, declaration.name)
  );

  if (relevant.length === 0) {
    return {
      id: declaration.id,
      kind: 'service',
      passed: false,
      detail: `expected service/systemd task for "${declaration.name}"`,
    };
  }

  const stateOk =
    !wantState || relevant.some((inv) => inv.args.state === wantState);
  const enabledOk =
    !wantEnabled || relevant.some((inv) => truthyEnabled(inv.args.enabled));

  // Combined or split across tasks both OK.
  const passed = stateOk && enabledOk;

  return {
    id: declaration.id,
    kind: 'service',
    passed,
    detail: passed
      ? `service "${declaration.name}" configured`
      : `expected service "${declaration.name}"${
          wantState ? ` state=${wantState}` : ''
        }${wantEnabled ? ' enabled=true' : ''}`,
  };
}

function parseDeclaration(raw: unknown): IacDeclaration | null {
  if (!isPlainObject(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const kind = typeof raw.kind === 'string' ? raw.kind.trim().toLowerCase() : '';
  if (!id || !kind) return null;

  if (kind === 'hosts') {
    const hosts =
      typeof raw.hosts === 'string'
        ? raw.hosts
        : typeof raw.host === 'string'
          ? raw.host
          : typeof raw.hostGroup === 'string'
            ? raw.hostGroup
            : typeof raw.host_group === 'string'
              ? raw.host_group
              : typeof raw.value === 'string'
                ? raw.value
                : '';
    if (!hosts.trim()) return null;
    return { id, kind: 'hosts', hosts: hosts.trim() };
  }

  if (kind === 'package') {
    const name =
      typeof raw.name === 'string'
        ? raw.name
        : typeof raw.package === 'string'
          ? raw.package
          : '';
    if (!name.trim()) return null;
    const state = typeof raw.state === 'string' ? raw.state.trim() : undefined;
    const modules = Array.isArray(raw.modules)
      ? raw.modules.filter((m): m is string => typeof m === 'string')
      : undefined;
    return { id, kind: 'package', name: name.trim(), state, modules };
  }

  if (kind === 'service') {
    const name =
      typeof raw.name === 'string'
        ? raw.name
        : typeof raw.service === 'string'
          ? raw.service
          : '';
    if (!name.trim()) return null;
    const state = typeof raw.state === 'string' ? raw.state.trim() : undefined;
    const enabled =
      typeof raw.enabled === 'boolean'
        ? raw.enabled
        : typeof raw.enabled === 'string'
          ? truthyEnabled(raw.enabled)
          : undefined;
    const modules = Array.isArray(raw.modules)
      ? raw.modules.filter((m): m is string => typeof m === 'string')
      : undefined;
    return {
      id,
      kind: 'service',
      name: name.trim(),
      state,
      enabled,
      modules,
    };
  }

  return null;
}

export function parseIacLabExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): IacLabExpectedState {
  if (!isPlainObject(expectedState)) {
    return { declarations: [], passThresholdPercent: 100 };
  }

  const playbookPath =
    typeof expectedState.playbookPath === 'string'
      ? expectedState.playbookPath
      : typeof expectedState.playbook_path === 'string'
        ? expectedState.playbook_path
        : typeof expectedState.filePath === 'string'
          ? expectedState.filePath
          : undefined;

  const rawDecls =
    expectedState.declarations ??
    expectedState.requirements ??
    expectedState.required_declarations;

  const declarations: IacDeclaration[] = [];
  if (Array.isArray(rawDecls)) {
    for (const entry of rawDecls) {
      const parsed = parseDeclaration(entry);
      if (parsed) declarations.push(parsed);
    }
  }

  const thresholdRaw =
    expectedState.passThresholdPercent ?? expectedState.pass_threshold_percent;
  const passThresholdPercent =
    typeof thresholdRaw === 'number' &&
    Number.isFinite(thresholdRaw) &&
    thresholdRaw > 0
      ? Math.min(100, Math.floor(thresholdRaw))
      : 100;

  return { playbookPath, declarations, passThresholdPercent };
}

function looksLikePlaybookPath(path: string): boolean {
  const lower = path.toLowerCase();
  const base = lower.includes('/')
    ? lower.slice(lower.lastIndexOf('/') + 1)
    : lower;
  if (SKIP_PLAYBOOK_NAMES.has(base)) return false;
  return PLAYBOOK_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function resolvePlaybook(
  files: Record<string, string>,
  playbookPath?: string
): { path: string | null; content: string } {
  if (playbookPath) {
    const path = normalizePath(playbookPath);
    const content = files[path];
    if (typeof content === 'string') {
      return { path, content };
    }
    return { path: null, content: '' };
  }

  const candidates = Object.keys(files).filter(looksLikePlaybookPath).sort();
  const preferred = candidates.find((p) =>
    /playbook|site|main|deploy|nginx/i.test(p)
  );
  const path = preferred ?? candidates[0] ?? null;
  if (!path) return { path: null, content: '' };
  return { path, content: files[path] ?? '' };
}

export function evaluateIacLab(
  submission: TicketSubmission,
  ticket: ScorableTicket
): IacLabStructuredResult {
  const expected = parseIacLabExpectedState(
    ticket.expected_state as Record<string, unknown>
  );
  const files = extractSubmissionFiles(submission);
  const { path: playbookPath, content } = resolvePlaybook(
    files,
    expected.playbookPath
  );

  if (expected.declarations.length === 0) {
    return {
      style: 'iac_lab',
      playbookPath,
      declarationResults: [],
      matchedCount: 0,
      totalCount: 0,
      percentage: 0,
      passThresholdPercent: expected.passThresholdPercent,
      reason: 'no_declarations_configured',
    };
  }

  if (!playbookPath || !content.trim()) {
    return {
      style: 'iac_lab',
      playbookPath: playbookPath ?? expected.playbookPath ?? null,
      declarationResults: expected.declarations.map((d) => ({
        id: d.id,
        kind: d.kind,
        passed: false,
        detail: 'playbook file missing',
      })),
      matchedCount: 0,
      totalCount: expected.declarations.length,
      percentage: 0,
      passThresholdPercent: expected.passThresholdPercent,
      reason: 'missing_playbook',
    };
  }

  const hostsValues = extractHostsValues(content);
  const invocations = extractModuleInvocations(content);

  const declarationResults: IacDeclarationResult[] = expected.declarations.map(
    (declaration) => {
      if (declaration.kind === 'hosts') {
        return evaluateHostsDeclaration(hostsValues, declaration);
      }
      if (declaration.kind === 'package') {
        return evaluatePackageDeclaration(invocations, declaration);
      }
      return evaluateServiceDeclaration(invocations, declaration);
    }
  );

  const matchedCount = declarationResults.filter((r) => r.passed).length;
  const totalCount = declarationResults.length;
  const percentage =
    totalCount === 0 ? 0 : Math.round((matchedCount / totalCount) * 100);

  return {
    style: 'iac_lab',
    playbookPath,
    declarationResults,
    matchedCount,
    totalCount,
    percentage,
    passThresholdPercent: expected.passThresholdPercent,
  };
}

export function iacLabFeedback(result: IacLabStructuredResult): string {
  if (result.reason === 'no_declarations_configured') {
    return 'This IaC lab has no expected declarations configured.';
  }
  if (result.reason === 'missing_playbook') {
    return result.playbookPath
      ? `Playbook not found at ${result.playbookPath}. Add or edit the YAML playbook and submit again.`
      : 'No Ansible playbook (.yml/.yaml) found in the submission.';
  }

  const failed = result.declarationResults.filter((r) => !r.passed);
  if (failed.length === 0) {
    return `Playbook satisfies all ${result.totalCount} required declarations (${result.playbookPath}).`;
  }

  const gaps = failed.map((f) => `- ${f.id}: ${f.detail}`).join('\n');
  return `Playbook matched ${result.matchedCount}/${result.totalCount} required declarations.\n\nMissing:\n${gaps}`;
}

export function isIacLabTicketType(ticketType: string): boolean {
  const t = ticketType.trim().toLowerCase();
  const base = t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
  return (
    base === 'ansible_playbook' ||
    base === 'iac_lab' ||
    base === 'ansible_lab' ||
    base === 'terraform_lab'
  );
}

export const iacLabTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const structuredResult = evaluateIacLab(submission, ticket);
    const meetsThreshold =
      structuredResult.totalCount > 0 &&
      structuredResult.percentage >= structuredResult.passThresholdPercent &&
      !structuredResult.reason;

    return {
      status: meetsThreshold ? 'resolved' : 'needs_revision',
      structuredResult,
      feedback: iacLabFeedback(structuredResult),
    };
  },
};
