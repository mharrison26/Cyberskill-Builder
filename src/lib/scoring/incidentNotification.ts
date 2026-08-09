import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import { INCIDENT_NOTIFICATION_MIN_DRAFT_LENGTH } from '@/lib/scoring/ticketUi';

/**
 * ISSO / GRC incident notification timeline scoring.
 *
 * Fully deterministic for recipient + deadline identification against
 * expected_state.requiredNotifications. Notification draft is a min-length
 * completeness gate only (no RAG/LLM grading).
 *
 * Resolve only when every required recipient+deadlineHours pair is correct
 * (and extras are absent when allowExtraRecipients is false) and the draft
 * meets minDraftLength.
 *
 * initial_state:
 *   {
 *     incident: { discoveredAt, summary, impact, system, title?, ... },
 *     policy: {
 *       title?,
 *       rules: [{ recipientId, recipientLabel?, deadlineHours, description? }]
 *     },
 *     prompt?
 *   }
 *
 * expected_state:
 *   {
 *     requiredNotifications: [{ recipientId, deadlineHours }],
 *     minDraftLength?: number,
 *     allowExtraRecipients?: boolean
 *   }
 *
 * submission:
 *   {
 *     type: 'incident_notification' | ...,
 *     notifications: [{ recipientId, deadlineHours }],
 *     draft: string
 *   }
 */

export { INCIDENT_NOTIFICATION_MIN_DRAFT_LENGTH } from '@/lib/scoring/ticketUi';

export const INCIDENT_NOTIFICATION_TICKET_TYPES = [
  'incident_notification',
  'incident_reporting',
  'isso_incident_notify',
] as const;

export type IncidentNotificationTicketType =
  (typeof INCIDENT_NOTIFICATION_TICKET_TYPES)[number];

export type IncidentNotificationRule = {
  recipientId: string;
  recipientLabel: string;
  deadlineHours: number;
  description: string;
};

export type IncidentFacts = {
  id: string;
  title: string;
  discoveredAt: string;
  summary: string;
  system: string;
  impact: string;
  classification: string;
};

export type RequiredNotification = {
  recipientId: string;
  deadlineHours: number;
};

export type IncidentNotificationExpectedState = {
  requiredNotifications: RequiredNotification[];
  minDraftLength?: number;
  allowExtraRecipients?: boolean;
};

export type IncidentNotificationSubmission = {
  type?: string;
  notifications: RequiredNotification[];
  draft: string;
};

export type IncidentNotificationStructuredResult = {
  style: 'incident_notification';
  submittedNotifications: RequiredNotification[];
  requiredNotifications: RequiredNotification[];
  matchedRecipientIds: string[];
  missingRecipientIds: string[];
  wrongDeadlineRecipientIds: string[];
  extraRecipientIds: string[];
  notificationsOk: boolean;
  draftLength: number;
  minDraftLength: number;
  draftLengthOk: boolean;
  allowExtraRecipients: boolean;
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isIncidentNotificationTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (INCIDENT_NOTIFICATION_TICKET_TYPES as readonly string[]).includes(
    base
  );
}

function normalizeRecipientId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  return normalized || null;
}

function readPositiveNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number.parseFloat(value.trim());
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function readPositiveInt(value: unknown): number | null {
  const n = readPositiveNumber(value);
  if (n === null) return null;
  return Math.floor(n);
}

function parseNotificationEntry(entry: unknown): RequiredNotification | null {
  if (!isPlainObject(entry)) return null;

  const recipientId = normalizeRecipientId(
    entry.recipientId ??
      entry.recipient_id ??
      entry.id ??
      entry.recipient ??
      entry.to
  );
  if (!recipientId) return null;

  const deadlineHours = readPositiveNumber(
    entry.deadlineHours ?? entry.deadline_hours ?? entry.hours ?? entry.deadline
  );
  if (deadlineHours === null) return null;

  return {
    recipientId,
    deadlineHours: Math.round(deadlineHours * 1000) / 1000,
  };
}

function dedupeNotifications(
  items: RequiredNotification[]
): RequiredNotification[] {
  const byId = new Map<string, RequiredNotification>();
  for (const item of items) {
    if (!byId.has(item.recipientId)) {
      byId.set(item.recipientId, item);
    }
  }
  return Array.from(byId.values()).sort((a, b) =>
    a.recipientId.localeCompare(b.recipientId)
  );
}

