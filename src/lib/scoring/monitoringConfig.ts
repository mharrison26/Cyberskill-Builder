import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import {
  isMonitoringAlertRoute,
  isMonitoringAlertType,
  MONITORING_ALERT_ROUTE_LABELS,
  MONITORING_ALERT_TYPE_LABELS,
  type MonitoringAlertRoute,
  type MonitoringAlertType,
} from '@/lib/scoring/ticketUi';

/**
 * Monitoring / alert configuration scoring.
 *
 * Fully deterministic: student submits alert rules (alertType + threshold +
 * route). Each required alert in expected_state must be covered by at least
 * one submission rule with a threshold in [thresholdMin, thresholdMax] and a
 * route in acceptedRoutes. Extra alerts are ignored.
 *
 * initial_state:
 *   {
 *     prompt?: string,
 *     systemName?: string,
 *     services?: Array<{ name, role?, slo? }>,
 *     context?: string,
 *     alertTypeOptions?: string[],
 *     routeOptions?: string[],
 *   }
 *
 * expected_state:
 *   {
 *     requiredAlerts: Array<{
 *       alertType: MonitoringAlertType,
 *       thresholdMin: number,
 *       thresholdMax: number,
 *       acceptedRoutes: MonitoringAlertRoute[],
 *     }>
 *   }
 *
 * submission:
 *   {
 *     type: 'monitoring_config',
 *     alerts: Array<{ alertType, threshold, route }>
 *   }
 */

export {
  MONITORING_ALERT_TYPES,
  MONITORING_ALERT_TYPE_LABELS,
  MONITORING_ALERT_THRESHOLD_HINTS,
  MONITORING_ALERT_ROUTES,
  MONITORING_ALERT_ROUTE_LABELS,
  isMonitoringAlertType,
  isMonitoringAlertRoute,
  isMonitoringConfigTicketType,
  type MonitoringAlertType,
  type MonitoringAlertRoute,
} from '@/lib/scoring/ticketUi';

export type RequiredMonitoringAlert = {
  alertType: MonitoringAlertType;
  thresholdMin: number;
  thresholdMax: number;
  acceptedRoutes: MonitoringAlertRoute[];
};

export type MonitoringConfigExpectedState = {
  requiredAlerts: RequiredMonitoringAlert[];
};

export type MonitoringAlertSubmission = {
  alertType: MonitoringAlertType;
  threshold: number;
  route: MonitoringAlertRoute;
};

export type MonitoringConfigSubmission = {
  type?: string;
  alerts: MonitoringAlertSubmission[];
};

export type RequiredAlertCheckResult = {
  alertType: MonitoringAlertType;
  present: boolean;
  thresholdOk: boolean;
  routeOk: boolean;
  matchedThreshold: number | null;
  matchedRoute: MonitoringAlertRoute | null;
  thresholdMin: number;
  thresholdMax: number;
  acceptedRoutes: MonitoringAlertRoute[];
  reason?: string;
};

export type MonitoringConfigStructuredResult = {
  style: 'monitoring_config';
  submittedCount: number;
  requiredCount: number;
  checks: RequiredAlertCheckResult[];
  allRequiredCovered: boolean;
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return trimmed || null;
}

function normalizeAlertType(value: unknown): MonitoringAlertType | null {
  const key = normalizeKey(value);
  if (!key) return null;
  if (isMonitoringAlertType(key)) return key;
  if (
    key === 'disk' ||
    key === 'disk_usage' ||
    key === 'filesystem' ||
    key === 'low_disk'
  ) {
    return 'disk_space';
  }
  if (
    key === 'service_unavailable' ||
    key === 'healthcheck' ||
    key === 'health_check' ||
    key === 'down'
  ) {
    return 'service_down';
  }
  if (
    key === 'error_rate' ||
    key === 'errors' ||
    key === 'http_errors' ||
    key === '5xx'
  ) {
    return 'high_error_rate';
  }
  if (key === 'latency' || key === 'p99' || key === 'slow_responses') {
    return 'high_latency';
  }
  if (key === 'cpu' || key === 'high_cpu') {
    return 'cpu_saturation';
  }
  return null;
}

