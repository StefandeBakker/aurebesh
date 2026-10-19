/**
 * Keyboard shortcuts beyond the ones browsers already give contenteditable (Ctrl/Cmd+B, I, U, Z, Y).
 * `Mod` is Ctrl on Windows/Linux and Cmd on macOS.
 *
 *   Mod+K            link (opens the link box)      Mod+E            inline code
 *   Mod+Shift+X      strikethrough                  Mod+Shift+7 / 8  numbered / bullet list
 *   Mod+Alt+1 / 2 / 3  heading 1 / 2 / 3           Mod+Alt+C        code block
 *   Mod+Shift+9      task list                      Mod+Enter        check / uncheck the task
 */
export function shortcutFor(e: KeyboardEvent): string | null {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod || e.isComposing) return null;
  // On Windows, AltGr is reported as Ctrl+Alt: that must stay available for typing characters such as { } [ ].
  if (e.getModifierState?.('AltGraph')) return null;

  if (!e.altKey && !e.shiftKey) {
    if (e.code === 'KeyK') return 'link';
    if (e.code === 'KeyE') return 'code';
    return null;
  }
  if (e.shiftKey && !e.altKey) {
    if (e.code === 'KeyX') return 'strike';
    if (e.code === 'Digit7') return 'ol';
    if (e.code === 'Digit8') return 'ul';
    if (e.code === 'Digit9') return 'task';
    return null;
  }
  if (e.altKey && !e.shiftKey) {
    if (e.code === 'Digit1') return 'h1';
    if (e.code === 'Digit2') return 'h2';
    if (e.code === 'Digit3') return 'h3';
    if (e.code === 'KeyC') return 'codeblock';
  }
  return null;
}

/** The shortcut of each toolbar command, as shown in its tooltip (`Mod` is Ctrl, or Cmd on a Mac). */
const KEYS: Record<string, string> = {
  bold: 'Mod+B',
  italic: 'Mod+I',
  underline: 'Mod+U',
  strike: 'Mod+Shift+X',
  undo: 'Mod+Z',
  redo: 'Mod+Shift+Z',
  link: 'Mod+K',
  code: 'Mod+E',
  codeblock: 'Mod+Alt+C',
  h1: 'Mod+Alt+1',
  h2: 'Mod+Alt+2',
  h3: 'Mod+Alt+3',
  ol: 'Mod+Shift+7',
  ul: 'Mod+Shift+8',
  task: 'Mod+Shift+9',
};

export const isMac = (): boolean => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** "Ctrl+K" or, on a Mac, "⌘K"; null for a command without a shortcut. */
export function shortcutLabel(command: string): string | null {
  const keys = KEYS[command];
  if (!keys) return null;
  if (!isMac()) return keys.replace('Mod', 'Ctrl');
  return keys.replace('Mod+', '⌘').replace('Shift+', '⇧').replace('Alt+', '⌥').replace('⌘⇧', '⇧⌘').replace('⌘⌥', '⌥⌘').replace('+', '');
}
