import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import {
  isMockDirectoryActionType,
  type MockDirectoryActionType,
  type MockDirectoryLoggedAction,
  type MockDirectoryUser,
  type MockDirectoryUserStatus,
} from '@/lib/scoring/ticketUi';

/**
 * Mock directory / helpdesk admin panel scoring.
 *
 * Fully deterministic: compare the student's client-side action log against
 * `expected_state.requiredActions` (ordered subsequence by default).
 *
 * initial_state:
 *   { mock_directory_users: MockDirectoryUser[], prompt?: string }
 *
 * expected_state:
 *   {
 *     requiredActions: Array<{
 *       type: 'search' | 'verify_identity' | 'unlock' | 'reset_password';
 *       userId?: string;
 *       query?: string; // for search: substring match (case-insensitive)
 *     }>;
 *     requireOrdered?: boolean; // default true
 *   }
 *
 * submission:
 *   { type: 'mock_directory', actions: MockDirectoryLoggedAction[] }
 */

export type MockDirectoryRequiredAction = {
  type: MockDirectoryActionType;
  userId?: string;
  query?: string;
};

export type MockDirectoryExpectedState = {
  requiredActions?: MockDirectoryRequiredAction[];
  /** When true (default), required actions must appear in order as a subsequence. */
  requireOrdered?: boolean;
};

export type MockDirectorySubmission = {
  type?: string;
  actions: MockDirectoryLoggedAction[];
};

export type MockDirectoryActionMatch = {
  required: MockDirectoryRequiredAction;
  matched: boolean;
  matchedAtIndex: number | null;
};

export type MockDirectoryStructuredResult = {
  style: 'mock_directory';
  actionCount: number;
  requiredCount: number;
  matchedCount: number;
  requireOrdered: boolean;
  matches: MockDirectoryActionMatch[];
  missingActions: MockDirectoryRequiredAction[];
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStatus(value: unknown): MockDirectoryUserStatus | null {
  if (value === 'active' || value === 'locked' || value === 'disabled') {
    return value;
  }
  return null;
}

export function parseMockDirectoryUsers(
  initialState: Record<string, unknown> | null | undefined
): MockDirectoryUser[] {
  if (!isPlainObject(initialState)) return [];

  const raw =
    initialState.mock_directory_users ??
    initialState.mockDirectoryUsers ??
    initialState.users;

  if (!Array.isArray(raw)) return [];

  const users: MockDirectoryUser[] = [];

  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;

    const id =
      typeof entry.id === 'string'
        ? entry.id.trim()
        : typeof entry.userId === 'string'
          ? entry.userId.trim()
          : typeof entry.user_id === 'string'
            ? entry.user_id.trim()
            : '';
    if (!id) continue;

    const username =
      typeof entry.username === 'string'
        ? entry.username.trim()
        : typeof entry.userName === 'string'
          ? entry.userName.trim()
          : '';
    const displayName =
      typeof entry.displayName === 'string'
        ? entry.displayName.trim()
        : typeof entry.display_name === 'string'
          ? entry.display_name.trim()
          : typeof entry.name === 'string'
            ? entry.name.trim()
            : username || id;
    const email = typeof entry.email === 'string' ? entry.email.trim() : '';
    const status = normalizeStatus(entry.status) ?? 'active';

    const user: MockDirectoryUser = {
      id,
      username: username || id,
      displayName: displayName || username || id,
      email,
      status,
    };

    if (typeof entry.department === 'string' && entry.department.trim()) {
      user.department = entry.department.trim();
    }
    if (
      typeof entry.identityQuestion === 'string' &&
      entry.identityQuestion.trim()
    ) {
      user.identityQuestion = entry.identityQuestion.trim();
    } else if (
      typeof entry.identity_question === 'string' &&
      entry.identity_question.trim()
    ) {
      user.identityQuestion = entry.identity_question.trim();
    }
    if (
      typeof entry.identityAnswer === 'string' &&
      entry.identityAnswer.trim()
    ) {
      user.identityAnswer = entry.identityAnswer.trim();
    } else if (
      typeof entry.identity_answer === 'string' &&
      entry.identity_answer.trim()
    ) {
      user.identityAnswer = entry.identity_answer.trim();
    }

    users.push(user);
  }

  return users;
}

