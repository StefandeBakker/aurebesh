/**
 * Find and replace: the matches of a text in the editor, marked with the CSS Custom Highlight API (so the text is not touched), a bar
 * to search and replace, and the replacing itself. A match stays inside one block (a paragraph, a list item, a table cell...) but can
 * go over the formatting in it: "hello world" is found when "hello" is bold.
 */
const BLOCK = 'p,h1,h2,h3,li,td,th,blockquote,pre,div,caption,aside';
const MAX_MATCHES = 5000;

export interface FindOptions {
  matchCase?: boolean;
  wholeWord?: boolean;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The pattern for a text: letters and digits around it are not allowed with `wholeWord`. */
function pattern(query: string, options: FindOptions): RegExp {
  const body = escapeRegExp(query);
  const source = options.wholeWord ? `(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])` : body;
  return new RegExp(source, options.matchCase ? 'gu' : 'giu');
}

interface Segment {
  /** The text node, or null for a line break (<br>), which counts as a newline that nothing matches over. */
  node: Text | null;
  start: number;
}

/** The text of each block of the root, with where each piece of it is in the DOM. */
function blocks(root: Element): { text: string; segments: Segment[] }[] {
  const out: { text: string; segments: Segment[]; block: Element }[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let current: { text: string; segments: Segment[]; block: Element } | null = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      if (n.nodeName === 'BR' && current && (n as Element).closest(BLOCK) === current.block) {
        current.segments.push({ node: null, start: current.text.length });
        current.text += '\n';
      }
      continue;
    }
    const text = n as Text;
    if (!text.length) continue;
    const block = text.parentElement?.closest(BLOCK) ?? root;
    if (!current || current.block !== block) {
      current = { text: '', segments: [], block };
      out.push(current);
    }
    current.segments.push({ node: text, start: current.text.length });
    current.text += text.data;
  }
  return out;
}

/** The place in the DOM of a position in the text of a block. */
function locate(segments: Segment[], offset: number, isEnd: boolean): [Text, number] | null {
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i];
    if (!s.node) continue;
    if (isEnd ? offset > s.start : offset >= s.start) return [s.node, Math.min(offset - s.start, s.node.length)];
  }
  return null;
}

/** The matches of a text in the editor, as ranges, in the order of the text. */
export function findRanges(root: Element, query: string, options: FindOptions = {}): Range[] {
  if (!query) return [];
  const regex = pattern(query, options);
  const ranges: Range[] = [];
  for (const { text, segments } of blocks(root)) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text))) {
      if (!m[0].length) {
        regex.lastIndex++;
        continue;
      }
      const start = locate(segments, m.index, false);
      const end = locate(segments, m.index + m[0].length, true);
      if (start && end) {
        const range = root.ownerDocument.createRange();
        range.setStart(start[0], start[1]);
        range.setEnd(end[0], end[1]);
        ranges.push(range);
        if (ranges.length >= MAX_MATCHES) return ranges;
      }
    }
  }
  return ranges;
}

const EMPTYABLE = 'b,strong,i,em,u,s,strike,del,span,a,code,sup,sub,font,mark';

/** Puts a text in the place of each match, in the DOM (the formatting of where the match starts stays). Returns how many there are. */
export function replaceRanges(root: Element, ranges: Range[], replacement: string): number {
  // from the last to the first, so that the others stay where they are
  for (const range of [...ranges].reverse()) {
    const { startContainer: a, startOffset: from, endContainer: b, endOffset: to } = range;
    if (a.nodeType !== Node.TEXT_NODE || b.nodeType !== Node.TEXT_NODE) continue;
    const first = a as Text;
    const last = b as Text;
    if (first === last) {
      first.replaceData(from, to - from, replacement);
      continue;
    }
    // over several pieces of text (the match goes over formatting): the replacement goes in the first, the rest of the match is taken out
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    walker.currentNode = first;
    const middle: Text[] = [];
    for (let n = walker.nextNode() as Text | null; n && n !== last; n = walker.nextNode() as Text | null) middle.push(n);
    first.replaceData(from, first.length - from, replacement);
    for (const m of middle) m.replaceData(0, m.length, '');
    last.replaceData(0, to, '');
  }
  // what is empty now (a bold element that had only the match) goes
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(EMPTYABLE))) {
    if (!el.textContent && !el.querySelector('img,video,iframe,br')) el.remove();
  }
  root.normalize();
  return ranges.length;
}

