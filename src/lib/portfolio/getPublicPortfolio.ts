import { sortPortfolioItemsFlagshipFirst } from '@/lib/portfolio/sortPortfolioItems';
import { createPublicClient } from '@/lib/supabase/public';
import type { OscalObservation } from '@/lib/oscal/toAssessmentFinding';
import type {
  FindingState,
  PortfolioItemKind,
  PortfolioScoreStatus,
} from '@/types';

export type PublicTrackEnrollment = {
  trackId: string;
  trackName: string;
  trackSlug: string;
};

export type PublicPortfolioDefense = {
  id: string;
  url: string;
  mediaType: 'audio' | 'video';
  durationSeconds: number;
  isPublic: true;
  createdAt: string;
};

export type PublicPortfolioItem = {
  id: string;
  itemKind: PortfolioItemKind;
  title: string;
  dcwfCode: string;
  /** Title from work_role_codes via FK join (fresh catalog value). */
  dcwfTitle: string | null;
  narrative: string;
  tier: string | null;
  createdAt: string;
  /** Track flagship capstone — displayed first on the public portfolio. */
  isFlagship: boolean;
  // oscal_finding fields
  controlId: string | null;
  findingState: string | null;
  studentNarrative: string | null;
  observation: OscalObservation | null;
  // ticket_resolution fields
  scoreStatus: PortfolioScoreStatus | null;
  ticketType: string | null;
  /** Public verbal defense when the student marked the recording public. */
  defense: PublicPortfolioDefense | null;
};

/** @deprecated Prefer PublicPortfolioItem; kept for FindingCard mapping. */
export type PublicFinding = {
  id: string;
  controlId: string;
  findingState: string;
  dcwfCode: string;
  dcwfTitle: string | null;
  narrative: string;
  createdAt: string;
  studentNarrative: string | null;
  observation: OscalObservation | null;
};

type WorkRoleCodeEmbed = {
  code: string;
  title: string;
};

function embedWorkRoleTitle(
  embed: WorkRoleCodeEmbed | WorkRoleCodeEmbed[] | null | undefined
): string | null {
  if (!embed) {
    return null;
  }
  const row = Array.isArray(embed) ? embed[0] : embed;
  return row?.title ?? null;
}

export async function getStudentActiveTracks(
  studentId: string
): Promise<PublicTrackEnrollment[]> {
  const supabase = createPublicClient();

  const { data, error } = await supabase.rpc('get_student_active_tracks', {
    p_student_id: studentId,
  });

  if (error) {
    console.error('[getStudentActiveTracks]', error.message);
    return [];
  }

  return (data ?? []).map(
    (row: { track_id: string; track_name: string; track_slug: string }) => ({
      trackId: row.track_id,
      trackName: row.track_name,
      trackSlug: row.track_slug,
    })
  );
}

