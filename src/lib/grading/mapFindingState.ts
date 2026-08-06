export type AiFindingState =
  'satisfied' | 'insufficient_evidence' | 'not_satisfied';

export type DbFindingState =
  'draft' | 'submitted' | 'under_review' | 'accepted' | 'rejected';

const AI_FINDING_STATES: AiFindingState[] = [
  'satisfied',
  'insufficient_evidence',
  'not_satisfied',
];

export function isAiFindingState(value: string): value is AiFindingState {
  return AI_FINDING_STATES.includes(value as AiFindingState);
}

/**
 * Map Claude assessment states to oscal_findings.finding_state CHECK values.
 *
 * - satisfied -> accepted
 * - insufficient_evidence -> under_review (needs follow-up or more evidence)
 * - not_satisfied -> rejected
 */
export function mapAiFindingStateToDb(aiState: AiFindingState): DbFindingState {
  switch (aiState) {
    case 'satisfied':
      return 'accepted';
    case 'insufficient_evidence':
      return 'under_review';
    case 'not_satisfied':
      return 'rejected';
  }
}
