/** Format a DCWF work role for display, e.g. "722 — Information Systems Security Manager". */
export function formatDcwfLabel(
  code: string | null | undefined,
  title?: string | null
): string {
  const trimmedCode = code?.trim() ?? '';
  if (!trimmedCode) {
    return '';
  }
  const trimmedTitle = title?.trim() ?? '';
  if (!trimmedTitle) {
    return trimmedCode;
  }
  return `${trimmedCode} — ${trimmedTitle}`;
}
