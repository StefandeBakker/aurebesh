/**
 * Suggestions (tracked changes): in suggestion mode what is typed is marked as an insertion and what is deleted stays in the text,
 * marked as a deletion, so that somebody can accept or reject each change. The marks are in the text itself:
 * `<span data-suggestion="id" data-kind="insert|delete" data-author data-name data-date>`, so they stay with the text when the HTML is
 * saved, copied and loaded again (a replacement is a deletion and an insertion with the same id). There is nothing else to keep: the
 * list in the panel is made from the text.
 *
 * It works on text: the browser does the edit, and in the `input` event what changed is worked out from the text before and after, and
 * made into marks (the text before is put back, the deleted text is marked, the typed text is inserted as an insertion). That is the same
 * for typing, deleting, cutting, pasting, dropping, an input method and a correction of the spelling. Line breaks, formatting, tables and
 * pictures are not tracked: they are done as they always are.
 */
import { charsBefore, restoreSelection, saveSelection } from './selection';
import type { SavedSelection } from './selection';
import { COMMENT_ID } from './comments';

export interface SuggestionAuthor {
  id: string;
  name: string;
}

export interface SuggestionsOptions {
  /** Who is writing: the changes that are made in this editor are from this person. */
  author: SuggestionAuthor;
  /** Start in suggestion mode. Default: off (the switch of the toolbar, and `setSuggesting()`, turn it on). */
  enabled?: boolean;
}

export interface Suggestion {
  /** The id that is in the text, in `data-suggestion`. */
  id: string;
  kind: 'insert' | 'delete' | 'replace';
  author: SuggestionAuthor;
  /** When it was made, as an ISO date. */
  date: string;
  /** The text that was put in. */
  inserted: string;
  /** The text that was taken out. */
  deleted: string;
}

export interface SuggestionEvent {
  action: 'accept' | 'reject';
  suggestion: Suggestion;
}

/** The id of a suggestion is safe in an attribute and in a CSS selector (the same rule as for a comment). */
export const SUGGESTION_ID = COMMENT_ID;

/** The look of suggestions for a page that shows the HTML (which has no styles of its own, only the attributes). */
export const suggestionCss = `span[data-suggestion][data-kind="insert"]{color:var(--aurebesh-insert,#047857);background:color-mix(in srgb,var(--aurebesh-insert,#047857) 10%,transparent);text-decoration:underline}
span[data-suggestion][data-kind="delete"]{color:var(--aurebesh-delete,#b42318);background:color-mix(in srgb,var(--aurebesh-delete,#b42318) 8%,transparent);text-decoration:line-through}
`;

const SELECTOR = 'span[data-suggestion]';
const INSERT = 'span[data-suggestion][data-kind="insert"]';
const DELETE = 'span[data-suggestion][data-kind="delete"]';

// ---- the text -------------------------------------------------------------------------------------------

function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return 's' + (c?.randomUUID ? c.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '').slice(0, 12);
}

const textOf = (root: Node): string => root.textContent ?? '';

/** The suggestions in some HTML or text area, in the order of the text. */
export function suggestionsIn(root: ParentNode): Suggestion[] {
  const found = new Map<string, Suggestion>();
  root.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
    const id = el.getAttribute('data-suggestion') ?? '';
    const kind = el.getAttribute('data-kind');
    if (!SUGGESTION_ID.test(id) || (kind !== 'insert' && kind !== 'delete')) return;
    let s = found.get(id);
    if (!s) {
      s = { id, kind, author: { id: el.getAttribute('data-author') ?? '', name: el.getAttribute('data-name') ?? '' }, date: el.getAttribute('data-date') ?? '', inserted: '', deleted: '' };
      found.set(id, s);
    }
    if (kind === 'insert') s.inserted += textOf(el);
    else s.deleted += textOf(el);
    s.kind = s.inserted && s.deleted ? 'replace' : s.inserted ? 'insert' : 'delete';
  });
  return Array.from(found.values());
}

