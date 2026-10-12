/**
 * The ticket layout in the page: every line of the template is a <p>. Text is text; a field, command or condition marker is
 * a small non-editable <span data-t="..."> (an "atom": one position in the line); a stretch in a larger size is a
 * <span data-size="...">. This file turns lines into that markup and back, and finds positions in a line.
 */
import { printsText } from './engine';
import type { Align, Item, Line, ResolvedTicket } from './engine';
import { fieldText } from './engine';

export interface View {
  /** Show field names instead of their sample values. */
  useNames: boolean;
  /** The value of a field in the test data: it comes before the sample. */
  lookup?: (name: string) => string | undefined;
  /** The words for a condition marker (the editor translates them). */
  describe: (item: Extract<Item, { t: 'if' | 'endif' }>) => string;
}

export const isAtom = (n: Node | null | undefined): n is HTMLElement => !!n && n.nodeType === 1 && (n as HTMLElement).hasAttribute('data-t');

const cleanText = (s: string) => s.replace(/ /g, ' ').replace(/​/g, '');

/** What a command shows in the layout. */
export function commandText(name: string, arg: string | undefined, R: ResolvedTicket): string {
  const c = R.commandByKey.get(name.toLowerCase());
  switch (c?.kind) {
    case 'include':
      return `‹${arg ?? ''}›`;
    case 'break':
      return '↵';
    case 'cut':
      return '✂';
    case 'logo':
      return `▣ ${c.label ?? c.name}`;
    default:
      return c?.display ?? `[${name}]`;
  }
}

/** The text of a chip: a field shows its sample (padded to its format), a command what it prints. */
export function chipText(item: Extract<Item, { t: 'field' | 'cmd' }>, R: ResolvedTicket, view: View): string {
  return item.t === 'field' ? fieldText(item.name, item.fmt, R, view.useNames, view.lookup) : commandText(item.name, item.arg, R);
}

function atom(doc: Document, item: Item, R: ResolvedTicket, view: View): HTMLElement {
  const s = doc.createElement('span');
  s.className = 'aurebesh-tk';
  s.setAttribute('contenteditable', 'false');
  s.setAttribute('data-t', item.t);
  if (item.t === 'field') {
    s.setAttribute('data-name', item.name);
    if (item.fmt !== undefined) s.setAttribute('data-fmt', item.fmt);
    s.title = item.fmt === undefined ? item.name : `${item.name}  ${item.fmt}`;
    s.textContent = chipText(item, R, view);
  } else if (item.t === 'cmd') {
    s.setAttribute('data-name', item.name);
    if (item.arg !== undefined) s.setAttribute('data-arg', item.arg);
    s.classList.add('aurebesh-tk-cmd');
    s.title = item.arg === undefined ? item.name : `${item.name} "${item.arg}"`;
    s.textContent = chipText(item, R, view);
  } else if (item.t === 'if') {
    s.setAttribute('data-field', item.field);
    if (item.value !== undefined) s.setAttribute('data-val', item.value);
    if (item.not) s.setAttribute('data-not', '');
    s.classList.add('aurebesh-tk-if');
    const label = view.describe(item);
    s.setAttribute('data-label', label);
    s.title = label;
  } else if (item.t === 'endif') {
    s.classList.add('aurebesh-tk-if');
    const label = view.describe(item);
    s.setAttribute('data-label', label);
    s.title = label;
  }
  return s;
}

/** Puts the items of a line in a <p>, grouping neighbours of one size in a span. */
export function fillLine(p: HTMLElement, line: Line, R: ResolvedTicket, view: View): void {
  const doc = p.ownerDocument;
  p.replaceChildren();
  if (line.align === 'left') p.style.removeProperty('text-align');
  else p.style.textAlign = line.align;
  if (!p.getAttribute('style')) p.removeAttribute('style');
  let group: HTMLElement | null = null;
  let groupSize = '';
  for (const it of line.items) {
    if (it.t === 'if' || it.t === 'endif') {
      group = null;
      p.appendChild(atom(doc, it, R, view));
      continue;
    }
    const node: Node = it.t === 'text' ? doc.createTextNode(it.text) : atom(doc, it, R, view);
    if (it.size === R.defaultSize) {
      group = null;
      p.appendChild(node);
    } else {
      if (!group || groupSize !== it.size) {
        group = doc.createElement('span');
        group.setAttribute('data-size', it.size);
        groupSize = it.size;
        p.appendChild(group);
      }
      group.appendChild(node);
    }
  }
  if (!p.firstChild) p.appendChild(doc.createElement('br'));
}

