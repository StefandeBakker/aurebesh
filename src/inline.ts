/** Inline formatting that needs more than a single execCommand: links and inline code. */

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

/** Where a point is, as the number of characters of text before it (so that it can be found again after the DOM changed). */
function charsBefore(root: Element, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

/** The point that has a number of characters of text before it. */
function pointAfter(root: Element, chars: number): [Node, number] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let left = chars;
  let last: Text | null = null;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    last = n;
    if (left <= n.length) return [n, left];
    left -= n.length;
  }
  return last ? [last, last.length] : [root, 0];
}

/** The selected text, in runs: the text of each block that the selection reaches, from its first to its last character. */
function runs(root: Element, range: Range): Range[] {
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

/** HTML of the text in a range, with its other formatting (bold, links...) but without code in it. */
function htmlOf(range: Range): string {
  const box = document.createElement('div');
  box.appendChild(range.cloneContents());
  box.querySelectorAll('code').forEach((c) => c.replaceWith(...Array.from(c.childNodes)));
  return box.innerHTML;
}

/**
 * Puts a run of text in code. With the command of the browser when that works (it is in the undo history); a browser that puts the
 * code in a span with a font where the text is in bold or the like does not give code, and then it is done in the DOM.
 */
function wrapInCode(root: Element, run: Range, sel: Selection): void {
  const from = charsBefore(root, run.startContainer, run.startOffset);
  const to = charsBefore(root, run.endContainer, run.endOffset);
  const html = htmlOf(run);
  sel.removeAllRanges();
  sel.addRange(run);
  root.querySelectorAll('code[data-new]').forEach((c) => c.removeAttribute('data-new'));
  document.execCommand('insertHTML', false, `<code data-new="">${html}</code>`);
  const made = root.querySelector('code[data-new]');
  if (made) {
    made.removeAttribute('data-new');
    return;
  }
  document.execCommand('undo');
  const [startNode, startOffset] = pointAfter(root, from);
  const [endNode, endOffset] = pointAfter(root, to);
  const again = document.createRange();
  again.setStart(startNode, startOffset);
  again.setEnd(endNode, endOffset);
  const el = document.createElement('code');
  el.appendChild(again.extractContents());
  el.querySelectorAll('code').forEach((c) => c.replaceWith(...Array.from(c.childNodes)));
  again.insertNode(el);
}

/** A browser writes a space beside what it inserted as a no-break space: where the text had a space, it is one again. */
function restoreSpaces(root: Element, before: string): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let at = 0;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (n.data.includes('\u00a0')) {
      const fixed = Array.from(n.data, (ch, i) => (ch === '\u00a0' && before[at + i] === ' ' ? ' ' : ch)).join('');
      if (fixed !== n.data) n.data = fixed;
    }
    at += n.length;
  }
}

const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Takes one piece of code away and leaves what is in it. A browser puts the caret back inside the code when only the code is selected,
 * so a character beside it is selected too (and put back with it); where there is none, or the browser keeps the code anyway, the code
 * is taken out of the DOM, which the undo history does not have.
 */
function unwrapCode(code: HTMLElement, sel: Selection): void {
  const r = document.createRange();
  let before = '';
  let after = '';
  const prev = code.previousSibling;
  const next = code.nextSibling;
  if (prev?.nodeType === Node.TEXT_NODE && (prev as Text).length) {
    const text = prev as Text;
    before = text.data.slice(-1);
    r.setStart(text, text.length - 1);
    r.setEnd(code, code.childNodes.length);
    r.setEndAfter(code);
  } else if (next?.nodeType === Node.TEXT_NODE && (next as Text).length) {
    const text = next as Text;
    after = text.data.slice(0, 1);
    r.setStartBefore(code);
    r.setEnd(text, 1);
  } else {
    r.selectNode(code);
  }
  sel.removeAllRanges();
  sel.addRange(r);
  if (before || after) document.execCommand('insertHTML', false, escape(before) + code.innerHTML + escape(after));
  else document.execCommand('insertHTML', false, code.innerHTML);
  if (code.isConnected) code.replaceWith(...Array.from(code.childNodes));
}

/**
 * Makes the selected text inline code, or (when the caret or the selection is in inline code) takes the code away. The other formatting
 * stays: bold and links in the text go along into the code, and taking the code away leaves them where they were. A selection over
 * several blocks gets a piece of code in each. It is done with the commands of the browser, so it is in the undo history (one step for
 * each block).
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
  const text = root.textContent ?? '';
  const from = charsBefore(root, range.startContainer, range.startOffset);
  const to = charsBefore(root, range.endContainer, range.endOffset);
  const codes = codesIn(root, range);
  if (codes.length) {
    // taking away: the code goes, what is in it stays, from the last to the first so that the others stay where they are
    for (const code of codes.reverse()) unwrapCode(code, sel);
  } else {
    for (const run of runs(root, range).reverse()) wrapInCode(root, run, sel);
  }
  restoreSpaces(root, text);
  // the same text is selected again, so that the shortcut can undo it (like Bold does)
  const [startNode, startOffset] = pointAfter(root, from);
  const [endNode, endOffset] = pointAfter(root, to);
  const back = document.createRange();
  back.setStart(startNode, startOffset);
  back.setEnd(endNode, endOffset);
  sel.removeAllRanges();
  sel.addRange(back);
}
