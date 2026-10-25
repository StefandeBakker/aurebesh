/** Keyboard behaviour inside <pre> code blocks. Works on the current selection. */

import { normalizeLanguage } from './languages';
import { stripEnd } from './strings';

const ROOT = '.aurebesh-content';
const INDENT = '  ';

export function currentPre(): HTMLPreElement | null {
  const node = document.getSelection()?.anchorNode;
  const el = node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);
  const pre = el?.closest('pre') as HTMLPreElement | null;
  return pre?.closest(ROOT) ? pre : null;
}

/** The language of the code block that has the caret: an id, or null for automatic (also when the caret is not in a code block). */
export function currentCodeLanguage(): string | null {
  return currentPre()?.getAttribute('data-language') || null;
}

/** Gives the code block that has the caret a language (an id such as `python`, or an alias such as `py`); '' or 'auto' makes it automatic again. */
export function setCodeLanguage(name: string): void {
  const pre = currentPre();
  if (!pre) return;
  const id = name === 'auto' ? null : normalizeLanguage(name);
  if (id) pre.setAttribute('data-language', id);
  else pre.removeAttribute('data-language');
}

/** The block's text with every <br> counted as a newline (browsers differ in which of the two they produce). */
function codeText(pre: HTMLElement): string {
  let text = '';
  const walker = pre.ownerDocument.createTreeWalker(pre, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) text += n.textContent ?? '';
    else if (n.nodeName === 'BR') text += '\n';
  }
  return text;
}

/** Caret at the end of the code, ignoring the trailing newline some browsers keep as a placeholder. */
function caretAtEnd(pre: HTMLElement): boolean {
  const sel = document.getSelection();
  if (!sel || !sel.isCollapsed || !sel.anchorNode) return false;
  const rest = document.createRange();
  rest.selectNodeContents(pre);
  rest.setStart(sel.anchorNode, sel.anchorOffset);
  return rest.toString().replace(/\n/g, '') === '';
}

/** Moves out of the block: strips trailing line breaks and puts the caret in a paragraph after it. */
function exitBlock(pre: HTMLElement): void {
  for (let last = pre.lastChild; last; last = pre.lastChild) {
    if (last.nodeName === 'BR') {
      last.remove();
    } else if (last.nodeType === Node.TEXT_NODE && /\n$/.test(last.textContent ?? '')) {
      const trimmed = stripEnd(last.textContent ?? '', '\n');
      if (trimmed) {
        last.textContent = trimmed;
        break;
      }
      last.remove();
    } else {
      break;
    }
  }
  const p = document.createElement('p');
  p.appendChild(document.createElement('br'));
  if (pre.textContent) pre.after(p);
  else pre.replaceWith(p);
  const range = document.createRange();
  range.selectNodeContents(p);
  range.collapse(true);
  const sel = document.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

/** Inserts text that may contain newlines as lines of the same block (not as separate <pre> blocks). */
export function insertCode(text: string): void {
  text.replace(/\r\n?/g, '\n').split('\n').forEach((line, i) => {
    if (i) document.execCommand('insertLineBreak');
    if (line) document.execCommand('insertText', false, line);
  });
}

/**
 * Enter adds a line, Enter on an empty last line leaves the block, Shift+Enter always adds a line,
 * Tab indents. Returns true when the event was handled.
 */
export function handleCodeKey(e: KeyboardEvent): boolean {
  const pre = currentPre();
  if (!pre || e.ctrlKey || e.altKey || e.metaKey) return false;

  if (e.key === 'Enter') {
    e.preventDefault();
    const text = codeText(pre);
    const emptyBlock = !text.replace(/\n/g, '');
    const blankLastLine = /\n\n$/.test(text) && caretAtEnd(pre);
    if (!e.shiftKey && (emptyBlock || blankLastLine)) exitBlock(pre);
    else document.execCommand('insertLineBreak');
    return true;
  }
  if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault();
    document.execCommand('insertText', false, INDENT);
    return true;
  }
  return false;
}
