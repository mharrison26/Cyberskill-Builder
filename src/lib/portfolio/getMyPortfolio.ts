import type { SupabaseClient } from '@supabase/supabase-js';

import {
  extractTrainingFeedback,
  type TrainingFeedback,
} from '@/lib/feedback';
import type { OscalObservation } from '@/lib/oscal/toAssessmentFinding';
import { sortPortfolioItemsFlagshipFirst } from '@/lib/portfolio/sortPortfolioItems';
import type { PortfolioItemKind, PortfolioScoreStatus } from '@/types';

export type MyPortfolioDefense = {
  id: string;
  url: string;
  mediaType: 'audio' | 'video';
  durationSeconds: number;
  isPublic: boolean;
  createdAt: string;
  storagePath: string;
};

export type MyPortfolioPromptQuestion = {
  id?: string;
  prompt: string;
  focus?: string;
};

export type MyPortfolioItem = {
  id: string;
  itemKind: PortfolioItemKind;
  title: string;
  dcwfCode: string;
  dcwfTitle: string | null;
  narrative: string;
  tier: string | null;
  createdAt: string;
  isPublic: boolean;
  isFlagship: boolean;
  trackId: string;
  relatedFindingId: string | null;
  /** RAG AO/interview prompts from ticket submission (when present). */
  promptQuestions: MyPortfolioPromptQuestion[];
  controlId: string | null;
  findingState: string | null;
  studentNarrative: string | null;
  observation: OscalObservation | null;
  scoreStatus: PortfolioScoreStatus | null;
  ticketType: string | null;
  /** Persisted rich training feedback for ticket resolutions (reopenable). */
  trainingFeedback: TrainingFeedback | null;
  defense: MyPortfolioDefense | null;
};

type WorkRoleCodeEmbed = {
  code: string;
  title: string;
};

function embedWorkRoleTitle(
  embed: WorkRoleCodeEmbed | WorkRoleCodeEmbed[] | null | undefined
): string | null {
  if (!embed) return null;
  const row = Array.isArray(embed) ? embed[0] : embed;
  return row?.title ?? null;
}

function extractControlId(
  title: string,
  structured: Record<string, unknown>
): string | null {
  if (typeof structured.control_id === 'string') return structured.control_id;
  const match = title.match(/\b([A-Z]{2}-\d+(?:\(\d+\))?)\b/);
  return match?.[1] ?? null;
}

function extractNarrative(
  studentNarrative: string | null,
  observation: OscalObservation
): string {
  if (studentNarrative?.trim()) return studentNarrative.trim();
  if (typeof observation.feedback === 'string' && observation.feedback.trim()) {
    return observation.feedback.trim();
  }
  return 'No narrative available.';
}

function extractPromptQuestions(
  submission: Record<string, unknown> | null | undefined
): MyPortfolioPromptQuestion[] {
  const raw = submission?.questions;
  if (!Array.isArray(raw)) return [];
  const questions: MyPortfolioPromptQuestion[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index];
    if (typeof item === 'string' && item.trim()) {
      questions.push({ id: `q${index + 1}`, prompt: item.trim() });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const prompt =
      typeof row.prompt === 'string'
        ? row.prompt.trim()
        : typeof row.question === 'string'
          ? row.question.trim()
          : '';
    if (!prompt) continue;
    questions.push({
      id: typeof row.id === 'string' ? row.id : `q${index + 1}`,
      prompt,
      ...(typeof row.focus === 'string' ? { focus: row.focus } : {}),
    });
  }
  return questions;
}

/**
 * Current user's portfolio ledger (public + private), with defense recordings.
 */