export function parseIncidentNotificationExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): IncidentNotificationExpectedState | null {
  if (!isPlainObject(expectedState)) return null;

  const raw =
    expectedState.requiredNotifications ??
    expectedState.required_notifications ??
    expectedState.notifications;

  if (!Array.isArray(raw)) return null;

  const requiredNotifications = dedupeNotifications(
    raw
      .map(parseNotificationEntry)
      .filter((item): item is RequiredNotification => item !== null)
  );

  if (requiredNotifications.length === 0) return null;

  const minDraftLength =
    readPositiveInt(
      expectedState.minDraftLength ?? expectedState.min_draft_length
    ) ?? undefined;

  const allowExtraRecipients =
    typeof expectedState.allowExtraRecipients === 'boolean'
      ? expectedState.allowExtraRecipients
      : typeof expectedState.allow_extra_recipients === 'boolean'
        ? expectedState.allow_extra_recipients
        : undefined;

  return {
    requiredNotifications,
    minDraftLength,
    allowExtraRecipients,
  };
}

export function extractIncidentNotificationSubmission(
  submission: TicketSubmission
): IncidentNotificationSubmission | null {
  const draftRaw =
    submission.draft ??
    submission.notificationDraft ??
    submission.notification_draft ??
    submission.notificationContent ??
    submission.content;

  if (typeof draftRaw !== 'string') return null;

  const rawNotifications =
    submission.notifications ??
    submission.requiredNotifications ??
    submission.recipients;

  if (!Array.isArray(rawNotifications)) return null;

  const notifications = dedupeNotifications(
    rawNotifications
      .map(parseNotificationEntry)
      .filter((item): item is RequiredNotification => item !== null)
  );

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'incident_notification',
    notifications,
    draft: draftRaw.trim(),
  };
}

