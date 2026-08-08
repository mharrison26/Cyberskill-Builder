/**
 * Fly.io Machines API client for short-lived student sandbox VMs.
 *
 * Env (server-only; never expose FLY_API_TOKEN to the client):
 *   FLY_API_TOKEN       – deploy/org token with Machines API access
 *   FLY_APP_NAME        – Fly app that hosts sandbox machines
 *   FLY_REGION          – preferred region (e.g. "iad"); optional
 *   FLY_SANDBOX_IMAGE   – container image with a tty/ws terminal (e.g. ttyd)
 *   FLY_API_HOSTNAME    – optional override (default https://api.machines.dev)
 *   FLY_TERMINAL_PORT   – guest port serving the websocket terminal (default 7681)
 *   FLY_IDLE_TIMEOUT_MINUTES – default idle destroy timeout (default 20)
 *
 * Cost controls (see src/lib/sandbox/costControls.ts + costControlsJob.ts):
 *   FLY_MAX_ACTIVE_SANDBOXES_PER_TENANT – concurrent sandboxes per tenant (default 2)
 *   FLY_SANDBOX_HOURLY_RATE_USD         – estimated $/machine-hour (default 0.02)
 *   FLY_MONTHLY_SPEND_WARNING_USD       – projected monthly spend warn threshold
 *
 * Docs: https://fly.io/docs/machines/api/machines-resource/
 */

import { captureFeatureException } from '@/lib/observability/sentry';

const DEFAULT_API_HOSTNAME = 'https://api.machines.dev';
const DEFAULT_IDLE_TIMEOUT_MINUTES = 20;
const DEFAULT_TERMINAL_PORT = 7681;
const DEFAULT_MEMORY_MB = 512;
const DEFAULT_CPUS = 1;

export type FlyMachineGuest = {
  cpu_kind: 'shared' | 'performance';
  cpus: number;
  memory_mb: number;
};

export type FlyMachineService = {
  protocol: 'tcp' | 'udp';
  internal_port: number;
  ports: Array<{
    port: number;
    handlers: string[];
  }>;
  autostop?: boolean | 'off' | 'stop' | 'suspend';
  autostart?: boolean;
};

export type FlyMachineConfig = {
  image: string;
  env?: Record<string, string>;
  metadata?: Record<string, string>;
  auto_destroy?: boolean;
  restart?: { policy: 'no' | 'always' | 'on-failure'; max_retries?: number };
  guest?: FlyMachineGuest;
  services?: FlyMachineService[];
  init?: { exec?: string[] };
};

export type FlyMachine = {
  id: string;
  name: string;
  state: string;
  region: string;
  private_ip?: string;
  instance_id?: string;
  created_at?: string;
  updated_at?: string;
  config?: FlyMachineConfig;
};

export type LaunchSandboxOptions = {
  /** Correlates the VM with a ticket for ops/debugging. */
  ticketId: string;
  studentId: string;
  /** Idle timeout in minutes; defaults to FLY_IDLE_TIMEOUT_MINUTES or 20. */
  idleTimeoutMinutes?: number;
  /** Extra env injected into the guest. */
  env?: Record<string, string>;
  /** Override region for this launch. */
  region?: string;
};

export type LaunchSandboxResult = {
  machine: FlyMachine;
  appName: string;
  region: string;
  idleTimeoutMinutes: number;
  /** Guest port expected to serve the web terminal websocket. */
  terminalPort: number;
};

export class FlyMachinesError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = 'FlyMachinesError';
    this.status = status;
    this.body = body;
  }
}

export type FlyMachinesConfig = {
  apiToken: string;
  appName: string;
  region: string | null;
  image: string;
  apiHostname: string;
  terminalPort: number;
  idleTimeoutMinutes: number;
};

export function getDefaultIdleTimeoutMinutes(): number {
  const raw = process.env.FLY_IDLE_TIMEOUT_MINUTES;
  if (!raw) return DEFAULT_IDLE_TIMEOUT_MINUTES;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_IDLE_TIMEOUT_MINUTES;
}

