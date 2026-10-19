/**
 * Building blocks: layouts (a row of one to six columns) and content (heading, text, image, button, divider) that are dragged from the
 * sidebar into the text, or clicked to be added where the caret is. A row is a grid (`<div data-layout="row">`) of columns
 * (`<div data-layout="col">`), and a column holds any blocks, also another row.
 */
import { ensureParagraphAfter } from './table';

export const BLOCK_MIME = 'application/x-aurebesh-block';
const ROOT = '.aurebesh-content';
const ROW = '[data-layout="row"]';
const COL = '[data-layout="col"]';

/** The layouts, by the distribution of the columns (CSS fractions). */
export const LAYOUTS: { id: string; template: string }[] = [
  { id: 'row1', template: '1fr' },
  { id: 'row2', template: '1fr 1fr' },
  { id: 'row3', template: '1fr 1fr 1fr' },
  { id: 'row37', template: '3fr 7fr' },
  { id: 'row73', template: '7fr 3fr' },
  { id: 'row121', template: '1fr 2fr 1fr' },
];
export const CONTENT = ['heading', 'text', 'image', 'button', 'divider'] as const;
export type ContentId = (typeof CONTENT)[number];

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const empty = '<p><br></p>';

export function rowHtml(template: string, gap = 16): string {
  const count = template.split(' ').length;
  const col = `<div data-layout="col" style="min-width: 0">${empty}</div>`;
  return `<div data-layout="row" style="display: grid; grid-template-columns: ${template}; gap: ${gap}px">${col.repeat(count)}</div>`;
}

/** The HTML of a block. `t` gives the texts (the heading and the button have a text to start from). */
export function blockHtml(id: string, t: (key: string) => string): string {
  const layout = LAYOUTS.find((l) => l.id === id);
  if (layout) return rowHtml(layout.template);
  switch (id) {
    case 'heading':
      return `<h2>${esc(t('block.headingText'))}</h2>`;
    case 'text':
      return `<p>${esc(t('block.textText'))}</p>`;
    case 'button':
      return `<p><a href="https://example.com" data-button="" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: #ffffff; border-radius: 6px; text-decoration: none">${esc(t('block.buttonText'))}</a></p>`;
    case 'divider':
      return '<hr>';
    default:
      return '';
  }
}

// ---- where a block goes -----------------------------------------------------------------------------------

export interface Spot {
  /** The text area, or a column: what the block becomes a child of. */
  parent: HTMLElement;
  /** The child it goes in front of; null for the end. */
  before: Element | null;
  /** An empty paragraph that the block takes the place of (the empty line the caret is in, or the one in an empty column). */
  replace?: Element;
}

/** A spot that replaces the empty paragraph that is all there is in a column. */
function forColumn(spot: Spot, content: HTMLElement): Spot {
  const only = spot.parent !== content && spot.parent.children.length === 1 ? spot.parent.firstElementChild : null;
  return only && isEmptyParagraph(only) ? { ...spot, replace: only } : spot;
}

const isEmptyParagraph = (el: Element | null): boolean => !!el && el.tagName === 'P' && !el.textContent && !el.querySelector('img,video,iframe,table,hr');

/** The block of a container that holds a node: the child of `container` that the node is in (or is). */
function childOf(container: Element, node: Node | null): Element | null {
  let n: Node | null = node;
  while (n && n.parentNode !== container) n = n.parentNode;
  return n && n.nodeType === Node.ELEMENT_NODE ? (n as Element) : null;
}

/** The spot under a point on the screen: in the text area or in the column there, before or after the block that is under it. */
export function spotAt(content: HTMLElement, x: number, y: number): Spot | null {
  const under = content.ownerDocument.elementFromPoint(x, y);
  if (!under || !content.contains(under)) return null;
  const parent = (under.closest(COL) as HTMLElement | null) ?? content;
  const block = under === parent ? null : childOf(parent, under);
  if (block) {
    const box = block.getBoundingClientRect();
    return forColumn({ parent, before: y < box.top + box.height / 2 ? block : block.nextElementSibling }, content);
  }
  // over the padding or the gap: in front of the first block that ends below the point
  const kids = Array.from(parent.children);
  return forColumn({ parent, before: kids.find((k) => k.getBoundingClientRect().bottom > y) ?? null }, content);
}

