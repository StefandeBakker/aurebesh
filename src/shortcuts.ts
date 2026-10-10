/**
 * Keyboard shortcuts beyond the ones browsers already give contenteditable (Ctrl/Cmd+B, I, U, Z, Y).
 * `Mod` is Ctrl on Windows/Linux and Cmd on macOS.
 *
 *   Mod+K            link (opens the link box)      Mod+E            inline code
 *   Mod+Shift+X      strikethrough                  Mod+Shift+7 / 8  numbered / bullet list
 *   Mod+Alt+1 / 2 / 3  heading 1 / 2 / 3           Mod+Alt+C        code block
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
