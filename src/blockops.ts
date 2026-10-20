/**
 * What can be done with a block of the text (a paragraph, a heading, a list, a table, a callout, a row of columns...): move it, copy it,
 * delete it, or turn it into another kind. A block is a child of the text area or of a column. These change the DOM themselves (a
 * browser merges whole blocks that are put in with `insertHTML` with the ones beside them), so the editor keeps them in its own history
 * (see history.ts).
 */
import { normalizeLayouts } from './blocks';
import type { Spot } from './blocks';

const COL = '[data-layout="col"]';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The block that holds a node: the child of the text area, or of a column, that the node is in (or is). */
export function blockOf(content: HTMLElement, node: Node | null): HTMLElement | null {
  let el: Element | null = node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);
  while (el && el !== content) {
    const parent: HTMLElement | null = el.parentElement;
    if (parent === content || parent?.matches(COL)) return el as HTMLElement;
    el = parent;
  }
  return null;
}

/** The block of the text area (not of a column) at a height of the screen: what is next to the pointer when it is in the margin. */
export function blockAtY(content: HTMLElement, y: number): HTMLElement | null {
  const kids = Array.from(content.children) as HTMLElement[];
  let best: HTMLElement | null = null;
  for (const k of kids) {
    const box = k.getBoundingClientRect();
    if (y >= box.top && y <= box.bottom) return k;
    if (y > box.bottom) best = k;
  }
  return best;
}

/** The blocks that are only there to type in (the empty paragraph beside a callout or a row at the edge of the text). */
export const isGuard = (el: Element): boolean => el.hasAttribute('data-guard');

/** The blocks with a handle: all, but a guard and what the editor adds for itself. */
export const hasHandle = (el: Element): boolean => !isGuard(el) && !el.classList.contains('aurebesh-pending');