/** The spot after the block that has the caret (in the text area or in the column it is in), or at the end of the text. */
export function spotAtCaret(content: HTMLElement): Spot {
  const sel = content.ownerDocument.getSelection();
  const node = sel?.rangeCount && content.contains(sel.anchorNode) ? sel.anchorNode : null;
  const parent = (node && ((node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement)?.closest(COL) as HTMLElement | null)) || content;
  const block = node ? childOf(parent, node) : null;
  // on an empty line the block takes the place of the line
  if (block && isEmptyParagraph(block)) return { parent, before: block.nextElementSibling, replace: block };
  return forColumn({ parent, before: block ? block.nextElementSibling : null }, content);
}

/** The line that shows where a block would go: its position on the screen. */
export function spotLine(spot: Spot): { left: number; width: number; top: number } {
  const box = spot.parent.getBoundingClientRect();
  const style = getComputedStyle(spot.parent);
  const left = box.left + (parseFloat(style.paddingLeft) || 0);
  const width = box.width - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
  const kids = Array.from(spot.parent.children);
  if (spot.before) return { left, width, top: spot.before.getBoundingClientRect().top };
  const last = kids[kids.length - 1];
  return { left, width, top: last ? last.getBoundingClientRect().bottom : box.top + (parseFloat(style.paddingTop) || 0) };
}

// ---- putting it in ----------------------------------------------------------------------------------------

/** Selects the text of the first element that has some, or puts the caret in the first one that can have it: where to carry on typing. */
function focusIn(el: Element): void {
  const sel = el.ownerDocument.getSelection();
  const target = el.matches('h1,h2,h3,p,a,li') ? el : el.querySelector('h1,h2,h3,p,li');
  if (!sel || !target) return;
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(target);
  if (!target.textContent) range.collapse(true); // an empty paragraph: the caret, nothing to select
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Puts the selection where a block at the spot would go: on the empty line it replaces, or between the blocks. */
export function selectSpot(content: HTMLElement, spot: Spot): void {
  const doc = content.ownerDocument;
  const range = doc.createRange();
  if (spot.replace) range.selectNode(spot.replace);
  else {
    if (spot.before) range.setStartBefore(spot.before);
    else range.setStart(spot.parent, spot.parent.childNodes.length);
    range.collapse(true);
  }
  const sel = doc.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  content.focus();
}

/**
 * Replaces a run of sibling blocks by HTML, as one step for undo. The run must start and end with something that is not a div: when a
 * browser puts a div in a range that ends beside another div it merges the two, which takes a layout apart (a paragraph does not do that).
 */
export function replaceRun(content: HTMLElement, first: Element, last: Element, html: string): void {
  const doc = content.ownerDocument;
  const range = doc.createRange();
  range.setStartBefore(first);
  range.setEndAfter(last);
  const sel = doc.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  content.focus();
  doc.execCommand('insertHTML', false, html);
}

export const outer = (els: Element[]): string => els.map((e) => e.outerHTML).join('');
export const isDiv = (el: Element | undefined): boolean => el?.tagName === 'DIV';

/**
 * Puts the HTML of a block at a spot, as one step for undo, and puts the caret in it (the text of a heading or a paragraph is selected,
 * so that typing replaces it). Returns the first element of the block.
 */
export function insertBlock(content: HTMLElement, html: string, spot: Spot): Element | null {
  if (!html) return null;
  const doc = content.ownerDocument;
  const marked = html.replace(/^<(\w+)/, '<$1 data-new-block');
  const kids = Array.from(spot.parent.children);
  const at = spot.replace ? kids.indexOf(spot.replace) : spot.before ? kids.indexOf(spot.before) : kids.length;
  // the run to replace: the nearest block that is not a div on either side of the spot
  let lo = spot.replace ? at : at - 1;
  while (lo >= 0 && isDiv(kids[lo])) lo--;
  let hi = at;
  while (hi < kids.length && isDiv(kids[hi])) hi++;
  if (lo >= 0 && hi < kids.length) {
    const before = kids.slice(lo, at);
    const after = kids.slice(spot.replace ? at + 1 : at, hi + 1);
    replaceRun(content, kids[lo], kids[hi], outer(before) + marked + outer(after));
  }
  let fresh = content.querySelector('[data-new-block]');
  if (!fresh) {
    // nothing to hold on to (an empty column, only divs around it) or a browser that would not: put it in as it is, without a step for undo
    const tpl = doc.createElement('template');
    tpl.innerHTML = marked;
    const node = tpl.content.firstElementChild;
    if (!node) return null;
    if (spot.replace) spot.replace.replaceWith(node);
    else spot.parent.insertBefore(node, spot.before);
    fresh = node;
  }
  fresh.removeAttribute('data-new-block');
  normalizeLayouts(content);
  if (fresh.matches('hr') || fresh.matches(ROW)) ensureParagraphAfter(fresh);
  focusIn(fresh);
  return fresh;
}

// ---- keeping a layout whole -------------------------------------------------------------------------------

/**
 * Makes sure every row has columns and only columns, every column has something to type in, a column outside a row is just its content,
 * and a row at the start or the end of the text has a paragraph beside it. Returns true when it changed something.
 */
export function normalizeLayouts(content: HTMLElement): boolean {
  let changed = false;
  const doc = content.ownerDocument;
  for (const col of Array.from(content.querySelectorAll<HTMLElement>(COL))) {
    if (col.parentElement?.matches(ROW)) continue;
    col.replaceWith(...Array.from(col.childNodes)); // a column that lost its row
    changed = true;
  }
  for (const row of Array.from(content.querySelectorAll<HTMLElement>(ROW))) {
    // anything in a row that is not a column goes into a column of its own
    let run: HTMLElement | null = null;
    for (const node of Array.from(row.childNodes)) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as Element).matches(COL)) {
        run = null;
        continue;
      }
      if (node.nodeType === Node.TEXT_NODE && !node.nodeValue?.trim()) continue;
      if (!run) {
        run = doc.createElement('div');
        run.setAttribute('data-layout', 'col');
        run.setAttribute('style', 'min-width: 0');
        row.insertBefore(run, node);
      }
      run.appendChild(node);
      changed = true;
    }
    if (!row.querySelector(':scope > ' + COL)) {
      row.insertAdjacentHTML('beforeend', `<div data-layout="col" style="min-width: 0">${empty}</div>`);
      changed = true;
    }
    for (const col of Array.from(row.querySelectorAll<HTMLElement>(':scope > ' + COL))) {
      if (!col.children.length && !col.textContent) {
        col.innerHTML = empty;
        changed = true;
      } else if (!col.children.length) {
        const p = doc.createElement('p');
        p.append(...Array.from(col.childNodes));
        col.appendChild(p);
        changed = true;
      }
    }
    if (row.parentElement === content) {
      if (!row.previousElementSibling) {
        row.insertAdjacentHTML('beforebegin', empty);
        changed = true;
      }
      if (!row.nextElementSibling) {
        row.insertAdjacentHTML('afterend', empty);
        changed = true;
      }
    }
  }
  return changed;
}

