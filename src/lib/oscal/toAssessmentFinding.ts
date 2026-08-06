export type OscalObservation = {
  feedback?: string;
  strengths?: string;
  gaps?: string;
  cccer?: {
    condition?: string;
    criteria?: string;
    cause?: string;
    effect?: string;
    recommendation?: string;
  };
  ai_finding_state?: string;
};

export type OscalFindingRow = {
  id: string;
  control_id: string;
  finding_state: string;
  student_narrative?: string | null;
  observation?: OscalObservation | null;
};

export type AssessmentFindingJson = {
  uuid: string;
  'control-id': string;
  description: string;
  'related-observations': Array<Record<string, unknown>>;
  state: string;
};

export function mapFindingStateToOscal(findingState: string): string {
  const normalized = findingState.toLowerCase().replace(/-/g, '_');
  switch (normalized) {
    case 'accepted':
    case 'satisfied':
      return 'satisfied';
    case 'rejected':
    case 'not_satisfied':
      return 'not-satisfied';
    case 'under_review':
    case 'insufficient_evidence':
      return 'insufficient-evidence';
    case 'draft':
      return 'draft';
    case 'submitted':
      return 'submitted';
    default:
      return normalized.replace(/_/g, '-');
  }
}

function extractDescription(
  studentNarrative: string | null | undefined,
  observation: OscalObservation | null | undefined
): string {
  if (studentNarrative?.trim()) {
    return studentNarrative.trim();
  }

  const feedback = observation?.feedback;
  if (typeof feedback === 'string' && feedback.trim()) {
    return feedback.trim();
  }

  return '';
}

function buildRelatedObservations(
  observation: OscalObservation | null | undefined
): Array<Record<string, unknown>> {
  if (!observation || typeof observation !== 'object') {
    return [];
  }

  const entry: Record<string, unknown> = {};

  if (observation.feedback?.trim()) {
    entry.feedback = observation.feedback.trim();
  }
  if (observation.strengths?.trim()) {
    entry.strengths = observation.strengths.trim();
  }
  if (observation.gaps?.trim()) {
    entry.gaps = observation.gaps.trim();
  }
  if (observation.cccer && typeof observation.cccer === 'object') {
    const cccer = observation.cccer;
    const cccerEntry: Record<string, string> = {};
    for (const key of [
      'condition',
      'criteria',
      'cause',
      'effect',
      'recommendation',
    ] as const) {
      const value = cccer[key];
      if (typeof value === 'string' && value.trim()) {
        cccerEntry[key] = value.trim();
      }
    }
    if (Object.keys(cccerEntry).length > 0) {
      entry.cccer = cccerEntry;
    }
  }

  return Object.keys(entry).length > 0 ? [entry] : [];
}

export function toAssessmentFinding(
  finding: OscalFindingRow
): AssessmentFindingJson {
  const observation = finding.observation ?? null;

  return {
    uuid: finding.id,
    'control-id': finding.control_id,
    description: extractDescription(finding.student_narrative, observation),
    'related-observations': buildRelatedObservations(observation),
    state: mapFindingStateToOscal(finding.finding_state),
  };
}
