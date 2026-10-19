/**
 * The look of an underline or a strikethrough: the kind of line (single, double, dashed, dotted, wavy) and its colour. The text stays in
 * `<u>` or `<s>`, so it has its line where the styles are not read; the look is two properties on it:
 * `<u style="text-decoration-style: wavy; text-decoration-color: #dc2626">`.
 */
const ROOT = '.aurebesh-content';

export type DecorationKind = 'underline' | 'strike';
/** `solid` is the plain line: it has no style on the element. */
export type LineStyle = 'solid' | 'double' | 'dashed' | 'dotted' | 'wavy';

const KINDS: Record<DecorationKind, { selector: string; command: string }> = {
  underline: { selector: 'u', command: 'underline' },
  strike: { selector: 's,strike,del', command: 'strikeThrough' },
};

export interface DecorationLook {
  style: LineStyle;
  /** A colour, or null for the colour of the text. */
  color: string | null;
}

export interface DecorationChange {
  style?: LineStyle;
  /** A colour; null or '' for the colour of the text. */
  color?: string | null;
}

const rootOf = (node: Node | null): Element | null | undefined =>
  (node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement))?.closest(ROOT);

/** The line that has the caret, or the first one in the selection. */
function current(kind: DecorationKind): HTMLElement | null {
  const sel = document.getSelection();
  if (!sel?.rangeCount) return null;
  const node = sel.anchorNode;
  const el = node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);
  const near = el?.closest(KINDS[kind].selector) as HTMLElement | null | undefined;
  if (near?.closest(ROOT)) return near;
  const root = rootOf(node);
  if (!root || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  return Array.from(root.querySelectorAll<HTMLElement>(KINDS[kind].selector)).find((e) => range.intersectsNode(e)) ?? null;
}

/** How the line at the selection looks, or null when there is none. */
export function decorationLook(kind: DecorationKind): DecorationLook | null {
  const el = current(kind);
  if (!el) return null;
  const style = el.style.textDecorationStyle;
  return { style: style === 'double' || style === 'dashed' || style === 'dotted' || style === 'wavy' ? style : 'solid', color: el.style.textDecorationColor || null };
}

/** Puts a look on the line at the selection (the text gets the line first when it has none). */
export function setDecoration(kind: DecorationKind, change: DecorationChange): void {
  const sel = document.getSelection();
  if (!sel?.rangeCount) return;
  const { selector, command } = KINDS[kind];
  const near = current(kind);
  if (sel.isCollapsed) {
    // the caret is in a line: the whole of it gets the look
    if (!near) return;
    const range = document.createRange();
    range.selectNodeContents(near);
    sel.removeAllRanges();
    sel.addRange(range);
  } else if (!document.queryCommandState(command)) {
    document.execCommand(command);
  }
  const root = rootOf(sel.anchorNode);
  if (!root || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
    if (!range.intersectsNode(el)) continue;
    if (change.style !== undefined) {
      if (change.style !== 'solid') el.style.setProperty('text-decoration-style', change.style);
      else el.style.removeProperty('text-decoration-style');
    }
    if (change.color !== undefined) {
      if (change.color) el.style.setProperty('text-decoration-color', change.color);
      else el.style.removeProperty('text-decoration-color');
    }
    if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
  }
}
