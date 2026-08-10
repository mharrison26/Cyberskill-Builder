import type { OptionVerdict } from '@/lib/feedback/types';

export function optionVerdict(
  selected: boolean,
  shouldSelect: boolean
): OptionVerdict {
  if (selected && shouldSelect) return 'true_positive';
  if (selected && !shouldSelect) return 'false_positive';
  if (!selected && shouldSelect) return 'false_negative';
  return 'true_negative';
}

export const OPTION_VERDICT_LABELS: Record<OptionVerdict, string> = {
  true_positive: 'Correct selection',
  false_positive: 'False positive',
  false_negative: 'Missed',
  true_negative: 'Correctly left unselected',
};

export const OPTION_VERDICT_HINTS: Record<OptionVerdict, string> = {
  true_positive: 'You selected a real gap / correct equivalent.',
  false_positive: 'You selected a distractor that should stay unchecked.',
  false_negative: 'You missed a required selection.',
  true_negative: 'You correctly left this distractor unchecked.',
};