// ---- marking --------------------------------------------------------------------------------------------

type Registry = { set(name: string, h: unknown): void; delete(name: string): void };
const registry = (): Registry | null => {
  const css = (globalThis as { CSS?: { highlights?: Registry } }).CSS;
  return css?.highlights && typeof (globalThis as { Highlight?: unknown }).Highlight === 'function' ? css.highlights : null;
};

/** What each bar has marked, so that several editors on one page do not overwrite each other. */
const marked = new Map<object, { all: Range[]; current: Range | null }>();

function paint(): void {
  const api = registry();
  if (!api) return;
  const Highlight = (globalThis as unknown as { Highlight: new (...r: Range[]) => unknown }).Highlight;
  const all: Range[] = [];
  const current: Range[] = [];
  marked.forEach((m) => {
    all.push(...m.all);
    if (m.current) current.push(m.current);
  });
  if (all.length) api.set('aurebesh-find', new Highlight(...all));
  else api.delete('aurebesh-find');
  if (current.length) api.set('aurebesh-find-current', new Highlight(...current));
  else api.delete('aurebesh-find-current');
}

// ---- the bar --------------------------------------------------------------------------------------------

export interface FindHost {
  content: HTMLElement;
  /** The element the bar goes in, before `before`. */
  root: HTMLElement;
  before: () => Element | null;
  t(key: string, vars?: Record<string, string>): string;
  canEdit(): boolean;
  /** The text was changed by the bar. */
  changed(): void;
  /** Puts back the HTML of the text (the undo of replace all). */
  restore(html: string): void;
}

export class FindBar {
  readonly el: HTMLElement;
  private find: HTMLInputElement;
  private replaceInput: HTMLInputElement;
  private replaceRow: HTMLElement;
  private toggle: HTMLButtonElement;
  private count: HTMLElement;
  private caseBtn: HTMLButtonElement;
  private wordBtn: HTMLButtonElement;
  private replaceBtn: HTMLButtonElement;
  private replaceAllBtn: HTMLButtonElement;
  private undoBtn: HTMLButtonElement;
  private ranges: Range[] = [];
  private index = 0;
  private matchCase = false;
  private wholeWord = false;
  private undoState: { before: string; after: string } | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private waiting = false;
  private readonly key = {};

  constructor(private host: FindHost) {
    const doc = host.content.ownerDocument;
    const t = (k: string, v?: Record<string, string>) => host.t(k, v);
    const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
      const e = doc.createElement(tag);
      e.className = className;
      if (text !== undefined) e.textContent = text;
      return e;
    };
    const button = (className: string, text: string, label: string, run: () => void): HTMLButtonElement => {
      const b = make('button', className, text);
      b.type = 'button';
      b.title = label;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', run);
      return b;
    };

    this.el = make('div', 'aurebesh-find');
    this.el.setAttribute('role', 'search');
    this.el.setAttribute('aria-label', t('find'));
    this.el.hidden = true;

    const row = make('div', 'aurebesh-find-row');
    this.toggle = button('aurebesh-find-toggle', '▸', t('ui.find.showReplace'), () => this.showReplace(this.replaceRow.hidden));
    this.toggle.setAttribute('aria-expanded', 'false');
    this.find = make('input', 'aurebesh-find-input');
    this.find.type = 'text';
    this.find.placeholder = t('ui.find.find');
    this.find.setAttribute('aria-label', t('ui.find.find'));
    this.find.autocomplete = 'off';
    this.caseBtn = button('aurebesh-find-case', 'Aa', t('ui.find.matchCase'), () => {
      this.matchCase = !this.matchCase;
      this.caseBtn.setAttribute('aria-pressed', String(this.matchCase));
      this.search();
    });
    this.caseBtn.setAttribute('aria-pressed', 'false');
    this.wordBtn = button('aurebesh-find-word', 'ab', t('ui.find.wholeWord'), () => {
      this.wholeWord = !this.wholeWord;
      this.wordBtn.setAttribute('aria-pressed', String(this.wholeWord));
      this.search();
    });
    this.wordBtn.setAttribute('aria-pressed', 'false');
    this.count = make('span', 'aurebesh-find-count');
    this.count.setAttribute('role', 'status');
    this.count.setAttribute('aria-live', 'polite');
    const prev = button('aurebesh-find-prev', '▲', t('ui.find.previous'), () => this.step(-1));
    const next = button('aurebesh-find-next', '▼', t('ui.find.next'), () => this.step(1));
    const close = button('aurebesh-find-close', '✕', t('ui.find.close'), () => this.close());
    row.append(this.toggle, this.find, this.caseBtn, this.wordBtn, this.count, prev, next, close);