export function parseMockDirectoryExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): MockDirectoryExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }

  const requireOrdered =
    typeof expectedState.requireOrdered === 'boolean'
      ? expectedState.requireOrdered
      : typeof expectedState.require_ordered === 'boolean'
        ? expectedState.require_ordered
        : true;

  const raw =
    expectedState.requiredActions ?? expectedState.required_actions ?? [];
  const requiredActions: MockDirectoryRequiredAction[] = [];

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry === 'string' && entry.trim()) {
        const [typePart, userPart, ...rest] = entry.trim().split(':');
        if (typePart && isMockDirectoryActionType(typePart)) {
          const action: MockDirectoryRequiredAction = { type: typePart };
          if (typePart === 'search') {
            const query = [userPart, ...rest].filter(Boolean).join(':');
            if (query) action.query = query;
          } else if (userPart) {
            action.userId = userPart;
          }
          requiredActions.push(action);
        }
        continue;
      }

      if (!isPlainObject(entry)) continue;
      const typeRaw =
        typeof entry.type === 'string'
          ? entry.type.trim()
          : typeof entry.action === 'string'
            ? entry.action.trim()
            : '';
      if (!isMockDirectoryActionType(typeRaw)) continue;

      const action: MockDirectoryRequiredAction = { type: typeRaw };
      const userId =
        typeof entry.userId === 'string'
          ? entry.userId.trim()
          : typeof entry.user_id === 'string'
            ? entry.user_id.trim()
            : '';
      if (userId) action.userId = userId;

      const query =
        typeof entry.query === 'string'
          ? entry.query.trim()
          : typeof entry.search === 'string'
            ? entry.search.trim()
            : '';
      if (query) action.query = query;

      requiredActions.push(action);
    }
  }

  return { requiredActions, requireOrdered };
}

export function extractMockDirectorySubmission(
  submission: TicketSubmission
): MockDirectorySubmission | null {
  const raw =
    submission.actions ?? submission.actionLog ?? submission.action_log;
  if (!Array.isArray(raw)) return null;

  const actions: MockDirectoryLoggedAction[] = [];

  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    const typeRaw = typeof entry.type === 'string' ? entry.type.trim() : '';
    if (!isMockDirectoryActionType(typeRaw)) continue;

    const action: MockDirectoryLoggedAction = {
      type: typeRaw,
      at:
        typeof entry.at === 'string' && entry.at.trim()
          ? entry.at.trim()
          : new Date(0).toISOString(),
    };

    const userId =
      typeof entry.userId === 'string'
        ? entry.userId.trim()
        : typeof entry.user_id === 'string'
          ? entry.user_id.trim()
          : '';
    if (userId) action.userId = userId;

    if (typeof entry.query === 'string' && entry.query.trim()) {
      action.query = entry.query.trim();
    }

    if (typeof entry.correct === 'boolean') {
      action.correct = entry.correct;
    }

    actions.push(action);
  }

  return {
    type:
      typeof submission.type === 'string' ? submission.type : 'mock_directory',
    actions,
  };
}

function actionMatchesRequired(
  logged: MockDirectoryLoggedAction,
  required: MockDirectoryRequiredAction
): boolean {
  if (logged.type !== required.type) return false;

  if (required.type === 'search') {
    if (!required.query) return true;
    const query = (logged.query ?? '').toLowerCase();
    return query.includes(required.query.toLowerCase());
  }

  if (required.userId) {
    if ((logged.userId ?? '') !== required.userId) return false;
  }

  if (required.type === 'verify_identity') {
    return logged.correct === true;
  }

  return true;
}

/**
 * Find whether each required action is satisfied by the logged actions.
 * When requireOrdered, match as an ordered subsequence (pointer advances).
 */