export async function getMyPortfolioItems(
  supabase: SupabaseClient,
  studentId: string
): Promise<MyPortfolioItem[]> {
  const { data, error } = await supabase
    .from('portfolio_items')
    .select(
      `
      id,
      item_kind,
      title,
      dcwf_code,
      narrative,
      tier,
      track_id,
      oscal_finding_id,
      submission,
      structured_result,
      score_status,
      ticket_type,
      is_flagship,
      is_public,
      created_at,
      work_role_codes ( code, title )
    `
    )
    .eq('student_id', studentId)
    .order('is_flagship', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getMyPortfolioItems]', error.message);
    return [];
  }

  const itemIds = (data ?? []).map((row) => row.id as string);

  const defenseByArtifact = new Map<string, MyPortfolioDefense>();

  if (itemIds.length > 0) {
    const itemIdSet = new Set(itemIds);
    const { data: defenses, error: defenseError } = await supabase
      .from('defense_recordings')
      .select(
        'id, artifact_id, portfolio_item_id, storage_path, media_type, duration_seconds, is_public, created_at'
      )
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (defenseError) {
      // Table may not exist until migration 20260809160000 is applied.
      console.warn('[getMyPortfolioItems] defenses:', defenseError.message);
    }

    for (const row of defenses ?? []) {
      const portfolioKey = row.portfolio_item_id as string | null;
      const artifactKey = row.artifact_id as string;
      const key =
        portfolioKey && itemIdSet.has(portfolioKey)
          ? portfolioKey
          : itemIdSet.has(artifactKey)
            ? artifactKey
            : null;
      if (!key || defenseByArtifact.has(key)) continue;

      const storagePath = row.storage_path as string;
      const { data: signed } = await supabase.storage
        .from('defenses')
        .createSignedUrl(storagePath, 60 * 60);

      defenseByArtifact.set(key, {
        id: row.id as string,
        url: signed?.signedUrl ?? '',
        mediaType: row.media_type === 'video' ? 'video' : 'audio',
        durationSeconds: (row.duration_seconds as number) ?? 0,
        isPublic: row.is_public === true,
        createdAt: row.created_at as string,
        storagePath,
      });
    }
  }

  const items: MyPortfolioItem[] = (data ?? []).map((row) => {
    const itemKind = row.item_kind as PortfolioItemKind;
    const structured =
      (row.structured_result as Record<string, unknown> | null) ?? {};
    const submission = (row.submission as Record<string, unknown> | null) ?? {};
    const dcwfTitle = embedWorkRoleTitle(
      row.work_role_codes as
        WorkRoleCodeEmbed | WorkRoleCodeEmbed[] | null | undefined
    );
    const defense = defenseByArtifact.get(row.id as string) ?? null;
    const trackId = row.track_id as string;
    const relatedFindingId = (row.oscal_finding_id as string | null) ?? null;
    const promptQuestions = extractPromptQuestions(submission);

    if (itemKind === 'oscal_finding') {
      const observation = structured as OscalObservation;
      const findingState =
        typeof structured.finding_state === 'string'
          ? structured.finding_state
          : typeof observation.ai_finding_state === 'string'
            ? observation.ai_finding_state
            : 'accepted';
      const studentNarrative =
        typeof row.narrative === 'string' ? row.narrative : null;

      return {
        id: row.id as string,
        itemKind,
        title: row.title as string,
        dcwfCode: (row.dcwf_code as string) ?? '',
        dcwfTitle,
        narrative: extractNarrative(studentNarrative, observation),
        tier: (row.tier as string | null) ?? null,
        createdAt: row.created_at as string,
        isPublic: row.is_public === true,
        isFlagship: row.is_flagship === true,
        trackId,
        relatedFindingId,
        promptQuestions,
        controlId: extractControlId(row.title as string, structured),
        findingState,
        studentNarrative,
        observation,
        scoreStatus: null,
        ticketType: null,
        trainingFeedback: null,
        defense,
      };
    }

    const scoreStatus =
      row.score_status === 'resolved' || row.score_status === 'needs_revision'
        ? row.score_status
        : null;

    return {
      id: row.id as string,
      itemKind: 'ticket_resolution',
      title: row.title as string,
      dcwfCode: (row.dcwf_code as string) ?? '',
      dcwfTitle,
      narrative:
        typeof row.narrative === 'string' && row.narrative.trim()
          ? row.narrative.trim()
          : 'No summary available.',
      tier: (row.tier as string | null) ?? null,
      createdAt: row.created_at as string,
      isPublic: row.is_public === true,
      isFlagship: row.is_flagship === true,
      trackId,
      relatedFindingId,
      promptQuestions,
      controlId: null,
      findingState: null,
      studentNarrative: null,
      observation: null,
      scoreStatus,
      ticketType: (row.ticket_type as string | null) ?? null,
      trainingFeedback: extractTrainingFeedback(structured),
      defense,
    };
  });

  return sortPortfolioItemsFlagshipFirst(items);
}