/** The row around the caret (the nearest one), or null. */
export function currentRow(content: HTMLElement): HTMLElement | null {
  const sel = content.ownerDocument.getSelection();
  const node = sel?.rangeCount ? sel.anchorNode : null;
  const el = node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);
  const row = el?.closest(ROW) as HTMLElement | null | undefined;
  return row && content.contains(row) ? row : null;
}

/** The distribution of the columns of a row, as the CSS value it has ('' when it has none). */
export function rowTemplate(row: Element): string {
  return (row as HTMLElement).style.getPropertyValue('grid-template-columns').trim();
}

export function rowGap(row: Element): number {
  return parseInt((row as HTMLElement).style.getPropertyValue('gap'), 10) || 0;
}

/**
 * Puts HTML in the place of a run of sibling blocks, as one step for undo, by replacing the nearest blocks that are not divs on both
 * sides with themselves around the new HTML (see replaceRun). False when there are none, and nothing was changed.
 */
export function replaceSiblings(content: HTMLElement, first: Element, last: Element, html: string): boolean {
  const kids = Array.from(first.parentElement?.children ?? []);
  const lo = kids.indexOf(first);
  const hi = kids.indexOf(last);
  if (lo < 0 || hi < lo) return false;
  let a = lo - 1;
  while (a >= 0 && isDiv(kids[a])) a--;
  let b = hi + 1;
  while (b < kids.length && isDiv(kids[b])) b++;
  if (a < 0 || b >= kids.length) return false;
  replaceRun(content, kids[a], kids[b], outer(kids.slice(a, lo)) + html + outer(kids.slice(hi + 1, b + 1)));
  return true;
}