/** Read and validate Fly sandbox env. Throws if required vars are missing. */
export function getFlyMachinesConfig(): FlyMachinesConfig {
  const apiToken = process.env.FLY_API_TOKEN?.trim();
  const appName = process.env.FLY_APP_NAME?.trim();
  const image = process.env.FLY_SANDBOX_IMAGE?.trim();

  if (!apiToken) {
    throw new Error('FLY_API_TOKEN is not configured');
  }
  if (!appName) {
    throw new Error('FLY_APP_NAME is not configured');
  }
  if (!image) {
    throw new Error('FLY_SANDBOX_IMAGE is not configured');
  }

  const terminalPortRaw = process.env.FLY_TERMINAL_PORT;
  const terminalPort = terminalPortRaw
    ? Number.parseInt(terminalPortRaw, 10)
    : DEFAULT_TERMINAL_PORT;

  return {
    apiToken,
    appName,
    region: process.env.FLY_REGION?.trim() || null,
    image,
    apiHostname: (
      process.env.FLY_API_HOSTNAME?.trim() || DEFAULT_API_HOSTNAME
    ).replace(/\/$/, ''),
    terminalPort:
      Number.isFinite(terminalPort) && terminalPort > 0
        ? terminalPort
        : DEFAULT_TERMINAL_PORT,
    idleTimeoutMinutes: getDefaultIdleTimeoutMinutes(),
  };
}

async function flyFetch<T>(
  path: string,
  init: RequestInit & { apiToken: string; apiHostname: string }
): Promise<T> {
  const { apiToken, apiHostname, ...requestInit } = init;
  const url = `${apiHostname}${path.startsWith('/') ? path : `/${path}`}`;

  const response = await fetch(url, {
    ...requestInit,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...(requestInit.headers ?? {}),
    },
  });

  const bodyText = await response.text();
  const method = requestInit.method ?? 'GET';

  if (!response.ok) {
    const error = new FlyMachinesError(
      `Fly Machines API ${method} ${path} failed (${response.status})`,
      response.status,
      bodyText
    );
    captureFeatureException(error, {
      feature: 'sandbox',
      pi: 'PI-05',
      operation: 'fly_api',
      extras: {
        method,
        path,
        status: response.status,
        // Truncate — response bodies may include infra details, never student files.
        bodyPreview: bodyText.slice(0, 500),
      },
    });
    throw error;
  }

  if (!bodyText) {
    return undefined as T;
  }

  try {
    return JSON.parse(bodyText) as T;
  } catch (parseError) {
    const error = new FlyMachinesError(
      `Fly Machines API returned non-JSON for ${path}`,
      response.status,
      bodyText
    );
    captureFeatureException(parseError instanceof Error ? parseError : error, {
      feature: 'sandbox',
      pi: 'PI-05',
      operation: 'fly_api_parse',
      extras: {
        method,
        path,
        status: response.status,
        bodyPreview: bodyText.slice(0, 200),
      },
    });
    throw error;
  }
}

function buildSandboxConfig(
  config: FlyMachinesConfig,
  options: LaunchSandboxOptions,
  idleTimeoutMinutes: number
): FlyMachineConfig {
  const idleSeconds = idleTimeoutMinutes * 60;

  return {
    image: config.image,
    auto_destroy: true,
    // Exit when the guest process ends (idle killer / tty session end).
    restart: { policy: 'no' },
    guest: {
      cpu_kind: 'shared',
      cpus: DEFAULT_CPUS,
      memory_mb: DEFAULT_MEMORY_MB,
    },
    env: {
      TICKET_ID: options.ticketId,
      STUDENT_ID: options.studentId,
      IDLE_TIMEOUT_SECONDS: String(idleSeconds),
      // Sandbox images should honor this and exit (auto_destroy cleans up).
      SANDBOX_IDLE_TIMEOUT_MINUTES: String(idleTimeoutMinutes),
      ...(options.env ?? {}),
    },
    metadata: {
      purpose: 'ticket-sandbox',
      ticket_id: options.ticketId,
      student_id: options.studentId,
    },
    // Expose a websocket-capable HTTP service for xterm.js clients.
    // Expected guest: ttyd (or similar) listening on FLY_TERMINAL_PORT.
    services: [
      {
        protocol: 'tcp',
        internal_port: config.terminalPort,
        autostart: true,
        autostop: false,
        ports: [
          { port: 443, handlers: ['tls', 'http'] },
          { port: 80, handlers: ['http'] },
        ],
      },
    ],
  };
}

