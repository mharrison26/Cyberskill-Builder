import { createPublicClient } from '@/lib/supabase/public';
import type { OscalObservation } from '@/lib/oscal/toAssessmentFinding';
import type { FindingState } from '@/types';

export type PublicTrackEnrollment = {
  trackId: string;
  trackName: string;
  trackSlug: string;
};

export type PublicFinding = {
  id: string;
  controlId: string;
  findingState: string;
  dcwfCode: string;
  narrative: string;
  createdAt: string;
  studentNarrative: string | null;
  observation: OscalObservation | null;
};

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

export async function getPublicFindings(
  studentId: string
): Promise<PublicFinding[]> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from('oscal_findings')
    .select(
      'id, control_id, finding_state, student_narrative, observation, dcwf_code, created_at'
    )
    .eq('student_id', studentId)
    .eq('is_public', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getPublicFindings]', error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    controlId: row.control_id,
    findingState: row.finding_state,
    dcwfCode: row.dcwf_code ?? '',
    narrative: extractNarrative(row.student_narrative, row.observation),
    createdAt: row.created_at,
    studentNarrative: row.student_narrative,
    observation: (row.observation as OscalObservation | null) ?? null,
  }));
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
