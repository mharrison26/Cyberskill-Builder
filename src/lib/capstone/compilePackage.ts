import type { SupabaseClient } from '@supabase/supabase-js';

import {
  DEFAULT_CAPSTONE_SOURCE_ARTIFACTS,
  GRC_TICKET_CODES,
  ticketTypeBase,
  type CapstoneSourceArtifactDef,
  type GrcTicketCode,
} from '@/lib/capstone/ticketCodes';

/**
 * Expected sibling submission shapes (integrate when GRC-03/04/09 land):
 *
 * GRC-03 `oscal_ssp`:
 *   { type?: 'oscal_ssp', oscalSsp?: object, ssp?: object, controlImplementations?: unknown }
 *
 * GRC-04 `poam` / `poam_draft`:
 *   { entries: Array<{ findingId, weaknessDescription, milestone, scheduledCompletionDate, status }> }
 *   plus rows in `poam_items`
 *
 * GRC-09 `oscal_generator`:
 *   { type?: 'oscal_generator', files?: Record<string,string>, generatedOscal?: object,
 *     oscalDocument?: object, outputPath?: string }
 */

export type CompiledArtifactStatus = 'present' | 'missing' | 'incomplete';

export type CompiledArtifact = {
  code: GrcTicketCode;
  label: string;
  ticketTypes: string[];
  status: CompiledArtifactStatus;
  ticketId: string | null;
  progressStatus: string | null;
  /** Human-readable summary for the package UI. */
  summary: string;
  /** Normalized payload excerpt for RAG / display. */
  payload: Record<string, unknown> | null;
  /** Full text used for RAG corpus chunks. */
  textCorpus: string;
};

export type CompiledAuthorizationPackage = {
  trackId: string;
  studentId: string;
  artifacts: CompiledArtifact[];
  complete: boolean;
  missingCodes: GrcTicketCode[];
  compiledAt: string;
  /**
   * Where package content came from:
   * - prior_submission: all present artifacts from student work
   * - seed: only seeded sample ATO excerpts (no live artifacts)
   * - mixed: live artifacts preferred, gaps filled from seedPackage
   * Optional for callers that construct packages in tests / sibling scorers.
   */
  packageSource?: 'prior_submission' | 'seed' | 'mixed' | 'empty';
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeJson(value: unknown, maxLen = 12_000): string {
  try {
    const text = JSON.stringify(value, null, 2);
    if (text.length <= maxLen) return text;
    return `${text.slice(0, maxLen)}\n…(truncated)`;
  } catch {
    return String(value);
  }
}

export function parseSourceArtifactsFromTicketState(
  initialState: Record<string, unknown> | null | undefined
): CapstoneSourceArtifactDef[] {
  const raw = initialState?.sourceArtifacts;
  if (!Array.isArray(raw) || raw.length === 0) {
    return [...DEFAULT_CAPSTONE_SOURCE_ARTIFACTS];
  }

  const parsed: CapstoneSourceArtifactDef[] = [];
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    const code =
      typeof entry.code === 'string' && entry.code.trim()
        ? (entry.code.trim().toUpperCase() as GrcTicketCode)
        : null;
    const ticketTypes = Array.isArray(entry.ticketTypes)
      ? entry.ticketTypes.filter((t): t is string => typeof t === 'string')
      : Array.isArray(entry.ticket_types)
        ? entry.ticket_types.filter((t): t is string => typeof t === 'string')
        : [];
    const label =
      typeof entry.label === 'string' && entry.label.trim()
        ? entry.label.trim()
        : (code ?? 'Artifact');
    if (!code || ticketTypes.length === 0) continue;
    const table = entry.table === 'poam_items' ? 'poam_items' : undefined;
    parsed.push({ code, ticketTypes, label, table });
  }

  return parsed.length > 0 ? parsed : [...DEFAULT_CAPSTONE_SOURCE_ARTIFACTS];
}

function extractSspPayload(
  submission: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!submission) return null;
  if (isPlainObject(submission.oscalSsp)) return submission.oscalSsp;
  if (isPlainObject(submission.ssp)) return submission.ssp;
  if (isPlainObject(submission.oscal_ssp)) return submission.oscal_ssp;
  if (isPlainObject(submission.systemSecurityPlan)) {
    return submission.systemSecurityPlan;
  }
  if (
    isPlainObject(submission['system-security-plan']) ||
    typeof submission.implementationStatus === 'string' ||
    Array.isArray(submission.controlImplementations)
  ) {
    return submission;
  }
  return Object.keys(submission).length > 0 ? submission : null;
}

