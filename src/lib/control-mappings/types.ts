/** Framework keys stored in public.control_mappings. */
export const CONTROL_FRAMEWORKS = ['nist_800_53', 'soc2', 'iso27001'] as const;

export type ControlFramework = (typeof CONTROL_FRAMEWORKS)[number];

export type MappingConfidence = 'high' | 'medium' | 'low';

export type ControlMappingRow = {
  source_framework: ControlFramework;
  source_control_id: string;
  target_framework: ControlFramework;
  target_control_id: string;
  mapping_confidence: MappingConfidence;
};

/** Candidate option for multi-select control mapping (string id or rich object). */
export type ControlMappingOption = {
  /** Control identifier shown/scored (e.g. CC6.1, A.5.15). */
  id: string;
  label?: string;
  /** Authored teaching rationale shown after grading. */
  rationale?: string;
  /**
   * Optional NIST (or other) control to deep-link from feedback.
   * Defaults to `id` when it looks like a NIST control id.
   */
  controlId?: string;
};

export type ControlMappingTargetPrompt = {
  framework: ControlFramework;
  label?: string;
  /**
   * Candidate control IDs shown in the UI (correct + distractors).
   * Prefer rich `{ id, rationale }` objects; plain strings remain supported.
   */
  options?: Array<string | ControlMappingOption>;
};

/** Shape of tickets.initial_state for ticket_type = control_mapping. */
export type ControlMappingInitialState = {
  source_framework: ControlFramework;
  source_control_id: string;
  source_label?: string;
  prompt?: string;
  targets: ControlMappingTargetPrompt[];
};

/** Student submission payload for control_mapping tickets. */
export type ControlMappingSubmission = {
  answers: Partial<Record<ControlFramework, string[]>>;
  /** Strong vs partial overlap explanation (GRC-01 RAG-graded narrative). */
  overlapNarrative?: string;
};

export function isControlFramework(value: unknown): value is ControlFramework {
  return (
    typeof value === 'string' &&
    (CONTROL_FRAMEWORKS as readonly string[]).includes(value)
  );
}
