/**
 * The ticket mode of the editor: the toolbar items (fields, commands, size, alignment, conditions), the edits on the layout,
 * an undo history of its own, copy and paste as template code, and the side panel with the options, the preview and the code.
 *
 * Every edit works on the model (lines of items) and draws the lines again; typing is left to the browser. The history keeps
 * snapshots of the model, because the browser's undo knows nothing about edits made this way.
 */
import {
  dataLookup,
  exportTemplate,
  groupConditions,
  insertItems,
  interpret,
  lex,
  lineColumns,
  lineUnits,
  normalizeItems,
  parseTemplate,
  previewTicket,
  resolveTicket,
  setSizeBetween,
  sizeAt,
  splitItems,
  usedFields,
  validateModel,
} from './engine';
import type { Align, Item, Line, OutLine, PreviewContext, ResolvedTicket, TicketData, TicketOptions, TicketPart } from './engine';
import { decorate, lineOf, tornPath, normalizeContent, offsetOf, pointAt, readLine, readLines, renderLine, unitLength } from './dom';
import type { View } from './dom';

export interface TicketHost {
  doc: Document;
  root: HTMLElement;
  content: HTMLElement;
  stage: HTMLElement;
  /** The layout changed by something other than typing: the editor reports it. */
  changed(): void;
  emitTemplate(code: string): void;
  emitData(data: TicketData): void;
  fail(err: unknown): void;
  listen(target: EventTarget, type: string, fn: (e: Event) => void): void;
  focus(): void;
  restoreSelection(): void;
  closeOnOutside(wrap: HTMLElement, pop: HTMLElement, toggle: HTMLElement): void;
  isEditable(): boolean;
}

interface Pos {
  line: number;
  off: number;
}
interface Snapshot {
  json: string;
  caret: { a: Pos; b: Pos } | null;
}

let counter = 0;

function cloneData(d: TicketData | undefined): TicketData {
  return {
    values: { ...(d?.values ?? {}) },
    lists: Object.fromEntries(Object.entries(d?.lists ?? {}).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))])),
  };
}

export class TicketController {
  readonly R: ResolvedTicket;
  private host!: TicketHost;
  private id = String(++counter);
  private styleEl: HTMLStyleElement | null = null;
  private useNames = false;
  private source: { code: string; json: string } | null = null;
  private history: Snapshot[] = [];
  private hi = -1;
  private lastRecord = 0;
  private lastKind = '';
  private timer: ReturnType<typeof setTimeout> | undefined;
  private ctx: PreviewContext = { values: {}, flags: {} };
  private data: TicketData;
  private parts: TicketPart[];
  private partName: string | undefined;
  private paperWhole: HTMLElement | null = null;
  private dataEl: HTMLElement | null = null;
  private dataSig = '';
  private dataTimer: ReturnType<typeof setTimeout> | undefined;
  private lastSig = '';
  private lastCode = '';
  private codeDirty = false;
  private editingCondition = false;
  private chip: HTMLElement | null = null;
  private tools: HTMLElement | null = null;
  private toolName: HTMLElement | null = null;
  private toolInput: HTMLInputElement | null = null;
  private sizeSelect: HTMLSelectElement | null = null;
  private alignButtons = new Map<Align, HTMLButtonElement>();
  private undoBtn: HTMLButtonElement | null = null;
  private redoBtn: HTMLButtonElement | null = null;
  private panel: HTMLElement | null = null;
  private optionsEl!: HTMLElement;
  private condsEl!: HTMLElement;
  private paper!: HTMLElement;
  private codeArea!: HTMLTextAreaElement;
  private loadBtn!: HTMLButtonElement;
  private warnEl!: HTMLElement;
  private panes = new Map<string, HTMLElement>();
  private tabs = new Map<string, HTMLButtonElement>();
  private datalist: HTMLDataListElement | null = null;
  private options: TicketOptions;

  /** `t` gives a text of the editor (the labels option), `titleOf` the tooltip of a toolbar command. */
  constructor(options: TicketOptions, private readonly t: (key: string, vars?: Record<string, string>) => string, private readonly titleOf: (command: string) => string) {
    this.options = options;
    this.R = resolveTicket(options);
    this.data = cloneData(options.data);
    this.parts = (options.parts ?? []).map((p) => ({ ...p }));
    this.partName = options.part;
  }

  private get view(): View {
    return { useNames: this.useNames, describe: (it) => this.describe(it), lookup: this.layoutLookup() };
  }

  private describe(it: Extract<Item, { t: 'if' | 'endif' }>): string {
    if (it.t === 'endif') return this.t('ui.ticket.endif');
    return `${this.t(it.not ? 'ui.ticket.ifnot' : 'ui.ticket.if')} ${it.field}${it.value === undefined ? '' : ` = ${it.value}`}`;
  }

  // ---- toolbar ---------------------------------------------------------------------------------------------------

  private button(label: string, title: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('mousedown', (e) => e.preventDefault()); // the caret stays in the layout
    b.addEventListener('click', onClick);
    return b;
  }