function extractGeneratorPayload(
  submission: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!submission) return null;
  if (isPlainObject(submission.generatedOscal)) {
    return { generatedOscal: submission.generatedOscal };
  }
  if (isPlainObject(submission.oscalDocument)) {
    return { oscalDocument: submission.oscalDocument };
  }
  if (isPlainObject(submission.files)) {
    return { files: submission.files };
  }
  if (isPlainObject(submission.filesystem)) {
    return { files: submission.filesystem };
  }
  return Object.keys(submission).length > 0 ? submission : null;
}

function extractPoamPayload(
  submission: Record<string, unknown> | null,
  poamRows: Array<Record<string, unknown>>
): Record<string, unknown> | null {
  const entries = Array.isArray(submission?.entries)
    ? submission.entries
    : Array.isArray(submission?.poamEntries)
      ? submission.poamEntries
      : null;

  if (poamRows.length > 0 || (entries && entries.length > 0)) {
    return {
      entries: entries ?? [],
      poamItems: poamRows,
    };
  }
  return null;
}

function summarizeSsp(payload: Record<string, unknown> | null): string {
  if (!payload) return 'No SSP fragment submission found.';
  const keys = Object.keys(payload);
  return `SSP artifact keys: ${keys.slice(0, 8).join(', ') || '(empty)'}.`;
}

function summarizePoam(payload: Record<string, unknown> | null): string {
  if (!payload) return 'No POA&M entries found.';
  const items = Array.isArray(payload.poamItems) ? payload.poamItems : [];
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const count = Math.max(items.length, entries.length);
  return `${count} POA&M entr${count === 1 ? 'y' : 'ies'} available.`;
}

function summarizeGenerator(payload: Record<string, unknown> | null): string {
  if (!payload) return 'No OSCAL generator submission found.';
  if (isPlainObject(payload.files)) {
    const paths = Object.keys(payload.files);
    return `Generator submission with ${paths.length} file(s): ${paths.slice(0, 5).join(', ')}.`;
  }
  return `Generator artifact keys: ${Object.keys(payload).slice(0, 8).join(', ')}.`;
}

function corpusForArtifact(
  code: GrcTicketCode,
  payload: Record<string, unknown> | null
): string {
  if (!payload) return '';
  const header = `## ${code} artifact\n`;
  return header + safeJson(payload);
}

type TicketRow = {
  id: string;
  ticket_type: string;
  scenario_brief: string | null;
  sort_order: number;
};

type ProgressRow = {
  ticket_id: string;
  status: string;
  submission: Record<string, unknown> | null;
};

export type CompileStudentPackageInput = {
  supabase: SupabaseClient;
  studentId: string;
  trackId: string;
  /** Capstone ticket initial_state (optional sourceArtifacts override). */
  initialState?: Record<string, unknown> | null;
};

/**
 * Parse seeded ATO package excerpts from ticket initial_state so AO review
 * remains playable when the student has not completed ISSO-04 / GRC-03–09 yet.
 *
 * Accepts `seedPackage.artifacts` or a top-level `compiledPackage.artifacts`
 * array of { code, label?, status?, summary?, payload?, textCorpus? }.
 */
