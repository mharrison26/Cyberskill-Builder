/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it } from 'vitest';

import { readTerminalTheme } from '@/lib/terminalTheme';

describe('readTerminalTheme', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('style');
    document.documentElement.className = '';
  });

  it('falls back to dark defaults when variables are unset', () => {
    const theme = readTerminalTheme(document.documentElement);
    expect(theme.background).toBe('#0f1419');
    expect(theme.foreground).toBe('#d6deeb');
    expect(theme.cursor).toBe('#94a3b8');
    expect(theme.selectionBackground).toBe('#334155');
  });

  it('reads live CSS custom properties from the root element', () => {
    const root = document.documentElement;
    root.style.setProperty('--terminal', '#eef1f5');
    root.style.setProperty('--terminal-foreground', '#1f2937');
    root.style.setProperty('--terminal-muted', '#4b5563');
    root.style.setProperty('--terminal-selection', '#c5d0dc');

    expect(readTerminalTheme(root)).toEqual({
      background: '#eef1f5',
      foreground: '#1f2937',
      cursor: '#4b5563',
      selectionBackground: '#c5d0dc',
    });
  });
});