/** Puts the caret at the start (or the end) of the text of a block. */
export function caretIn(block: Element, atEnd = false): void {
  const doc = block.ownerDocument;
  const target = block.matches('h1,h2,h3,p,li,pre,blockquote,td,th') ? block : block.querySelector('h1,h2,h3,p,li,pre,blockquote,td,th') ?? block;
  const range = doc.createRange();
  range.selectNodeContents(target);
  range.collapse(!atEnd);
  const sel = doc.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

/** A block as it is copied: without what the editor puts on it while it is being moved. */
function clean(block: Element): Element {
  const copy = block.cloneNode(true) as Element;
  for (const el of [copy, ...Array.from(copy.querySelectorAll('*'))]) {
    el.classList.remove('aurebesh-moving');
    if (!el.getAttribute('class')) el.removeAttribute('class');
  }
  return copy;
}

/** Whether a block can go to a spot: not into itself, and not to where it is. */
export function canMove(block: Element, spot: Spot): boolean {
  if (spot.parent === block || block.contains(spot.parent)) return false;
  if (spot.parent === block.parentElement && (spot.before === block || spot.before === block.nextElementSibling)) return false;
  return true;
}

/** Moves a block to a spot. A column that is left empty gets a paragraph to type in. */
export function moveBlock(content: HTMLElement, block: HTMLElement, spot: Spot): boolean {
  if (!canMove(block, spot)) return false;
  block.classList.remove('aurebesh-moving');
  if (!block.getAttribute('class')) block.removeAttribute('class');
  spot.parent.insertBefore(block, spot.before);
  normalizeLayouts(content);
  caretIn(block);
  return true;
}

/** Moves a block one place up or down among the blocks beside it (in its column, or in the text). False at the end. */
export function moveBy(content: HTMLElement, block: HTMLElement, by: -1 | 1): boolean {
  const parent = block.parentElement;
  if (!parent) return false;
  const kids = (Array.from(parent.children) as HTMLElement[]).filter(hasHandle);
  const next = kids[kids.indexOf(block) + by];
  if (!next) return false;
  return moveBlock(content, block, { parent, before: by < 0 ? next : next.nextElementSibling });
}

/** Puts a copy of a block after it. */
export function duplicateBlock(content: HTMLElement, block: HTMLElement): HTMLElement | null {
  const copy = clean(block) as HTMLElement;
  block.after(copy);
  normalizeLayouts(content);
  caretIn(copy);
  return copy;
}

/** Takes a block away; where it was the only one there is an empty paragraph. */
export function deleteBlock(content: HTMLElement, block: HTMLElement): void {
  const parent = block.parentElement;
  if (!parent) return;
  const near = (block.nextElementSibling ?? block.previousElementSibling) as HTMLElement | null;
  if (parent.children.length === 1) {
    const p = block.ownerDocument.createElement('p');
    p.appendChild(block.ownerDocument.createElement('br'));
    block.replaceWith(p);
  } else block.remove();
  normalizeLayouts(content);
  if (!content.children.length) content.innerHTML = '<p><br></p>';
  const target = near && content.contains(near) ? near : content.firstElementChild;
  if (target) caretIn(target);
}

export type BlockKind = 'p' | 'h1' | 'h2' | 'h3' | 'quote' | 'ul' | 'ol' | 'task' | 'code' | 'callout';

/** Whether a block is one of those that can be turned into another: text, quotes, lists, code and callouts (not tables, rows or media). */
export function canTurn(block: Element): boolean {
  return block.matches('p,h1,h2,h3,blockquote,ul,ol,pre') || block.matches('div[data-callout]');
}

/** The lines of a block as inline HTML: what stays of it when it becomes another kind of block. */
function lines(block: Element): string[] {
  if (block.matches('ul,ol')) {
    const out: string[] = [];
    block.querySelectorAll('li').forEach((li) => {
      const copy = li.cloneNode(true) as Element;
      copy.querySelectorAll('ul,ol').forEach((n) => n.remove());
      out.push(copy.innerHTML.trim());
    });
    return out;
  }
  if (block.tagName === 'PRE') return (block.textContent ?? '').replace(/\n$/, '').split('\n').map(esc);
  if (block.matches('div[data-callout]')) return Array.from(block.children).map((c) => c.innerHTML.trim());
  if (block.tagName === 'BLOCKQUOTE' && block.children.length && Array.from(block.children).every((c) => c.matches('p'))) return Array.from(block.children).map((c) => c.innerHTML.trim());
  return [block.innerHTML.trim()];
}

/** The HTML of a list as another kind of list (bullets, numbers or tasks), with its items and the lists in them. */
function convertList(block: Element, kind: 'ul' | 'ol' | 'task'): string {
  const doc = block.ownerDocument;
  const convert = (list: Element): Element => {
    const made = doc.createElement(kind === 'ol' ? 'ol' : 'ul');
    if (kind === 'task') made.setAttribute('data-task', '');
    for (const child of Array.from(list.children)) {
      if (child.matches('ul,ol')) {
        made.appendChild(convert(child)); // a list the browser put straight into a list
        continue;
      }
      const li = child.cloneNode(false) as Element;
      if (kind !== 'task') li.removeAttribute('data-checked');
      for (const node of Array.from(child.childNodes)) {
        li.appendChild(node.nodeType === Node.ELEMENT_NODE && (node as Element).matches('ul,ol') ? convert(node as Element) : node.cloneNode(true));
      }
      made.appendChild(li);
    }
    return made;
  };
  return convert(block).outerHTML;
}

const para = (inline: string): string => `<p>${inline || '<br>'}</p>`;

/** Turns a block into another kind, keeping its text and the formatting in it. Returns the first block that it became. */
export function turnInto(content: HTMLElement, block: HTMLElement, kind: BlockKind, calloutType = 'note'): HTMLElement | null {
  if (!canTurn(block)) return null;
  let html: string;
  if (block.matches('ul,ol') && (kind === 'ul' || kind === 'ol' || kind === 'task')) {
    // a list into another kind of list: the items and their nesting stay
    html = convertList(block, kind);
  } else {
    const items = lines(block);
    switch (kind) {
      case 'p':
        html = items.map(para).join('');
        break;
      case 'h1':
      case 'h2':
      case 'h3':
        html = items.map((i) => `<${kind}>${i || '<br>'}</${kind}>`).join('');
        break;
      case 'quote':
        html = `<blockquote>${items.join('<br>') || '<br>'}</blockquote>`;
        break;
      case 'ul':
      case 'ol':
      case 'task': {
        const tag = kind === 'ol' ? 'ol' : 'ul';
        html = `<${tag}${kind === 'task' ? ' data-task=""' : ''}>${items.map((i) => `<li>${i || '<br>'}</li>`).join('')}</${tag}>`;
        break;
      }
      case 'code':
        html = `<pre>${items.map((i) => i.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')).join('\n')}</pre>`;
        break;
      case 'callout':
        html = `<div data-callout="${calloutType}">${items.map(para).join('')}</div>`;
        break;
    }
  }
  const tpl = block.ownerDocument.createElement('template');
  tpl.innerHTML = html;
  const made = Array.from(tpl.content.children) as HTMLElement[];
  if (!made.length) return null;
  block.replaceWith(...Array.from(tpl.content.childNodes));
  normalizeLayouts(content);
  caretIn(made[0], true);
  return made[0];
}

/** The kind of block that something is, as far as `turnInto` knows (for the menu to mark it). */
export function kindOf(block: Element): BlockKind | null {
  if (block.matches('ul[data-task]')) return 'task';
  if (block.matches('ul')) return 'ul';
  if (block.matches('ol')) return 'ol';
  if (block.matches('h1,h2,h3')) return block.tagName.toLowerCase() as BlockKind;
  if (block.matches('blockquote')) return 'quote';
  if (block.matches('pre')) return 'code';
  if (block.matches('div[data-callout]')) return 'callout';
  if (block.matches('p')) return 'p';
  return null;
}
