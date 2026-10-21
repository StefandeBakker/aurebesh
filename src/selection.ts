/** Small helpers for the selection in the editor, shared by the formatting that works on the selected text. */
const ROOT = '.aurebesh-content';

/** The number of characters of text before a point (so that it can be found again after the DOM changed, whatever was rebuilt). */
export function charsBefore(root: Element, node: Node, offset: number): number {
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

/** The point that has a number of characters of text before it. */
export function pointAfter(root: Element, chars: number): [Node, number] {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let left = chars;
  let last: Text | null = null;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    last = n;
    if (left <= n.length) return [n, left];
    left -= n.length;
  }
  return last ? [last, last.length] : [root, 0];
}

export interface SavedSelection {
  from: number;
  to: number;
}

/** Where the selection is, as numbers of characters; null when it is not in the root. */
export function saveSelection(root: Element): SavedSelection | null {
  const sel = root.ownerDocument.getSelection();
  if (!sel?.rangeCount || !root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return null;
  const range = sel.getRangeAt(0);
  return { from: charsBefore(root, range.startContainer, range.startOffset), to: charsBefore(root, range.endContainer, range.endOffset) };
}

/** Puts the selection back (some browsers drop it when the DOM is changed under it). */
export function restoreSelection(root: Element, saved: SavedSelection | null): void {
  if (!saved) return;
  const sel = root.ownerDocument.getSelection();
  if (!sel) return;
  const [startNode, startOffset] = pointAfter(root, saved.from);
  const [endNode, endOffset] = pointAfter(root, saved.to);
  sel.setBaseAndExtent(startNode, startOffset, endNode, endOffset);
}

/** The editor that a node is in, or null. */
export const rootOf = (node: Node | null): Element | null | undefined =>
  (node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement))?.closest(ROOT);

/**
 * The element that holds the first piece of text that is really selected, or the one that has the caret. A selection dragged over
 * a word often starts at the very end of the text before it, so the start container itself says nothing about the selected text.
 */
export function firstElement(sel: Selection): HTMLElement | null {
  const range = sel.getRangeAt(0);
  if (!range.collapsed) {
    const root = rootOf(range.commonAncestorContainer);
    if (root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
        if (!range.intersectsNode(n)) continue;
        const from = n === range.startContainer ? range.startOffset : 0;
        const to = n === range.endContainer ? range.endOffset : n.length;
        if (n.data.slice(from, to).trim()) return n.parentElement;
      }
    }
  }
  let node: Node = range.startContainer;
  if (node.nodeType === Node.ELEMENT_NODE) node = node.childNodes[range.startOffset] ?? node;
  return node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
}
