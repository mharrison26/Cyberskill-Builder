export type TerminalTheme = {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
};

const FALLBACK_DARK: TerminalTheme = {
  background: '#0f1419',
  foreground: '#d6deeb',
  cursor: '#94a3b8',
  selectionBackground: '#334155',
};

/** Read live `--terminal*` CSS variables for xterm / sandbox chrome. */
export function readTerminalTheme(
  root: Element | null = typeof document !== 'undefined'
    ? document.documentElement
    : null
): TerminalTheme {
  if (!root) return FALLBACK_DARK;

  const styles = getComputedStyle(root);
  const read = (name: string, fallback: string) => {
    const value = styles.getPropertyValue(name).trim();
    return value || fallback;
  };

  return {
    background: read('--terminal', FALLBACK_DARK.background),
    foreground: read('--terminal-foreground', FALLBACK_DARK.foreground),
    cursor: read('--terminal-muted', FALLBACK_DARK.cursor),
    selectionBackground: read(
      '--terminal-selection',
      FALLBACK_DARK.selectionBackground
    ),
  };
}
