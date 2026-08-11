export type ControlBaseline = 'low' | 'moderate' | 'high';

export const CONTROL_BASELINES: readonly ControlBaseline[] = [
  'low',
  'moderate',
  'high',
] as const;

export const CONTROL_CATALOG_PATH = 'data/oscal/control-catalog.json';

export const OSCAL_BASELINE_PROFILE_PATHS = {
  low: 'data/oscal/baselines/NIST_SP-800-53_rev5_LOW-baseline_profile.json',
  moderate:
    'data/oscal/baselines/NIST_SP-800-53_rev5_MODERATE-baseline_profile.json',
  high: 'data/oscal/baselines/NIST_SP-800-53_rev5_HIGH-baseline_profile.json',
} as const;

/** Lightweight / list+detail row from the processed catalog index. */
export type ProcessedControlEntry = {
  /** OSCAL id (e.g. "ac-2", "ia-5.1") */
  id: string;
  /** Display label (e.g. "AC-2", "IA-5(1)") */
  control_id: string;
  title: string;
  family: string;
  statement: string;
  /** SP 800-53B baselines that include this control. */
  baselines: ControlBaseline[];
  withdrawn: boolean;
  /** Parent base control id for enhancements; null for base controls. */
  parent_id: string | null;
  enhancement_ids: string[];
};

export type ProcessedControlCatalog = {
  source: {
    catalog: string;
    version: string;
    title: string;
    baselines: string[];
  };
  families: string[];
  controls: ProcessedControlEntry[];
};

/** Client-safe list row (omit large statement blobs when desired). */
export type ControlCatalogListItem = Omit<
  ProcessedControlEntry,
  'statement' | 'enhancement_ids'
> & {
  /** Truncated statement for expand/preview. */
  statementPreview?: string;
};

export function formatBaselineLabel(baseline: ControlBaseline): string {
  switch (baseline) {
    case 'low':
      return 'Low';
    case 'moderate':
      return 'Moderate';
    case 'high':
      return 'High';
  }
}
