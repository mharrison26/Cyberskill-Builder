/**
 * WebSocket URL shape for xterm.js → Fly sandbox terminal.
 *
 * The sandbox image is expected to expose a tty websocket (e.g. ttyd) on
 * FLY_TERMINAL_PORT, published via Fly Proxy on 443 (TLS) / 80.
 *
 * Browser clients cannot set arbitrary headers on WebSocket; we therefore
 * encode the target machine in the query string. The guest (or a tiny edge
 * proxy in the sandbox image) should honor `machine_id` / route sticky via
 * Fly's `fly-force-instance-id` when terminating on a gateway.
 *
 * Returned shape:
 *   wss://{FLY_APP_NAME}.fly.dev/?machine_id={id}
 *
 * Optional override: FLY_TERMINAL_WS_BASE (e.g. wss://sandbox.example.com)
 */

export type TerminalConnection = {
  /** Full websocket URL for xterm.js `new WebSocket(url)`. */
  websocketUrl: string;
  /** Machine id to send as Fly-Force-Instance-Id when the client can. */
  flyForceInstanceId: string;
  appName: string;
};

export function buildTerminalWebSocketUrl(
  appName: string,
  machineId: string
): TerminalConnection {
  const base =
    process.env.FLY_TERMINAL_WS_BASE?.trim().replace(/\/$/, '') ||
    `wss://${appName}.fly.dev`;

  const url = new URL(base.includes('://') ? base : `wss://${base}`);
  url.searchParams.set('machine_id', machineId);

  return {
    websocketUrl: url.toString(),
    flyForceInstanceId: machineId,
    appName,
  };
}
