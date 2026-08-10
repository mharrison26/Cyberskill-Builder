'use client';

import { useEffect, useRef, useState } from 'react';
import type { FileSystemTree, WebContainer } from '@webcontainer/api';
import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  buildModesJson,
  PERMISSIONS_JSHRC,
  PERMISSIONS_LS_JS,
} from '@/lib/sandbox/permissionsLs';
import { cn } from '@/lib/utils';

import '@xterm/xterm/css/xterm.css';

/**
 * Optional pre-submit hook: rewrite a canonical sample input file, run the
 * student script in the WebContainer (PI-04), and include stdout in the
 * submission payload. Used by GRC-09 oscal_generator.
 */
export type CodeSandboxRunOnSubmit = {
  inputPath: string;
  inputContents: string;
  scriptPath: string;
  /** Override argv; default is `node <script>` or `python3 <script>`. */
  command?: string[];
  timeoutMs?: number;
};

export type CodeSandboxProps = {
  ticketId: string;
  /** Flat path → file contents map used to seed the WebContainer FS. */
  initialState: Record<string, string>;
  /** Optional path → octal mode map. Injects a mode-aware `ls` helper. */
  fileModes?: Record<string, string>;
  /** Hide the file browser + editor (terminal-only explore labs). */
  showFileBrowser?: boolean;
  /** Show the "Submit lab" button that posts filesystem snapshots. */
  showSubmit?: boolean;
  /**
   * When set, Submit rewrites the sample input and runs the student script
   * inside WebContainer before posting the filesystem snapshot.
   */
  runOnSubmit?: CodeSandboxRunOnSubmit;
  readOnly?: boolean;
  className?: string;
  onSubmitComplete?: (result: {
    ok: boolean;
    status?: number;
    body?: unknown;
  }) => void;
};

type BootStatus = 'idle' | 'booting' | 'ready' | 'error';

function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/\/+/g, '/');
}

/** Convert a flat path→contents map into a WebContainer FileSystemTree. */
export function filesToTree(files: Record<string, string>): FileSystemTree {
  const tree: FileSystemTree = {};

  for (const [rawPath, contents] of Object.entries(files)) {
    if (typeof contents !== 'string') continue;
    const parts = normalizePath(rawPath).split('/').filter(Boolean);
    if (parts.length === 0) continue;

    let current: FileSystemTree = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      const existing = current[part];
      if (!existing || !('directory' in existing)) {
        current[part] = { directory: {} };
      }
      current = (current[part] as { directory: FileSystemTree }).directory;
    }

    const fileName = parts[parts.length - 1]!;
    current[fileName] = { file: { contents } };
  }

  return tree;
}

function flattenTree(
  tree: FileSystemTree,
  prefix = ''
): Record<string, string> {
  const out: Record<string, string> = {};

  for (const [name, node] of Object.entries(tree)) {
    const path = prefix ? `${prefix}/${name}` : name;
    if ('directory' in node && node.directory) {
      Object.assign(out, flattenTree(node.directory, path));
    } else if (
      'file' in node &&
      node.file &&
      'contents' in node.file &&
      !('symlink' in node.file)
    ) {
      const contents = node.file.contents;
      out[path] =
        typeof contents === 'string'
          ? contents
          : new TextDecoder().decode(contents);
    }
  }

  return out;
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.cache']);

async function collectFilesFromFs(
  container: WebContainer,
  dir = '.'
): Promise<Record<string, string>> {
  const entries = await container.fs.readdir(dir, { withFileTypes: true });
  const files: Record<string, string> = {};

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = dir === '.' ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      Object.assign(files, await collectFilesFromFs(container, path));
    } else if (entry.isFile()) {
      files[path] = await container.fs.readFile(path, 'utf-8');
    }
  }

  return files;
}

/**
 * WebContainer's FileSystemAPI has no chmod/stat. Collect modes via Node in the
 * sandbox so config-diff `file_permission` rules can score directory/file modes
 * after students run `chmod` in the terminal.
 */
