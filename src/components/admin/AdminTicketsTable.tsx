'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { Pencil, Plus, ExternalLink } from 'lucide-react';

import {
  createTicket,
  deleteTicket,
  updateTicket,
  type TicketActionResult,
} from '@/app/(app)/admin/tickets/actions';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { DIFFICULTIES, TICKET_TYPES } from '@/lib/tickets/adminOptions';
import { cn } from '@/lib/utils';

export type AdminTicketRow = {
  id: string;
  track_id: string;
  trackName: string;
  trackSlug: string;
  tier: number;
  ticket_type: string;
  difficulty: string;
  sla_minutes: number;
  scenario_brief: string;
  initial_state: string;
  expected_state: string;
  sort_order: number;
};

export type AdminTrackOption = {
  id: string;
  name: string;
  slug: string;
};

const selectClassName = cn(
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm',
  'transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
  'disabled:cursor-not-allowed disabled:opacity-50'
);

const initialActionState: TicketActionResult = {};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-sm text-destructive">
      {message}
    </p>
  );
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : children}
    </Button>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      {pending ? 'Deleting…' : 'Delete'}
    </Button>
  );
}

type TicketFormProps = {
  tracks: AdminTrackOption[];
  ticket: AdminTicketRow | null;
  onSuccess: () => void;
};

