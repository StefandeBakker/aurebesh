/**
 * Callouts (alerts, admonitions): a block with a colour and an icon around a piece of text, for a note, a tip, a warning. The types are
 * those of GitHub's alerts (note, tip, important, warning, caution), so that they go to Markdown and back as `> [!NOTE]`. A callout is
 * `<div data-callout="warning">` around its blocks; how it looks is CSS (`calloutCss`), which can be changed with variables.
 */
import { restoreSelection, saveSelection } from './selection';

export interface CalloutDef {
  /** The name in the HTML (`data-callout="id"`): lower case letters, digits and hyphens. */
  id: string;
  /** The text in the menus; default: the translated name of a built-in type, or the id. */
  label?: string;
  /** The colour (a hex or rgb() value); default: the variable `--aurebesh-callout-<id>`, or blue. */
  color?: string;
  /** One of the icons: 'note', 'tip', 'important', 'warning' or 'caution'. Default: note. */
  icon?: string;
}

export const DEFAULT_CALLOUTS: CalloutDef[] = [
  { id: 'note', color: '#3b82f6', icon: 'note' },
  { id: 'tip', color: '#16a34a', icon: 'tip' },
  { id: 'important', color: '#8b5cf6', icon: 'important' },
  { id: 'warning', color: '#d97706', icon: 'warning' },
  { id: 'caution', color: '#dc2626', icon: 'caution' },
];

/** The id of a callout type is safe to write in a CSS selector and a Markdown marker. */
export const CALLOUT_ID = /^[a-z][a-z0-9-]{0,19}$/;

const SELECTOR = '[data-callout]';

/** The icons, as the paths of a 24 by 24 line drawing. */
const ICON_PATHS: Record<string, string> = {
  note: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.5v.01',
  tip: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z',
  important: 'M4 5h16v11H9l-5 4zM12 8.5v3.5M12 14.2v.01',
  warning: 'M12 3.5 2.8 19.5h18.4zM12 10v4.5M12 17v.01',
  caution: 'M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2zM12 8v5M12 16v.01',
};

const icon = (name: string | undefined): string => {
  const d = ICON_PATHS[name ?? ''] ?? ICON_PATHS.note;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

/**
 * The CSS of callouts. The editor has it for the built-in types; it is also what to put in the page that shows the HTML (the HTML has
 * no styles of its own, only `data-callout`). The colour of a type is the variable `--aurebesh-callout-<id>`, the corners are
 * `--aurebesh-callout-radius`; the background and the border are made from the colour, so that it works on a light and a dark page.
 */
export function calloutCss(types: CalloutDef[] = DEFAULT_CALLOUTS): string {
  const base =
    `[data-callout]{--c:var(--aurebesh-callout-note,#3b82f6);--aurebesh-callout-icon:${icon('note')};position:relative;box-sizing:border-box;margin:.75em 0;padding:12px 14px 12px 46px;` +
    `border:1px solid color-mix(in srgb,var(--c) 35%,transparent);border-left:4px solid var(--c);border-radius:var(--aurebesh-callout-radius,6px);background:color-mix(in srgb,var(--c) 10%,transparent)}\n` +
    `[data-callout]::before{content:'';position:absolute;inset-inline-start:14px;top:14px;width:20px;height:20px;background:var(--c);-webkit-mask:var(--aurebesh-callout-icon) center/contain no-repeat;mask:var(--aurebesh-callout-icon) center/contain no-repeat}\n` +
    `[data-callout]>:first-child{margin-top:0}[data-callout]>:last-child{margin-bottom:0}\n`;
  const each = types
    .filter((t) => CALLOUT_ID.test(t.id))
    .map((t) => `[data-callout="${t.id}"]{--c:var(--aurebesh-callout-${t.id},${t.color && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(t.color) ? t.color : '#3b82f6'});--aurebesh-callout-icon:${icon(t.icon)}}`)
    .join('\n');
  return base + each + '\n';
}

// ---- in the text ------------------------------------------------------------------------------------------

const BLOCK_PARENT = '[data-layout="col"]';
const empty = '<p><br></p>';
/** The paragraph beside a callout at the edge of the text, to type in: marked, so that the HTML given out does not have it. */
const guard = '<p data-guard=""><br></p>';

/** The child of `container` that a node is in. */
function childOf(container: Element, node: Node | null): Element | null {
  let n: Node | null = node;
  while (n && n.parentNode !== container) n = n.parentNode;
  return n && n.nodeType === Node.ELEMENT_NODE ? (n as Element) : null;
}

/** The container of blocks around a node: a column, or the text area. */
function containerOf(content: HTMLElement, node: Node | null): HTMLElement {
  const el = node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);
  return (el?.closest(BLOCK_PARENT) as HTMLElement | null) ?? content;
}

/** The callout around the caret (the nearest one), or null. */
export function currentCallout(content: HTMLElement): HTMLElement | null {
  const sel = content.ownerDocument.getSelection();
  const node = sel?.rangeCount ? sel.anchorNode : null;
  const el = node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);
  const found = el?.closest(SELECTOR) as HTMLElement | null | undefined;
  return found && content.contains(found) ? found : null;
}