async function collectFileModesFromFs(
  container: WebContainer
): Promise<Record<string, string>> {
  const script = [
    "const fs=require('fs');",
    "const path=require('path');",
    "const SKIP=new Set(['node_modules','.git','.cache']);",
    'const modes={};',
    'function walk(dir){',
    '  let entries;',
    '  try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}',
    '  for(const entry of entries){',
    '    if(SKIP.has(entry.name)) continue;',
    "    const p=dir==='.'?entry.name:path.join(dir,entry.name);",
    '    try{',
    '      const st=fs.statSync(p);',
    "      modes[p.replace(/\\\\/g,'/')]=(st.mode&0o7777).toString(8);",
    '    }catch{}',
    '    if(entry.isDirectory()) walk(p);',
    '  }',
    '}',
    "walk('.');",
    'process.stdout.write(JSON.stringify(modes));',
  ].join('');

  try {
    const process = await container.spawn('node', ['-e', script], {
      output: true,
    });
    const reader = process.output.getReader();
    const chunks: string[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const exitCode = await process.exit;
    if (exitCode !== 0) return {};

    const raw = chunks.join('').trim();
    // Node may echo jsh noise; take the last JSON object in the stream.
    const start = raw.lastIndexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return {};
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const modes: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' || typeof value === 'number') {
        modes[normalizePath(key)] = String(value);
      }
    }
    return modes;
  } catch {
    return {};
  }
}

async function ensureParentDirs(
  container: WebContainer,
  filePath: string
): Promise<void> {
  const parts = normalizePath(filePath).split('/');
  if (parts.length <= 1) return;
  const dir = parts.slice(0, -1).join('/');
  await container.fs.mkdir(dir, { recursive: true });
}

function mergeSeedFiles(
  initialState: Record<string, string>,
  fileModes?: Record<string, string>
): Record<string, string> {
  const files = { ...initialState };
  if (fileModes && Object.keys(fileModes).length > 0) {
    files['.lab/modes.json'] = buildModesJson(fileModes);
    files['.lab/ls.js'] = PERMISSIONS_LS_JS;
    files['.jshrc'] = PERMISSIONS_JSHRC;
  }
  return files;
}

function defaultRunCommand(scriptPath: string): string[] {
  const lower = scriptPath.toLowerCase();
  if (lower.endsWith('.py')) return ['python3', scriptPath];
  return ['node', scriptPath];
}

/** Prefer configured path; if missing, try common Node↔Python swap for generators. */
async function resolveRunnableScriptPath(
  container: WebContainer,
  configured: string
): Promise<string> {
  const scriptPath = normalizePath(configured);
  try {
    await container.fs.readFile(scriptPath, 'utf8');
    return scriptPath;
  } catch {
    // Fall through to alternates.
  }

  const alternates: string[] = [];
  if (/\.js$/i.test(scriptPath)) {
    alternates.push(scriptPath.replace(/\.js$/i, '.py'));
  } else if (/\.py$/i.test(scriptPath)) {
    alternates.push(scriptPath.replace(/\.py$/i, '.js'));
  }
  // Capstone convention: generate_ssp.* regardless of configured extension.
  const base = scriptPath.replace(/\.[^.]+$/, '');
  for (const ext of ['.js', '.mjs', '.cjs', '.py', '.ts']) {
    const candidate = `${base}${ext}`;
    if (candidate !== scriptPath) alternates.push(candidate);
  }

  for (const candidate of alternates) {
    try {
      await container.fs.readFile(candidate, 'utf8');
      return candidate;
    } catch {
      // try next
    }
  }
  return scriptPath;
}

async function runScriptInContainer(
  container: WebContainer,
  run: CodeSandboxRunOnSubmit,
  terminal: Terminal | null
): Promise<{ stdout: string; exitCode: number }> {
  const inputPath = normalizePath(run.inputPath);
  const scriptPath = await resolveRunnableScriptPath(container, run.scriptPath);
  const dir = inputPath.includes('/')
    ? inputPath.slice(0, inputPath.lastIndexOf('/'))
    : '';
  if (dir) {
    await container.fs.mkdir(dir, { recursive: true });
  }
  await container.fs.writeFile(inputPath, run.inputContents);

  const argv = run.command?.length
    ? run.command
    : defaultRunCommand(scriptPath);
  const [bin, ...args] = argv;
  if (!bin) {
    return { stdout: '', exitCode: 1 };
  }

  terminal?.writeln(`\r\n$ ${argv.join(' ')}\r\n`);

  const process = await container.spawn(bin, args);
  let stdout = '';
  process.output
    .pipeTo(
      new WritableStream({
        write(chunk) {
          stdout += chunk;
          terminal?.write(chunk);
        },
      })
    )
    .catch(() => {
      // Ignore late pipe errors after process exit.
    });

  const timeoutMs = run.timeoutMs ?? 20_000;
  const exitCode = await Promise.race([
    process.exit,
    new Promise<number>((resolve) => {
      window.setTimeout(() => {
        try {
          process.kill();
        } catch {
          // Process may already have exited.
        }
        resolve(124);
      }, timeoutMs);
    }),
  ]);

  return { stdout, exitCode };
}