/**
 * Launch a short-lived Linux sandbox VM for a Tier 2+ shell ticket.
 * The guest image should run a web terminal (e.g. ttyd) on FLY_TERMINAL_PORT.
 */
export async function launchSandboxMachine(
  options: LaunchSandboxOptions
): Promise<LaunchSandboxResult> {
  const config = getFlyMachinesConfig();
  const idleTimeoutMinutes =
    options.idleTimeoutMinutes ?? config.idleTimeoutMinutes;
  const region = options.region ?? config.region ?? undefined;

  const name = [
    'sandbox',
    options.ticketId.replace(/-/g, '').slice(0, 8),
    options.studentId.replace(/-/g, '').slice(0, 8),
    Date.now().toString(36),
  ].join('-');

  const body: {
    name: string;
    region?: string;
    config: FlyMachineConfig;
  } = {
    name,
    config: buildSandboxConfig(config, options, idleTimeoutMinutes),
  };
  if (region) {
    body.region = region;
  }

  const machine = await flyFetch<FlyMachine>(
    `/v1/apps/${encodeURIComponent(config.appName)}/machines`,
    {
      method: 'POST',
      apiToken: config.apiToken,
      apiHostname: config.apiHostname,
      body: JSON.stringify(body),
    }
  );

  return {
    machine,
    appName: config.appName,
    region: machine.region || region || 'unknown',
    idleTimeoutMinutes,
    terminalPort: config.terminalPort,
  };
}

/**
 * Destroy a sandbox machine (force-delete so running VMs are torn down).
 * Prefer calling this on ticket submit and when idle timeout has elapsed.
 */
export async function destroySandboxMachine(machineId: string): Promise<void> {
  const config = getFlyMachinesConfig();
  const id = machineId.trim();
  if (!id) {
    throw new Error('machineId is required');
  }

  await flyFetch<unknown>(
    `/v1/apps/${encodeURIComponent(config.appName)}/machines/${encodeURIComponent(id)}?force=true`,
    {
      method: 'DELETE',
      apiToken: config.apiToken,
      apiHostname: config.apiHostname,
    }
  );
}

/** Fetch a single machine (useful for status / debugging). */
export async function getSandboxMachine(
  machineId: string
): Promise<FlyMachine> {
  const config = getFlyMachinesConfig();
  const id = machineId.trim();
  if (!id) {
    throw new Error('machineId is required');
  }

  return flyFetch<FlyMachine>(
    `/v1/apps/${encodeURIComponent(config.appName)}/machines/${encodeURIComponent(id)}`,
    {
      method: 'GET',
      apiToken: config.apiToken,
      apiHostname: config.apiHostname,
    }
  );
}

/** Wait until the machine reaches a target state (default: started). */
export async function waitForSandboxMachine(
  machineId: string,
  options?: { state?: string; timeoutSeconds?: number }
): Promise<FlyMachine> {
  const config = getFlyMachinesConfig();
  const id = machineId.trim();
  if (!id) {
    throw new Error('machineId is required');
  }

  const state = options?.state ?? 'started';
  const timeout = options?.timeoutSeconds ?? 60;
  const params = new URLSearchParams({
    state,
    timeout: String(timeout),
  });

  return flyFetch<FlyMachine>(
    `/v1/apps/${encodeURIComponent(config.appName)}/machines/${encodeURIComponent(id)}/wait?${params}`,
    {
      method: 'GET',
      apiToken: config.apiToken,
      apiHostname: config.apiHostname,
    }
  );
}