/** The blocks the selection reaches in one container, in order: where a callout would go around. */
function touchedBlocks(content: HTMLElement): { container: HTMLElement; blocks: Element[] } | null {
  const sel = content.ownerDocument.getSelection();
  if (!sel?.rangeCount || !content.contains(sel.anchorNode)) return null;
  const range = sel.getRangeAt(0);
  // a selection can start and end at the text area or a block itself (a select-all in Firefox does): the child at that place is the node
  const startNode = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer.childNodes[range.startOffset] ?? range.startContainer.lastChild ?? range.startContainer : range.startContainer;
  const container = containerOf(content, startNode);
  const first = childOf(container, startNode);
  // the end of a selection that is dragged over a whole block is at the start of the next one: that one is not touched
  let endNode: Node | null = range.endContainer;
  if (endNode.nodeType === Node.ELEMENT_NODE && range.endOffset > 0 && endNode.childNodes[range.endOffset - 1]) endNode = endNode.childNodes[range.endOffset - 1];
  else if (!range.collapsed && range.endOffset === 0 && endNode.nodeType === Node.ELEMENT_NODE && endNode !== container) endNode = endNode.previousSibling ?? endNode;
  const last = containerOf(content, endNode) === container ? childOf(container, endNode) ?? first : first;
  if (!first || !last) return null;
  const kids = Array.from(container.children);
  const [a, b] = [kids.indexOf(first), kids.indexOf(last)];
  if (a < 0 || b < 0) return null;
  return { container, blocks: kids.slice(Math.min(a, b), Math.max(a, b) + 1) };
}

/** Where to carry on typing in a callout: the end of its last block. */
function caretAtEnd(el: Element): void {
  const doc = el.ownerDocument;
  const target = (el.lastElementChild ?? el) as Element;
  const range = doc.createRange();
  range.selectNodeContents(target);
  range.collapse(false);
  const sel = doc.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

/**
 * Puts the blocks the selection reaches in a callout of a type, changes the type when they are in one already, and takes the callout
 * away (the blocks stay) when the type is the same or `null`. It changes the DOM itself (the editor keeps it in its own history, see
 * history.ts): a browser merges a callout that is put in with `insertHTML` with the div beside it, and not the same in every browser.
 */
export function setCallout(content: HTMLElement, type: string | null): void {
  if (type !== null && !CALLOUT_ID.test(type)) return;
  const touched = touchedBlocks(content);
  if (!touched) return;
  const { blocks } = touched;
  const saved = saveSelection(content);
  const inside = blocks.length === 1 && blocks[0].matches(SELECTOR) ? (blocks[0] as HTMLElement) : null;
  let fresh: HTMLElement | null = null;
  if (inside) {
    if (type === null || inside.getAttribute('data-callout') === type) inside.replaceWith(...Array.from(inside.childNodes));
    else {
      inside.setAttribute('data-callout', type);
      fresh = inside;
    }
  } else {
    if (type === null) return;
    const div = content.ownerDocument.createElement('div');
    div.setAttribute('data-callout', type);
    blocks[0].before(div);
    div.append(...blocks);
    fresh = div;
  }
  normalizeCallouts(content);
  content.normalize();
  if (fresh && !inside) caretAtEnd(fresh);
  else restoreSelection(content, saved);
}

/**
 * Every callout has something to type in, and a callout at the start or the end of the text has a paragraph beside it to carry on
 * typing. Returns true when it changed something.
 */
export function normalizeCallouts(content: HTMLElement): boolean {
  let changed = false;
  for (const callout of Array.from(content.querySelectorAll<HTMLElement>(SELECTOR))) {
    if (!callout.children.length) {
      if (callout.textContent) {
        const p = content.ownerDocument.createElement('p');
        p.append(...Array.from(callout.childNodes));
        callout.appendChild(p);
      } else callout.innerHTML = empty;
      changed = true;
    }
    if (callout.parentElement === content) {
      if (!callout.previousElementSibling) {
        callout.insertAdjacentHTML('beforebegin', guard);
        changed = true;
      }
      if (!callout.nextElementSibling) {
        callout.insertAdjacentHTML('afterend', guard);
        changed = true;
      }
    }
  }
  return changed;
}

/**
 * Keys in a callout: Backspace at the very start of it takes the callout away (the text stays), Enter on an empty line at the end of it
 * goes on after the callout, and on the only line of an empty one takes it away. Returns true when it was one of those.
 */
export function handleCalloutKey(e: KeyboardEvent, content: HTMLElement): boolean {
  if ((e.key !== 'Backspace' && e.key !== 'Enter') || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.isComposing) return false;
  const doc = content.ownerDocument;
  const sel = doc.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed || !content.contains(sel.anchorNode)) return false;
  const callout = currentCallout(content);
  if (!callout) return false;
  const caret = sel.getRangeAt(0);
  const block = childOf(callout, caret.startContainer);
  if (!block) return false;

  if (e.key === 'Backspace') {
    if (block !== callout.firstElementChild) return false;
    const probe = doc.createRange();
    probe.selectNodeContents(block);
    probe.setEnd(caret.startContainer, caret.startOffset);
    if (probe.toString() || probe.cloneContents().querySelector('img,video,iframe,hr,table')) return false;
    e.preventDefault();
    setCallout(content, null);
    return true;
  }

  // Enter on an empty line
  const blank = block.tagName === 'P' && !block.textContent && !block.querySelector('img,video,iframe,table,hr');
  if (!blank) return false;
  if (callout.children.length === 1) {
    e.preventDefault();
    setCallout(content, null); // the only line of an empty callout: leave it
    return true;
  }
  if (block !== callout.lastElementChild) return false; // between lines: a new line, as always
  e.preventDefault();
  block.remove();
  const next = doc.createElement('p');
  next.innerHTML = '<br>';
  callout.after(next);
  const range = doc.createRange();
  range.selectNodeContents(next);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}
