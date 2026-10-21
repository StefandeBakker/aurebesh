/**
 * The size of the selected text in points, as Word and Google Docs have it: 8, 9, 10 ... 72. It is a style on a span
 * (<span style="font-size: 14pt">), so the HTML says what was chosen, whatever the size of the text around it.
 */
import { firstElement, restoreSelection, rootOf, saveSelection } from './selection';

/** The sizes of the box in the toolbar, in points. */
export const DEFAULT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];

/** What the browser makes of its largest size step: the spans it makes are found by it and get the size asked for. */
const MARK = 'xxx-large';

/** A size chosen with only a caret (no text to give it to yet): it goes to the span that the browser makes when the typing starts. */
let pending: number | null = null;

/** The size, in points, of the text that is selected or has the caret. */
export function currentSize(): number | null {
  const sel = document.getSelection();
  if (!sel?.rangeCount || !rootOf(sel.anchorNode)) return null;
  const el = firstElement(sel);
  if (!el) return null;
  const px = parseFloat(getComputedStyle(el).fontSize);
  if (!px) return null;
  // a browser rounds the size in pixels (Firefox: 19.99 for 20), so a size that is within a hair of a quarter of a point is that
  const pt = px * 0.75;
  const quarter = Math.round(pt * 4) / 4;
  return Math.abs(pt - quarter) < 0.05 ? quarter : Math.round(pt * 100) / 100;
}

/** Whether all the text of an element is selected. */
function covers(range: Range, el: Element): boolean {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (!n.length) continue;
    if (!range.intersectsNode(n)) return false;
    const from = n === range.startContainer ? range.startOffset : 0;
    const to = n === range.endContainer ? range.endOffset : n.length;
    if (from > 0 || to < n.length) return false;
  }
  return true;
}

/** Whether some of the text of an element is selected (an element that the selection only touches is not). */
function overlaps(range: Range, el: Element): boolean {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (!range.intersectsNode(n)) continue;
    const from = n === range.startContainer ? range.startOffset : 0;
    const to = n === range.endContainer ? range.endOffset : n.length;
    if (to > from) return true;
  }
  return false;
}

/** The size of the block that a piece of text is in, in points: what text without a size of its own has. */
function blockSize(el: Element | null): number {
  const block = el?.closest('p,h1,h2,h3,li,td,th,blockquote,div,caption,aside') ?? el;
  const px = block ? parseFloat(getComputedStyle(block).fontSize) : 16;
  return Math.round((px || 16) * 75) / 100;
}

/**
 * Gives the selected text a size in points; null takes the sizes away. With only a caret the size is for the text that is typed next.
 * Only the selected text changes: a piece of text with a size that is partly selected keeps that size where it is not selected (the
 * browser splits it, and the selected part gets a span of its own). The browser makes the spans (that is in the undo history) with
 * its largest size, which then gets the size asked for.
 */
export function setFontSize(points: number | null): void {
  const sel = document.getSelection();
  if (!sel?.rangeCount) return;
  const root = rootOf(sel.anchorNode);
  if (!root) return;
  pending = null;
  // some browsers leave the selection empty after this (the text is changed under it): it is put back
  const saved = sel.isCollapsed ? null : saveSelection(root);
  try {
    apply(sel, root, points);
  } finally {
    restoreSelection(root, saved);
  }
}

function apply(sel: Selection, root: Element, points: number | null): void {
  const sized = (range: Range): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>('[style*="font-size"]')).filter((el) => overlaps(range, el));
  if (!sel.isCollapsed) {
    // the text with a size that is all selected loses it (the new size goes on the selection); a partly selected one is split by the browser
    for (const el of sized(sel.getRangeAt(0))) {
      if (!covers(sel.getRangeAt(0), el)) continue;
      el.style.removeProperty('font-size');
      if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
    }
  }
  if (points === null) {
    // what is left of a size is in a piece that is only partly selected: its selected part gets the size of the block around it
    if (sel.isCollapsed || !sized(sel.getRangeAt(0)).length) return;
    points = blockSize(firstElement(sel));
  }
  document.execCommand('styleWithCSS', false, 'true');
  try {
    document.execCommand('fontSize', false, '7');
  } finally {
    document.execCommand('styleWithCSS', false, 'false');
  }
  if (sel.isCollapsed) {
    pending = points;
    return;
  }
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  for (const el of sized(range)) if (el.style.fontSize === MARK) el.style.fontSize = points + 'pt';
  // a browser that makes a font element of it instead: the same, as a span
  for (const font of Array.from(root.querySelectorAll<HTMLElement>('font[size="7"]'))) {
    if (!overlaps(range, font)) continue;
    const span = font.ownerDocument.createElement('span');
    span.style.fontSize = points + 'pt';
    span.append(...Array.from(font.childNodes));
    font.replaceWith(span);
  }
}

/**
 * After the typing that follows a size chosen at a caret: what the browser made of it (a span with its largest size, or a font
 * element) becomes a span with the size asked for, and the caret stays where it is.
 */
export function applyPendingSize(): void {
  if (pending === null) return;
  const points = pending;
  pending = null;
  const sel = document.getSelection();
  if (!sel?.rangeCount) return;
  const node = sel.anchorNode;
  const el = node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);
  if (!el || !rootOf(el)) return;
  const span = el.closest<HTMLElement>('span');
  if (span && span.style.fontSize === MARK) {
    span.style.fontSize = points + 'pt';
    return;
  }
  const font = el.closest<HTMLElement>('font[size="7"]');
  if (!font) return;
  const keep = [sel.anchorNode!, sel.anchorOffset, sel.focusNode!, sel.focusOffset] as const;
  const made = font.ownerDocument.createElement('span');
  made.style.fontSize = points + 'pt';
  made.append(...Array.from(font.childNodes));
  font.replaceWith(made);
  sel.setBaseAndExtent(keep[0], keep[1], keep[2], keep[3]);
}