export function CodeSandbox({
  ticketId,
  initialState,
  fileModes,
  showFileBrowser = true,
  showSubmit = true,
  runOnSubmit,
  readOnly = false,
  className,
  onSubmitComplete,
}: CodeSandboxProps) {
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<WebContainer | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const shellWriterRef = useRef<WritableStreamDefaultWriter<string> | null>(
    null
  );
  const bootingRef = useRef(false);

  const seedFiles = mergeSeedFiles(initialState, fileModes);
  const filePaths = Object.keys(seedFiles)
    .filter((p) => !p.startsWith('.lab/') && p !== '.jshrc')
    .sort();
  const [paths, setPaths] = useState<string[]>(filePaths);
  const [activePath, setActivePath] = useState<string | null>(
    filePaths[0] ?? null
  );
  const [editorValue, setEditorValue] = useState(
    filePaths[0] ? (seedFiles[filePaths[0]] ?? '') : ''
  );
  const [dirty, setDirty] = useState(false);
  const [bootStatus, setBootStatus] = useState<BootStatus>('idle');
  const [bootError, setBootError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<string | null>(null);
  const [submitScoreStatus, setSubmitScoreStatus] = useState<
    'resolved' | 'needs_revision' | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let shellProcess: { kill: () => void } | null = null;

    async function boot() {
      if (bootingRef.current || containerRef.current) return;
      if (!terminalHostRef.current) return;
      bootingRef.current = true;
      setBootStatus('booting');
      setBootError(null);

      try {
        const [{ WebContainer }, { Terminal }, { FitAddon }] =
          await Promise.all([
            import('@webcontainer/api'),
            import('@xterm/xterm'),
            import('@xterm/addon-fit'),
          ]);

        if (cancelled || !terminalHostRef.current) return;

        const fitAddon = new FitAddon();
        const terminal = new Terminal({
          convertEol: true,
          cursorBlink: true,
          fontSize: 13,
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          theme: {
            background: '#0f172a',
            foreground: '#e2e8f0',
            cursor: '#94a3b8',
            selectionBackground: '#334155',
          },
        });
        terminal.loadAddon(fitAddon);
        terminal.open(terminalHostRef.current);
        fitAddon.fit();

        terminalRef.current = terminal;
        fitAddonRef.current = fitAddon;

        const container = await WebContainer.boot({
          coep: 'credentialless',
          workdirName: 'ticket-lab',
        });
        if (cancelled) {
          container.teardown();
          return;
        }

        containerRef.current = container;

        const tree = filesToTree(seedFiles);
        if (Object.keys(tree).length > 0) {
          await container.mount(tree);
        }

        // Best-effort chmod so native tools agree with seeded modes when supported.
        if (fileModes) {
          for (const [filePath, mode] of Object.entries(fileModes)) {
            const octal = mode.trim().replace(/^0+/, '') || '0';
            if (!/^[0-7]{3,4}$/.test(octal)) continue;
            try {
              const chmodProc = await container.spawn('chmod', [
                octal,
                normalizePath(filePath),
              ]);
              await chmodProc.exit;
            } catch {
              // jsh / FS may lack chmod; the .lab/ls.js alias still applies modes.
            }
          }
        }

        const process = await container.spawn('jsh');
        shellProcess = process;

        process.output.pipeTo(
          new WritableStream({
            write(data) {
              terminal.write(data);
            },
          })
        );

        const writer = process.input.getWriter();
        shellWriterRef.current = writer;
        terminal.onData((data) => {
          void writer.write(data);
        });

        resizeObserver = new ResizeObserver(() => {
          fitAddon.fit();
        });
        resizeObserver.observe(terminalHostRef.current);

        const seededPaths = Object.keys(seedFiles)
          .filter((p) => !p.startsWith('.lab/') && p !== '.jshrc')
          .sort();
        setPaths(seededPaths);
        if (!cancelled) {
          setBootStatus('ready');
          if (fileModes && Object.keys(fileModes).length > 0) {
            terminal.writeln(
              '\r\n[sandbox] Tip: run `ls -l` (mode-aware lab helper) after `cd` into a directory.'
            );
          }
        }
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to boot in-browser sandbox.';
        setBootError(message);
        setBootStatus('error');
        terminalRef.current?.writeln(`\r\n[sandbox] ${message}`);
      } finally {
        bootingRef.current = false;
      }
    }

    void boot();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      void shellWriterRef.current?.close().catch(() => undefined);
      shellWriterRef.current = null;
      shellProcess?.kill();
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      containerRef.current?.teardown();
      containerRef.current = null;
    };
    // Seed once on mount from the ticket's initial_state.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only boot
  }, [ticketId]);

  async function persistActiveFile(): Promise<void> {
    const container = containerRef.current;
    if (!container || !activePath || readOnly) return;
    await ensureParentDirs(container, activePath);
    await container.fs.writeFile(activePath, editorValue);
    setDirty(false);
  }

  async function selectFile(path: string) {
    if (path === activePath) return;
    try {
      await persistActiveFile();
    } catch {
      // Still allow navigation; surface via editor state if needed.
    }

    const container = containerRef.current;
    setActivePath(path);
    if (container) {
      try {
        const contents = await container.fs.readFile(path, 'utf-8');
        setEditorValue(contents);
        setDirty(false);
        return;
      } catch {
        // Fall through to local seed.
      }
    }
    setEditorValue(seedFiles[path] ?? initialState[path] ?? '');
    setDirty(false);
  }

  async function refreshFileList() {
    const container = containerRef.current;
    if (!container) return;
    try {
      const snapshot = await collectFilesFromFs(container);
      const nextPaths = Object.keys(snapshot).sort();
      setPaths(nextPaths);
      if (activePath && !snapshot[activePath] && nextPaths[0]) {
        setActivePath(nextPaths[0]);
        setEditorValue(snapshot[nextPaths[0]] ?? '');
        setDirty(false);
      }
    } catch {
      // Keep current list if readdir fails mid-boot.
    }
  }

  async function handleSubmit() {
    const container = containerRef.current;
    if (!container || bootStatus !== 'ready' || readOnly) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);
    setSubmitFeedback(null);
    setSubmitScoreStatus(null);

    try {
      await persistActiveFile();

      let stdout: string | undefined;
      let sandboxRunFailed = false;
      if (runOnSubmit) {
        try {
          const runResult = await runScriptInContainer(
            container,
            runOnSubmit,
            terminalRef.current
          );
          stdout = runResult.stdout;
          sandboxRunFailed = runResult.exitCode !== 0;
        } catch (error) {
          sandboxRunFailed = true;
          stdout =
            error instanceof Error
              ? error.message
              : 'Failed to run script in sandbox';
          terminalRef.current?.writeln(
            `\r\n[sandbox] run-on-submit failed: ${stdout}\r\n`
          );
        }
      }

      let files: Record<string, string>;
      try {
        const exported = await container.export('.', { format: 'json' });
        files = flattenTree(exported);
      } catch {
        files = await collectFilesFromFs(container);
      }

      const fileModes = await collectFileModesFromFs(container);

      // Body is the TicketSubmission itself (see POST /api/tickets/[ticketId]/submit).
      const response = await fetch(`/api/tickets/${ticketId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files,
          fileModes,
          ...(stdout !== undefined ? { stdout } : {}),
          ...(runOnSubmit ? { sandboxRunFailed } : {}),
        }),
      });

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }

      if (!response.ok) {
        const message =
          typeof body === 'object' &&
          body !== null &&
          'error' in body &&
          typeof (body as { error: unknown }).error === 'string'
            ? (body as { error: string }).error
            : 'Submission failed. Please try again.';
        setSubmitError(message);
        onSubmitComplete?.({ ok: false, status: response.status, body });
        return;
      }

      const feedback =
        typeof body === 'object' &&
        body !== null &&
        'feedback' in body &&
        typeof (body as { feedback: unknown }).feedback === 'string'
          ? (body as { feedback: string }).feedback.trim()
          : '';
      const scoreStatus =
        typeof body === 'object' &&
        body !== null &&
        'status' in body &&
        ((body as { status: unknown }).status === 'resolved' ||
          (body as { status: unknown }).status === 'needs_revision')
          ? (body as { status: 'resolved' | 'needs_revision' }).status
          : null;

      setSubmitFeedback(feedback || null);
      setSubmitScoreStatus(scoreStatus);
      setSubmitSuccess(true);
      onSubmitComplete?.({ ok: true, status: response.status, body });
    } catch {
      setSubmitError('Network error. Check your connection and try again.');
      onSubmitComplete?.({ ok: false });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="code-sandbox-heading"
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-card text-card-foreground',
        className
      )}
      data-ticket-id={ticketId}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 id="code-sandbox-heading" className="text-base font-semibold">
            Lab sandbox
          </h2>
          <p className="text-sm text-muted-foreground">
            {bootStatus === 'booting' && 'Booting in-browser runtime…'}
            {bootStatus === 'ready' &&
              (showFileBrowser
                ? 'Edit files and use the terminal. Submit when ready.'
                : 'Use the terminal to explore the seeded filesystem.')}
            {bootStatus === 'error' &&
              (bootError ?? 'Sandbox failed to start.')}
            {bootStatus === 'idle' && 'Preparing sandbox…'}
          </p>
        </div>
        {(showFileBrowser || showSubmit) && (
          <div className="flex flex-wrap items-center gap-2">
            {showFileBrowser ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={bootStatus !== 'ready' || readOnly}
                  onClick={() => void refreshFileList()}
                >
                  Refresh files
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    bootStatus !== 'ready' || readOnly || !activePath || !dirty
                  }
                  onClick={() => void persistActiveFile()}
                >
                  Save file
                </Button>
              </>
            ) : null}
            {showSubmit ? (
              <Button
                type="button"
                size="sm"
                disabled={bootStatus !== 'ready' || readOnly || isSubmitting}
                onClick={() => void handleSubmit()}
              >
                {isSubmitting ? 'Submitting…' : 'Submit lab'}
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {showFileBrowser ? (
        <div className="grid min-h-[28rem] grid-cols-1 md:grid-cols-[12rem_1fr]">
          <aside className="border-b border-border md:border-b-0 md:border-r">
            <p className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Files
            </p>
            <ul className="max-h-48 overflow-y-auto p-1 md:max-h-none md:min-h-[12rem]">
              {paths.length === 0 ? (
                <li className="px-2 py-2 text-sm text-muted-foreground">
                  No files seeded
                </li>
              ) : (
                paths.map((path) => (
                  <li key={path}>
                    <button
                      type="button"
                      className={cn(
                        'w-full rounded-md px-2 py-1.5 text-left font-mono text-xs transition-colors',
                        path === activePath
                          ? 'bg-secondary text-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                      onClick={() => void selectFile(path)}
                    >
                      {path}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </aside>

          <div className="flex min-h-[12rem] flex-col">
            <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
              {activePath ?? 'No file selected'}
              {dirty ? ' · unsaved' : null}
            </div>
            <Textarea
              aria-label={
                activePath ? `Edit ${activePath}` : 'File editor (empty)'
              }
              value={editorValue}
              disabled={!activePath || readOnly || bootStatus === 'booting'}
              spellCheck={false}
              className="min-h-[12rem] flex-1 resize-none rounded-none border-0 bg-background font-mono text-xs focus-visible:ring-0 md:text-xs"
              onChange={(event) => {
                setEditorValue(event.target.value);
                setDirty(true);
              }}
              onBlur={() => {
                if (dirty) void persistActiveFile();
              }}
            />
          </div>
        </div>
      ) : null}

      <div className={showFileBrowser ? 'border-t border-border' : undefined}>
        <p className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Terminal
        </p>
        <div
          ref={terminalHostRef}
          className={cn(
            'w-full bg-terminal px-1 py-1 [&_.xterm]:h-full [&_.xterm-viewport]:overflow-auto',
            showFileBrowser ? 'h-52' : 'h-[28rem]'
          )}
          aria-label="Interactive lab terminal"
        />
      </div>

      {submitError ? (
        <p
          className="border-t border-border px-4 py-2 text-sm text-destructive"
          role="alert"
        >
          {submitError}
        </p>
      ) : null}
      {submitSuccess ? (
        <div
          className={cn(
            'space-y-1 border-t border-border px-4 py-2 text-sm',
            submitScoreStatus === 'needs_revision'
              ? 'text-destructive'
              : 'text-[color:var(--status-satisfied-foreground)]'
          )}
          role={submitScoreStatus === 'needs_revision' ? 'alert' : 'status'}
        >
          <p className="font-medium">
            {submitScoreStatus === 'resolved'
              ? 'Lab accepted.'
              : submitScoreStatus === 'needs_revision'
                ? 'Needs revision.'
                : 'Submission received.'}
          </p>
          {submitFeedback ? (
            <p className="text-muted-foreground">{submitFeedback}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