export function parseSeedPackageFromTicketState(
  initialState: Record<string, unknown> | null | undefined
): CompiledArtifact[] {
  if (!isPlainObject(initialState)) return [];

  const seedRoot = isPlainObject(initialState.seedPackage)
    ? initialState.seedPackage
    : isPlainObject(initialState.compiledPackage)
      ? initialState.compiledPackage
      : isPlainObject(initialState.seed_package)
        ? initialState.seed_package
        : null;

  const rawArtifacts = seedRoot
    ? seedRoot.artifacts
    : Array.isArray(initialState.seedArtifacts)
      ? initialState.seedArtifacts
      : null;

  if (!Array.isArray(rawArtifacts)) return [];

  const artifacts: CompiledArtifact[] = [];
  for (const entry of rawArtifacts) {
    if (!isPlainObject(entry)) continue;
    const codeRaw =
      typeof entry.code === 'string' && entry.code.trim()
        ? entry.code.trim().toUpperCase()
        : '';
    if (!codeRaw) continue;

    const code = codeRaw as GrcTicketCode;
    const label =
      typeof entry.label === 'string' && entry.label.trim()
        ? entry.label.trim()
        : code;
    const ticketTypes = Array.isArray(entry.ticketTypes)
      ? entry.ticketTypes.filter((t): t is string => typeof t === 'string')
      : [];
    const statusRaw =
      entry.status === 'present' ||
      entry.status === 'missing' ||
      entry.status === 'incomplete'
        ? entry.status
        : 'present';
    const summary =
      typeof entry.summary === 'string' && entry.summary.trim()
        ? entry.summary.trim()
        : `${label} (seeded sample)`;
    const payload = isPlainObject(entry.payload) ? entry.payload : null;
    const textCorpus =
      typeof entry.textCorpus === 'string' && entry.textCorpus.trim()
        ? entry.textCorpus
        : typeof entry.text_corpus === 'string' && entry.text_corpus.trim()
          ? entry.text_corpus
          : corpusForArtifact(code, payload);

    artifacts.push({
      code,
      label,
      ticketTypes,
      status: statusRaw,
      ticketId: null,
      progressStatus: 'seeded',
      summary,
      payload,
      textCorpus,
    });
  }

  return artifacts;
}

/**
 * Prefer live student artifacts; fill missing codes from seedPackage so the
 * ISSO-05 / GRC-11 AO review stays solvable standalone.
 */
export function mergeLivePackageWithSeed(
  live: CompiledAuthorizationPackage,
  seedArtifacts: CompiledArtifact[]
): CompiledAuthorizationPackage {
  if (seedArtifacts.length === 0) {
    return {
      ...live,
      packageSource: live.artifacts.some((a) => a.status === 'present')
        ? 'prior_submission'
        : 'empty',
    };
  }

  const seedByCode = new Map(seedArtifacts.map((a) => [a.code, a]));
  let usedSeed = false;
  let usedLive = false;

  const artifacts = live.artifacts.map((artifact) => {
    if (artifact.status === 'present' && artifact.payload) {
      usedLive = true;
      return artifact;
    }
    const seeded = seedByCode.get(artifact.code);
    if (seeded && seeded.status === 'present') {
      usedSeed = true;
      return {
        ...seeded,
        // Keep the live ticket id / progress when available for UI context.
        ticketId: artifact.ticketId ?? seeded.ticketId,
        progressStatus: artifact.progressStatus ?? seeded.progressStatus,
        summary: `${seeded.summary} (seeded — complete ISSO-04 / prior tickets for your live package)`,
      };
    }
    if (artifact.payload || artifact.status !== 'missing') {
      usedLive = true;
    }
    return artifact;
  });

  // Include seed-only artifacts not in the live source list (e.g. SAR excerpt).
  for (const seeded of seedArtifacts) {
    if (!artifacts.some((a) => a.code === seeded.code)) {
      usedSeed = true;
      artifacts.push(seeded);
    }
  }

  const missingCodes = artifacts
    .filter((a) => a.status !== 'present')
    .map((a) => a.code);

  let packageSource: CompiledAuthorizationPackage['packageSource'] = 'empty';
  if (usedLive && usedSeed) packageSource = 'mixed';
  else if (usedLive) packageSource = 'prior_submission';
  else if (usedSeed) packageSource = 'seed';

  return {
    ...live,
    artifacts,
    complete: missingCodes.length === 0,
    missingCodes,
    packageSource,
  };
}

/** Pure helper for tests / preview: seed-only package from initial_state. */
export function compileSeedAuthorizationPackage(
  initialState: Record<string, unknown> | null | undefined,
  options?: { trackId?: string; studentId?: string }
): CompiledAuthorizationPackage {
  const artifacts = parseSeedPackageFromTicketState(initialState);
  const missingCodes = artifacts
    .filter((a) => a.status !== 'present')
    .map((a) => a.code);

  return {
    trackId: options?.trackId ?? 'seed',
    studentId: options?.studentId ?? 'seed',
    artifacts,
    complete: artifacts.length > 0 && missingCodes.length === 0,
    missingCodes,
    compiledAt: new Date().toISOString(),
    packageSource: artifacts.length > 0 ? 'seed' : 'empty',
  };
}