export function renderLine(doc: Document, line: Line, R: ResolvedTicket, view: View): HTMLParagraphElement {
  const p = doc.createElement('p');
  fillLine(p, line, R, view);
  return p;
}

export function renderLines(doc: Document, lines: Line[], R: ResolvedTicket, view: View): HTMLParagraphElement[] {
  return lines.map((l) => renderLine(doc, l, R, view));
}

// ---- reading the markup back ------------------------------------------------------------------------------------

const alignOf = (el: HTMLElement): Align => {
  const a = el.style.textAlign;
  return a === 'center' || a === 'right' ? a : 'left';
};

function pushText(items: Item[], text: string, size: string): void {
  const t = cleanText(text);
  if (!t) return;
  const last = items[items.length - 1];
  if (last && last.t === 'text' && last.size === size) last.text += t;
  else items.push({ t: 'text', text: t, size });
}

/** The items in a line element; the size of each comes from the nearest enclosing size span. */
export function readLine(el: HTMLElement, R: ResolvedTicket): Line {
  const items: Item[] = [];
  const walk = (node: Node, size: string) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        pushText(items, (child as Text).data, size);
      } else if (child.nodeType === 1) {
        const e = child as HTMLElement;
        const t = e.getAttribute('data-t');
        if (t === 'field') {
          items.push({ t: 'field', name: e.getAttribute('data-name') ?? '', ...(e.hasAttribute('data-fmt') ? { fmt: e.getAttribute('data-fmt')! } : {}), size });
        } else if (t === 'cmd') {
          items.push({ t: 'cmd', name: e.getAttribute('data-name') ?? '', ...(e.hasAttribute('data-arg') ? { arg: e.getAttribute('data-arg')! } : {}), size });
        } else if (t === 'if') {
          items.push({ t: 'if', field: e.getAttribute('data-field') ?? '', ...(e.hasAttribute('data-val') ? { value: e.getAttribute('data-val')! } : {}), not: e.hasAttribute('data-not') });
        } else if (t === 'endif') {
          items.push({ t: 'endif' });
        } else if (e.nodeName !== 'BR') {
          const own = R.sizeByKey.get((e.getAttribute('data-size') ?? '').toLowerCase());
          walk(e, own ? own.name : size);
        }
      }
    }
  };
  walk(el, R.defaultSize);
  return { align: alignOf(el), items };
}

/** Makes sure every direct child of the content is a <p> (typing into an empty editor can leave loose text), and that there is one. */
export function normalizeContent(content: HTMLElement): void {
  const doc = content.ownerDocument;
  let run: Node[] = [];
  const flush = () => {
    if (!run.length) return;
    const p = doc.createElement('p');
    content.insertBefore(p, run[0]);
    run.forEach((n) => p.appendChild(n));
    run = [];
  };
  for (const child of Array.from(content.childNodes)) {
    if (child.nodeType === 1 && (child as Element).tagName === 'P') {
      flush();
    } else if (child.nodeType === 1 && (child as Element).tagName === 'DIV' && !isAtom(child)) {
      flush();
      const p = doc.createElement('p');
      const style = (child as HTMLElement).getAttribute('style');
      if (style) p.setAttribute('style', style);
      content.replaceChild(p, child);
      while (child.firstChild) p.appendChild(child.firstChild);
    } else {
      run.push(child);
    }
  }
  flush();
  if (!content.firstChild) {
    const p = doc.createElement('p');
    p.appendChild(doc.createElement('br'));
    content.appendChild(p);
  }
}

export function readLines(content: HTMLElement, R: ResolvedTicket): Line[] {
  return Array.from(content.children).map((p) => readLine(p as HTMLElement, R));
}