    this.replaceRow = make('div', 'aurebesh-find-row aurebesh-find-replace-row');
    this.replaceRow.hidden = true;
    this.replaceInput = make('input', 'aurebesh-find-input aurebesh-find-replace-input');
    this.replaceInput.type = 'text';
    this.replaceInput.placeholder = t('ui.find.replaceWith');
    this.replaceInput.setAttribute('aria-label', t('ui.find.replaceWith'));
    this.replaceInput.autocomplete = 'off';
    this.replaceBtn = button('aurebesh-find-replace', t('ui.find.replace'), t('ui.find.replace'), () => this.replaceCurrent());
    this.replaceAllBtn = button('aurebesh-find-replace-all', t('ui.find.replaceAll'), t('ui.find.replaceAll'), () => this.replaceAll());
    this.undoBtn = button('aurebesh-find-undo', t('ui.find.undo'), t('ui.find.undoReplace'), () => this.undoReplace());
    this.undoBtn.hidden = true;
    this.replaceRow.append(this.replaceInput, this.replaceBtn, this.replaceAllBtn, this.undoBtn);
    this.el.append(row, this.replaceRow);

    this.find.addEventListener('input', () => {
      clearTimeout(this.timer);
      this.waiting = true;
      this.timer = setTimeout(() => this.flush(), 60);
    });
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (e.target === this.replaceInput) this.replaceCurrent();
        else this.step(e.shiftKey ? -1 : 1);
      }
    };
    this.find.addEventListener('keydown', keys);
    this.replaceInput.addEventListener('keydown', keys);
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });

    const body = host.before();
    host.root.insertBefore(this.el, body);
    this.updateEditable();
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  /** Shows the bar, with the selected text as the text to find; `replace` shows the row to replace with as well. */
  open(options: { query?: string; replace?: boolean } = {}): void {
    this.el.hidden = false;
    this.updateEditable();
    if (options.replace !== undefined) this.showReplace(options.replace && this.host.canEdit());
    const picked = options.query ?? this.selectedText();
    if (picked) this.find.value = picked;
    this.find.focus();
    this.find.select();
    this.search();
  }

  /** Searches now when typing has not been searched for yet (a key that comes right after typing must see what was typed). */
  private flush(): void {
    if (!this.waiting) return;
    clearTimeout(this.timer);
    this.waiting = false;
    this.search();
  }

  /** Closes the bar; the text has the focus again, with the match that was current selected. */
  close(): void {
    if (this.el.hidden) return;
    this.flush();
    const current = this.ranges[this.index];
    this.el.hidden = true;
    this.clear();
    this.host.content.focus();
    if (current) {
      const { startContainer, startOffset, endContainer, endOffset } = current;
      this.host.content.ownerDocument.getSelection()?.setBaseAndExtent(startContainer, startOffset, endContainer, endOffset);
    }
  }

  destroy(): void {
    clearTimeout(this.timer);
    this.clear();
    this.el.remove();
  }

  /** Searches again (the text changed, or what to find did). */
  refresh(): void {
    if (this.isOpen) this.search(false);
  }

  /** The number of matches. */
  get matches(): number {
    return this.ranges.length;
  }

  private updateEditable(): void {
    const editable = this.host.canEdit();
    this.toggle.hidden = !editable;
    if (!editable) this.replaceRow.hidden = true;
  }

  private showReplace(show: boolean): void {
    this.replaceRow.hidden = !show;
    this.toggle.setAttribute('aria-expanded', String(show));
    this.toggle.textContent = show ? '▾' : '▸';
    this.toggle.title = this.host.t(show ? 'ui.find.hideReplace' : 'ui.find.showReplace');
    this.toggle.setAttribute('aria-label', this.toggle.title);
  }

  /** The selected text, when it is a line of it. */
  private selectedText(): string {
    const sel = this.host.content.ownerDocument.getSelection();
    if (!sel?.rangeCount || sel.isCollapsed || !this.host.content.contains(sel.anchorNode)) return '';
    const text = sel.toString();
    return text.length <= 200 && !/[\n\r]/.test(text) ? text : '';
  }

  private search(keepPlace = true): void {
    this.waiting = false;
    const keep = keepPlace ? this.ranges[this.index] : undefined;
    this.undoState = null;
    this.undoBtn.hidden = true;
    this.ranges = findRanges(this.host.content, this.find.value, { matchCase: this.matchCase, wholeWord: this.wholeWord });
    // the same place again when it is still a match, else the first match after the caret or after where it was
    this.index = 0;
    if (this.ranges.length) {
      const from = keep ?? this.caret();
      if (from) {
        const found = this.ranges.findIndex((r) => r.compareBoundaryPoints(Range.START_TO_START, from) >= 0);
        this.index = found < 0 ? 0 : found;
      }
    }
    this.mark(false);
  }

  /** Where the caret is in the text, as a collapsed range. */
  private caret(): Range | null {
    const sel = this.host.content.ownerDocument.getSelection();
    return sel?.rangeCount && this.host.content.contains(sel.anchorNode) ? sel.getRangeAt(0) : null;
  }

  private step(by: number): void {
    this.flush();
    if (!this.ranges.length) return;
    this.index = (this.index + by + this.ranges.length) % this.ranges.length;
    this.mark(true);
  }

  /** Marks the matches and the current one, and says how many there are. */
  private mark(scroll: boolean): void {
    const current = this.ranges[this.index] ?? null;
    marked.set(this.key, { all: this.ranges, current });
    paint();
    const total = this.ranges.length;
    const filled = !!this.find.value;
    this.count.textContent = !filled ? '' : total ? this.host.t('ui.find.count', { current: String(this.index + 1), total: String(total) }) : this.host.t('ui.find.none');
    this.count.classList.toggle('is-none', filled && !total);
    this.replaceBtn.disabled = !total || !this.host.canEdit();
    this.replaceAllBtn.disabled = !total || !this.host.canEdit();
    if (current && (scroll || this.ranges.length)) this.reveal(current);
  }

  /** Scrolls the current match into view. */
  private reveal(range: Range): void {
    const el = range.startContainer.nodeType === Node.ELEMENT_NODE ? (range.startContainer as Element) : range.startContainer.parentElement;
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  private clear(): void {
    marked.delete(this.key);
    paint();
    this.ranges = [];
  }

  /** Replaces the current match (in the undo history), and goes on to the next one. */
  private replaceCurrent(): void {
    this.flush();
    const range = this.ranges[this.index];
    if (!range || !this.host.canEdit()) return;
    const doc = this.host.content.ownerDocument;
    const at = this.index;
    this.host.content.focus();
    const sel = doc.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range.cloneRange());
    if (this.replaceInput.value) doc.execCommand('insertText', false, this.replaceInput.value);
    else doc.execCommand('delete');
    this.host.changed();
    this.search(false);
    this.index = this.ranges.length ? Math.min(at, this.ranges.length - 1) : 0;
    this.mark(true);
    this.find.focus();
  }

  /** Replaces every match. One step that the button next to it takes back (the undo history of the browser does not have it). */
  private replaceAll(): void {
    this.flush();
    if (!this.ranges.length || !this.host.canEdit()) return;
    const before = this.host.content.innerHTML;
    const count = replaceRanges(this.host.content, this.ranges, this.replaceInput.value);
    const after = this.host.content.innerHTML;
    this.host.changed();
    this.search(false);
    this.undoState = { before, after };
    this.undoBtn.hidden = false;
    this.count.textContent = this.host.t('ui.find.replaced', { count: String(count) });
    this.count.classList.remove('is-none');
  }

  private undoReplace(): void {
    const state = this.undoState;
    if (!state) return;
    // only while nothing else changed in the text
    if (this.host.content.innerHTML !== state.after) {
      this.undoBtn.hidden = true;
      return;
    }
    this.host.restore(state.before);
    this.search(false);
    this.undoState = null;
    this.undoBtn.hidden = true;
  }
}
