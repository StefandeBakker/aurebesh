/**
 * Newspaper-style columns: a <div style="column-count: N"> around a run of blocks.
 * The text flows from the bottom of one column to the top of the next, like Word's section columns.
 */

const ROOT = '.aurebesh-content';
const COLUMN_DIV = 'div[style*="column-count"]';

const elementOf = (node: Node | null | undefined): Element | null =>
  (node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement)) || null;

export const columnsOf = (el: Element): number => Math.min(4, Math.max(1, +(/column-count:\s*(\d)/.exec(el.getAttribute('style') ?? '')?.[1] ?? 1)));

/** The column block around the selection, if any. */
export function currentColumnBlock(): HTMLElement | null {
  const el = elementOf(document.getSelection()?.anchorNode)?.closest(COLUMN_DIV) as HTMLElement | null | undefined;
  return el?.closest(ROOT) ? el : null;
}

/** The number of columns at the selection (1 when it is not in a column block). */
export function currentColumns(): number {
  const block = currentColumnBlock();
  return block ? columnsOf(block) : 1;
}

/** The top-level nodes of the editor that the selection touches (just the caret's block when nothing is selected). */
function touchedNodes(root: Element, range: Range): Node[] {
  const topLevel = (node: Node, offset: number): Node | null => {
    if (node === root) return root.childNodes[Math.min(offset, root.childNodes.length - 1)] ?? null;
    let n: Node | null = node;
    while (n && n.parentNode !== root) n = n.parentNode;
    return n;
  };
  const first = topLevel(range.startContainer, range.startOffset);
  const last = range.collapsed ? first : topLevel(range.endContainer, Math.max(0, range.endOffset - 1));
  if (!first || !last) return [];
  const all = Array.from(root.childNodes);
  const from = all.indexOf(first as ChildNode);
  const to = all.indexOf(last as ChildNode);
  return from < 0 || to < from ? [first] : all.slice(from, to + 1);
}

/**
 * Sets the number of columns (1-4) for the selected blocks: wraps them in a column block, changes an existing one,
 * or with 1 removes it. The DOM is edited directly because `insertHTML` merges the last paragraph of a replaced
 * run into the next one and nests the new block inside the old; the cost is that the browser's undo does not
 * know about this change. The selection is put back where it was.
 */
export function setColumns(count: number): void {
  const n = Math.max(1, Math.min(4, Math.round(count) || 1));
  const sel = document.getSelection();
  if (!sel?.rangeCount) return;
  const root = elementOf(sel.anchorNode)?.closest(ROOT);
  if (!root) return;

  // Moving nodes makes the browser collapse a selection that lives inside them, so remember it and restore it.
  const r = sel.getRangeAt(0);
  const saved = { sc: r.startContainer, so: r.startOffset, ec: r.endContainer, eo: r.endOffset };
  const restore = () => {
    if (!saved.sc.isConnected || !saved.ec.isConnected) return;
    const range = document.createRange();
    range.setStart(saved.sc, saved.so);
    range.setEnd(saved.ec, saved.eo);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const existing = currentColumnBlock();
  if (existing) {
    if (columnsOf(existing) === n) return;
    if (n === 1) {
      const parent = existing.parentNode!;
      while (existing.firstChild) parent.insertBefore(existing.firstChild, existing);
      existing.remove();
    } else {
      existing.style.setProperty('column-count', String(n)); // keeps a gap that came from Word
    }
    restore();
    return;
  }

  if (n === 1) return;
  const nodes = touchedNodes(root, r);
  if (!nodes.length) return;
  const box = document.createElement('div');
  box.setAttribute('style', `column-count: ${n}; column-gap: 2em`);
  nodes[0].parentNode!.insertBefore(box, nodes[0]);
  nodes.forEach((node) => box.appendChild(node));
  restore();
}