function normalizeRoute(value: unknown): MonitoringAlertRoute | null {
  const key = normalizeKey(value);
  if (!key) return null;
  if (isMonitoringAlertRoute(key)) return key;
  if (key === 'pd' || key === 'page' || key === 'page_oncall') {
    return 'pagerduty';
  }
  if (key === 'email' || key === 'oncall_email' || key === 'on_call') {
    return 'email_oncall';
  }
  if (key === 'slack' || key === 'ops_slack' || key === '#ops') {
    return 'slack_ops';
  }
  if (key === 'ticket' || key === 'queue' || key === 'itsm') {
    return 'ticket_queue';
  }
  return null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseRequiredAlert(raw: unknown): RequiredMonitoringAlert | null {
  if (!isPlainObject(raw)) return null;
  const alertType = normalizeAlertType(
    raw.alertType ?? raw.type ?? raw.alert_type ?? raw.metric
  );
  if (!alertType) return null;

  const thresholdMin = parseNumber(
    raw.thresholdMin ?? raw.minThreshold ?? raw.threshold_min ?? raw.min
  );
  const thresholdMax = parseNumber(
    raw.thresholdMax ?? raw.maxThreshold ?? raw.threshold_max ?? raw.max
  );
  if (thresholdMin === null || thresholdMax === null) return null;
  if (thresholdMin > thresholdMax) return null;

  const routesRaw =
    raw.acceptedRoutes ??
    raw.routes ??
    raw.accepted_routes ??
    raw.requiredRoutes ??
    raw.routing;
  const acceptedRoutes: MonitoringAlertRoute[] = [];
  if (Array.isArray(routesRaw)) {
    for (const item of routesRaw) {
      const route = normalizeRoute(item);
      if (route && !acceptedRoutes.includes(route)) {
        acceptedRoutes.push(route);
      }
    }
  } else {
    const single = normalizeRoute(routesRaw);
    if (single) acceptedRoutes.push(single);
  }
  if (acceptedRoutes.length === 0) return null;

  return {
    alertType,
    thresholdMin,
    thresholdMax,
    acceptedRoutes,
  };
}

export function parseMonitoringConfigExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): MonitoringConfigExpectedState {
  if (!isPlainObject(expectedState)) {
    return { requiredAlerts: [] };
  }

  const raw =
    expectedState.requiredAlerts ??
    expectedState.required_alerts ??
    expectedState.alerts ??
    expectedState.rubric;

  if (!Array.isArray(raw)) {
    return { requiredAlerts: [] };
  }

  const requiredAlerts: RequiredMonitoringAlert[] = [];
  for (const item of raw) {
    const parsed = parseRequiredAlert(item);
    if (parsed) requiredAlerts.push(parsed);
  }
  return { requiredAlerts };
}

function parseAlertSubmission(raw: unknown): MonitoringAlertSubmission | null {
  if (!isPlainObject(raw)) return null;
  const alertType = normalizeAlertType(
    raw.alertType ?? raw.type ?? raw.alert_type ?? raw.metric
  );
  const threshold = parseNumber(
    raw.threshold ?? raw.value ?? raw.thresholdValue
  );
  const route = normalizeRoute(
    raw.route ?? raw.routing ?? raw.destination ?? raw.notify
  );
  if (!alertType || threshold === null || !route) return null;
  return { alertType, threshold, route };
}

export function extractMonitoringConfigSubmission(
  submission: TicketSubmission
): MonitoringConfigSubmission | null {
  const rawAlerts = submission.alerts ?? submission.rules ?? submission.config;
  if (!Array.isArray(rawAlerts)) return null;

  const alerts: MonitoringAlertSubmission[] = [];
  for (const item of rawAlerts) {
    const parsed = parseAlertSubmission(item);
    if (parsed) alerts.push(parsed);
  }

  if (alerts.length === 0) return null;

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'monitoring_config',
    alerts,
  };
}

