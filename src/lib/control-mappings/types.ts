/** Framework keys stored in public.control_mappings. */
export const CONTROL_FRAMEWORKS = [
  'nist_800_53',
  'soc2',
  'iso27001',
] as const;

export type ControlFramework = (typeof CONTROL_FRAMEWORKS)[number];

export type MappingConfidence = 'high' | 'medium' | 'low';

export type ControlMappingRow = {
  source_framework: ControlFramework;
  source_control_id: string;
  target_framework: ControlFramework;
  target_control_id: string;
  mapping_confidence: MappingConfidence;
};

export type ControlMappingTargetPrompt = {
  framework: ControlFramework;
  label?: string;
  /** Candidate control IDs shown in the UI (correct + distractors). */
  options?: string[];
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
};

export function isControlFramework(value: unknown): value is ControlFramework {
  return (
    typeof value === 'string' &&
    (CONTROL_FRAMEWORKS as readonly string[]).includes(value)
  );
}