/**
 * Load the student's GRC-03 / GRC-04 / GRC-09 artifacts into one package.
 * Falls back to `initial_state.seedPackage` excerpts when live work is missing
 * (ISSO-04 compiled package / ISSO-05 AO review preview path).
 */
export async function compileStudentPackage(
  input: CompileStudentPackageInput
): Promise<CompiledAuthorizationPackage> {
  const sources = parseSourceArtifactsFromTicketState(input.initialState);
  const allTypes = new Set(
    sources.flatMap((s) => s.ticketTypes.map((t) => t.toLowerCase()))
  );

  const { data: tickets, error: ticketsError } = await input.supabase
    .from('tickets')
    .select('id, ticket_type, scenario_brief, sort_order')
    .eq('track_id', input.trackId);

  if (ticketsError) {
    throw new Error(`Failed to load track tickets: ${ticketsError.message}`);
  }

  const matchingTickets = ((tickets ?? []) as TicketRow[]).filter((t) =>
    allTypes.has(ticketTypeBase(t.ticket_type))
  );

  const ticketIds = matchingTickets.map((t) => t.id);
  let progressRows: ProgressRow[] = [];

  if (ticketIds.length > 0) {
    const { data: progress, error: progressError } = await input.supabase
      .from('ticket_progress')
      .select('ticket_id, status, submission')
      .eq('student_id', input.studentId)
      .in('ticket_id', ticketIds);

    if (progressError) {
      throw new Error(
        `Failed to load ticket progress: ${progressError.message}`
      );
    }

    progressRows = (progress ?? []).map((row) => ({
      ticket_id: row.ticket_id as string,
      status: row.status as string,
      submission: isPlainObject(row.submission)
        ? (row.submission as Record<string, unknown>)
        : null,
    }));
  }

  const progressByTicket = new Map(
    progressRows.map((row) => [row.ticket_id, row])
  );

  /** portfolio_items often hold compiled SSP / generator payloads in structured_result. */
  const portfolioByTicket = new Map<string, Record<string, unknown>>();
  if (ticketIds.length > 0) {
    const { data: portfolioRows, error: portfolioError } = await input.supabase
      .from('portfolio_items')
      .select('ticket_id, structured_result, submission, score_status')
      .eq('student_id', input.studentId)
      .in('ticket_id', ticketIds);

    if (portfolioError) {
      console.warn(
        '[compileStudentPackage] portfolio_items load:',
        portfolioError.message
      );
    } else {
      for (const row of portfolioRows ?? []) {
        const ticketId = row.ticket_id as string | null;
        if (!ticketId) continue;
        const structured = isPlainObject(row.structured_result)
          ? row.structured_result
          : {};
        const submission = isPlainObject(row.submission) ? row.submission : {};
        portfolioByTicket.set(ticketId, { ...submission, ...structured });
      }
    }
  }

  let poamRows: Array<Record<string, unknown>> = [];
  if (sources.some((s) => s.table === 'poam_items')) {
    const { data, error } = await input.supabase
      .from('poam_items')
      .select(
        'id, finding_id, weakness_description, milestone, scheduled_completion_date, status, ticket_id'
      )
      .eq('student_id', input.studentId)
      .eq('track_id', input.trackId);

    if (error) {
      // Table may not exist yet in some environments; treat as empty.
      console.warn('[compileStudentPackage] poam_items load:', error.message);
      poamRows = [];
    } else {
      poamRows = (data ?? []) as Array<Record<string, unknown>>;
    }
  }

  const artifacts: CompiledArtifact[] = sources.map((source) => {
    const typeSet = new Set(source.ticketTypes.map((t) => t.toLowerCase()));
    const candidates = matchingTickets
      .filter((t) => typeSet.has(ticketTypeBase(t.ticket_type)))
      .sort((a, b) => a.sort_order - b.sort_order);

    let chosen: TicketRow | null = null;
    let chosenProgress: ProgressRow | null = null;

    for (const candidate of candidates) {
      const progress = progressByTicket.get(candidate.id) ?? null;
      if (progress?.status === 'resolved') {
        chosen = candidate;
        chosenProgress = progress;
        break;
      }
      if (!chosen && progress) {
        chosen = candidate;
        chosenProgress = progress;
      }
      if (!chosen) {
        chosen = candidate;
      }
    }

    const progressSubmission = chosenProgress?.submission ?? null;
    const portfolioPayload = chosen
      ? (portfolioByTicket.get(chosen.id) ?? null)
      : null;
    const mergedSubmission =
      progressSubmission || portfolioPayload
        ? {
            ...(portfolioPayload ?? {}),
            ...(progressSubmission ?? {}),
          }
        : null;

    let payload: Record<string, unknown> | null = null;
    let summary = '';

    if (source.code === GRC_TICKET_CODES.SSP) {
      payload =
        extractSspPayload(mergedSubmission) ??
        extractSspPayload(portfolioPayload);
      // structured_result from oscal_ssp scorer nests the document under `ssp`
      if (!payload && portfolioPayload && isPlainObject(portfolioPayload.ssp)) {
        payload = portfolioPayload.ssp;
      }
      summary = summarizeSsp(payload);
    } else if (source.code === GRC_TICKET_CODES.POAM) {
      payload = extractPoamPayload(mergedSubmission, poamRows);
      summary = summarizePoam(payload);
    } else if (source.code === GRC_TICKET_CODES.OSCAL_GENERATOR) {
      payload =
        extractGeneratorPayload(mergedSubmission) ??
        extractGeneratorPayload(portfolioPayload);
      summary = summarizeGenerator(payload);
    } else {
      payload = mergedSubmission;
      summary = payload
        ? `Submission with keys: ${Object.keys(payload).join(', ')}.`
        : 'No submission found.';
    }

    const resolved = chosenProgress?.status === 'resolved';
    let status: CompiledArtifactStatus = 'missing';
    if (payload && resolved) {
      status = 'present';
    } else if (payload || chosenProgress) {
      status = 'incomplete';
      if (!resolved && payload) {
        summary = `${summary} (ticket not resolved yet)`;
      }
    } else if (!chosen) {
      summary = `No ${source.label} ticket (${source.ticketTypes.join(', ')}) found on this track yet.`;
    } else {
      summary = `${source.label} ticket found but not submitted.`;
    }

    // POA&M can be present via poam_items even if progress shape is odd.
    if (
      source.code === GRC_TICKET_CODES.POAM &&
      poamRows.length > 0 &&
      status !== 'present'
    ) {
      status = resolved || poamRows.length > 0 ? 'present' : status;
      if (status === 'present' && !payload) {
        payload = { poamItems: poamRows, entries: [] };
        summary = summarizePoam(payload);
      }
    }

    return {
      code: source.code,
      label: source.label,
      ticketTypes: [...source.ticketTypes],
      status,
      ticketId: chosen?.id ?? null,
      progressStatus: chosenProgress?.status ?? null,
      summary,
      payload,
      textCorpus: corpusForArtifact(source.code, payload),
    };
  });

  const missingCodes = artifacts
    .filter((a) => a.status !== 'present')
    .map((a) => a.code);

  const live: CompiledAuthorizationPackage = {
    trackId: input.trackId,
    studentId: input.studentId,
    artifacts,
    complete: missingCodes.length === 0,
    missingCodes,
    compiledAt: new Date().toISOString(),
    packageSource: artifacts.some((a) => a.status === 'present')
      ? 'prior_submission'
      : 'empty',
  };

  const seedArtifacts = parseSeedPackageFromTicketState(input.initialState);
  return mergeLivePackageWithSeed(live, seedArtifacts);
}

/** Flatten package into a single RAG query / prompt block. */
export function formatCompiledPackageForPrompt(
  pkg: CompiledAuthorizationPackage
): string {
  return pkg.artifacts
    .map((artifact) => {
      const body =
        artifact.textCorpus.trim() ||
        `(${artifact.status}) ${artifact.summary}`;
      return `### ${artifact.code} — ${artifact.label} [${artifact.status}]

${artifact.summary}

${body}`;
    })
    .join('\n\n');
}