export async function getPublicPortfolioItems(
  studentId: string
): Promise<PublicPortfolioItem[]> {
  const supabase = createPublicClient();

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
      structured_result,
      score_status,
      ticket_type,
      is_flagship,
      created_at,
      work_role_codes ( code, title )
    `
    )
    .eq('student_id', studentId)
    .eq('is_public', true)
    .order('is_flagship', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getPublicPortfolioItems]', error.message);
    return [];
  }

  const itemIds = (data ?? []).map((row) => row.id as string);
  const defenseByItemId = new Map<string, PublicPortfolioDefense>();

  if (itemIds.length > 0) {
    const itemIdSet = new Set(itemIds);
    const { data: defenses, error: defenseError } = await supabase
      .from('defense_recordings')
      .select(
        'id, artifact_id, portfolio_item_id, storage_path, media_type, duration_seconds, created_at'
      )
      .eq('student_id', studentId)
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    if (defenseError) {
      console.warn('[getPublicPortfolioItems] defenses:', defenseError.message);
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
      if (!key || defenseByItemId.has(key)) continue;

      const storagePath = row.storage_path as string;
      const { data: signed } = await supabase.storage
        .from('defenses')
        .createSignedUrl(storagePath, 60 * 60);

      defenseByItemId.set(key, {
        id: row.id as string,
        url: signed?.signedUrl ?? '',
        mediaType: row.media_type === 'video' ? 'video' : 'audio',
        durationSeconds: (row.duration_seconds as number) ?? 0,
        isPublic: true,
        createdAt: row.created_at as string,
      });
    }
  }

  const items: PublicPortfolioItem[] = (data ?? []).map((row) => {
    const itemKind = row.item_kind as PortfolioItemKind;
    const structured =
      (row.structured_result as Record<string, unknown> | null) ?? {};
    const dcwfTitle = embedWorkRoleTitle(
      row.work_role_codes as
        WorkRoleCodeEmbed | WorkRoleCodeEmbed[] | null | undefined
    );
    const defense = defenseByItemId.get(row.id as string) ?? null;

    if (itemKind === 'oscal_finding') {
      const observation = structured as OscalObservation;
      const findingState =
        typeof structured.finding_state === 'string'
          ? structured.finding_state
          : typeof observation.ai_finding_state === 'string'
            ? observation.ai_finding_state
            : 'accepted';
      const controlId = extractControlId(row.title, structured);
      const studentNarrative =
        typeof row.narrative === 'string' ? row.narrative : null;

      return {
        id: row.id,
        itemKind,
        title: row.title,
        dcwfCode: row.dcwf_code ?? '',
        dcwfTitle,
        narrative: extractNarrative(studentNarrative, observation),
        tier: row.tier ?? null,
        createdAt: row.created_at,
        isFlagship: row.is_flagship === true,
        controlId,
        findingState,
        studentNarrative,
        observation,
        scoreStatus: null,
        ticketType: null,
        defense,
      };
    }

    const scoreStatus =
      row.score_status === 'resolved' || row.score_status === 'needs_revision'
        ? row.score_status
        : null;

    return {
      id: row.id,
      itemKind: 'ticket_resolution',
      title: row.title,
      dcwfCode: row.dcwf_code ?? '',
      dcwfTitle,
      narrative:
        typeof row.narrative === 'string' && row.narrative.trim()
          ? row.narrative.trim()
          : 'No summary available.',
      tier: row.tier ?? null,
      createdAt: row.created_at,
      isFlagship: row.is_flagship === true,
      controlId: null,
      findingState: null,
      studentNarrative: null,
      observation: null,
      scoreStatus,
      ticketType: row.ticket_type ?? null,
      defense,
    };
  });

  return sortPortfolioItemsFlagshipFirst(items);
}

/** @deprecated Use getPublicPortfolioItems. */
export async function getPublicFindings(
  studentId: string
): Promise<PublicFinding[]> {
  const items = await getPublicPortfolioItems(studentId);
  return items
    .filter((item) => item.itemKind === 'oscal_finding')
    .map((item) => ({
      id: item.id,
      controlId: item.controlId ?? item.title,
      findingState: item.findingState ?? 'accepted',
      dcwfCode: item.dcwfCode,
      dcwfTitle: item.dcwfTitle,
      narrative: item.narrative,
      createdAt: item.createdAt,
      studentNarrative: item.studentNarrative,
      observation: item.observation,
    }));
}

function extractControlId(
  title: string,
  structured: Record<string, unknown>
): string {
  if (typeof structured.control_id === 'string' && structured.control_id) {
    return structured.control_id;
  }
  const match = /^Finding:\s*(.+)$/i.exec(title.trim());
  if (match?.[1]) {
    return match[1].trim();
  }
  return title;
}

function extractNarrative(
  studentNarrative: string | null,
  observation: OscalObservation | null
): string {
  if (studentNarrative?.trim()) {
    return studentNarrative.trim();
  }

  const feedback = observation?.feedback;
  if (typeof feedback === 'string' && feedback.trim()) {
    return feedback.trim();
  }

  return 'No summary available.';
}

export function toFindingStateDisplay(findingState: string): FindingState {
  const normalized = findingState.toLowerCase().replace(/-/g, '_');
  switch (normalized) {
    case 'accepted':
    case 'satisfied':
      return 'satisfied';
    case 'rejected':
    case 'not_satisfied':
      return 'not_satisfied';
    case 'under_review':
    case 'insufficient_evidence':
      return 'insufficient_evidence';
    case 'draft':
    case 'submitted':
      return 'not_started';
    default:
      return 'not_started';
  }
}