export function matchRequiredActions(
  actions: MockDirectoryLoggedAction[],
  requiredActions: MockDirectoryRequiredAction[],
  requireOrdered: boolean
): {
  matches: MockDirectoryActionMatch[];
  matchedCount: number;
  missingActions: MockDirectoryRequiredAction[];
} {
  const matches: MockDirectoryActionMatch[] = [];
  let cursor = 0;

  for (const required of requiredActions) {
    let matchedAtIndex: number | null = null;

    if (requireOrdered) {
      for (let i = cursor; i < actions.length; i += 1) {
        if (actionMatchesRequired(actions[i]!, required)) {
          matchedAtIndex = i;
          cursor = i + 1;
          break;
        }
      }
    } else {
      for (let i = 0; i < actions.length; i += 1) {
        if (actionMatchesRequired(actions[i]!, required)) {
          matchedAtIndex = i;
          break;
        }
      }
    }

    matches.push({
      required,
      matched: matchedAtIndex !== null,
      matchedAtIndex,
    });
  }

  const missingActions = matches
    .filter((m) => !m.matched)
    .map((m) => m.required);

  return {
    matches,
    matchedCount: matches.filter((m) => m.matched).length,
    missingActions,
  };
}

function formatRequiredAction(action: MockDirectoryRequiredAction): string {
  if (action.type === 'search') {
    return action.query ? `search("${action.query}")` : 'search';
  }
  if (action.userId) {
    return `${action.type}(${action.userId})`;
  }
  return action.type;
}

export function evaluateMockDirectoryDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: MockDirectorySubmission | null;
  structured: MockDirectoryStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseMockDirectoryExpectedState(ticket.expected_state);
  const requiredActions = expected.requiredActions ?? [];
  const requireOrdered = expected.requireOrdered !== false;

  const parsed = extractMockDirectorySubmission(submission);

  if (!parsed) {
    const structured: MockDirectoryStructuredResult = {
      style: 'mock_directory',
      actionCount: 0,
      requiredCount: requiredActions.length,
      matchedCount: 0,
      requireOrdered,
      matches: requiredActions.map((required) => ({
        required,
        matched: false,
        matchedAtIndex: null,
      })),
      missingActions: requiredActions,
      reason: 'missing_actions',
    };
    return {
      parsed: null,
      structured,
      ok: false,
      feedback:
        'Submission must include an actions array logging directory admin steps (search, verify identity, unlock, reset password).',
    };
  }

  if (requiredActions.length === 0) {
    const structured: MockDirectoryStructuredResult = {
      style: 'mock_directory',
      actionCount: parsed.actions.length,
      requiredCount: 0,
      matchedCount: 0,
      requireOrdered,
      matches: [],
      missingActions: [],
      reason: 'missing_required_actions',
    };
    return {
      parsed,
      structured,
      ok: false,
      feedback:
        'Ticket expected_state.requiredActions is empty; cannot score this mock directory ticket.',
    };
  }

  const { matches, matchedCount, missingActions } = matchRequiredActions(
    parsed.actions,
    requiredActions,
    requireOrdered
  );

  const structured: MockDirectoryStructuredResult = {
    style: 'mock_directory',
    actionCount: parsed.actions.length,
    requiredCount: requiredActions.length,
    matchedCount,
    requireOrdered,
    matches,
    missingActions,
  };

  if (missingActions.length > 0) {
    structured.reason = 'incomplete_required_actions';
    const missingList = missingActions.map(formatRequiredAction).join(', ');
    const orderHint = requireOrdered
      ? ' Complete them in the required order (identity verification must precede reset when both are required).'
      : '';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Missing or out-of-order required actions: ${missingList}.${orderHint}`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback:
      'All required directory actions were completed correctly. Account recovery steps look good.',
  };
}

export const mockDirectoryTicketScorer: TicketScorer = {
  score(submission, ticket): TicketScoreResult {
    const result = evaluateMockDirectoryDeterministic(submission, ticket);
    return {
      status: result.ok ? 'resolved' : 'needs_revision',
      structuredResult: result.structured,
      feedback: result.feedback,
    };
  },
};