  private picker(label: string, title: string, kind: string, fill: (pop: HTMLElement) => void, onOpen: () => void): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'aurebesh-table-picker';
    const pop = document.createElement('div');
    pop.className = `aurebesh-table-pop aurebesh-media-form aurebesh-ticket-pop aurebesh-ticket-pop-${kind}`;
    pop.hidden = true;
    const toggle = this.button(label, title, () => {
      pop.hidden = !pop.hidden;
      if (!pop.hidden) onOpen();
    });
    toggle.removeAttribute('aria-pressed');
    fill(pop);
    wrap.append(toggle, pop);
    // the host may not be attached yet when the toolbar is built
    queueMicrotask(() => this.host?.closeOnOutside(wrap, pop, toggle));
    this.closers.push(() => (pop.hidden = true));
    return wrap;
  }

  private closers: Array<() => void> = [];
  private closeAll(): void {
    this.closers.forEach((c) => c());
  }

  /** Builds one toolbar item (see TICKET_ITEMS). */
  buildItem(name: string): HTMLElement {
    const title = (c: string) => this.titleOf(c);
    switch (name) {
      case 'ticketTag':
        return this.tagPicker(title(name));
      case 'ticketCmd':
        return this.commandPicker(title(name));
      case 'ticketCondition':
        return this.conditionPicker(title(name));
      case 'ticketSize': {
        const select = document.createElement('select');
        select.className = 'aurebesh-size aurebesh-ticket-size';
        select.title = title(name);
        select.setAttribute('aria-label', title(name));
        const ph = document.createElement('option');
        ph.value = '';
        ph.textContent = title(name);
        ph.disabled = true;
        ph.hidden = true;
        select.appendChild(ph);
        for (const s of this.R.sizes) {
          const o = document.createElement('option');
          o.value = s.name;
          o.textContent = s.label ?? s.name;
          select.appendChild(o);
        }
        select.addEventListener('change', () => this.applySize(select.value));
        this.sizeSelect = select;
        return select;
      }
      case 'alignLeft':
      case 'alignCenter':
      case 'alignRight': {
        const align = name === 'alignLeft' ? 'left' : name === 'alignCenter' ? 'center' : 'right';
        const b = this.button(name === 'alignLeft' ? '≡' : name === 'alignCenter' ? '≣' : '≢', title(name), () => this.applyAlign(align));
        this.alignButtons.set(align, b);
        return b;
      }
      case 'undo':
        return (this.undoBtn = this.button('↶', title(name), () => this.undo()));
      case 'redo':
        return (this.redoBtn = this.button('↷', title(name), () => this.redo()));
    }
    return document.createElement('span');
  }

  private tagPicker(title: string): HTMLElement {
    let input!: HTMLInputElement;
    let list!: HTMLElement;
    const show = () => {
      const q = input.value.trim().toLowerCase();
      list.replaceChildren();
      const found = this.R.keywords.filter((k) => !q || k.name.toLowerCase().includes(q) || (k.label ?? '').toLowerCase().includes(q));
      for (const k of found) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'aurebesh-ticket-item';
        b.addEventListener('mousedown', (e) => e.preventDefault());
        const main = document.createElement('span');
        main.textContent = k.label ?? k.name;
        const sub = document.createElement('small');
        sub.textContent = k.label ? k.name : k.format ?? '';
        b.append(main, sub);
        b.addEventListener('click', () => {
          this.closeAll();
          this.insertField(k.name, k.format);
        });
        list.appendChild(b);
      }
      const typed = input.value.trim();
      if (typed && !this.R.keywordByKey.has(typed.toLowerCase()) && /^[A-Za-z][\w.]{0,63}$/.test(typed)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'aurebesh-ticket-item';
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.textContent = `+ ${typed}`;
        b.addEventListener('click', () => {
          this.closeAll();
          this.insertField(typed, undefined);
        });
        list.appendChild(b);
      }
    };
    return this.picker(
      '[*]',
      title,
      'tag',
      (pop) => {
        input = document.createElement('input');
        input.type = 'text';
        input.placeholder = this.t('ui.ticket.search') ?? 'Search…';
        input.addEventListener('input', show);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (list.querySelector('button') as HTMLElement | null)?.click();
          }
        });
        list = document.createElement('div');
        list.className = 'aurebesh-ticket-list';
        pop.append(input, list);
      },
      () => {
        input.value = '';
        show();
        input.focus();
      },
    );
  }

  private commandPicker(title: string): HTMLElement {
    let list!: HTMLElement;
    let arg!: HTMLElement;
    let argInput!: HTMLInputElement;
    let pending = '';
    return this.picker(
      '[…]',
      title,
      'cmd',
      (pop) => {
        list = document.createElement('div');
        list.className = 'aurebesh-ticket-list';
        for (const c of this.R.commands) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'aurebesh-ticket-item';
          b.addEventListener('mousedown', (e) => e.preventDefault());
          const main = document.createElement('span');
          main.textContent = c.label ?? c.name;
          const sub = document.createElement('small');
          sub.textContent = c.name;
          b.append(main, sub);
          b.addEventListener('click', () => {
            if (c.kind === 'include') {
              pending = c.name;
              arg.hidden = false;
              argInput.focus();
              return;
            }
            this.closeAll();
            this.insertCommand(c.name);
          });
          list.appendChild(b);
        }
        arg = document.createElement('div');
        arg.hidden = true;
        argInput = document.createElement('input');
        argInput.type = 'text';
        const go = document.createElement('button');
        go.type = 'button';
        go.textContent = this.t('ui.insert') ?? 'Insert';
        const submit = () => {
          const file = argInput.value.trim();
          if (!file || /["\r\n]/.test(file)) return;
          this.closeAll();
          this.insertCommand(pending, file);
        };
        go.addEventListener('mousedown', (e) => e.preventDefault());
        go.addEventListener('click', submit);
        argInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        });
        arg.append(argInput, go);
        pop.append(list, arg);
      },
      () => {
        arg.hidden = true;
        argInput.value = '';
        argInput.placeholder = this.t('ui.ticket.file') ?? 'File name';
      },
    );
  }

  /** The small form for a condition: If / If not, a field, and a value. */
  private conditionForm(initial: { field: string; value?: string; not: boolean }, apply: (c: { field: string; value?: string; not: boolean }) => void, applyLabel: string): HTMLElement {
    const form = document.createElement('div');
    form.className = 'aurebesh-ticket-form';
    const kind = document.createElement('select');
    for (const [v, k] of [['if', 'ui.ticket.if'], ['ifnot', 'ui.ticket.ifnot']] as const) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = this.t(k) ?? k;
      kind.appendChild(o);
    }
    kind.value = initial.not ? 'ifnot' : 'if';
    const field = document.createElement('input');
    field.type = 'text';
    field.placeholder = this.t('ui.ticket.field') ?? 'Field';
    field.value = initial.field;
    if (this.datalist) field.setAttribute('list', this.datalist.id);
    const value = document.createElement('input');
    value.type = 'text';
    value.placeholder = this.t('ui.ticket.value') ?? 'Value';
    value.value = initial.value ?? '';
    const go = document.createElement('button');
    go.type = 'button';
    go.textContent = applyLabel;
    const submit = () => {
      const f = field.value.trim();
      const v = value.value;
      if (!/^[^,\s"]+$/.test(f) || /["\r\n]/.test(v)) return this.host.fail(new Error(this.t('ui.ticket.badCondition')));
      apply({ field: f, ...(v === '' ? {} : { value: v }), not: kind.value === 'ifnot' });
    };
    go.addEventListener('click', submit);
    for (const el of [field, value]) {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submit();
        }
      });
    }
    form.append(kind, field, value, go);
    return form;
  }

  private conditionPicker(title: string): HTMLElement {
    let holder!: HTMLElement;
    return this.picker(
      'If',
      title,
      'cond',
      (pop) => {
        holder = document.createElement('div');
        pop.appendChild(holder);
      },
      () => {
        holder.replaceChildren(
          this.conditionForm({ field: '', not: false }, (c) => {
            this.closeAll();
            this.addCondition(c);
          }, this.t('ui.apply') ?? 'Apply'),
        );
        (holder.querySelector('input') as HTMLInputElement | null)?.focus();
      },
    );
  }

  // ---- attaching to the editor -------------------------------------------------------------------------------------

  attach(host: TicketHost): void {
    this.host = host;
    const { doc, root, content, stage } = host;
    root.setAttribute('data-ticket', '');
    root.setAttribute('data-tk', this.id);
    root.style.setProperty('--tk-cols', String(this.R.columns));
    content.classList.add('aurebesh-ticket');
    content.classList.toggle('no-ruler', this.options.ruler === false);
    content.setAttribute('aria-label', this.t('ui.ticket.layout'));

    // the sizes: one rule per size, in this editor only
    this.styleEl = doc.createElement('style');
    this.styleEl.setAttribute('data-aurebesh-ticket', this.id);
    const scope = `.aurebesh[data-tk="${this.id}"]`;
    this.styleEl.textContent = this.R.sizes
      .filter((s) => s.width !== 1 || s.height !== 1)
      .map((s) => {
        const sel = `${scope} [data-size="${s.name}"]`;
        if (s.width === s.height) return `${sel}{font-size:${s.width}em}`;
        const r = s.height / s.width;
        return `${sel}{display:inline-block;font-size:${s.width}em;transform:scaleY(${r});transform-origin:50% 60%;margin:${((r - 1) * 0.6).toFixed(2)}em 0}`;
      })
      .join('');
    doc.head.appendChild(this.styleEl);

    // body: the layout on the left, the panel on the right
    const body = doc.createElement('div');
    body.className = 'aurebesh-body';
    root.insertBefore(body, stage);
    body.appendChild(stage);
    this.buildPanel(body);
    this.buildChipTools();

    host.listen(content, 'input', () => this.schedule());
    host.listen(content, 'beforeinput', (e) => this.onBeforeInput(e as InputEvent));
    host.listen(content, 'click', (e) => this.onClick(e as MouseEvent));
    host.listen(content, 'copy', (e) => this.onCopy(e as ClipboardEvent, false));
    host.listen(content, 'cut', (e) => this.onCopy(e as ClipboardEvent, true));
    host.listen(content, 'paste', (e) => this.onPaste(e as ClipboardEvent));
    host.listen(content, 'drop', (e) => e.preventDefault());
    host.listen(content, 'dragover', (e) => e.preventDefault());
    host.listen(doc, 'selectionchange', () => this.updateUi());

    if (this.options.template !== undefined) this.load(this.options.template);
    else {
      normalizeContent(content);
      this.refresh(false, 'op');
    }
  }

  destroy(): void {
    clearTimeout(this.timer);
    this.styleEl?.remove();
    this.clearHighlight();
  }

  // ---- model and markup ----------------------------------------------------------------------------------------------

  private els(): HTMLElement[] {
    return Array.from(this.host.content.children) as HTMLElement[];
  }

  private lines(): Line[] {
    normalizeContent(this.host.content);
    return readLines(this.host.content, this.R);
  }

  private render(lines: Line[]): void {
    const { content, doc } = this.host;
    const els = lines.length ? lines.map((l) => renderLine(doc, l, this.R, this.view)) : [renderLine(doc, { align: 'left', items: [] }, this.R, this.view)];
    content.replaceChildren(...els);
  }

  /** The code for these lines: what was loaded, as long as nothing in the layout changed, so a template is not rewritten for nothing. */
  private codeFor(lines: Line[], json: string): string {
    return this.source && this.source.json === json ? this.source.code : exportTemplate(lines, this.R);
  }

  /** The template as code. */
  getTemplate(): string {
    this.flush();
    const lines = this.lines();
    return this.codeFor(lines, JSON.stringify(lines));
  }

  /** Replaces the layout by a template. */
  setTemplate(code: string): void {
    this.flush();
    this.load(code);
    this.host.changed();
  }

  private load(code: string): void {
    const lines = parseTemplate(code, this.R);
    this.source = { code, json: JSON.stringify(lines) };
    this.render(lines);
    this.refresh(true, 'op');
  }

  getProblems() {
    return validateModel(this.lines());
  }

  getLines(): Line[] {
    this.flush();
    return this.lines();
  }

  /** Takes over markup put in the content from outside (`setHTML`): chips and lines are put right and the panel catches up. */
  adopt(): void {
    this.source = null;
    normalizeContent(this.host.content);
    this.refresh(true, 'op');
  }

  /** The toolbar follows the state of the editor (read-only or not). */
  sync(): void {
    this.updateUi();
  }

  // ---- positions in the layout ---------------------------------------------------------------------------------------

  private posOf(node: Node, offset: number): Pos {
    const { content } = this.host;
    const els = this.els();
    if (node === content) {
      if (offset >= els.length) return { line: els.length - 1, off: unitLength(els[els.length - 1]) };
      return { line: offset, off: 0 };
    }
    const line = lineOf(content, node);
    if (!line) return { line: 0, off: 0 };
    return { line: els.indexOf(line), off: offsetOf(line, node, offset) };
  }

  private range(): Range | null {
    const { doc, content } = this.host;
    const get = () => {
      const sel = doc.getSelection();
      const r = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
      return r && content.contains(r.startContainer) && content.contains(r.endContainer) ? r : null;
    };
    let r = get();
    if (!r) {
      this.host.focus();
      this.host.restoreSelection();
      r = get();
    }
    return r;
  }

  private caret(): { a: Pos; b: Pos } | null {
    const r = this.range();
    return r ? { a: this.posOf(r.startContainer, r.startOffset), b: this.posOf(r.endContainer, r.endOffset) } : null;
  }

  private setCaret(a: Pos, b: Pos = a): void {
    const { doc, content } = this.host;
    const els = this.els();
    const clamp = (p: Pos) => ({ line: Math.min(Math.max(p.line, 0), els.length - 1), off: p.off });
    const [x, y] = [clamp(a), clamp(b)];
    const [sn, so] = pointAt(els[x.line], x.off);
    const [en, eo] = pointAt(els[y.line], y.off);
    const r = doc.createRange();
    r.setStart(sn, so);
    r.setEnd(en, eo);
    const sel = doc.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    content.focus();
  }

  // ---- edits -----------------------------------------------------------------------------------------------------------

  /** Runs an edit on the lines and shows the result, with the caret where the edit says. */
  private edit(fn: (lines: Line[], c: { a: Pos; b: Pos }) => { a: Pos; b?: Pos } | void): void {
    if (!this.host.isEditable()) return;
    this.flush();
    const c = this.caret() ?? { a: { line: 0, off: 0 }, b: { line: 0, off: 0 } };
    const lines = this.lines();
    const after = fn(lines, c);
    this.render(lines);
    if (after) this.setCaret(after.a, after.b);
    this.refresh(true, 'op');
    this.host.changed();
  }

  /** The lines a selection touches, with the part of each that is selected (the whole line for a caret). */
  private spans(lines: Line[], c: { a: Pos; b: Pos }): { line: number; from: number; to: number }[] {
    const out: { line: number; from: number; to: number }[] = [];
    const collapsed = c.a.line === c.b.line && c.a.off === c.b.off;
    for (let i = c.a.line; i <= c.b.line; i++) {
      const len = lineUnits(lines[i].items);
      out.push({ line: i, from: collapsed ? 0 : i === c.a.line ? c.a.off : 0, to: collapsed ? len : i === c.b.line ? c.b.off : len });
    }
    return out;
  }

  /** Puts lines in place of the selection and returns the caret after them. */
  private replace(lines: Line[], a: Pos, b: Pos, ins: Line[]): Pos {
    const [left] = splitItems(lines[a.line].items, a.off);
    const [, right] = splitItems(lines[b.line].items, b.off);
    const align = lines[a.line].align;
    let made: Line[];
    let at: Pos;
    if (ins.length <= 1) {
      const mid = ins[0]?.items ?? [];
      made = [{ align, items: normalizeItems([...left, ...mid, ...right]) }];
      at = { line: a.line, off: lineUnits(left) + lineUnits(mid) };
    } else {
      const last = ins[ins.length - 1];
      made = [{ align, items: normalizeItems([...left, ...ins[0].items]) }, ...ins.slice(1, -1), { align: last.align, items: normalizeItems([...last.items, ...right]) }];
      at = { line: a.line + ins.length - 1, off: lineUnits(last.items) };
    }
    lines.splice(a.line, b.line - a.line + 1, ...made);
    return at;
  }

  insertField(name: string, fmt: string | undefined): void {
    this.edit((lines, c) => {
      const size = sizeAt(lines[c.a.line].items, c.a.off, this.R);
      return { a: this.replace(lines, c.a, c.b, [{ align: 'left', items: [{ t: 'field', name, ...(fmt === undefined ? {} : { fmt }), size }] }]) };
    });
  }

  insertCommand(name: string, arg?: string): void {
    this.edit((lines, c) => {
      const size = sizeAt(lines[c.a.line].items, c.a.off, this.R);
      return { a: this.replace(lines, c.a, c.b, [{ align: 'left', items: [{ t: 'cmd', name, ...(arg === undefined ? {} : { arg }), size }] }]) };
    });
  }

  applySize(size: string): void {
    if (!this.R.sizeByKey.has(size.toLowerCase())) return;
    this.edit((lines, c) => {
      for (const s of this.spans(lines, c)) lines[s.line].items = setSizeBetween(lines[s.line].items, s.from, s.to, this.R.sizeByKey.get(size.toLowerCase())!.name);
      return { a: c.a, b: c.b };
    });
  }

  applyAlign(align: Align): void {
    this.edit((lines, c) => {
      for (let i = c.a.line; i <= c.b.line; i++) lines[i].align = align;
      return { a: c.a, b: c.b };
    });
  }

  /** Wraps the selection (or the line with the caret) in a condition. */
  addCondition(cond: { field: string; value?: string; not: boolean }): void {
    this.edit((lines, c) => {
      const collapsed = c.a.line === c.b.line && c.a.off === c.b.off;
      const a = collapsed ? { line: c.a.line, off: 0 } : c.a;
      const b = collapsed ? { line: c.a.line, off: lineUnits(lines[c.a.line].items) } : c.b;
      lines[b.line].items = insertItems(lines[b.line].items, b.off, [{ t: 'endif' }]);
      lines[a.line].items = insertItems(lines[a.line].items, a.off, [{ t: 'if', field: cond.field, ...(cond.value === undefined ? {} : { value: cond.value }), not: cond.not }]);
      return { a: { line: b.line, off: b.off + (a.line === b.line ? 2 : 1) } };
    });
  }

  // ---- undo --------------------------------------------------------------------------------------------------------------

  private caretState(): Snapshot['caret'] {
    const r = this.host.doc.getSelection();
    if (!r || !r.rangeCount || !this.host.content.contains(r.getRangeAt(0).startContainer) || !this.host.content.contains(r.getRangeAt(0).endContainer)) return null;
    const range = r.getRangeAt(0);
    return { a: this.posOf(range.startContainer, range.startOffset), b: this.posOf(range.endContainer, range.endOffset) };
  }

  private record(json: string, kind: string): void {
    const top = this.history[this.hi];
    if (top && top.json === json) {
      top.caret = this.caretState() ?? top.caret;
      return;
    }
    const snap: Snapshot = { json, caret: this.caretState() };
    const now = Date.now();
    if (kind === 'typing' && top && this.lastKind === 'typing' && now - this.lastRecord < 700 && this.hi === this.history.length - 1) {
      this.history[this.hi] = snap; // typing in one go is one step
    } else {
      this.history.splice(this.hi + 1);
      this.history.push(snap);
      if (this.history.length > 200) this.history.shift();
      this.hi = this.history.length - 1;
    }
    this.lastRecord = now;
    this.lastKind = kind;
  }

  private restore(snap: Snapshot): void {
    this.render(JSON.parse(snap.json) as Line[]);
    if (snap.caret) this.setCaret(snap.caret.a, snap.caret.b);
    this.refresh(true, 'restore');
    this.host.changed();
  }

  undo(): void {
    this.flush();
    if (this.hi > 0) this.restore(this.history[--this.hi]);
  }

  redo(): void {
    this.flush();
    if (this.hi < this.history.length - 1) this.restore(this.history[++this.hi]);
  }

  // ---- events --------------------------------------------------------------------------------------------------------------

  /** Keys that are the ticket editor's own: undo and redo, and the formatting keys of the normal editor do nothing here. */
  handleKey(e: KeyboardEvent): boolean {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod && !e.shiftKey && !e.altKey && (e.key === 'Backspace' || e.key === 'Delete') && this.host.isEditable()) {
      const c = this.caret();
      if (c && c.a.line === c.b.line && c.a.off === c.b.off) {
        const els = this.els();
        const at = c.a;
        const join = e.key === 'Backspace' ? at.off === 0 && at.line > 0 : at.off === unitLength(els[at.line]) && at.line < els.length - 1;
        if (join) {
          e.preventDefault();
          const top = e.key === 'Backspace' ? at.line - 1 : at.line;
          this.edit((lines) => {
            const [first, second] = [lines[top], lines[top + 1]];
            lines.splice(top, 2, { align: first.items.length ? first.align : second.align, items: normalizeItems([...first.items, ...second.items]) });
            return { a: { line: top, off: lineUnits(first.items) } };
          });
          return true;
        }
      }
      return false;
    }
    if (!mod) return false;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) this.undo();
    else if ((k === 'z' && e.shiftKey) || k === 'y') this.redo();
    else if (!((k === 'b' || k === 'i' || k === 'u' || k === 'k') || e.altKey)) return false;
    e.preventDefault();
    return true;
  }

  private onBeforeInput(e: InputEvent): void {
    if (e.inputType === 'historyUndo') {
      e.preventDefault();
      this.undo();
    } else if (e.inputType === 'historyRedo') {
      e.preventDefault();
      this.redo();
    } else if (/^format/.test(e.inputType)) {
      e.preventDefault();
    }
  }

  private onClick(e: MouseEvent): void {
    const chip = (e.target as Element | null)?.closest?.('.aurebesh-tk') as HTMLElement | null;
    if (!chip || !this.host.content.contains(chip)) return;
    const r = this.host.doc.createRange();
    r.selectNode(chip);
    const sel = this.host.doc.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    this.showChipTools(chip);
  }

  /** What the selection is as template code: copying gives code, so pasting it somewhere here brings everything back. */
  private onCopy(e: ClipboardEvent, cut: boolean): void {
    const r = this.range();
    if (!r || r.collapsed || !e.clipboardData) return;
    const tmp = this.host.doc.createElement('div');
    tmp.appendChild(r.cloneContents());
    normalizeContent(tmp);
    e.clipboardData.setData('text/plain', exportTemplate(readLines(tmp, this.R), this.R));
    e.preventDefault();
    if (cut && this.host.isEditable()) {
      this.edit((lines, c) => ({ a: this.replace(lines, c.a, c.b, []) }));
    }
  }

  private onPaste(e: ClipboardEvent): void {
    e.preventDefault();
    if (!this.host.isEditable()) return;
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!text) return;
    const hasTags = text.includes('[*');
    this.edit((lines, c) => {
      const ins = parseTemplate(text, this.R);
      if (!hasTags) {
        const size = sizeAt(lines[c.a.line].items, c.a.off, this.R);
        for (const l of ins) l.items = l.items.map((it) => (it.t === 'text' ? { ...it, size } : it));
      }
      return { a: this.replace(lines, c.a, c.b, ins) };
    });
  }

  // ---- chip tools ----------------------------------------------------------------------------------------------------------

  private buildChipTools(): void {
    const { doc, root } = this.host;
    const tools = doc.createElement('div');
    tools.className = 'aurebesh-toolbar aurebesh-ticket-chip-tools';
    tools.setAttribute('role', 'toolbar');
    tools.hidden = true;
    const name = doc.createElement('span');
    name.className = 'aurebesh-link-url';
    const input = doc.createElement('input');
    input.type = 'text';
    input.className = 'aurebesh-alt';
    const apply = this.button(this.t('ui.apply'), this.t('ui.apply'), () => this.applyChip());
    apply.removeAttribute('aria-pressed');
    const remove = this.button(this.t('ui.ticket.remove'), this.t('ui.ticket.remove'), () => this.removeChip());
    remove.removeAttribute('aria-pressed');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.applyChip();
      }
    });
    tools.append(name, input, apply, remove);
    root.insertBefore(tools, root.querySelector('.aurebesh-body'));
    this.tools = tools;
    this.toolName = name;
    this.toolInput = input;
  }

  private showChipTools(chip: HTMLElement): void {
    const t = chip.getAttribute('data-t');
    if (t !== 'field' && !(t === 'cmd' && chip.hasAttribute('data-arg')) && t !== 'cmd' && t !== 'if') return;
    this.chip = chip;
    const input = this.toolInput!;
    if (t === 'field') {
      this.toolName!.textContent = chip.getAttribute('data-name') ?? '';
      input.hidden = false;
      input.placeholder = this.t('ui.ticket.format');
      input.value = chip.getAttribute('data-fmt') ?? '';
    } else if (t === 'cmd') {
      this.toolName!.textContent = chip.getAttribute('data-name') ?? '';
      input.hidden = !chip.hasAttribute('data-arg');
      input.placeholder = this.t('ui.ticket.file');
      input.value = chip.getAttribute('data-arg') ?? '';
    } else {
      this.toolName!.textContent = chip.getAttribute('data-label') ?? '';
      input.hidden = true;
    }
    this.tools!.hidden = false;
  }

  private applyChip(): void {
    const chip = this.chip;
    if (!chip || !this.host.isEditable()) return;
    const v = this.toolInput!.value;
    if (/["\r\n]/.test(v)) return this.host.fail(new Error(this.t('ui.ticket.badValue')));
    const t = chip.getAttribute('data-t');
    if (t === 'field') {
      if (v === '') chip.removeAttribute('data-fmt');
      else chip.setAttribute('data-fmt', v);
    } else if (t === 'cmd' && chip.hasAttribute('data-arg')) {
      chip.setAttribute('data-arg', v);
    }
    this.afterDomEdit();
  }

  private removeChip(): void {
    const chip = this.chip;
    if (!chip || !this.host.isEditable()) return;
    this.hideChipTools();
    chip.remove();
    this.afterDomEdit();
  }

  /** A change made straight in the markup (a chip's format, removing a marker): note it and tell the editor. */
  private afterDomEdit(): void {
    this.flush();
    this.refresh(true, 'op');
    this.host.changed();
  }

  private hideChipTools(): void {
    this.chip = null;
    if (this.tools) this.tools.hidden = true;
  }

  // ---- refreshing ---------------------------------------------------------------------------------------------------------

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.refresh(true, 'typing');
    }, 80);
  }

  private flush(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
      this.refresh(true, 'typing');
    }
  }

  private refresh(emit: boolean, kind: string): void {
    const { content } = this.host;
    normalizeContent(content);
    decorate(content, this.R, this.view);
    const lines = readLines(content, this.R);
    const json = JSON.stringify(lines);
    const code = this.codeFor(lines, json);
    this.record(json, kind);
    this.updatePanel(lines, code);
    this.updateUi();
    if (emit && code !== this.lastCode) {
      this.lastCode = code;
      this.host.emitTemplate(code);
    } else if (!emit) {
      this.lastCode = code;
    }
  }

  /** The toolbar follows the caret: the size of the text there, the alignment of the line, whether undo and redo are possible. */
  private updateUi(): void {
    if (!this.host) return;
    const c = this.caretState(); // only reads: this runs on every selection change, also while an input in the panel has the focus
    if (this.chip && !this.host.content.contains(this.chip)) this.hideChipTools();
    else if (this.chip && !this.tools?.contains(this.host.doc.activeElement)) {
      // not while its own input has the focus: the selection has moved into that input then
      const r = this.host.doc.getSelection();
      if (!r || !r.rangeCount || !r.getRangeAt(0).intersectsNode(this.chip)) this.hideChipTools();
    }
    if (c) {
      const els = this.els();
      const line = els[c.a.line];
      if (line) {
        const model = readLine(line, this.R);
        if (this.sizeSelect) this.sizeSelect.value = sizeAt(model.items, c.a.off, this.R);
        for (const [a, b] of this.alignButtons) b.setAttribute('aria-pressed', String(model.align === a));
      }
    }
    if (this.undoBtn) this.undoBtn.disabled = this.hi <= 0;
    if (this.redoBtn) this.redoBtn.disabled = this.hi >= this.history.length - 1;
    const editable = this.host.isEditable();
    for (const b of [...this.alignButtons.values()]) b.disabled = !editable;
    if (this.sizeSelect) this.sizeSelect.disabled = !editable;
  }

  // ---- the panel ----------------------------------------------------------------------------------------------------------

  private buildPanel(body: HTMLElement): void {
    const doc = this.host.doc;
    const t = this.t;
    const panel = doc.createElement('aside');
    panel.className = 'aurebesh-ticket-panel';
    panel.setAttribute('aria-label', t('ui.ticket.panel'));
    this.panel = panel;

    const switches = doc.createElement('div');
    switches.className = 'aurebesh-ticket-switches';
    const names = this.checkbox(t('ui.ticket.showNames'), (on) => {
      this.useNames = on;
      this.flush();
      this.refresh(false, 'view');
    });
    const ruler = this.checkbox(
      t('ui.ticket.showRuler'),
      (on) => this.host.content.classList.toggle('no-ruler', !on),
      this.options.ruler !== false,
    );
    switches.append(ruler, names);

    this.optionsEl = doc.createElement('div');
    this.optionsEl.className = 'aurebesh-ticket-options';
    this.condsEl = doc.createElement('div');
    this.condsEl.className = 'aurebesh-ticket-conds';
    this.warnEl = doc.createElement('div');
    this.warnEl.className = 'aurebesh-ticket-warn';
    this.warnEl.setAttribute('role', 'status');

    const tabs = doc.createElement('div');
    tabs.className = 'aurebesh-ticket-tabs';
    tabs.setAttribute('role', 'tablist');
    const mk = (key: string, label: string): HTMLElement => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.textContent = label;
      b.addEventListener('click', () => this.showTab(key));
      this.tabs.set(key, b);
      tabs.appendChild(b);
      const pane = doc.createElement('div');
      pane.className = 'aurebesh-ticket-pane';
      this.panes.set(key, pane);
      return pane;
    };
    const preview = mk('preview', t('ui.ticket.preview'));
    const hasWhole = this.parts.length > 0 || Object.keys(this.data.values ?? {}).length > 0 || Object.keys(this.data.lists ?? {}).length > 0;
    const whole = hasWhole ? mk('whole', t('ui.ticket.whole')) : null;
    const dataPane = hasWhole ? mk('data', t('ui.ticket.data')) : null;
    const code = mk('code', t('ui.ticket.code'));
    if (whole && dataPane) {
      this.paperWhole = doc.createElement('div');
      this.paperWhole.className = 'aurebesh-ticket-paper';
      whole.appendChild(this.paperWhole);
      this.dataEl = doc.createElement('div');
      this.dataEl.className = 'aurebesh-ticket-data';
      dataPane.appendChild(this.dataEl);
    }

    this.paper = doc.createElement('div');
    this.paper.className = 'aurebesh-ticket-paper';
    preview.appendChild(this.paper);

    this.codeArea = doc.createElement('textarea');
    this.codeArea.className = 'aurebesh-ticket-code';
    this.codeArea.spellcheck = false;
    this.codeArea.setAttribute('wrap', 'off');
    this.codeArea.setAttribute('aria-label', t('ui.ticket.code'));
    this.codeArea.addEventListener('input', () => {
      this.codeDirty = true;
      this.loadBtn.disabled = !this.host.isEditable();
    });
    this.loadBtn = doc.createElement('button');
    this.loadBtn.type = 'button';
    this.loadBtn.className = 'aurebesh-ticket-load';
    this.loadBtn.textContent = t('ui.ticket.load');
    this.loadBtn.disabled = true;
    this.loadBtn.addEventListener('click', () => {
      if (!this.host.isEditable()) return;
      this.codeDirty = false;
      this.loadBtn.disabled = true;
      this.setTemplate(this.codeArea.value);
    });
    code.append(this.codeArea, this.loadBtn);

    this.datalist = doc.createElement('datalist');
    this.datalist.id = `aurebesh-tk-fields-${this.id}`;

    panel.append(switches, this.optionsEl, this.condsEl, this.warnEl, tabs, preview, ...(whole && dataPane ? [whole, dataPane] : []), code, this.datalist);
    body.appendChild(panel);
    this.showTab('preview');
  }

  private checkbox(label: string, on: (checked: boolean) => void, checked = false): HTMLElement {
    const l = this.host.doc.createElement('label');
    const i = this.host.doc.createElement('input');
    i.type = 'checkbox';
    i.checked = checked;
    i.addEventListener('change', () => on(i.checked));
    l.append(i, ` ${label}`);
    return l;
  }

  private showTab(key: string): void {
    for (const [k, pane] of this.panes) {
      pane.hidden = k !== key;
      this.tabs.get(k)!.setAttribute('aria-selected', String(k === key));
    }
  }

  private updatePanel(lines: Line[], code: string): void {
    const tokens = lex(code, this.R);
    // code
    if (!this.codeDirty && this.codeArea.value !== code) this.codeArea.value = code;
    // the fields a condition can be about
    const groups = groupConditions(tokens);
    this.datalist!.replaceChildren(
      ...[...new Set([...this.R.keywords.map((k) => k.name), ...groups.map((g) => g.field)])].map((n) => {
        const o = this.host.doc.createElement('option');
        o.value = n;
        return o;
      }),
    );
    this.updateOptions(groups);
    this.updateConditions();
    this.updateProblems(lines);
    this.renderPreview(interpret(tokens, { ...this.ctx, useNames: this.useNames, data: this.layoutLookup() }, this.R));
    if (this.paperWhole) {
      this.renderPaper(this.paperWhole, previewTicket(this.partsLive(code), this.data, this.ctx.flags, this.R, this.useNames));
      this.updateData(code);
    }
  }

  /** One control per field a condition is about: the value to try, or a switch for a condition that is not a comparison. */
  private updateOptions(groups: ReturnType<typeof groupConditions>): void {
    const sig = JSON.stringify(groups);
    if (sig === this.lastSig) return;
    this.lastSig = sig;
    const doc = this.host.doc;
    const t = this.t;
    this.optionsEl.replaceChildren();
    if (!groups.length) {
      const p = doc.createElement('p');
      p.className = 'aurebesh-ticket-note';
      p.textContent = t('ui.ticket.noConditions');
      this.optionsEl.appendChild(p);
      return;
    }
    const h = doc.createElement('div');
    h.className = 'aurebesh-ticket-heading';
    h.textContent = t('ui.ticket.options');
    this.optionsEl.appendChild(h);
    for (const g of groups) {
      const key = g.field.toLowerCase();
      if (g.values.length) {
        if (!(key in this.ctx.values) || (this.ctx.values[key] !== '' && !g.values.includes(this.ctx.values[key]))) {
          // start where the first condition on the field is true: its value for an If, any other value for an Ifnot
          const sample = this.R.keywordByKey.get(key)?.sample;
          this.ctx.values[key] = sample !== undefined && g.values.includes(sample) ? sample : g.first?.not ? '' : g.first?.value ?? g.values[0];
        }
        const row = doc.createElement('label');
        row.className = 'aurebesh-ticket-option';
        const name = doc.createElement('span');
        name.textContent = g.field;
        const select = doc.createElement('select');
        for (const v of ['', ...g.values]) {
          const o = doc.createElement('option');
          o.value = v;
          o.textContent = v === '' ? t('ui.ticket.other') : v;
          select.appendChild(o);
        }
        select.value = this.ctx.values[key];
        select.addEventListener('change', () => {
          this.ctx.values[key] = select.value;
          this.repreview();
        });
        row.append(name, select);
        this.optionsEl.appendChild(row);
      }
      for (const f of g.flags) {
        const row = doc.createElement('label');
        row.className = 'aurebesh-ticket-option';
        const box = doc.createElement('input');
        box.type = 'checkbox';
        box.checked = !!this.ctx.flags[f.key];
        box.addEventListener('change', () => {
          this.ctx.flags[f.key] = box.checked;
          this.repreview();
        });
        const name = doc.createElement('span');
        name.textContent = f.value === undefined ? g.field : `${g.field} ${f.value}`;
        row.append(box, name);
        this.optionsEl.appendChild(row);
      }
    }
  }

  private repreview(): void {
    const lines = this.lines();
    const code = this.codeFor(lines, JSON.stringify(lines));
    this.renderPreview(interpret(lex(code, this.R), { ...this.ctx, useNames: this.useNames, data: this.layoutLookup() }, this.R));
    if (this.paperWhole) this.renderPaper(this.paperWhole, previewTicket(this.partsLive(code), this.data, this.ctx.flags, this.R, this.useNames));
  }

  private renderPreview(out: OutLine[]): void {
    this.renderPaper(this.paper, out);
  }

  /**
   * Draws what a template prints, on paper torn off a roll: a cut ends the piece and the next line starts a new one, so a ticket
   * that cuts in the middle is two pieces.
   */
  private renderPaper(paper: HTMLElement, out: OutLine[]): void {
    const { doc } = this.host;
    paper.replaceChildren();
    let slip: HTMLElement | null = null;
    let pieces = 0;
    const piece = (): HTMLElement => {
      if (slip) return slip;
      slip = doc.createElement('div');
      slip.className = 'aurebesh-ticket-slip';
      slip.style.clipPath = tornPath(pieces);
      if (pieces % 2) slip.style.transform = 'rotate(.35deg)';
      else if (pieces) slip.style.transform = 'rotate(-.3deg)';
      pieces++;
      paper.appendChild(slip);
      return slip;
    };
    for (const line of out) {
      if (line.cut) {
        slip = null;
        continue;
      }
      const div = doc.createElement('div');
      div.className = 'aurebesh-ticket-pl';
      if (line.align !== 'left') div.style.textAlign = line.align;
      for (const r of line.runs) {
        const span = doc.createElement('span');
        if (r.size !== this.R.defaultSize) span.setAttribute('data-size', r.size);
        if (r.kind) span.className = `aurebesh-tk aurebesh-tk-cmd`;
        if (r.kind === 'logo' && r.image) {
          // a logo is drawn at the size it prints: its width in dots against the dots of the paper
          const img = doc.createElement('img');
          img.className = 'aurebesh-ticket-logo';
          img.alt = r.text;
          img.addEventListener('load', () => (img.style.width = `${Math.min(100, (img.naturalWidth / this.R.dots) * 100)}%`));
          img.src = r.image;
          span.className = '';
          span.appendChild(img);
        } else span.textContent = r.text;
        div.appendChild(span);
      }
      if (!line.runs.length) div.appendChild(doc.createTextNode(' '));
      const cols = lineColumns(line, this.R);
      if (cols > this.R.columns) {
        div.classList.add('over');
        div.title = this.t('ui.ticket.over', { n: String(cols), max: String(this.R.columns) });
      }
      piece().appendChild(div);
    }
    if (!pieces) piece(); // nothing to print: a bare piece of paper
  }

  // ---- test data ---------------------------------------------------------------------------------------------------------

  /** Values for the layout and the preview of this part: the whole ticket's, and the first row when this part repeats. */
  private layoutLookup(): (name: string) => string | undefined {
    const part = this.parts.find((p) => p.name === this.partName);
    const row = part?.repeat ? this.data.lists?.[part.repeat]?.[0] : undefined;
    return dataLookup(this.data, row);
  }

  /** The parts of the ticket with this editor's own code in place of the one it was given. */
  private partsLive(code: string): TicketPart[] {
    if (!this.parts.length) return [{ name: this.partName ?? 'part', code }];
    const live = this.parts.map((p) => (p.name === this.partName ? { ...p, code } : p));
    return !this.partName || this.parts.some((p) => p.name === this.partName) ? live : [...live, { name: this.partName, code }];
  }

  getData(): TicketData {
    return cloneData(this.data);
  }

  /** Replaces the test data. */
  setData(data: TicketData | undefined): void {
    this.data = cloneData(data);
    this.dataSig = '';
    this.flush();
    this.refresh(false, 'view');
  }

  /** Gives another part of the ticket its code (the editor of that part changed). */
  setPartCode(name: string, code: string): void {
    const part = this.parts.find((p) => p.name === name);
    if (part) part.code = code;
    else this.parts.push({ name, code });
    this.flush();
    this.refresh(false, 'view');
  }

  private dataChanged(): void {
    clearTimeout(this.dataTimer);
    this.dataTimer = setTimeout(() => {
      this.flush();
      this.refresh(false, 'view'); // the layout shows the values too
      this.host.emitData(this.getData());
    }, 100);
  }

  /** What the form needs: the fields of the whole ticket, the columns of each list, and the switches. */
  private dataModel(parts: TicketPart[]): { globals: string[]; lists: { name: string; cols: string[] }[]; flags: { key: string; label: string }[] } {
    const used = parts.map((part) => ({ part, tokens: lex(part.code, this.R) })).map((x) => ({ ...x, names: usedFields(x.tokens) }));
    const given = new Set(Object.keys(this.data.values ?? {}).map((k) => k.toLowerCase()));
    const inPlain = new Set(used.filter((x) => !x.part.repeat).flatMap((x) => x.names.map((n) => n.toLowerCase())));
    const globals = new Map<string, string>(Object.keys(this.data.values ?? {}).map((k) => [k.toLowerCase(), k]));
    for (const x of used) if (!x.part.repeat) for (const n of x.names) if (!globals.has(n.toLowerCase())) globals.set(n.toLowerCase(), n);
    const lists = new Map<string, Map<string, string>>();
    for (const l of new Set([...Object.keys(this.data.lists ?? {}), ...parts.filter((p) => p.repeat).map((p) => p.repeat!)])) {
      const cols = new Map<string, string>();
      for (const row of this.data.lists?.[l] ?? []) for (const k of Object.keys(row)) if (!cols.has(k.toLowerCase())) cols.set(k.toLowerCase(), k);
      lists.set(l, cols);
    }
    // a field of a repeating part is a column of its list, unless the whole ticket has a value for it or another part uses it
    for (const x of used) {
      if (!x.part.repeat) continue;
      for (const n of x.names) {
        const k = n.toLowerCase();
        if (given.has(k) || inPlain.has(k)) {
          if (!globals.has(k)) globals.set(k, n);
        } else if (!lists.get(x.part.repeat)!.has(k)) lists.get(x.part.repeat)!.set(k, n);
      }
    }
    const flags = groupConditions(used.flatMap((x) => x.tokens)).flatMap((g) => g.flags.map((f) => ({ key: f.key, label: f.value === undefined ? g.field : `${g.field} ${f.value}` })));
    return { globals: [...globals.values()], lists: [...lists].map(([name, cols]) => ({ name, cols: [...cols.values()] })), flags };
  }

  private updateData(code: string): void {
    const model = this.dataModel(this.partsLive(code));
    const sig = JSON.stringify(model);
    if (sig === this.dataSig) return;
    this.dataSig = sig;
    this.buildData(model);
  }

  private buildData(model: ReturnType<TicketController['dataModel']>): void {
    const doc = this.host.doc;
    const t = this.t;
    const el = this.dataEl!;
    el.replaceChildren();
    const heading = (text: string) => {
      const h = doc.createElement('div');
      h.className = 'aurebesh-ticket-heading';
      h.textContent = text;
      el.appendChild(h);
    };
    const input = (value: string, on: (v: string) => void, placeholder = '', title = ''): HTMLInputElement => {
      const i = doc.createElement('input');
      i.type = 'text';
      i.value = value;
      i.placeholder = placeholder;
      if (title) i.title = title;
      i.addEventListener('input', () => on(i.value));
      return i;
    };
    if (!model.globals.length && !model.lists.length && !model.flags.length) {
      const p = doc.createElement('p');
      p.className = 'aurebesh-ticket-note';
      p.textContent = t('ui.ticket.noData');
      el.appendChild(p);
      return;
    }
    if (model.globals.length) {
      heading(t('ui.ticket.values'));
      const lookup = dataLookup(this.data);
      for (const name of model.globals) {
        const row = doc.createElement('label');
        row.className = 'aurebesh-ticket-option';
        const label = doc.createElement('span');
        label.textContent = name;
        label.title = this.R.keywordByKey.get(name.toLowerCase())?.label ?? name;
        row.append(label, input(lookup(name) ?? '', (v) => this.setValue(name, v), this.R.keywordByKey.get(name.toLowerCase())?.sample ?? ''));
        el.appendChild(row);
      }
    }
    for (const list of model.lists) {
      heading(list.name);
      const table = doc.createElement('table');
      const head = table.createTHead().insertRow();
      for (const c of list.cols) {
        const th = doc.createElement('th');
        th.textContent = c;
        th.title = this.R.keywordByKey.get(c.toLowerCase())?.label ?? c;
        head.appendChild(th);
      }
      head.appendChild(doc.createElement('th'));
      const body = table.createTBody();
      (this.data.lists?.[list.name] ?? []).forEach((row, i) => {
        const tr = body.insertRow();
        for (const c of list.cols) tr.insertCell().appendChild(input(row[c] ?? '', (v) => this.setCell(list.name, i, c, v)));
        const del = this.panelButton('×', () => this.removeRow(list.name, i));
        del.title = t('ui.ticket.remove');
        del.setAttribute('aria-label', t('ui.ticket.remove'));
        tr.insertCell().appendChild(del);
      });
      el.appendChild(table);
      el.appendChild(this.panelButton(t('ui.ticket.addRow'), () => this.addRow(list.name, list.cols)));
    }
    if (model.flags.length) {
      heading(t('ui.ticket.switches'));
      for (const f of model.flags) {
        const row = doc.createElement('label');
        row.className = 'aurebesh-ticket-option';
        const box = doc.createElement('input');
        box.type = 'checkbox';
        box.checked = !!this.ctx.flags[f.key];
        box.addEventListener('change', () => {
          this.ctx.flags[f.key] = box.checked;
          this.dataChanged();
        });
        const name = doc.createElement('span');
        name.textContent = f.label;
        row.append(box, name);
        el.appendChild(row);
      }
    }
  }

  private setValue(name: string, v: string): void {
    const values = (this.data.values ??= {});
    const key = Object.keys(values).find((k) => k.toLowerCase() === name.toLowerCase()) ?? name;
    values[key] = v;
    this.dataChanged();
  }

  private setCell(list: string, i: number, col: string, v: string): void {
    const row = this.data.lists?.[list]?.[i];
    if (!row) return;
    row[col] = v;
    this.dataChanged();
  }

  private addRow(list: string, cols: string[]): void {
    const lists = (this.data.lists ??= {});
    (lists[list] ??= []).push(Object.fromEntries(cols.map((c) => [c, ''])));
    this.dataSig = '';
    this.dataChanged();
  }

  private removeRow(list: string, i: number): void {
    this.data.lists?.[list]?.splice(i, 1);
    this.dataSig = '';
    this.dataChanged();
  }

  private updateProblems(lines: Line[]): void {
    const t = this.t;
    this.warnEl.replaceChildren();
    for (const p of validateModel(lines)) {
      const d = this.host.doc.createElement('div');
      d.textContent =
        p.kind === 'unclosed'
          ? t('ui.ticket.unclosed', { cond: `${p.not ? t('ui.ticket.ifnot') : t('ui.ticket.if')} ${p.field}${p.value === undefined ? '' : ` = ${p.value}`}`, line: String((p.line ?? 0) + 1) })
          : t('ui.ticket.extraEndif', { line: String((p.line ?? 0) + 1) });
      this.warnEl.appendChild(d);
    }
  }

  /** The conditions in the layout, in the order they open, with ways to find, change and remove them. */
  private updateConditions(): void {
    if (this.editingCondition) return;
    const { doc, content } = this.host;
    const t = this.t;
    this.condsEl.replaceChildren();
    const markers = Array.from(content.querySelectorAll<HTMLElement>('[data-t="if"],[data-t="endif"]'));
    const stack: { open: HTMLElement; close: HTMLElement | null }[] = [];
    const pairs: { open: HTMLElement; close: HTMLElement | null }[] = [];
    for (const m of markers) {
      if (m.getAttribute('data-t') === 'if') {
        const p = { open: m, close: null as HTMLElement | null };
        stack.push(p);
        pairs.push(p);
      } else {
        const p = stack.pop();
        if (p) p.close = m;
      }
    }
    if (!pairs.length) return;
    const h = doc.createElement('div');
    h.className = 'aurebesh-ticket-heading';
    h.textContent = t('ui.ticket.conditions');
    this.condsEl.appendChild(h);
    for (const pair of pairs) {
      const row = doc.createElement('div');
      row.className = 'aurebesh-ticket-cond';
      const label = doc.createElement('span');
      label.textContent = pair.open.getAttribute('data-label') ?? '';
      const edit = this.panelButton(t('ui.ticket.edit'), () => this.editCondition(pair.open, row));
      const del = this.panelButton(t('ui.ticket.remove'), () => this.removeCondition(pair));
      row.append(label, edit, del);
      row.addEventListener('mouseenter', () => this.highlight(pair));
      row.addEventListener('mouseleave', () => this.clearHighlight());
      this.condsEl.appendChild(row);
    }
  }

  private panelButton(label: string, on: () => void): HTMLButtonElement {
    const b = this.host.doc.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', on);
    return b;
  }

  private highlight(pair: { open: HTMLElement; close: HTMLElement | null }): void {
    this.clearHighlight();
    pair.open.classList.add('aurebesh-hot');
    pair.close?.classList.add('aurebesh-hot');
    const css = (this.host.doc.defaultView as unknown as { CSS?: { highlights?: Map<string, unknown> } } | null)?.CSS;
    const H = (this.host.doc.defaultView as unknown as { Highlight?: new (...r: Range[]) => unknown } | null)?.Highlight;
    if (css?.highlights && H && pair.close) {
      const r = this.host.doc.createRange();
      r.setStartAfter(pair.open);
      r.setEndBefore(pair.close);
      css.highlights.set('aurebesh-cond', new H(r));
    }
  }

  private clearHighlight(): void {
    this.host?.content.querySelectorAll('.aurebesh-hot').forEach((e) => e.classList.remove('aurebesh-hot'));
    (this.host?.doc.defaultView as unknown as { CSS?: { highlights?: Map<string, unknown> } } | null)?.CSS?.highlights?.delete('aurebesh-cond');
  }

  private editCondition(open: HTMLElement, row: HTMLElement): void {
    this.editingCondition = true;
    const form = this.conditionForm(
      { field: open.getAttribute('data-field') ?? '', ...(open.hasAttribute('data-val') ? { value: open.getAttribute('data-val')! } : {}), not: open.hasAttribute('data-not') },
      (c) => {
        open.setAttribute('data-field', c.field);
        if (c.value === undefined) open.removeAttribute('data-val');
        else open.setAttribute('data-val', c.value);
        if (c.not) open.setAttribute('data-not', '');
        else open.removeAttribute('data-not');
        this.editingCondition = false;
        this.afterDomEdit();
      },
      this.t('ui.apply'),
    );
    const cancel = this.panelButton(this.t('ui.ticket.cancel'), () => {
      this.editingCondition = false;
      this.updateConditions();
    });
    form.appendChild(cancel);
    row.replaceChildren(form);
    (form.querySelector('input') as HTMLInputElement | null)?.focus();
  }

  private removeCondition(pair: { open: HTMLElement; close: HTMLElement | null }): void {
    if (!this.host.isEditable()) return;
    this.clearHighlight();
    pair.open.remove();
    pair.close?.remove();
    this.afterDomEdit();
  }
}

