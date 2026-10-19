/**
 * The look of a strikethrough: a single or a double line, and its colour. The text stays in `<s>`, so it is struck through where
 * the styles are not read; the look is two properties on it: `<s style="text-decoration-style: double; text-decoration-color: #dc2626">`.
 */
const ROOT = '.aurebesh-content';
const STRIKE = 's,strike,del';

export interface StrikeLook {
  double: boolean;
  /** A colour, or null for the colour of the text. */
  color: string | null;
}

export interface StrikeChange {
  double?: boolean;
  /** A colour; null or '' for the colour of the text. */
  color?: string | null;
}

/** The strikethrough that has the caret, or the first one in the selection. */
function currentStrike(): HTMLElement | null {
  const sel = document.getSelection();
  if (!sel?.rangeCount) return null;
  const node = sel.anchorNode;
  const el = node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);
  const near = el?.closest(STRIKE) as HTMLElement | null | undefined;
  if (near?.closest(ROOT)) return near;
  const root = el?.closest(ROOT);
  if (!root || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  return Array.from(root.querySelectorAll<HTMLElement>(STRIKE)).find((s) => range.intersectsNode(s)) ?? null;
}

/** How the strikethrough at the selection looks, or null when there is none. */
export function strikeLook(): StrikeLook | null {
  const el = currentStrike();
  if (!el) return null;
  return { double: el.style.textDecorationStyle === 'double', color: el.style.textDecorationColor || null };
}

/** Puts a look on the strikethrough at the selection (the text is struck through first when it is not). */
export function setStrike(change: StrikeChange): void {
  const sel = document.getSelection();
  if (!sel?.rangeCount) return;
  const near = currentStrike();
  if (sel.isCollapsed) {
    // the caret is in a strikethrough: the whole of it gets the look
    if (!near) return;
    const range = document.createRange();
    range.selectNodeContents(near);
    sel.removeAllRanges();
    sel.addRange(range);
  } else if (!document.queryCommandState('strikeThrough')) {
    document.execCommand('strikeThrough');
  }
  const anchor = sel.anchorNode;
  const root = (anchor && (anchor.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : anchor.parentElement))?.closest(ROOT);
  if (!root || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(STRIKE))) {
    if (!range.intersectsNode(el)) continue;
    if (change.double !== undefined) {
      if (change.double) el.style.setProperty('text-decoration-style', 'double');
      else el.style.removeProperty('text-decoration-style');
    }
    if (change.color !== undefined) {
      if (change.color) el.style.setProperty('text-decoration-color', change.color);
      else el.style.removeProperty('text-decoration-color');
    }
    if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
  }
}