/** Puts new HTML in the place of an element (or nothing, with ''): as one step for undo when there are blocks that are not divs on both sides. */
function replaceElement(content: HTMLElement, old: Element, html: string): void {
  const kids = Array.from(old.parentElement?.children ?? []);
  const at = kids.indexOf(old);
  let lo = at - 1;
  while (lo >= 0 && isDiv(kids[lo])) lo--;
  let hi = at + 1;
  while (hi < kids.length && isDiv(kids[hi])) hi++;
  if (lo >= 0 && hi < kids.length) {
    replaceRun(content, kids[lo], kids[hi], outer(kids.slice(lo, at)) + html + outer(kids.slice(at + 1, hi + 1)));
    return;
  }
  // a row at the edge of a column has nothing to hold on to: changed as it is, without a step for undo
  const tpl = content.ownerDocument.createElement('template');
  tpl.innerHTML = html;
  const node = tpl.content.firstElementChild;
  if (node) old.replaceWith(node);
  else old.remove();
}

/**
 * Gives a row another distribution (and gap). With fewer columns than before the content of the ones that go moves to the last one that
 * stays; with more, the new columns are empty. One step for undo.
 */
export function setRow(content: HTMLElement, row: HTMLElement, template: string, gap = rowGap(row)): void {
  const copy = row.cloneNode(true) as HTMLElement;
  const cols = Array.from(copy.querySelectorAll<HTMLElement>(':scope > ' + COL));
  const count = template.split(' ').length;
  while (cols.length > count) {
    const gone = cols.pop()!;
    const keep = cols[cols.length - 1];
    if (gone.querySelector('*') && !(gone.children.length === 1 && isEmptyParagraph(gone.firstElementChild))) {
      if (keep.children.length === 1 && isEmptyParagraph(keep.firstElementChild)) keep.replaceChildren();
      keep.append(...Array.from(gone.childNodes));
    }
    gone.remove();
  }
  while (cols.length < count) {
    const col = copy.ownerDocument.createElement('div');
    col.setAttribute('data-layout', 'col');
    col.setAttribute('style', 'min-width: 0');
    col.innerHTML = empty;
    copy.appendChild(col);
    cols.push(col);
  }
  copy.style.setProperty('display', 'grid');
  copy.style.setProperty('grid-template-columns', template);
  copy.style.setProperty('gap', `${gap}px`);
  replaceElement(content, row, copy.outerHTML);
  normalizeLayouts(content);
}

/** Takes a row away, with what is in it. One step for undo (where it has blocks that are not divs on both sides). */
export function deleteRow(content: HTMLElement, row: HTMLElement): void {
  const parent = row.parentElement;
  replaceElement(content, row, '');
  if (parent && !parent.children.length) parent.innerHTML = empty; // a column that has nothing left
  if (!content.firstChild) content.innerHTML = empty;
}

// ---- keys -------------------------------------------------------------------------------------------------

/**
 * Backspace at the very start of a column, and Delete at the very end of it, would join the column with what is beside it, which takes
 * the layout apart: they do nothing there. Returns true when it was one of those.
 */
export function handleLayoutKey(e: KeyboardEvent, content: HTMLElement): boolean {
  if ((e.key !== 'Backspace' && e.key !== 'Delete') || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return false;
  const doc = content.ownerDocument;
  const sel = doc.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed || !content.contains(sel.anchorNode)) return false;
  const el = sel.anchorNode!.nodeType === Node.ELEMENT_NODE ? (sel.anchorNode as Element) : sel.anchorNode!.parentElement;
  const col = el?.closest(COL) as HTMLElement | null | undefined;
  if (!col) return false;
  const caret = sel.getRangeAt(0);
  const probe = doc.createRange();
  probe.selectNodeContents(col);
  const start = e.key === 'Backspace';
  if (start) probe.setEnd(caret.startContainer, caret.startOffset);
  else probe.setStart(caret.startContainer, caret.startOffset);
  const nothing = !probe.toString() && !probe.cloneContents().querySelector('img,video,iframe,hr,table');
  if (!nothing) return false;
  const block = childOf(col, caret.startContainer);
  const edge = start ? !block?.previousElementSibling : !block?.nextElementSibling;
  if (!edge) return false;
  e.preventDefault();
  return true;
}
