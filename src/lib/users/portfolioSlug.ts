/** Portfolio URL slug: explicit username or email local-part slug. */
export function portfolioSlug(user: {
  username: string | null;
  email: string;
}): string {
  if (user.username?.trim()) {
    return user.username.trim().toLowerCase();
  }

  const localPart = user.email.split('@')[0] ?? user.email;
  return localPart.toLowerCase().replace(/\./g, '-');
}
