/**
 * Indent and outdent: a list item moves one level in or out (a nested list); any other block (paragraph, heading, quote) moves in
 * steps of 24px, kept as `margin-inline-start` so that it follows the text direction.
 */

const ROOT = '.aurebesh-content';
const STEP = 24;
const MAX = 8 * STEP;
const BLOCKS = 'p,h1,h2,h3,blockquote';

function selectedBlocks(): { items: HTMLLIElement[]; blocks: HTMLElement[] } {
  const sel = document.getSelection();
  if (!sel || !sel.rangeCount) return { items: [], blocks: [] };
  const range = sel.getRangeAt(0);
  const start = range.startContainer;
  const el = start.nodeType === Node.ELEMENT_NODE ? (start as Element) : start.parentElement;
  const root = el?.closest(ROOT);
  if (!root) return { items: [], blocks: [] };
  const items = Array.from(root.querySelectorAll('li')).filter((li) => range.intersectsNode(li)) as HTMLLIElement[];
  const blocks = (Array.from(root.querySelectorAll(BLOCKS)) as HTMLElement[]).filter((b) => !b.closest('li') && range.intersectsNode(b));
  return { items, blocks };
}

/** Whether indenting (1) or outdenting (-1) would change something at the selection. */
export function canIndent(direction: 1 | -1): boolean {
  const { items, blocks } = selectedBlocks();
  if (items.length) {
    const li = items[0];
    if (direction > 0) return !!li.previousElementSibling;
    const outer = li.parentElement?.parentElement;
    return !!outer && /^(?:LI|UL|OL)$/.test(outer.tagName);
  }
  return blocks.some((b) => {
    const now = parseInt(b.style.getPropertyValue('margin-inline-start'), 10) || 0;
    return direction > 0 ? now < MAX : now > 0;
  });
}

export function indent(direction: 1 | -1): void {
  const { items, blocks } = selectedBlocks();
  if (items.length) {
    if (canIndent(direction)) document.execCommand(direction > 0 ? 'indent' : 'outdent');
    return;
  }
  for (const b of blocks) {
    const now = parseInt(b.style.getPropertyValue('margin-inline-start'), 10) || 0;
    const next = Math.max(0, Math.min(MAX, now + direction * STEP));
    if (next) b.style.setProperty('margin-inline-start', `${next}px`);
    else b.style.removeProperty('margin-inline-start');
    if (!b.getAttribute('style')) b.removeAttribute('style');
  }
}