function checkRequiredAlert(
  required: RequiredMonitoringAlert,
  submitted: MonitoringAlertSubmission[]
): RequiredAlertCheckResult {
  const candidates = submitted.filter(
    (alert) => alert.alertType === required.alertType
  );

  if (candidates.length === 0) {
    return {
      alertType: required.alertType,
      present: false,
      thresholdOk: false,
      routeOk: false,
      matchedThreshold: null,
      matchedRoute: null,
      thresholdMin: required.thresholdMin,
      thresholdMax: required.thresholdMax,
      acceptedRoutes: required.acceptedRoutes,
      reason: 'missing',
    };
  }

  // Prefer a fully matching candidate; otherwise report the best partial.
  for (const candidate of candidates) {
    const thresholdOk =
      candidate.threshold >= required.thresholdMin &&
      candidate.threshold <= required.thresholdMax;
    const routeOk = required.acceptedRoutes.includes(candidate.route);
    if (thresholdOk && routeOk) {
      return {
        alertType: required.alertType,
        present: true,
        thresholdOk: true,
        routeOk: true,
        matchedThreshold: candidate.threshold,
        matchedRoute: candidate.route,
        thresholdMin: required.thresholdMin,
        thresholdMax: required.thresholdMax,
        acceptedRoutes: required.acceptedRoutes,
      };
    }
  }

  const first = candidates[0];
  const thresholdOk =
    first.threshold >= required.thresholdMin &&
    first.threshold <= required.thresholdMax;
  const routeOk = required.acceptedRoutes.includes(first.route);

  let reason = 'mismatch';
  if (!thresholdOk && !routeOk) reason = 'bad_threshold_and_route';
  else if (!thresholdOk) reason = 'bad_threshold';
  else if (!routeOk) reason = 'bad_route';

  return {
    alertType: required.alertType,
    present: true,
    thresholdOk,
    routeOk,
    matchedThreshold: first.threshold,
    matchedRoute: first.route,
    thresholdMin: required.thresholdMin,
    thresholdMax: required.thresholdMax,
    acceptedRoutes: required.acceptedRoutes,
    reason,
  };
}

function formatAlertLabel(alertType: MonitoringAlertType): string {
  return MONITORING_ALERT_TYPE_LABELS[alertType] ?? alertType;
}

function formatRouteList(routes: MonitoringAlertRoute[]): string {
  return routes
    .map((route) => MONITORING_ALERT_ROUTE_LABELS[route] ?? route)
    .join(', ');
}

export function evaluateMonitoringConfig(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: MonitoringConfigSubmission | null;
  structured: MonitoringConfigStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseMonitoringConfigExpectedState(ticket.expected_state);
  const parsed = extractMonitoringConfigSubmission(submission);

  const baseStructured: MonitoringConfigStructuredResult = {
    style: 'monitoring_config',
    submittedCount: parsed?.alerts.length ?? 0,
    requiredCount: expected.requiredAlerts.length,
    checks: [],
    allRequiredCovered: false,
  };

  if (expected.requiredAlerts.length === 0) {
    return {
      parsed,
      structured: {
        ...baseStructured,
        reason: 'misconfigured_expected_state',
      },
      ok: false,
      feedback:
        'This monitoring_config ticket is missing requiredAlerts in expected_state. Ask an admin to fix the seed.',
    };
  }

  if (!parsed) {
    return {
      parsed: null,
      structured: { ...baseStructured, reason: 'missing_alerts' },
      ok: false,
      feedback:
        'Submission must include at least one alert with alertType, threshold, and route.',
    };
  }

  const checks = expected.requiredAlerts.map((required) =>
    checkRequiredAlert(required, parsed.alerts)
  );
  const allRequiredCovered = checks.every(
    (check) => check.present && check.thresholdOk && check.routeOk
  );

  const structured: MonitoringConfigStructuredResult = {
    ...baseStructured,
    submittedCount: parsed.alerts.length,
    checks,
    allRequiredCovered,
  };

  if (!allRequiredCovered) {
    const parts: string[] = [];
    for (const check of checks) {
      if (!check.present) {
        parts.push(
          `Missing required alert: ${formatAlertLabel(check.alertType)}.`
        );
        continue;
      }
      if (!check.thresholdOk) {
        parts.push(
          `${formatAlertLabel(check.alertType)} threshold must be between ${check.thresholdMin} and ${check.thresholdMax} (got ${check.matchedThreshold}).`
        );
      }
      if (!check.routeOk) {
        parts.push(
          `${formatAlertLabel(check.alertType)} must route to one of: ${formatRouteList(check.acceptedRoutes)}.`
        );
      }
    }
    structured.reason = 'incomplete_rubric';
    return {
      parsed,
      structured,
      ok: false,
      feedback: parts.join(' '),
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback: `Monitoring configuration covers all required alerts (${checks.map((c) => c.alertType).join(', ')}).`,
  };
}

export const monitoringConfigTicketScorer: TicketScorer = {
  score(submission, ticket): TicketScoreResult {
    const result = evaluateMonitoringConfig(submission, ticket);
    return {
      status: result.ok ? 'resolved' : 'needs_revision',
      structuredResult: result.structured,
      feedback: result.feedback,
    };
  },
};
