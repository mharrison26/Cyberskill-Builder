/**
 * Resolve the dashboard track filter from a `?track=` search param.
 * Unknown / non-enrolled slugs fall back to "ALL" (null).
 */
export function resolveTrackFilter(
  requestedTrack: string | null | undefined,
  enrolledSlugs: readonly string[]
): string | null {
  const slug = typeof requestedTrack === 'string' ? requestedTrack.trim() : '';
  if (!slug) return null;
  return enrolledSlugs.includes(slug) ? slug : null;
}