const anchorsOf = (root: ParentNode, id: string): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>(SELECTOR)).filter((el) => el.getAttribute('data-suggestion') === id);

const unwrap = (el: Element) => el.replaceWith(...Array.from(el.childNodes));

/** Makes a suggestion part of the text: what was deleted goes, what was inserted stays. */
export function acceptIn(root: Element, id: string): void {
  for (const el of anchorsOf(root, id)) {
    if (el.getAttribute('data-kind') === 'delete') el.remove();
    else unwrap(el);
  }
  root.normalize();
}

/** Takes a suggestion back: what was inserted goes, what was deleted stays. */
export function rejectIn(root: Element, id: string): void {
  for (const el of anchorsOf(root, id)) {
    if (el.getAttribute('data-kind') === 'insert') el.remove();
    else unwrap(el);
  }
  root.normalize();
}

/**
 * The HTML as it reads when every suggestion is accepted: what was deleted is gone, what was inserted is plain text. That is the text of
 * the Markdown and Word files (which have no marks of their own for it).
 */
export function finalHtml(html: string): string {
  if (!html.includes('data-suggestion')) return html;
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  body.querySelectorAll(DELETE).forEach((el) => el.remove());
  body.querySelectorAll(SELECTOR).forEach(unwrap);
  return body.innerHTML;
}

/** Puts the pieces that follow each other, of one author and one kind, together into one suggestion (the first one's id and date). */
function mergeAdjacent(root: Element): void {
  root.normalize();
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(SELECTOR))) {
    if (!el.isConnected) continue;
    for (;;) {
      const next = el.nextSibling;
      if (!(next instanceof HTMLElement) || !next.matches(SELECTOR)) break;
      if (next.getAttribute('data-kind') !== el.getAttribute('data-kind') || next.getAttribute('data-author') !== el.getAttribute('data-author')) break;
      const keep = el.getAttribute('data-suggestion')!;
      const drop = next.getAttribute('data-suggestion')!;
      if (drop !== keep) for (const other of anchorsOf(root, drop)) other.setAttribute('data-suggestion', keep);
      const [a, b] = [Date.parse(el.getAttribute('data-date') ?? ''), Date.parse(next.getAttribute('data-date') ?? '')];
      if (b < a) el.setAttribute('data-date', next.getAttribute('data-date')!);
      el.append(...Array.from(next.childNodes));
      next.remove();
    }
  }
  root.normalize();
}

// ---- finding what changed -------------------------------------------------------------------------------

interface Change {
  /** Where, as a number of characters of text before it. */
  at: number;
  /** How many characters of the old text went. */
  removed: number;
  /** The text that came. */
  inserted: string;
}

/**
 * What changed between two texts: the part in the middle that is not the same. When the same characters repeat it can be in more than one
 * place; the one nearest to where the caret says is taken.
 */
