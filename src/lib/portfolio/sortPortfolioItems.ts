/**
 * Public / my-portfolio display order: flagship first, then newest.
 * Mirrors `.order('is_flagship', { ascending: false }).order('created_at', { ascending: false })`.
 */
export function sortPortfolioItemsFlagshipFirst<
  T extends { isFlagship: boolean; createdAt: string },
>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.isFlagship !== b.isFlagship) {
      return a.isFlagship ? -1 : 1;
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}
