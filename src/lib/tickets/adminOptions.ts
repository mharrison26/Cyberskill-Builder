/** Shared option lists for admin ticket create/edit forms. */

export const TICKET_TYPES = [
  'config_remediation',
  'config_diff',
  'scripting',
  'python',
  'shell',
  'sysadmin',
  'cccer',
  'hybrid',
] as const;

export const DIFFICULTIES = ['critical', 'high', 'medium', 'low'] as const;
