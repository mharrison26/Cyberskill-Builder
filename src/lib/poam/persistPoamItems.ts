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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toRow(
  entry: PoamEntrySubmission,
  input: PersistPoamItemsInput,
  now: string
) {
  // Seed exercises use text finding keys (e.g. FIND-AC-2-01). When the
  // findingId is a real oscal_findings UUID (GRC-04 student history), link it.
  const oscalFindingId = UUID_RE.test(entry.findingId) ? entry.findingId : null;

  return {
    tenant_id: input.tenantId,
    student_id: input.studentId,
    track_id: input.trackId,
    ticket_id: input.ticketId,
    finding_id: entry.findingId,
    oscal_finding_id: oscalFindingId,
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