/** Refreshes what the chips show (their text, the condition labels) after the sample values or the words changed. */
export function decorate(content: HTMLElement, R: ResolvedTicket, view: View): void {
  for (const a of Array.from(content.querySelectorAll<HTMLElement>('[data-t]'))) {
    a.setAttribute('contenteditable', 'false');
    a.classList.add('aurebesh-tk');
    const t = a.getAttribute('data-t');
    if (t === 'field') {
      const text = chipText({ t: 'field', name: a.getAttribute('data-name') ?? '', ...(a.hasAttribute('data-fmt') ? { fmt: a.getAttribute('data-fmt')! } : {}), size: '' }, R, view);
      if (a.textContent !== text) a.textContent = text;
    } else if (t === 'cmd') {
      a.classList.add('aurebesh-tk-cmd');
      const text = commandText(a.getAttribute('data-name') ?? '', a.getAttribute('data-arg') ?? undefined, R);
      if (a.textContent !== text) a.textContent = text;
    } else if (t === 'if' || t === 'endif') {
      a.classList.add('aurebesh-tk-if');
      if (a.textContent) a.textContent = '';
      const item: Item = t === 'if' ? { t: 'if', field: a.getAttribute('data-field') ?? '', ...(a.hasAttribute('data-val') ? { value: a.getAttribute('data-val')! } : {}), not: a.hasAttribute('data-not') } : { t: 'endif' };
      const label = view.describe(item);
      a.setAttribute('data-label', label);
      a.title = label;
    }
  }
}

// ---- positions ---------------------------------------------------------------------------------------------------

/** How many positions a node takes in a line: a character of text is one, a chip or marker is one. */
export function unitLength(node: Node): number {
  if (node.nodeType === 3) return (node as Text).data.length;
  if (isAtom(node)) return 1;
  if (node.nodeType !== 1 || node.nodeName === 'BR') return 0;
  let n = 0;
  node.childNodes.forEach((c) => (n += unitLength(c)));
  return n;
}

/** The line element (a direct child of the content) a node is in. */
export function lineOf(content: HTMLElement, node: Node | null): HTMLElement | null {
  let n: Node | null = node;
  while (n && n.parentNode !== content) n = n.parentNode;
  return n && n.nodeType === 1 ? (n as HTMLElement) : null;
}

/** The position of a point (a node and an offset in it) counted from the start of its line. */
export function offsetOf(line: HTMLElement, node: Node, offset: number): number {
  let n = 0;
  const walk = (cur: Node): boolean => {
    if (cur === node) {
      if (cur.nodeType === 3) n += offset;
      else if (!isAtom(cur)) for (let i = 0; i < offset; i++) n += unitLength(cur.childNodes[i]);
      else if (offset > 0) n += 1;
      return true;
    }
    if (cur.nodeType === 3) {
      n += (cur as Text).data.length;
      return false;
    }
    if (isAtom(cur)) {
      if (cur.contains(node)) return true;
      n += 1;
      return false;
    }
    if (cur.nodeName === 'BR') return false;
    for (const c of Array.from(cur.childNodes)) if (walk(c)) return true;
    return false;
  };
  walk(line);
  return n;
}

/** The point (node and offset) for a position in a line: the other way round from `offsetOf`. */
export function pointAt(line: HTMLElement, offset: number): [Node, number] {
  let rest = offset;
  const walk = (cur: Node): [Node, number] | null => {
    if (cur.nodeType === 3) {
      const len = (cur as Text).data.length;
      if (rest <= len) return [cur, rest];
      rest -= len;
      return null;
    }
    if (isAtom(cur)) {
      if (rest === 0) return [cur.parentNode!, Array.prototype.indexOf.call(cur.parentNode!.childNodes, cur)];
      rest -= 1;
      return null;
    }
    if (cur.nodeName === 'BR') return null;
    for (const c of Array.from(cur.childNodes)) {
      const r = walk(c);
      if (r) return r;
    }
    return null;
  };
  return walk(line) ?? [line, line.childNodes.length];
}

/**
 * The outline of a piece of paper torn off a roll: straight sides and uneven top and bottom, as a clip-path. The unevenness
 * is worked out from a number, so a piece looks the same every time it is drawn and each piece has its own tear.
 */
export function tornPath(seed: number, steps = 44): string {
  let s = (seed * 9301 + 49297) >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const edge = (): number[] =>
    Array.from({ length: steps + 1 }, (_, i) => Math.min(13, Math.max(0, 1.5 + 4 * (1 + Math.sin(i * 0.5 + seed * 1.7)) + rand() * 6)));
  const x = (i: number) => ((i / steps) * 100).toFixed(2);
  const top = edge().map((y, i) => `${x(i)}% ${y.toFixed(1)}px`);
  const bottom = edge()
    .map((y, i) => `${x(i)}% calc(100% - ${y.toFixed(1)}px)`)
    .reverse();
  return `polygon(${[...top, ...bottom].join(',')})`;
}

/** Does this item print something (so that a stretch of it can be made larger)? */
export const isPrintable = (it: Item, R: ResolvedTicket): boolean => it.t === 'text' || it.t === 'field' || (it.t === 'cmd' && printsText(R.commandByKey.get(it.name.toLowerCase())));
