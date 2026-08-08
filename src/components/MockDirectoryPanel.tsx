'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { parseMockDirectoryUsers } from '@/lib/scoring/mockDirectory';
import type {
  MockDirectoryLoggedAction,
  MockDirectoryUser,
  MockDirectoryUserStatus,
} from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type MockDirectoryPanelProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function statusVariant(
  status: MockDirectoryUserStatus
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'locked') return 'destructive';
  if (status === 'disabled') return 'secondary';
  return 'outline';
}

function formatAction(action: MockDirectoryLoggedAction): string {
  switch (action.type) {
    case 'search':
      return `Search "${action.query ?? ''}"`;
    case 'verify_identity':
      return action.correct
        ? `Verified identity (${action.userId ?? 'user'})`
        : `Identity verification failed (${action.userId ?? 'user'})`;
    case 'unlock':
      return `Unlocked ${action.userId ?? 'user'}`;
    case 'reset_password':
      return `Reset password for ${action.userId ?? 'user'}`;
    default:
      return action.type;
  }
}

export function MockDirectoryPanel({
  ticket,
  readOnly = false,
  className,
}: MockDirectoryPanelProps) {
  const initialState = asRecord(ticket.initial_state);
  const seedUsers = useMemo(
    () => parseMockDirectoryUsers(initialState),
    [initialState]
  );

  const prompt =
    typeof initialState.prompt === 'string' && initialState.prompt.trim()
      ? initialState.prompt.trim()
      : 'Use this simulated directory console to find the affected user, verify their identity when required, unlock the account, and reset the password. This is not a real directory.';

  const [users, setUsers] = useState<MockDirectoryUser[]>(seedUsers);
  const [searchInput, setSearchInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [identityAnswer, setIdentityAnswer] = useState('');
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [verifiedUserIds, setVerifiedUserIds] = useState<Set<string>>(
    () => new Set()
  );
  const [actions, setActions] = useState<MockDirectoryLoggedAction[]>([]);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;

  const filteredUsers = useMemo(() => {
    const q = activeQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) => {
      const haystack = [
        user.username,
        user.displayName,
        user.email,
        user.department ?? '',
        user.id,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [users, activeQuery]);

  function appendAction(
    partial: Omit<MockDirectoryLoggedAction, 'at'> & { at?: string }
  ) {
    const next: MockDirectoryLoggedAction = {
      ...partial,
      at: partial.at ?? new Date().toISOString(),
    };
    setActions((prev) => [...prev, next]);
    return next;
  }

  function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;

    const query = searchInput.trim();
    setActiveQuery(query);
    setFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);
    setActionMessage(null);

    if (!query) return;

    appendAction({ type: 'search', query });
  }

  function selectUser(userId: string) {
    setSelectedUserId(userId);
    setIdentityAnswer('');
    setIdentityError(null);
    setActionMessage(null);
  }

  function handleVerifyIdentity(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly || !selectedUser) return;

    setIdentityError(null);
    setActionMessage(null);
    setFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);

    const expected = (selectedUser.identityAnswer ?? '').trim().toLowerCase();
    const provided = identityAnswer.trim().toLowerCase();
    const correct = Boolean(expected) && provided === expected;

    appendAction({
      type: 'verify_identity',
      userId: selectedUser.id,
      correct,
    });

    if (!correct) {
      setIdentityError(
        'Identity answer does not match directory records. Try again.'
      );
      return;
    }

    setVerifiedUserIds((prev) => new Set(prev).add(selectedUser.id));
    setActionMessage(`Identity verified for ${selectedUser.displayName}.`);
    setIdentityAnswer('');
  }

  function handleUnlock() {
    if (readOnly || !selectedUser) return;
    if (selectedUser.status !== 'locked') {
      setActionMessage('Account is not locked.');
      return;
    }

    setFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);

    appendAction({ type: 'unlock', userId: selectedUser.id });
    setUsers((prev) =>
      prev.map((user) =>
        user.id === selectedUser.id ? { ...user, status: 'active' } : user
      )
    );
    setActionMessage(`Unlocked ${selectedUser.username}.`);
  }

  function handleResetPassword() {
    if (readOnly || !selectedUser) return;

    setFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);
    setIdentityError(null);

    const needsVerify = Boolean(selectedUser.identityQuestion);
    if (needsVerify && !verifiedUserIds.has(selectedUser.id)) {
      setIdentityError(
        'Verify identity before resetting the password for this account.'
      );
      return;
    }

    appendAction({ type: 'reset_password', userId: selectedUser.id });
    setActionMessage(
      `Temporary password issued for ${selectedUser.username} (simulated).`
    );
  }

  async function handleSubmit() {
    if (readOnly) return;

    setSubmitError(null);
    setFeedback(null);
    setScoreStatus(null);

    if (actions.length === 0) {
      setSubmitError('Log at least one directory action before submitting.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'mock_directory',
          actions,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit directory actions.');
      }

      setScoreStatus(payload.status ?? null);
      setFeedback(payload.feedback ?? 'Submission recorded.');
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Something went wrong while submitting.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="mock-directory-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="mock-directory-heading" className="text-lg font-semibold">
          Directory admin console
        </h2>
        <Badge variant="secondary">Simulated</Badge>
        <Badge variant="outline">Not a real directory</Badge>
      </div>

      <p className="max-w-prose text-sm text-muted-foreground">{prompt}</p>

      {seedUsers.length === 0 ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          Ticket is missing <code>initial_state.mock_directory_users</code>.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Find a user</CardTitle>
              <CardDescription>
                Search by username, display name, email, or department.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={handleSearch}
                className="flex flex-col gap-3 sm:flex-row sm:items-end"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <Label htmlFor="mock-directory-search">Search</Label>
                  <Input
                    id="mock-directory-search"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="e.g. jdoe or finance"
                    disabled={readOnly || isSubmitting}
                  />
                </div>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={readOnly || isSubmitting}
                >
                  Search
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Directory results</CardTitle>
              <CardDescription>
                {activeQuery
                  ? `${filteredUsers.length} match${filteredUsers.length === 1 ? '' : 'es'} for “${activeQuery}”.`
                  : `${users.length} users in the simulated directory. Run a search to log the find-user step.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No users found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[1%]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow
                        key={user.id}
                        data-state={
                          selectedUserId === user.id ? 'selected' : undefined
                        }
                      >
                        <TableCell>
                          <div className="space-y-0.5">
                            <p className="font-medium">{user.displayName}</p>
                            <p className="text-xs text-muted-foreground">
                              {user.username}
                              {user.department ? ` · ${user.department}` : ''}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {user.email || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(user.status)}>
                            {user.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="sm"
                            variant={
                              selectedUserId === user.id ? 'default' : 'outline'
                            }
                            onClick={() => selectUser(user.id)}
                            disabled={readOnly || isSubmitting}
                          >
                            Select
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {selectedUser ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Account actions — {selectedUser.displayName}
                </CardTitle>
                <CardDescription>
                  Unlock or reset only after confirming you have the right
                  account. Password reset requires identity verification when a
                  challenge question is configured.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Username</dt>
                    <dd className="font-medium">{selectedUser.username}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>
                      <Badge variant={statusVariant(selectedUser.status)}>
                        {selectedUser.status}
                      </Badge>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Email</dt>
                    <dd>{selectedUser.email || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Department</dt>
                    <dd>{selectedUser.department || '—'}</dd>
                  </div>
                </dl>

                {selectedUser.identityQuestion ? (
                  <form onSubmit={handleVerifyIdentity} className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="mock-directory-identity">
                        Identity verification
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {selectedUser.identityQuestion}
                      </p>
                      <Input
                        id="mock-directory-identity"
                        value={identityAnswer}
                        onChange={(event) => {
                          setIdentityAnswer(event.target.value);
                          setIdentityError(null);
                        }}
                        placeholder="Answer"
                        disabled={
                          readOnly ||
                          isSubmitting ||
                          verifiedUserIds.has(selectedUser.id)
                        }
                        autoComplete="off"
                      />
                      {verifiedUserIds.has(selectedUser.id) ? (
                        <p className="text-xs text-muted-foreground">
                          Identity verified for this session.
                        </p>
                      ) : null}
                    </div>
                    <Button
                      type="submit"
                      variant="secondary"
                      disabled={
                        readOnly ||
                        isSubmitting ||
                        verifiedUserIds.has(selectedUser.id)
                      }
                    >
                      Verify identity
                    </Button>
                  </form>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No identity challenge configured for this account.
                  </p>
                )}

                {identityError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {identityError}
                  </p>
                ) : null}

                {actionMessage ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    {actionMessage}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={handleUnlock}
                    disabled={
                      readOnly ||
                      isSubmitting ||
                      selectedUser.status !== 'locked'
                    }
                  >
                    Unlock account
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleResetPassword}
                    disabled={
                      readOnly ||
                      isSubmitting ||
                      selectedUser.status === 'disabled'
                    }
                  >
                    Reset password
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Action log</CardTitle>
              <CardDescription>
                Every console action is recorded client-side and submitted for
                scoring.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {actions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No actions yet. Search for a user to begin.
                </p>
              ) : (
                <ol className="space-y-2 text-sm">
                  {actions.map((action, index) => (
                    <li
                      key={`${action.at}-${action.type}-${index}`}
                      className="rounded-md border border-border bg-muted/30 px-3 py-2"
                    >
                      <p className="font-medium">{formatAction(action)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(action.at).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {submitError ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {submitError}
            </p>
          ) : null}

          {feedback ? (
            <div
              role="status"
              className={cn(
                'rounded-md border px-3 py-2 text-sm',
                scoreStatus === 'resolved'
                  ? 'border-status-satisfied-foreground/20 bg-status-satisfied text-status-satisfied-foreground'
                  : 'border-border bg-muted/40'
              )}
            >
              {scoreStatus ? (
                <p className="mb-1 font-medium capitalize">
                  Status: {scoreStatus.replace(/_/g, ' ')}
                </p>
              ) : null}
              <p className="text-muted-foreground">{feedback}</p>
            </div>
          ) : null}

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={readOnly || isSubmitting || seedUsers.length === 0}
          >
            {isSubmitting ? 'Submitting…' : 'Submit directory actions'}
          </Button>
        </div>
      </div>
    </section>
  );
}
