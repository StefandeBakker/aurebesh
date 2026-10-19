/**
 * The weight of the selected text: light, regular, medium, semibold or bold. Bold is `<strong>`, as ever; the weights between are a
 * `font-weight` on a span (`<span style="font-weight: 600">`). Which weights show depends on the font: a browser takes the weight the
 * font has that is nearest to the one asked for, so a font with only regular and bold shows medium as regular and semibold as bold,
 * and the HTML still says what was chosen.
 */
import { clearInline } from './clearformat';
import { firstElement, rootOf } from './selection';

export const WEIGHTS = [300, 400, 500, 600, 700] as const;

/** The weight of the selected text (the nearest of the five), or null when the selection is not in the editor. */
export function currentWeight(): number | null {
  const sel = document.getSelection();
  if (!sel?.rangeCount || !rootOf(sel.anchorNode)) return null;
  const el = firstElement(sel);
  if (!el) return null;
  const computed = parseInt(getComputedStyle(el).fontWeight, 10) || 400;
  return WEIGHTS.reduce((best, w) => (Math.abs(w - computed) < Math.abs(best - computed) ? w : best), 400 as number);
}

/** Gives the selected text a weight. The text that has a weight already loses it first. */
export function setWeight(weight: number): void {
  if (!(WEIGHTS as readonly number[]).includes(weight)) return;
  const sel = document.getSelection();
  if (!sel?.rangeCount || sel.isCollapsed) return;
  const root = rootOf(sel.anchorNode);
  if (!root) return;
  const touching = (range: Range): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>('[style*="font-weight"]')).filter((el) => range.intersectsNode(el));

  // what has a weight loses it: the weights of spans first, then the bold elements (which is the command of the browser, so it is undoable)
  for (const el of touching(sel.getRangeAt(0))) {
    el.style.removeProperty('font-weight');
    if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
  }
  clearInline('bold');
  if (!sel.rangeCount) return;

  // headings and table headers are bold by themselves: that is the weight to start from
  const first = firstElement(sel);
  const base = first ? parseInt(getComputedStyle(first).fontWeight, 10) || 400 : 400;
  if (weight === 700) {
    if (base < 600) document.execCommand('bold');
    return;
  }
  if (weight === base) return;
  // the browser makes the spans (and it is in the undo history); they are bold at first, and get the weight asked for
  document.execCommand('styleWithCSS', false, 'true');
  try {
    document.execCommand('bold');
  } finally {
    document.execCommand('styleWithCSS', false, 'false');
  }
  if (!sel.rangeCount) return;
  for (const el of touching(sel.getRangeAt(0))) el.style.setProperty('font-weight', String(weight));
}