function TicketForm({ tracks, ticket, onSuccess }: TicketFormProps) {
  const action = ticket ? updateTicket : createTicket;
  const [state, formAction] = useFormState(action, initialActionState);
  const [deleteState, deleteAction] = useFormState(
    deleteTicket,
    initialActionState
  );

  useEffect(() => {
    if (state.success || deleteState.success) {
      onSuccess();
    }
  }, [state.success, deleteState.success, onSuccess]);

  const defaultTrackId = ticket?.track_id ?? tracks[0]?.id ?? '';
  const typeOptions = useMemo(() => {
    const set = new Set<string>(TICKET_TYPES);
    if (ticket?.ticket_type) set.add(ticket.ticket_type);
    return Array.from(set);
  }, [ticket?.ticket_type]);

  const difficultyOptions = useMemo(() => {
    const set = new Set<string>(DIFFICULTIES);
    if (ticket?.difficulty) set.add(ticket.difficulty);
    return Array.from(set);
  }, [ticket?.difficulty]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
      <form action={formAction} className="space-y-4">
        {ticket ? <input type="hidden" name="id" value={ticket.id} /> : null}

        {(state.error || deleteState.error) && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {state.error ?? deleteState.error}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ticket-track">Track</Label>
            <select
              id="ticket-track"
              name="track_id"
              required
              defaultValue={defaultTrackId}
              className={selectClassName}
              aria-invalid={state.fieldErrors?.track_id ? true : undefined}
            >
              {tracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.name}
                </option>
              ))}
            </select>
            <FieldError message={state.fieldErrors?.track_id} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ticket-tier">Tier</Label>
            <select
              id="ticket-tier"
              name="tier"
              required
              defaultValue={String(ticket?.tier ?? 1)}
              className={selectClassName}
              aria-invalid={state.fieldErrors?.tier ? true : undefined}
            >
              <option value="1">Tier 1</option>
              <option value="2">Tier 2</option>
              <option value="3">Tier 3</option>
            </select>
            <FieldError message={state.fieldErrors?.tier} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ticket-type">Ticket type</Label>
            <select
              id="ticket-type"
              name="ticket_type"
              required
              defaultValue={ticket?.ticket_type ?? 'config_remediation'}
              className={selectClassName}
              aria-invalid={state.fieldErrors?.ticket_type ? true : undefined}
            >
              {typeOptions.map((value) => (
                <option key={value} value={value}>
                  {value.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <FieldError message={state.fieldErrors?.ticket_type} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ticket-difficulty">Difficulty</Label>
            <select
              id="ticket-difficulty"
              name="difficulty"
              required
              defaultValue={ticket?.difficulty ?? 'medium'}
              className={selectClassName}
              aria-invalid={state.fieldErrors?.difficulty ? true : undefined}
            >
              {difficultyOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <FieldError message={state.fieldErrors?.difficulty} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ticket-sla">SLA (minutes)</Label>
            <Input
              id="ticket-sla"
              name="sla_minutes"
              type="number"
              min={0}
              step={1}
              required
              defaultValue={ticket?.sla_minutes ?? 30}
              aria-invalid={state.fieldErrors?.sla_minutes ? true : undefined}
            />
            <FieldError message={state.fieldErrors?.sla_minutes} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ticket-brief">Scenario brief</Label>
          <Textarea
            id="ticket-brief"
            name="scenario_brief"
            required
            rows={4}
            defaultValue={ticket?.scenario_brief ?? ''}
            aria-invalid={state.fieldErrors?.scenario_brief ? true : undefined}
            placeholder="Learner-facing ticket summary…"
          />
          <FieldError message={state.fieldErrors?.scenario_brief} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ticket-initial-state">Initial state (JSON)</Label>
          <Textarea
            id="ticket-initial-state"
            name="initial_state"
            rows={8}
            spellCheck={false}
            className="font-mono text-xs"
            defaultValue={ticket?.initial_state ?? '{\n  \n}'}
            aria-invalid={state.fieldErrors?.initial_state ? true : undefined}
          />
          <FieldError message={state.fieldErrors?.initial_state} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ticket-expected-state">
            Expected state (JSON, optional)
          </Label>
          <Textarea
            id="ticket-expected-state"
            name="expected_state"
            rows={8}
            spellCheck={false}
            className="font-mono text-xs"
            defaultValue={ticket?.expected_state ?? '{\n  \n}'}
            aria-invalid={state.fieldErrors?.expected_state ? true : undefined}
          />
          <p className="text-xs text-muted-foreground">
            Used for deterministic scoring (e.g. config remediation). Leave as{' '}
            <code className="text-xs">{'{}'}</code> when not applicable.
          </p>
          <FieldError message={state.fieldErrors?.expected_state} />
        </div>

        <SheetFooter className="gap-2 sm:justify-between">
          <SubmitButton>
            {ticket ? 'Save changes' : 'Create ticket'}
          </SubmitButton>
        </SheetFooter>
      </form>

      {ticket ? (
        <form action={deleteAction} className="border-t border-border pt-4">
          <input type="hidden" name="id" value={ticket.id} />
          <DeleteButton />
        </form>
      ) : null}
    </div>
  );
}

type AdminTicketsTableProps = {
  rows: AdminTicketRow[];
  tracks: AdminTrackOption[];
};

export function AdminTicketsTable({ rows, tracks }: AdminTicketsTableProps) {
  const router = useRouter();
  const [trackFilter, setTrackFilter] = useState<string>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<AdminTicketRow | null>(null);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (trackFilter !== 'all' && row.track_id !== trackFilter) return false;
      if (tierFilter !== 'all' && String(row.tier) !== tierFilter) return false;
      return true;
    });
  }, [rows, trackFilter, tierFilter]);

  const columns: DataTableColumn<AdminTicketRow>[] = [
    {
      key: 'sort_order',
      header: '#',
      sortable: true,
      className: 'w-12',
    },
    {
      key: 'scenario_brief',
      header: 'Scenario',
      sortable: true,
      render: (row) => (
        <span className="line-clamp-2 max-w-xs">{row.scenario_brief}</span>
      ),
    },
    { key: 'trackName', header: 'Track', sortable: true },
    {
      key: 'tier',
      header: 'Tier',
      sortable: true,
      render: (row) => <Badge variant="outline">Tier {row.tier}</Badge>,
    },
    {
      key: 'ticket_type',
      header: 'Type',
      sortable: true,
      render: (row) => (
        <span className="capitalize">{row.ticket_type.replace(/_/g, ' ')}</span>
      ),
    },
    {
      key: 'difficulty',
      header: 'Difficulty',
      sortable: true,
      className: 'capitalize',
    },
    {
      key: 'sla_minutes',
      header: 'SLA',
      sortable: true,
      render: (row) => `${row.sla_minutes}m`,
    },
    {
      key: 'id',
      header: 'Actions',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setEditing(row);
              setSheetOpen(true);
            }}
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Edit
          </Button>
          <Button
            render={
              <Link
                href={`/tracks/${row.trackSlug}/tickets/${row.id}?preview=1`}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
            variant="ghost"
            size="sm"
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            Preview
          </Button>
        </div>
      ),
    },
  ];

  function handleOpenCreate() {
    setEditing(null);
    setSheetOpen(true);
  }

  function handleSuccess() {
    setSheetOpen(false);
    setEditing(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="space-y-1">
            <Label htmlFor="filter-track" className="text-xs">
              Track
            </Label>
            <select
              id="filter-track"
              value={trackFilter}
              onChange={(e) => setTrackFilter(e.target.value)}
              className={cn(selectClassName, 'w-48')}
            >
              <option value="all">All tracks</option>
              {tracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="filter-tier" className="text-xs">
              Tier
            </Label>
            <select
              id="filter-tier"
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              className={cn(selectClassName, 'w-36')}
            >
              <option value="all">All tiers</option>
              <option value="1">Tier 1</option>
              <option value="2">Tier 2</option>
              <option value="3">Tier 3</option>
            </select>
          </div>
        </div>

        <Button
          type="button"
          onClick={handleOpenCreate}
          disabled={tracks.length === 0}
        >
          <Plus className="size-4" aria-hidden="true" />
          New ticket
        </Button>
      </div>

      {tracks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Create a track before adding tickets.
        </p>
      ) : (
        <DataTable
          data={filtered}
          columns={columns}
          searchKeys={[
            'scenario_brief',
            'trackName',
            'ticket_type',
            'difficulty',
          ]}
          searchPlaceholder="Search tickets…"
          emptyMessage="No tickets match the current filters."
        />
      )}

      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setEditing(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl"
          showCloseButton
        >
          <SheetHeader>
            <SheetTitle>{editing ? 'Edit ticket' : 'Create ticket'}</SheetTitle>
            <SheetDescription>
              {editing
                ? 'Update ticket content used in student consoles.'
                : 'Add a ticket scenario to a training track.'}
            </SheetDescription>
          </SheetHeader>
          {sheetOpen ? (
            <TicketForm
              key={editing?.id ?? 'create'}
              tracks={tracks}
              ticket={editing}
              onSuccess={handleSuccess}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
