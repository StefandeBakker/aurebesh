/**
 * Takes away one kind of formatting from the selected text and leaves the rest: bold, italic, underline or strikethrough. (The colours
 * go through their own commands with "automatic", and everything goes with `removeFormat`.) It is done with the commands of the
 * browser, so that it is part of the undo history: where only part of the text has the formatting, the whole selection gets it first
 * and loses it again.
 */
const ROOT = '.aurebesh-content';
const BLOCK = /^(?:P|DIV|H[1-6]|LI|TD|TH|BLOCKQUOTE|PRE|CAPTION|ASIDE|UL|OL|TABLE)$/;

export type InlineKind = 'bold' | 'italic' | 'underline' | 'strike';

const TAGS: Record<InlineKind, string> = { bold: 'B STRONG', italic: 'I EM', underline: 'U', strike: 'S STRIKE DEL' };
const COMMAND: Record<InlineKind, string> = { bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strikeThrough' };

/** Whether an element says the kind of formatting itself: its tag, or an inline style (what a paste from Word or Docs has). */
function says(el: HTMLElement, kind: InlineKind): boolean {
  if (TAGS[kind].split(' ').includes(el.tagName)) return true;
  const s = el.style;
  if (kind === 'bold') return /^(?:bold|bolder|[6-9]00)$/.test(s.fontWeight);
  if (kind === 'italic') return /^(?:italic|oblique)$/.test(s.fontStyle);
  const line = `${s.textDecorationLine} ${s.textDecoration}`;
  return kind === 'underline' ? line.includes('underline') : line.includes('line-through');
}

/** How much of the selected text has the formatting from inline elements (a heading is bold by itself, which does not count). */
function share(kind: InlineKind, root: Element, range: Range): 'none' | 'some' | 'all' {
  let total = 0;
  let has = 0;
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue?.trim() || !range.intersectsNode(n)) continue;
    total++;
    for (let el = n.parentElement; el && el !== root; el = el.parentElement) {
      if (BLOCK.test(el.tagName)) break;
      if (says(el, kind)) {
        has++;
        break;
      }
    }
  }
  return !has ? 'none' : has === total ? 'all' : 'some';
}

/** Whether the selected text has the kind of formatting, so that the button for it can be enabled. */
export function hasInline(kind: InlineKind): boolean {
  const sel = document.getSelection();
  if (!sel?.rangeCount || sel.isCollapsed) return false;
  const anchor = sel.anchorNode && (sel.anchorNode.nodeType === Node.ELEMENT_NODE ? (sel.anchorNode as Element) : sel.anchorNode.parentElement);
  const root = anchor?.closest(ROOT);
  return !!root && share(kind, root, sel.getRangeAt(0)) !== 'none';
}

/** Takes the kind of formatting away from the selected text. */
export function clearInline(kind: InlineKind): void {
  const sel = document.getSelection();
  if (!sel?.rangeCount || sel.isCollapsed) return;
  const anchor = sel.anchorNode && (sel.anchorNode.nodeType === Node.ELEMENT_NODE ? (sel.anchorNode as Element) : sel.anchorNode.parentElement);
  const root = anchor?.closest(ROOT);
  if (!root) return;
  if (kind === 'bold') {
    // a weight between regular and bold is a style on a span
    const picked = sel.getRangeAt(0);
    root.querySelectorAll<HTMLElement>('[style*="font-weight"]').forEach((el) => {
      if (!picked.intersectsNode(el)) return;
      el.style.removeProperty('font-weight');
      if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
    });
  }
  const state = share(kind, root, sel.getRangeAt(0));
  if (state === 'none') return;
  // the command toggles: on everything first when only part has it, then off
  if (state === 'some' && !document.queryCommandState(COMMAND[kind])) document.execCommand(COMMAND[kind]);
  document.execCommand(COMMAND[kind]);
}
