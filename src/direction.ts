/**
 * Text direction. Without anything set, every paragraph finds its own direction from its first strong letter
 * (`unicode-bidi: plaintext` in the styles), so Arabic and Hebrew are right-to-left by themselves and a mixed document works.
 * These commands set it explicitly with a `dir` attribute on the selected blocks.
 */

const ROOT = '.aurebesh-content';
const BLOCKS = 'p,h1,h2,h3,blockquote,pre,li,td,th,div,aside';

const elementOf = (node: Node | null | undefined): Element | null =>
  (node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement)) || null;

/** The blocks to give a direction: the selected ones, or the caret's block. A list item sets it on its whole list. */
function targets(): HTMLElement[] {
  const sel = document.getSelection();
  if (!sel?.rangeCount) return [];
  const root = elementOf(sel.anchorNode)?.closest(ROOT);
  if (!root) return [];
  const range = sel.getRangeAt(0);
  let blocks = Array.from(root.querySelectorAll<HTMLElement>(BLOCKS)).filter((b) => !b.querySelector(BLOCKS) && range.intersectsNode(b));
  if (!blocks.length) {
    const own = elementOf(sel.anchorNode)?.closest<HTMLElement>(BLOCKS);
    if (own && root.contains(own)) blocks = [own];
  }
  const out = new Set<HTMLElement>();
  for (const b of blocks) out.add(b.tagName === 'LI' ? (b.parentElement as HTMLElement) : b);
  return [...out];
}

/** The direction set on the block at the caret ('' when it finds its own). */
export function currentDirection(): 'ltr' | 'rtl' | '' {
  const first = targets()[0];
  const dir = first?.getAttribute('dir');
  return dir === 'ltr' || dir === 'rtl' ? dir : '';
}

/**
 * Sets the direction of the selected blocks; asking for the direction they already have goes back to automatic.
 * The DOM is edited directly, so the browser's undo does not know about this change.
 */
export function setDirection(dir: 'ltr' | 'rtl'): void {
  const blocks = targets();
  const remove = blocks.length > 0 && blocks.every((b) => b.getAttribute('dir') === dir);
  for (const b of blocks) {
    if (remove) b.removeAttribute('dir');
    else b.setAttribute('dir', dir);
  }
}
