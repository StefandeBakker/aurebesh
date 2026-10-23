/** Inline formatting that needs more than a single execCommand: links and inline code. */

import { charsBefore, pointAfter } from './selection';

const ROOT = '.aurebesh-content';
const SAFE_LINK = /^(?:https?:|mailto:|tel:|#|\/)/i;

const closestIn = (selector: string): HTMLElement | null => {
  const node = document.getSelection()?.anchorNode;
  const el = node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);
  const found = el?.closest(selector) as HTMLElement | null | undefined;
  return found?.closest(ROOT) ? found : null;
};

export const currentLink = (): HTMLAnchorElement | null => closestIn('a') as HTMLAnchorElement | null;

/** Whether an address is one the editor will open: http(s), mailto, tel or a path on this site (not `#anchors`, not scripts). */
export const canOpenLink = (href: string | null | undefined): boolean => {
  const url = (href ?? '').trim();
  return !!url && !url.startsWith('#') && SAFE_LINK.test(url);
};

/** Opens a link in a new tab, without giving the new page access to this one. Returns false when the address is not openable. */
export function openLink(href: string | null | undefined): boolean {
  if (!canOpenLink(href)) return false;
  window.open((href as string).trim(), '_blank', 'noopener,noreferrer');
  return true;
}

/** Accepts what people type: `example.com`, `me@example.com`, full URLs. Throws for anything unsafe. */
export function normalizeLink(input: string): string {
  const v = input.trim();
  if (!v) return '';
  let url = v;
  if (!SAFE_LINK.test(v)) {
    if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(v)) url = `mailto:${v}`;
    else if (/^[\w-]+(?:\.[\w-]+)+(?:[/?#]|$)/.test(v)) url = `https://${v}`;
  }
  if (!SAFE_LINK.test(url)) throw new Error('Unsupported link. Use http(s)://, mailto:, tel: or a relative path.');
  return url;
}

/** Sets, changes or (with an empty url) removes a link at the selection. */
export function setLink(url: string): void {
  const sel = document.getSelection();
  if (!sel) return;
  const existing = currentLink();
  if (existing && sel.isCollapsed) {
    // Caret inside a link: act on the whole link.
    const range = document.createRange();
    range.selectNodeContents(existing);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  if (!url) {
    document.execCommand('unlink');
    return;
  }
  if (sel.isCollapsed) {
    // Nothing selected and no link here: insert the address itself as the link text.
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.textContent = url.replace(/^mailto:|^tel:/i, '');
    document.execCommand('insertHTML', false, a.outerHTML);
    return;
  }
  document.execCommand('createLink', false, url);
}

export const isInlineCode = (): boolean => {
  const code = closestIn('code');
  return !!code && !code.closest('pre');
};

const BLOCK = 'p,h1,h2,h3,li,td,th,blockquote,div,caption,aside';

/** The selected text, in runs: the text of each block that the selection reaches, from its first to its last character. */
export function textRuns(root: Element, range: Range): Range[] {
  const out: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let block: Element | null = null;
  let current: { first: Text; from: number; last: Text; to: number } | null = null;
  const close = () => {
    if (!current) return;
    const r = document.createRange();
    r.setStart(current.first, current.from);
    r.setEnd(current.last, current.to);
    out.push(r);
    current = null;
  };
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (!range.intersectsNode(n) || n.parentElement?.closest('pre')) continue;
    const from = n === range.startContainer ? range.startOffset : 0;
    const to = n === range.endContainer ? range.endOffset : n.length;
    if (from >= to) continue;
    const owner = n.parentElement?.closest(BLOCK) ?? root;
    if (owner !== block) close();
    block = owner;
    if (!current) current = { first: n, from, last: n, to };
    else {
      current.last = n;
      current.to = to;
    }
  }
  close();
  return out;
}

/** The inline code that the selection is in, or reaches. */
function codesIn(root: Element, range: Range): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('code')).filter((c) => !c.closest('pre') && range.intersectsNode(c));
}

/**
 * Makes the selected text inline code, or (when the caret or the selection is in inline code) takes the code away. The other formatting
 * stays: bold and links in the text go along into the code, and taking the code away leaves them where they were. A selection over
 * several blocks gets a piece of code in each. It changes the DOM itself (the editor keeps it in its own history, see history.ts), which
 * is the same in every browser, where `insertHTML` of inline elements is not.
 */
export function toggleInlineCode(): void {
  const sel = document.getSelection();
  if (!sel?.rangeCount) return;
  const anchor = sel.anchorNode && (sel.anchorNode.nodeType === Node.ELEMENT_NODE ? (sel.anchorNode as Element) : sel.anchorNode.parentElement);
  const root = anchor?.closest(ROOT);
  if (!root || anchor?.closest('pre')) return;
  let range = sel.getRangeAt(0);
  const near = closestIn('code');
  if (!near && sel.isCollapsed) return;
  // a caret in code acts on all of that code
  if (near && !near.closest('pre') && sel.isCollapsed) {
    range = document.createRange();
    range.selectNodeContents(near);
  }
  const saved = { from: charsBefore(root, range.startContainer, range.startOffset), to: charsBefore(root, range.endContainer, range.endOffset) };
  const codes = codesIn(root, range);
  if (codes.length) {
    // taking away: the code goes, what is in it stays
    for (const code of codes) code.replaceWith(...Array.from(code.childNodes));
  } else {
    for (const run of textRuns(root, range).reverse()) {
      const part = run.extractContents(); // keeps the formatting around the text, in the pieces
      part.querySelectorAll('code').forEach((c) => c.replaceWith(...Array.from(c.childNodes)));
      const code = document.createElement('code');
      code.appendChild(part);
      run.insertNode(code);
    }
  }
  root.normalize();
  // the same text is selected again, so that the shortcut can undo it (like Bold does)
  const [startNode, startOffset] = pointAfter(root, saved.from);
  const [endNode, endOffset] = pointAfter(root, saved.to);
  sel.setBaseAndExtent(startNode, startOffset, endNode, endOffset);
}
