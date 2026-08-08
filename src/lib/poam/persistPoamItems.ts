import type { SupabaseClient } from '@supabase/supabase-js';

import {
  extractPoamEntries,
  isValidIsoDate,
  isPoamStatus,
  type PoamEntrySubmission,
} from '@/lib/scoring/poam';
import type { TicketSubmission } from '@/lib/scoring';

export type PersistPoamItemsInput = {
  supabase: SupabaseClient;
  tenantId: string;
  studentId: string;
  trackId: string;
  ticketId: string;
  submission: TicketSubmission;
};

export type PersistPoamItemsResult = {
  upserted: number;
  findingIds: string[];
};

function toRow(
  entry: PoamEntrySubmission,
  input: PersistPoamItemsInput,
  now: string
) {
  // Seed exercises use text finding keys (e.g. FIND-AC-2-01). Leave
  // oscal_finding_id null unless a future caller links a real oscal_findings row.
  return {
    tenant_id: input.tenantId,
    student_id: input.studentId,
    track_id: input.trackId,
    ticket_id: input.ticketId,
    finding_id: entry.findingId,
    oscal_finding_id: null as string | null,
    weakness_description: entry.weaknessDescription,
    milestone: entry.milestone,
    scheduled_completion_date: entry.scheduledCompletionDate,
    status: entry.status,
    updated_at: now,
  };
}

/**
 * Upsert POA&M rows for a ticket submission (on resolve / completeness pass).
 */
export async function persistPoamItems(
  input: PersistPoamItemsInput
): Promise<PersistPoamItemsResult> {
  const entries = extractPoamEntries(input.submission).filter(
    (entry) =>
      entry.weaknessDescription &&
      entry.milestone &&
      isValidIsoDate(entry.scheduledCompletionDate) &&
      isPoamStatus(entry.status)
  );

  if (entries.length === 0) {
    return { upserted: 0, findingIds: [] };
  }

  const now = new Date().toISOString();
  const rows = entries.map((entry) => toRow(entry, input, now));

  const { data, error } = await input.supabase
    .from('poam_items')
    .upsert(rows, { onConflict: 'student_id,ticket_id,finding_id' })
    .select('id, finding_id');

  if (error) {
    console.error('poam_items upsert failed:', error);
    throw new Error('Failed to persist POA&M items');
  }

  return {
    upserted: data?.length ?? rows.length,
    findingIds: entries.map((entry) => entry.findingId),
  };
}
