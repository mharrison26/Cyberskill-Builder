'use server';

import { revalidatePath } from 'next/cache';

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createClient } from '@/lib/supabase/server';

export type TicketActionResult = {
  error?: string;
  success?: boolean;
  fieldErrors?: {
    track_id?: string;
    tier?: string;
    ticket_type?: string;
    difficulty?: string;
    sla_minutes?: string;
    scenario_brief?: string;
    initial_state?: string;
    expected_state?: string;
    id?: string;
  };
};

function parseJsonObject(
  raw: string,
  fieldLabel: string
): { value?: Record<string, unknown>; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { value: {} };
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      return { error: `${fieldLabel} must be a JSON object` };
    }
    return { value: parsed as Record<string, unknown> };
  } catch {
    return { error: `${fieldLabel} is not valid JSON` };
  }
}

function parseTier(raw: string): { value?: number; error?: string } {
  const tier = Number(raw);
  if (!Number.isInteger(tier) || tier < 1 || tier > 3) {
    return { error: 'Tier must be 1, 2, or 3' };
  }
  return { value: tier };
}

function parseSlaMinutes(raw: string): { value?: number; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { error: 'SLA minutes is required' };
  }
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 0) {
    return { error: 'SLA minutes must be a non-negative integer' };
  }
  return { value };
}

function parseRequiredText(
  raw: string,
  label: string
): { value?: string; error?: string } {
  const value = raw.trim();
  if (!value) {
    return { error: `${label} is required` };
  }
  return { value };
}

type ParsedTicketFields = {
  track_id: string;
  tier: number;
  ticket_type: string;
  difficulty: string;
  sla_minutes: number;
  scenario_brief: string;
  initial_state: Record<string, unknown>;
  expected_state: Record<string, unknown>;
};

function parseTicketForm(formData: FormData): {
  fields?: ParsedTicketFields;
  fieldErrors: TicketActionResult['fieldErrors'];
} {
  const fieldErrors: TicketActionResult['fieldErrors'] = {};

  const track_id = String(formData.get('track_id') ?? '').trim();
  if (!track_id) fieldErrors.track_id = 'Track is required';

  const tierResult = parseTier(String(formData.get('tier') ?? ''));
  if (tierResult.error) fieldErrors.tier = tierResult.error;

  const ticketTypeResult = parseRequiredText(
    String(formData.get('ticket_type') ?? ''),
    'Ticket type'
  );
  if (ticketTypeResult.error) fieldErrors.ticket_type = ticketTypeResult.error;

  const difficultyResult = parseRequiredText(
    String(formData.get('difficulty') ?? ''),
    'Difficulty'
  );
  if (difficultyResult.error) fieldErrors.difficulty = difficultyResult.error;

  const slaResult = parseSlaMinutes(String(formData.get('sla_minutes') ?? ''));
  if (slaResult.error) fieldErrors.sla_minutes = slaResult.error;

  const briefResult = parseRequiredText(
    String(formData.get('scenario_brief') ?? ''),
    'Scenario brief'
  );
  if (briefResult.error) fieldErrors.scenario_brief = briefResult.error;

  const initialResult = parseJsonObject(
    String(formData.get('initial_state') ?? ''),
    'Initial state'
  );
  if (initialResult.error) fieldErrors.initial_state = initialResult.error;

  const expectedResult = parseJsonObject(
    String(formData.get('expected_state') ?? ''),
    'Expected state'
  );
  if (expectedResult.error) fieldErrors.expected_state = expectedResult.error;

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  return {
    fields: {
      track_id,
      tier: tierResult.value!,
      ticket_type: ticketTypeResult.value!,
      difficulty: difficultyResult.value!,
      sla_minutes: slaResult.value!,
      scenario_brief: briefResult.value!,
      initial_state: initialResult.value!,
      expected_state: expectedResult.value!,
    },
    fieldErrors,
  };
}

export async function createTicket(
  _prevState: TicketActionResult,
  formData: FormData
): Promise<TicketActionResult> {
  const { profile } = await requireAdmin();
  const { fields, fieldErrors } = parseTicketForm(formData);

  if (!fields || Object.keys(fieldErrors ?? {}).length > 0) {
    return { fieldErrors };
  }

  const supabase = await createClient();

  const { data: maxRow } = await supabase
    .from('tickets')
    .select('sort_order')
    .eq('track_id', fields.track_id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const sort_order =
    typeof maxRow?.sort_order === 'number' ? maxRow.sort_order + 1 : 0;

  const { error } = await supabase.from('tickets').insert({
    tenant_id: profile.tenant_id,
    track_id: fields.track_id,
    tier: fields.tier,
    ticket_type: fields.ticket_type,
    difficulty: fields.difficulty,
    sla_minutes: fields.sla_minutes,
    scenario_brief: fields.scenario_brief,
    initial_state: fields.initial_state,
    expected_state: fields.expected_state,
    sort_order,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/admin/tickets');
  return { success: true };
}

export async function updateTicket(
  _prevState: TicketActionResult,
  formData: FormData
): Promise<TicketActionResult> {
  await requireAdmin();

  const id = String(formData.get('id') ?? '').trim();
  if (!id) {
    return { fieldErrors: { id: 'Ticket id is required' } };
  }

  const { fields, fieldErrors } = parseTicketForm(formData);
  if (!fields || Object.keys(fieldErrors ?? {}).length > 0) {
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('tickets')
    .update({
      track_id: fields.track_id,
      tier: fields.tier,
      ticket_type: fields.ticket_type,
      difficulty: fields.difficulty,
      sla_minutes: fields.sla_minutes,
      scenario_brief: fields.scenario_brief,
      initial_state: fields.initial_state,
      expected_state: fields.expected_state,
    })
    .eq('id', id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/admin/tickets');
  revalidatePath(`/tracks`);
  return { success: true };
}

export async function deleteTicket(
  _prevState: TicketActionResult,
  formData: FormData
): Promise<TicketActionResult> {
  await requireAdmin();

  const id = String(formData.get('id') ?? '').trim();
  if (!id) {
    return { fieldErrors: { id: 'Ticket id is required' } };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('tickets').delete().eq('id', id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/admin/tickets');
  return { success: true };
}
