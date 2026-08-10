/** Normalize a stored or submitted display name; empty → null. */
export function normalizeDisplayName(
  value: string | null | undefined
): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Preferred UI name from the users.display_name column.
 * Never derives a name from email.
 */
export function getUserDisplayName(user: {
  display_name?: string | null;
  displayName?: string | null;
  name?: string | null;
}): string | null {
  return normalizeDisplayName(
    user.display_name ?? user.displayName ?? user.name
  );
}

/** Greeting fragment: "Welcome back, {name}." or "Welcome back, there." */
export function formatWelcomeBack(
  displayName: string | null | undefined
): string {
  const name = normalizeDisplayName(displayName);
  return `Welcome back, ${name ?? 'there'}.`;
}

/**
 * Avatar initials from display_name only.
 * Neutral single-letter fallback when unset — never email-derived.
 */
export function getAvatarInitials(
  displayName: string | null | undefined
): string {
  const name = normalizeDisplayName(displayName);
  if (!name) return '?';

  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]!)
    .join('')
    .toUpperCase();
}

export const DISPLAY_NAME_MAX_LENGTH = 80;

export function validateDisplayName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Preferred name is required';
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    return `Preferred name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer`;
  }
  return null;
}
