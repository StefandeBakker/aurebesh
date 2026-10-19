/** Small helpers for the selection in the editor, shared by the formatting that works on the selected text. */
const ROOT = '.aurebesh-content';

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
