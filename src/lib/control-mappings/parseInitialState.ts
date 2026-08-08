import {
  isControlFramework,
  type ControlFramework,
  type ControlMappingInitialState,
  type ControlMappingTargetPrompt,
} from '@/lib/control-mappings/types';
import { normalizeControlId } from '@/lib/control-mappings/normalize';

function parseTarget(raw: unknown): ControlMappingTargetPrompt | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (!isControlFramework(obj.framework)) return null;

  const options = Array.isArray(obj.options)
    ? obj.options.filter(
        (v): v is string => typeof v === 'string' && v.trim().length > 0
      )
    : undefined;

  return {
    framework: obj.framework,
    label: typeof obj.label === 'string' ? obj.label : undefined,
    options,
  };
}

/**
 * Parse ticket.initial_state for a control_mapping exercise.
 * Returns null when required fields are missing.
 */
export function parseControlMappingInitialState(
  initialState: unknown
): ControlMappingInitialState | null {
  if (
    !initialState ||
    typeof initialState !== 'object' ||
    Array.isArray(initialState)
  ) {
    return null;
  }
  const obj = initialState as Record<string, unknown>;
  if (!isControlFramework(obj.source_framework)) return null;
  if (
    typeof obj.source_control_id !== 'string' ||
    !obj.source_control_id.trim()
  ) {
    return null;
  }
  if (!Array.isArray(obj.targets) || obj.targets.length === 0) return null;

  const targets: ControlMappingTargetPrompt[] = [];
  const seen = new Set<ControlFramework>();
  for (const entry of obj.targets) {
    const target = parseTarget(entry);
    if (!target) continue;
    if (target.framework === obj.source_framework) continue;
    if (seen.has(target.framework)) continue;
    seen.add(target.framework);
    targets.push(target);
  }

  if (targets.length === 0) return null;

  return {
    source_framework: obj.source_framework,
    source_control_id: normalizeControlId(obj.source_control_id),
    source_label:
      typeof obj.source_label === 'string' ? obj.source_label : undefined,
    prompt: typeof obj.prompt === 'string' ? obj.prompt : undefined,
    targets,
  };
}