export function diffText(realBefore: string, realAfter: string, caret: number | null): Change | null {
  // a browser turns a space next to a deleted or typed one into a no-break space, and back: that is not a change
  const before = realBefore.replace(/\u00a0/g, ' ');
  const after = realAfter.replace(/\u00a0/g, ' ');
  if (before === after) return null;
  let prefix = 0;
  const max = Math.min(before.length, after.length);
  while (prefix < max && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (suffix < max - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  const removed = before.length - prefix - suffix;
  const added = after.length - prefix - suffix;
  // the same change can sit further to the left when characters repeat: all of those are the same text
  const hint = caret === null ? prefix : added > 0 ? caret - added : caret;
  let best = prefix;
  for (let p = prefix; p >= Math.max(0, prefix - 500); p--) {
    if (before.slice(p + removed) !== after.slice(p + added)) break;
    if (Math.abs(p - hint) < Math.abs(best - hint)) best = p;
  }
  return { at: best, removed, inserted: realAfter.slice(best, best + added) };
}

// ---- the controller -------------------------------------------------------------------------------------

export interface SuggestionsHost {
  content: HTMLElement;
  t(key: string, vars?: Record<string, string>): string;
  lang(): string;
  canEdit(): boolean;
  /** Does a change of the DOM that the editor keeps in its own history. */
  run(change: () => void): void;
  /** Keeps what was done in the history: the text as it was before, and the selection. A step that follows another soon, of the same `kind`, joins it. */
  commit(before: string, selection: SavedSelection | null, kind: string): void;
  /** Shows the panel. */
  show(): void;
  /** Something about the suggestions, or the mode, changed. */
  changed(event: SuggestionEvent | null): void;
  /** The text was changed outside an `input` event (an input method that is done). */
  textChanged(): void;
}

interface Snapshot {
  html: string;
  text: string;
  selection: SavedSelection | null;
  /** Where the caret was, as the way down to its node: it says which side of a block boundary it was on, which characters cannot. */
  caret: { path: number[]; offset: number } | null;
  forward: boolean;
}

/** The way down from `root` to a node, as the number of the child at each step. */
function pathTo(root: Node, node: Node): number[] | null {
  const path: number[] = [];
  for (let n: Node | null = node; n && n !== root; n = n.parentNode) {
    if (!n.parentNode) return null;
    path.unshift(Array.prototype.indexOf.call(n.parentNode.childNodes, n));
  }
  return node === root || root.contains(node) ? path : null;
}

function nodeAt(root: Node, path: number[]): Node | null {
  let n: Node | null = root;
  for (const i of path) n = n?.childNodes[i] ?? null;
  return n;
}

/** Whether nothing that can be seen is before this point in its block: a space there is not seen either. */
function atBlockStart(root: Element, node: Node, offset: number): boolean {
  const block = (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement)?.closest('p,h1,h2,h3,li,td,th,blockquote,div,caption,aside') ?? root;
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(block);
  range.setEnd(node, offset);
  return range.toString().trim() === '';
}

/** What is tracked: the edits that put text in or take it out. A line break or a format is not. */
const TRACKED = /^(?:insert(?:Text|ReplacementText|FromPaste|FromDrop|FromYank|CompositionText|HTML)|delete)/;

const LIMIT = 90;
const short = (text: string): string => (text.length > LIMIT ? text.slice(0, LIMIT).trimEnd() + '…' : text);

let counter = 0;

export class Suggestions {
  private suggesting: boolean;
  private readonly author: SuggestionAuthor;
  private snapshot: Snapshot | null = null;
  private readonly panel: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly cards: HTMLElement;
  private readonly empty: HTMLElement;
  private active: string | null = null;
  private drawn = '';

  constructor(
    private readonly host: SuggestionsHost,
    options: SuggestionsOptions,
  ) {
    this.author = { id: String(options.author?.id ?? 'anonymous').slice(0, 128), name: String(options.author?.name ?? 'Anonymous').slice(0, 128) };
    this.suggesting = !!options.enabled;
    const doc = host.content.ownerDocument;
    this.panel = doc.createElement('div');
    this.panel.className = 'aurebesh-suggestions';
    this.panel.id = `aurebesh-suggestions-${++counter}`;
    this.bar = doc.createElement('div');
    this.bar.className = 'aurebesh-comment-actions';
    this.empty = doc.createElement('div');
    this.empty.className = 'aurebesh-hint';
    this.empty.textContent = host.t('ui.suggest.empty');
    this.cards = doc.createElement('div');
    this.cards.className = 'aurebesh-comment-list';
    this.panel.append(this.bar, this.empty, this.cards);
    this.refresh(true);
  }

  build(): HTMLElement {
    return this.panel;
  }

  destroy(): void {
    this.snapshot = null;
  }

  isSuggesting(): boolean {
    return this.suggesting;
  }

  setSuggesting(on: boolean): void {
    if (this.suggesting === on) return;
    this.suggesting = on;
    this.snapshot = null;
    this.host.changed(null);
  }

  // ---- what is typed ----

  /** Before the browser edits: the text as it is, to compare with afterwards. */
  beforeInput(e: InputEvent): void {
    if (!TRACKED.test(e.inputType ?? '')) return;
    if (e.isComposing && this.snapshot) return; // the composition goes on: the text from before it is the one to compare with
    this.begin(/Forward/.test(e.inputType));
  }

  /**
   * Remembers the text as it is, for an edit that the editor does itself with `execCommand` (a paste, an insert): the browser does not
   * send `beforeinput` for those. The next `input` event is compared with it.
   */
  begin(forward = false): void {
    if (!this.suggesting || !this.host.canEdit()) return;
    const { content } = this.host;
    const sel = content.ownerDocument.getSelection();
    const anchor = sel?.rangeCount && sel.isCollapsed && sel.anchorNode && content.contains(sel.anchorNode) ? sel.anchorNode : null;
    const path = anchor ? pathTo(content, anchor) : null;
    this.snapshot = { html: content.innerHTML, text: textOf(content), selection: saveSelection(content), caret: path && anchor ? { path, offset: sel!.anchorOffset } : null, forward };
  }

  /** After the browser edited (and the editor tidied up): the change becomes marks. */
  afterInput(e: InputEvent): void {
    if (!this.snapshot || e.isComposing) return;
    this.process();
  }

  /** An input method is done: the text it made is compared with the text from before it. */
  compositionEnd(): void {
    if (this.snapshot && this.process()) this.host.textChanged();
  }

  private process(): boolean {
    const snap = this.snapshot!;
    this.snapshot = null;
    const { content } = this.host;
    const sel = saveSelection(content);
    const caret = sel && sel.from === sel.to ? sel.from : null;
    const change = diffText(snap.text, textOf(content), caret);
    if (!change) return false;
    const kind = change.removed ? (change.inserted ? 'replace' : snap.forward ? 'delete' : 'backspace') : 'type';

    // typing at the end of an insertion of your own: the browser has done all there is to do
    const node = sel ? content.ownerDocument.getSelection()?.anchorNode : null;
    const own = node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement)?.closest<HTMLElement>(INSERT);
    if (!change.removed && own && own.getAttribute('data-author') === this.author.id && content.contains(own)) {
      this.host.commit(snap.html, snap.selection, kind);
      return true;
    }

    content.innerHTML = snap.html;
    const caretAt = this.apply(change, snap);
    mergeAdjacent(content);
    restoreSelection(content, { from: caretAt, to: caretAt });
    this.host.commit(snap.html, snap.selection, kind);
    return true;
  }

  /** Makes a change of the text, on the text as it was before it, into marks. Returns where the caret goes. */
  private apply(original: Change, snap: Snapshot): number {
    let change = original;
    const { content } = this.host;
    const doc = content.ownerDocument;
    const id = newId();
    const date = new Date().toISOString();
    const mark = (kind: 'insert' | 'delete'): HTMLElement => {
      const span = doc.createElement('span');
      span.setAttribute('data-suggestion', id);
      span.setAttribute('data-kind', kind);
      span.setAttribute('data-author', this.author.id);
      span.setAttribute('data-name', this.author.name);
      span.setAttribute('data-date', date);
      return span;
    };

    let unseen = false;
    // a space that the browser takes away at the start of a block, where it could not be seen, is not a deletion
    if (change.removed && change.inserted && /^\s+$/.test(snap.text.slice(change.at, change.at + change.removed))) {
      const [node, offset] = pointOfChar(content, change.at);
      if (atBlockStart(content, node, offset)) {
        change = { ...change, removed: 0 };
        unseen = true;
      }
    }

    let gone = 0;
    if (change.removed) {
      // the text nodes in the range, with where each starts
      const parts: { node: Text; from: number; to: number }[] = [];
      const walker = doc.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      let offset = 0;
      for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
        const start = offset;
        offset += n.length;
        const from = Math.max(change.at, start) - start;
        const to = Math.min(change.at + change.removed, offset) - start;
        if (to > from) parts.push({ node: n, from, to });
      }
      for (const { node, from, to } of parts.reverse()) {
        const parent = node.parentElement;
        const mine = parent?.closest<HTMLElement>(INSERT);
        if (mine && mine.getAttribute('data-author') === this.author.id) {
          // what you inserted yourself is not a deletion, it is just gone
          node.deleteData(from, to - from);
          gone += to - from;
          if (!node.length) node.remove();
          if (mine && !mine.textContent) mine.remove();
        } else if (!parent?.closest(DELETE)) {
          const middle = from > 0 ? node.splitText(from) : node;
          if (to - from < middle.length) middle.splitText(to - from);
          const span = mark('delete');
          middle.replaceWith(span);
          span.appendChild(middle);
        }
      }
    }

    // where the deleted text ends: the text goes in after it
    const at = change.at + change.removed - gone;
    if (change.inserted) {
      let [node, offset] = unseen ? pointOfChar(content, at) : pointAt(content, at); // before the space that was not seen, in the block that it starts
      // typed at the caret: where the caret was, which can be at the end of one block or at the start of the next
      if (!change.removed && snap.caret && snap.selection && snap.selection.from === change.at) {
        const there = nodeAt(content, snap.caret.path);
        const limit = there?.nodeType === Node.TEXT_NODE ? (there as Text).length : there?.childNodes.length ?? -1;
        if (there && snap.caret.offset <= limit && charsBefore(content, there, snap.caret.offset) === change.at) [node, offset] = [there, snap.caret.offset];
      }
      const outside = node.parentElement?.closest(DELETE);
      const ownInsert = !outside && node.parentElement?.closest<HTMLElement>(INSERT);
      if (ownInsert && ownInsert.getAttribute('data-author') === this.author.id && node.nodeType === Node.TEXT_NODE) {
        (node as Text).insertData(offset, change.inserted);
      } else {
        const span = mark('insert');
        span.textContent = change.inserted;
        if (outside) outside.after(span);
        else if (node.nodeType === Node.TEXT_NODE) {
          const text = node as Text;
          const rest = offset < text.length ? text.splitText(offset) : null;
          if (rest) rest.before(span);
          else text.after(span);
        } else {
          const el = node as Element;
          // an empty paragraph has a break to hold it open: the text takes its place
          if (el.childNodes.length === 1 && el.firstChild?.nodeName === 'BR') el.firstChild.remove();
          el.insertBefore(span, el.childNodes[Math.min(offset, el.childNodes.length)] ?? null);
        }
      }
      return at + change.inserted.length;
    }
    // the caret goes on behind a selection that was deleted, and behind what a Delete took; a Backspace leaves it where it started
    const selected = !!snap.selection && snap.selection.from !== snap.selection.to;
    return snap.forward || selected ? at : change.at;
  }

  // ---- the suggestions ----

  getSuggestions(): Suggestion[] {
    return suggestionsIn(this.host.content);
  }

  accept(id: string): void {
    this.settle(id, 'accept');
  }

  reject(id: string): void {
    this.settle(id, 'reject');
  }

  acceptAll(): void {
    for (const s of this.getSuggestions()) this.settle(s.id, 'accept');
  }

  rejectAll(): void {
    for (const s of this.getSuggestions()) this.settle(s.id, 'reject');
  }

  private settle(id: string, action: 'accept' | 'reject'): void {
    const suggestion = this.getSuggestions().find((s) => s.id === id);
    if (!suggestion || !this.host.canEdit()) return;
    this.host.run(() => (action === 'accept' ? acceptIn : rejectIn)(this.host.content, id));
    this.host.changed({ action, suggestion });
  }

  /** Selects the text of a suggestion and scrolls it into view. */
  select(id: string): void {
    const parts = anchorsOf(this.host.content, id);
    if (!parts.length) return;
    const doc = this.host.content.ownerDocument;
    const range = doc.createRange();
    range.setStart(parts[0], 0);
    range.setEnd(parts[parts.length - 1], parts[parts.length - 1].childNodes.length);
    this.host.content.focus({ preventScroll: true });
    const sel = doc.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    parts[0].scrollIntoView?.({ block: 'center' });
  }

  // ---- the panel ----

  sync(): void {
    const sel = this.host.content.ownerDocument.getSelection();
    const node = sel?.rangeCount ? sel.anchorNode : null;
    const el = node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);
    const span = el?.closest(SELECTOR);
    const id = span && this.host.content.contains(span) ? span.getAttribute('data-suggestion') : null;
    this.active = id && SUGGESTION_ID.test(id) ? id : null;
    this.refresh();
  }

  refresh(force = false): void {
    const list = this.getSuggestions();
    const key = JSON.stringify([list, this.active, this.host.canEdit()]);
    if (!force && key === this.drawn) return;
    this.drawn = key;
    this.render(list);
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = this.host.content.ownerDocument.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  private button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
    const b = this.el('button', `aurebesh-comment-btn${primary ? ' is-primary' : ''}`, label);
    b.type = 'button';
    b.disabled = !this.host.canEdit();
    b.addEventListener('click', onClick);
    return b;
  }

  private time(iso: string): string {
    try {
      return new Intl.DateTimeFormat(this.host.lang(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  private render(list: Suggestion[]): void {
    const { t } = this.host;
    this.empty.hidden = list.length > 0;
    this.bar.hidden = list.length === 0;
    this.bar.replaceChildren(this.button(t('ui.suggest.acceptAll'), () => this.acceptAll(), true), this.button(t('ui.suggest.rejectAll'), () => this.rejectAll()));
    this.cards.replaceChildren(
      ...list.map((s) => {
        const card = this.el('article', 'aurebesh-comment-thread');
        card.setAttribute('data-suggestion-card', s.id);
        if (s.id === this.active) {
          card.classList.add('is-active');
          card.setAttribute('aria-current', 'true');
        }
        const head = this.el('div', 'aurebesh-comment-head');
        head.append(this.el('strong', undefined, s.author.name || t('ui.suggest.unknown')), this.el('span', 'aurebesh-comment-time', s.date ? this.time(s.date) : ''));
        card.appendChild(head);
        const line = (label: string, text: string, kind: 'insert' | 'delete') => {
          const row = this.el('button', `aurebesh-comment-quote aurebesh-suggestion-${kind}`);
          row.type = 'button';
          row.append(this.el('strong', undefined, `${label}: `), this.host.content.ownerDocument.createTextNode(short(text)));
          row.addEventListener('click', () => this.select(s.id));
          return row;
        };
        if (s.deleted) card.appendChild(line(t('ui.suggest.deleted'), s.deleted, 'delete'));
        if (s.inserted) card.appendChild(line(t('ui.suggest.inserted'), s.inserted, 'insert'));
        const actions = this.el('div', 'aurebesh-comment-actions');
        actions.append(this.button(t('ui.suggest.accept'), () => this.accept(s.id), true), this.button(t('ui.suggest.reject'), () => this.reject(s.id)));
        card.appendChild(actions);
        return card;
      }),
    );
  }
}

/** The point before the character that has a number of characters before it: in the text node that holds it (not the end of the one before). */
function pointOfChar(root: Element, chars: number): [Node, number] {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let left = chars;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (left < n.length) return [n, left];
    left -= n.length;
  }
  return pointAt(root, chars);
}

/** The point in the text that has a number of characters of text before it (in the last text node that has room for them). */
function pointAt(root: Element, chars: number): [Node, number] {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let left = chars;
  let last: Text | null = null;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    last = n;
    if (left <= n.length) return [n, left];
    left -= n.length;
  }
  return last ? [last, last.length] : [root, 0];
}
