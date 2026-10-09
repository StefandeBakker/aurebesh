/** Keyboard behaviour inside <pre> code blocks. Works on the current selection. */

const ROOT = '.aurebesh-content';
const INDENT = '  ';

export function currentPre(): HTMLPreElement | null {
  const node = document.getSelection()?.anchorNode;
  const el = node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);
  const pre = el?.closest('pre') as HTMLPreElement | null;
  return pre?.closest(ROOT) ? pre : null;
}

function caretAtEnd(pre: HTMLElement): boolean {
  const sel = document.getSelection();
  if (!sel || !sel.isCollapsed || !sel.anchorNode) return false;
  const rest = document.createRange();
  rest.selectNodeContents(pre);
  rest.setStart(sel.anchorNode, sel.anchorOffset);
  return rest.toString() === '';
}

/** Moves out of the block: strips trailing line breaks and puts the caret in a paragraph after it. */
function exitBlock(pre: HTMLElement): void {
  while (pre.lastChild?.nodeName === 'BR' || (pre.lastChild?.nodeType === Node.TEXT_NODE && /^\n*$/.test(pre.lastChild.textContent ?? ''))) {
    pre.lastChild!.remove();
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

/**
 * Enter adds a line, Enter on an empty last line leaves the block, Shift+Enter always adds a line,
 * Tab indents. Returns true when the event was handled.
 */
export function handleCodeKey(e: KeyboardEvent): boolean {
  const pre = currentPre();
  if (!pre || e.ctrlKey || e.altKey || e.metaKey) return false;

  if (e.key === 'Enter') {
    e.preventDefault();
    const last = pre.lastChild;
    const blankLastLine =
      !e.shiftKey && caretAtEnd(pre) && last?.nodeName === 'BR' && (last.previousSibling?.nodeName === 'BR' || /\n$/.test(last.previousSibling?.textContent ?? ''));
    if (blankLastLine || (!e.shiftKey && !pre.textContent)) exitBlock(pre);
    else document.execCommand('insertText', false, '\n');
    return true;
  }
  if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault();
    document.execCommand('insertText', false, INDENT);
    return true;
  }
  return false;
}