export function parseIncidentFacts(
  initialState: Record<string, unknown> | null | undefined
): IncidentFacts {
  const empty: IncidentFacts = {
    id: '',
    title: 'Security incident',
    discoveredAt: '',
    summary: '',
    system: '',
    impact: '',
    classification: '',
  };

  if (!isPlainObject(initialState)) return empty;

  const nested = isPlainObject(initialState.incident)
    ? initialState.incident
    : isPlainObject(initialState.scenario)
      ? initialState.scenario
      : initialState;

  const read = (...keys: string[]): string => {
    for (const key of keys) {
      const value = nested[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  };

  return {
    id: read('id', 'incidentId', 'incident_id'),
    title: read('title', 'name') || empty.title,
    discoveredAt: read(
      'discoveredAt',
      'discovered_at',
      'discoveryTime',
      'discovered'
    ),
    summary: read('summary', 'description', 'whatHappened'),
    system: read('system', 'systemName', 'affectedSystem'),
    impact: read('impact', 'businessImpact'),
    classification: read('classification', 'category', 'severity'),
  };
}

export function parseIncidentNotificationPolicyRules(
  initialState: Record<string, unknown> | null | undefined
): IncidentNotificationRule[] {
  if (!isPlainObject(initialState)) return [];

  const policy = isPlainObject(initialState.policy)
    ? initialState.policy
    : initialState;

  const raw =
    policy.rules ??
    policy.sections ??
    initialState.policyRules ??
    initialState.candidateRecipients;

  if (!Array.isArray(raw)) return [];

  const rules: IncidentNotificationRule[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;

    const recipientId = normalizeRecipientId(
      entry.recipientId ?? entry.recipient_id ?? entry.id ?? entry.recipient
    );
    if (!recipientId || seen.has(recipientId)) continue;

    const deadlineHours = readPositiveNumber(
      entry.deadlineHours ?? entry.deadline_hours ?? entry.hours
    );
    if (deadlineHours === null) continue;

    const recipientLabel =
      typeof entry.recipientLabel === 'string' && entry.recipientLabel.trim()
        ? entry.recipientLabel.trim()
        : typeof entry.label === 'string' && entry.label.trim()
          ? entry.label.trim()
          : typeof entry.title === 'string' && entry.title.trim()
            ? entry.title.trim()
            : recipientId;

    const description =
      typeof entry.description === 'string' && entry.description.trim()
        ? entry.description.trim()
        : typeof entry.text === 'string' && entry.text.trim()
          ? entry.text.trim()
          : typeof entry.body === 'string' && entry.body.trim()
            ? entry.body.trim()
            : '';

    seen.add(recipientId);
    rules.push({
      recipientId,
      recipientLabel,
      deadlineHours: Math.round(deadlineHours * 1000) / 1000,
      description,
    });
  }

  return rules;
}

function deadlinesMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.001;
}

export function evaluateIncidentNotificationDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: IncidentNotificationSubmission | null;
  structured: IncidentNotificationStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseIncidentNotificationExpectedState(
    ticket.expected_state
  );
  const parsed = extractIncidentNotificationSubmission(submission);

  const requiredNotifications = expected?.requiredNotifications ?? [];
  const minDraftLength =
    expected?.minDraftLength ?? INCIDENT_NOTIFICATION_MIN_DRAFT_LENGTH;
  const allowExtraRecipients = expected?.allowExtraRecipients === true;

  const structured: IncidentNotificationStructuredResult = {
    style: 'incident_notification',
    submittedNotifications: parsed?.notifications ?? [],
    requiredNotifications,
    matchedRecipientIds: [],
    missingRecipientIds: [],
    wrongDeadlineRecipientIds: [],
    extraRecipientIds: [],
    notificationsOk: false,
    draftLength: parsed?.draft.length ?? 0,
    minDraftLength,
    draftLengthOk: false,
    allowExtraRecipients,
  };

  if (!expected || requiredNotifications.length === 0) {
    structured.reason = 'misconfigured_expected_state';
    return {
      parsed,
      structured,
      ok: false,
      feedback:
        'This incident notification ticket is missing requiredNotifications in expected_state. Ask an admin to fix the seed.',
    };
  }

  if (!parsed) {
    structured.reason = 'missing_fields';
    structured.missingRecipientIds = requiredNotifications.map(
      (n) => n.recipientId
    );
    return {
      parsed: null,
      structured,
      ok: false,
      feedback:
        'Submission must include notifications (recipientId + deadlineHours) and a draft string.',
    };
  }

  const submittedById = new Map(
    parsed.notifications.map((n) => [n.recipientId, n] as const)
  );
  const requiredById = new Map(
    requiredNotifications.map((n) => [n.recipientId, n] as const)
  );

  const matchedRecipientIds: string[] = [];
  const missingRecipientIds: string[] = [];
  const wrongDeadlineRecipientIds: string[] = [];

  for (const required of requiredNotifications) {
    const submitted = submittedById.get(required.recipientId);
    if (!submitted) {
      missingRecipientIds.push(required.recipientId);
      continue;
    }
    if (!deadlinesMatch(submitted.deadlineHours, required.deadlineHours)) {
      wrongDeadlineRecipientIds.push(required.recipientId);
      continue;
    }
    matchedRecipientIds.push(required.recipientId);
  }

  const extraRecipientIds = allowExtraRecipients
    ? []
    : parsed.notifications
        .map((n) => n.recipientId)
        .filter((id) => !requiredById.has(id))
        .sort((a, b) => a.localeCompare(b));

  const draftLengthOk = parsed.draft.length >= minDraftLength;
  const notificationsOk =
    missingRecipientIds.length === 0 &&
    wrongDeadlineRecipientIds.length === 0 &&
    extraRecipientIds.length === 0;

  structured.matchedRecipientIds = matchedRecipientIds.sort((a, b) =>
    a.localeCompare(b)
  );
  structured.missingRecipientIds = missingRecipientIds.sort((a, b) =>
    a.localeCompare(b)
  );
  structured.wrongDeadlineRecipientIds = wrongDeadlineRecipientIds.sort(
    (a, b) => a.localeCompare(b)
  );
  structured.extraRecipientIds = extraRecipientIds;
  structured.notificationsOk = notificationsOk;
  structured.draftLength = parsed.draft.length;
  structured.draftLengthOk = draftLengthOk;

  if (!notificationsOk) {
    const parts: string[] = [];
    if (missingRecipientIds.length > 0) {
      parts.push(
        `Missing required recipient(s): ${missingRecipientIds.join(', ')}.`
      );
    }
    if (wrongDeadlineRecipientIds.length > 0) {
      const details = wrongDeadlineRecipientIds.map((id) => {
        const required = requiredById.get(id)!;
        const submitted = submittedById.get(id)!;
        return `${id} (expected ${required.deadlineHours}h, got ${submitted.deadlineHours}h)`;
      });
      parts.push(`Wrong deadline(s): ${details.join('; ')}.`);
    }
    if (extraRecipientIds.length > 0) {
      parts.push(
        `Extra recipient(s) not required for this incident: ${extraRecipientIds.join(', ')}.`
      );
    }
    structured.reason =
      missingRecipientIds.length > 0
        ? 'missing_recipients'
        : wrongDeadlineRecipientIds.length > 0
          ? 'wrong_deadlines'
          : 'extra_recipients';

    return {
      parsed,
      structured,
      ok: false,
      feedback: parts.join(' '),
    };
  }

  if (!draftLengthOk) {
    structured.reason = 'draft_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Notification draft must be at least ${minDraftLength} characters (got ${parsed.draft.length}).`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback:
      'All required notification recipients and deadlines match the policy, and the draft meets the completeness gate.',
  };
}

export const incidentNotificationTicketScorer: TicketScorer = {
  score(submission, ticket): TicketScoreResult {
    const result = evaluateIncidentNotificationDeterministic(
      submission,
      ticket
    );
    return {
      status: result.ok ? 'resolved' : 'needs_revision',
      structuredResult: result.structured,
      feedback: result.feedback,
    };
  },
};
