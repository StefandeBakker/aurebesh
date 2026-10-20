/**
 * Markdown-style typing shortcuts at the start of a line:
 *   `# ` `## ` `### `  heading      `- ` `* ` `+ `  bullet list     `1. `  numbered list     `> `  quote
 *   ``` + Enter        code block   `---` + Enter    horizontal line
 */

const ROOT = '.aurebesh-content';
const BLOCKS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'UL', 'OL', 'PRE', 'BLOCKQUOTE', 'TABLE', 'HR']);

const ON_SPACE: Array<[RegExp, string]> = [
  [/^#$/, 'h1'],
  [/^##$/, 'h2'],
  [/^###$/, 'h3'],
  [/^[-*+]$/, 'ul'],
  [/^\d{1,3}[.)]$/, 'ol'],
  [/^>$/, 'quote'],
];
const ON_ENTER: Array<[RegExp, string]> = [
  [/^```[A-Za-z][\w+#.-]{0,19}$|^```$/, 'codeblock'], // ```python + Enter: a code block in that language
  [/^(?:---|___|\*\*\*)$/, 'hr'],
];

/** The text node holding the start of the current line, if the caret sits in plain text at the line's beginning. */
function lineStartText(sel: Selection): Text | null {
  const node = sel.anchorNode;
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const parent = node.parentElement;
  if (!parent || !parent.closest(ROOT)) return null;
  const content = parent.closest(ROOT)!;
  // A paragraph/div directly in the editor (or in a column block), with nothing before this text...
  const container = parent.parentElement;
  const inEditor = container === content || !!container?.matches('div[style*="column-count"]');
  if ((parent.tagName === 'P' || parent.tagName === 'DIV') && inEditor) return node.previousSibling ? null : (node as Text);
  // ...or bare text directly in the editor (a fresh editor has no paragraph yet) that starts a line.
  if (parent === content) {
    const prev = node.previousSibling;
    return !prev || prev.nodeName === 'BR' || BLOCKS.has(prev.nodeName) ? (node as Text) : null;
  }
  return null;
}

/**
 * If the key completes a Markdown shortcut, removes the typed marker and returns the command to run
 * (the key press is cancelled). Otherwise returns null and does nothing.
 */
export function applyMarkdown(e: KeyboardEvent): string | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return null;
  const rules = e.key === ' ' ? ON_SPACE : e.key === 'Enter' && !e.shiftKey ? ON_ENTER : null;
  if (!rules) return null;
  const sel = document.getSelection();
  if (!sel || !sel.isCollapsed) return null;
  const text = lineStartText(sel);
  if (!text) return null;
  const before = text.data.slice(0, sel.anchorOffset);
  const command = rules.find(([pattern]) => pattern.test(before))?.[1];
  if (!command) return null;
  e.preventDefault();
  const range = document.createRange();
  range.setStart(text, 0);
  range.setEnd(text, sel.anchorOffset);
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand('delete');
  fenceLanguage = command === 'codeblock' ? before.slice(3) : '';
  return command;
}

/** The language that was typed after the three backticks of the last code block shortcut (once). */
let fenceLanguage = '';
export function takeFenceLanguage(): string {
  const language = fenceLanguage;
  fenceLanguage = '';
  return language;
}
