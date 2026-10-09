import { DEFAULT_COLORS, SAFE_COLOR } from './colors';
import { COMMANDS, DEFAULT_TOOLBAR, TABLE_TOOLS } from './commands';
import type { CommandDef } from './commands';
import { currentPre, handleCodeKey } from './codeblock';
import { clearHighlights, highlightCode } from './highlight';
import { currentCell, handleTab } from './table';
import { DEFAULT_FONTS, firstFamily, SAFE_FAMILY } from './fonts';
import type { FontDef } from './fonts';
import { base64Adapter, resultUrl } from './media';
import type { MediaAdapter, MediaKind, MediaUploadFn } from './media';
import { IMAGE_TYPES, VIDEO_TYPES } from './media-urls';
import { sanitize } from './sanitize';
import { CSS } from './styles';

export interface MediaOptions {
  /**
   * Where uploaded files go. Default: base64 inside the HTML (max 2 MB).
   * Pass base64Adapter(), endpointAdapter(), presignedAdapter(), your own `{ upload }` or a plain function.
   * `null` disables uploads (links only).
   */
  adapter?: MediaAdapter | MediaUploadFn | null;
  /** Allow adding images/videos by link. Default true. */
  allowUrl?: boolean;
}

export interface AurebeshOptions {
  /** Image and video settings: where uploads are stored and whether links are allowed. */
  media?: MediaOptions;
  /** Swatches offered by the 'color' and 'highlight' toolbar items (hex or rgb()). Defaults to DEFAULT_COLORS. */
  colors?: string[];
  /** Fonts offered by the 'font' toolbar item. Defaults to DEFAULT_FONTS. */
  fonts?: FontDef[];
  /** Initial HTML content. It is sanitized. */
  value?: string;
  placeholder?: string;
  readOnly?: boolean;
  /** Toolbar item names, '|' is a separator. Pass [] for no toolbar. */
  toolbar?: string[];
}

export interface AurebeshEvents {
  change: string;
  focus: undefined;
  blur: undefined;
  /** An upload failed or a link was rejected. */
  error: Error;
}

type Listener<T> = (payload: T) => void;

export class Aurebesh {
  readonly root: HTMLElement;
  readonly content: HTMLElement;
  private buttons = new Map<string, HTMLButtonElement>();
  private listeners = new Map<keyof AurebeshEvents, Set<Listener<any>>>();
  private cleanup: Array<() => void> = [];
  private highlightTimer: ReturnType<typeof setTimeout> | undefined;
  private fonts: FontDef[];
  private fontSelect: HTMLSelectElement | null = null;
  private lastRange: Range | null = null;
  private tableTools: HTMLElement | null = null;
  private colors: string[];
  private adapter: MediaAdapter | null;
  private allowUrl: boolean;
  private statusEl: HTMLElement | null = null;
  private statusTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingUploads = 0;

  constructor(private container: HTMLElement, options: AurebeshOptions = {}) {
    const doc = container.ownerDocument;
    const adapter = options.media?.adapter;
    this.adapter = adapter === undefined ? base64Adapter() : typeof adapter === 'function' ? { upload: adapter } : adapter;
    this.allowUrl = options.media?.allowUrl ?? true;
    this.colors = (options.colors ?? DEFAULT_COLORS).filter((c) => SAFE_COLOR.test(c));
    this.fonts = (options.fonts ?? DEFAULT_FONTS).filter((f) => SAFE_FAMILY.test(f.family));
    this.root = doc.createElement('div');
    this.root.className = 'aurebesh';

    if (!doc.head.querySelector('style[data-aurebesh]')) {
      const style = doc.createElement('style');
      style.setAttribute('data-aurebesh', '');
      style.textContent = CSS;
      doc.head.appendChild(style);
    }

    const items = options.toolbar ?? DEFAULT_TOOLBAR;
    if (items.length) this.buildToolbar(items);

    this.content = doc.createElement('div');
    this.content.className = 'aurebesh-content';
    this.content.setAttribute('role', 'textbox');
    this.content.setAttribute('aria-multiline', 'true');
    this.root.appendChild(this.content);

    this.setPlaceholder(options.placeholder ?? '');
    this.setReadOnly(options.readOnly ?? false);
    if (options.value) this.content.innerHTML = sanitize(options.value);
    this.syncEmpty();

    this.listen(this.content, 'input', () => {
      // Deleting an embed leaves its empty wrapper behind.
      this.content.querySelectorAll(':scope > div:empty').forEach((d) => d.remove());
      this.syncEmpty();
      this.emit('change', this.getHTML());
    });
    this.listen(this.content, 'focus', () => this.emit('focus', undefined));
    this.listen(this.content, 'blur', () => this.emit('blur', undefined));
    this.listen(this.content, 'keydown', (e) => {
      const ev = e as KeyboardEvent;
      if (handleTab(ev) || handleCodeKey(ev)) this.emit('change', this.getHTML());
    });
    this.listen(this.content, 'paste', (e) => this.onPaste(e as ClipboardEvent));
    this.listen(this.content, 'dragover', (e) => {
      if ((e as DragEvent).dataTransfer?.types.includes('Files')) e.preventDefault();
    });
    this.listen(this.content, 'drop', (e) => this.onDrop(e as DragEvent));
    this.listen(this.content, 'click', (e) => this.selectMedia(e.target as HTMLElement));
    this.listen(doc, 'selectionchange', () => this.updateToolbar());

    this.statusEl = doc.createElement('div');
    this.statusEl.className = 'aurebesh-status';
    this.statusEl.setAttribute('role', 'status');
    this.statusEl.hidden = true;
    this.root.appendChild(this.statusEl);

    container.appendChild(this.root);
    this.scheduleHighlight();
  }

  getHTML(): string {
    return this.content.innerHTML;
  }

  setHTML(html: string): void {
    this.content.innerHTML = sanitize(html);
    this.syncEmpty();
    this.scheduleHighlight();
  }

  getText(): string {
    return this.content.textContent ?? '';
  }

  focus(): void {
    this.content.focus();
  }

  setReadOnly(readOnly: boolean): void {
    this.content.contentEditable = readOnly ? 'false' : 'true';
    this.buttons.forEach((b) => (b.disabled = readOnly));
    if (this.fontSelect) this.fontSelect.disabled = readOnly;
  }

  setPlaceholder(text: string): void {
    this.content.setAttribute('data-placeholder', text);
  }

  /** Run a toolbar command by name, e.g. editor.exec('bold'). */
  exec(name: string, arg?: string, extra?: string): void {
    const cmd = COMMANDS[name];
    if (!cmd) throw new Error(`Aurebesh: unknown command "${name}"`);
    const hadFocus = this.content.ownerDocument.activeElement === this.content;
    this.content.focus();
    // Focusing from a popover input or the font select moves the caret to the start: put it back.
    if (!hadFocus) this.restoreSelection();
    cmd.run(arg, extra);
    this.tidyStyles();
    this.syncEmpty();
    this.emit('change', this.getHTML());
    this.updateToolbar();
  }

  on<K extends keyof AurebeshEvents>(event: K, fn: Listener<AurebeshEvents[K]>): () => void {
    let set = this.listeners.get(event) as Set<Listener<AurebeshEvents[K]>> | undefined;
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }

  destroy(): void {
    clearTimeout(this.highlightTimer);
    clearHighlights(this.content);
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    this.listeners.clear();
    this.root.remove();
  }

  private emit<K extends keyof AurebeshEvents>(event: K, payload: AurebeshEvents[K]): void {
    if (event === 'change') this.scheduleHighlight();
    this.listeners.get(event)?.forEach((fn) => fn(payload));
  }

  /** Repaints code highlights shortly after the last change (cheap, and the DOM is not touched). */
  private scheduleHighlight(): void {
    clearTimeout(this.highlightTimer);
    this.highlightTimer = setTimeout(() => highlightCode(this.content), 50);
  }

  private listen(target: EventTarget, type: string, fn: (e: Event) => void): void {
    target.addEventListener(type, fn);
    this.cleanup.push(() => target.removeEventListener(type, fn));
  }

  private buildToolbar(items: string[]): void {
    const doc = this.container.ownerDocument;
    const bar = doc.createElement('div');
    bar.className = 'aurebesh-toolbar';
    bar.setAttribute('role', 'toolbar');
    for (const item of items) {
      if (item === '|') {
        const sep = doc.createElement('span');
        sep.className = 'aurebesh-sep';
        bar.appendChild(sep);
        continue;
      }
      const cmd = COMMANDS[item];
      if (!cmd) continue;
      if (item === 'font') {
        bar.appendChild(this.buildFontSelect());
        continue;
      }
      if (item === 'color') {
        bar.appendChild(this.buildColorPicker(cmd, 'inherit', 'Automatic'));
        continue;
      }
      if (item === 'highlight') {
        bar.appendChild(this.buildColorPicker(cmd, 'transparent', 'No highlight'));
        continue;
      }
      if (item === 'table') {
        bar.appendChild(this.buildTablePicker());
        continue;
      }
      if (item === 'image' || item === 'video') {
        const picker = this.buildMediaPicker(item, cmd);
        if (picker) bar.appendChild(picker);
        continue;
      }
      bar.appendChild(this.makeButton(cmd));
    }
    this.root.appendChild(bar);

    if (items.includes('table')) {
      const tools = doc.createElement('div');
      tools.className = 'aurebesh-toolbar aurebesh-table-tools';
      tools.hidden = true;
      for (const name of TABLE_TOOLS) tools.appendChild(this.makeButton(COMMANDS[name]));
      this.tableTools = tools;
      this.root.appendChild(tools);
    }
  }

  private makeButton(cmd: CommandDef, onClick: () => void = () => this.exec(cmd.name)): HTMLButtonElement {
    const btn = this.container.ownerDocument.createElement('button');
    btn.type = 'button';
    btn.textContent = cmd.label;
    btn.title = cmd.title;
    btn.setAttribute('aria-label', cmd.title);
    btn.setAttribute('aria-pressed', 'false');
    // Keep the selection in the editor when clicking a button.
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', onClick);
    this.buttons.set(cmd.name, btn);
    return btn;
  }

  /** A button that opens a grid; hover to choose a size, click to insert. */
  private buildTablePicker(): HTMLElement {
    const doc = this.container.ownerDocument;
    const ROWS = 8;
    const COLS = 8;
    const wrap = doc.createElement('span');
    wrap.className = 'aurebesh-table-picker';

    const toggle = this.makeButton(COMMANDS.table, () => {
      pop.hidden = !pop.hidden;
      highlight(0, 0);
    });

    const pop = doc.createElement('div');
    pop.className = 'aurebesh-table-pop';
    pop.hidden = true;
    const grid = doc.createElement('div');
    grid.className = 'aurebesh-table-grid';
    grid.style.gridTemplateColumns = `repeat(${COLS}, 18px)`;
    const label = doc.createElement('div');
    label.className = 'aurebesh-table-label';
    label.textContent = 'Table';
    const cells: HTMLElement[] = [];
    const highlight = (r: number, c: number) => {
      cells.forEach((cell, i) => cell.classList.toggle('on', Math.floor(i / COLS) < r && i % COLS < c));
      label.textContent = r && c ? `${r} × ${c}` : 'Table';
    };
    for (let i = 0; i < ROWS * COLS; i++) {
      const cell = doc.createElement('div');
      const r = Math.floor(i / COLS) + 1;
      const c = (i % COLS) + 1;
      cell.addEventListener('mouseenter', () => highlight(r, c));
      cell.addEventListener('mousedown', (e) => e.preventDefault());
      cell.addEventListener('click', () => {
        pop.hidden = true;
        this.exec('table', `${r}x${c}`);
      });
      cells.push(cell);
      grid.appendChild(cell);
    }
    grid.addEventListener('mouseleave', () => highlight(0, 0));
    pop.append(grid, label);

    this.closeOnOutside(wrap, pop);

    wrap.append(toggle, pop);
    return wrap;
  }

  /** Popover with a link field and/or an upload button, depending on the media options. */
  private buildMediaPicker(kind: MediaKind, cmd: CommandDef): HTMLElement | null {
    if (!this.allowUrl && !this.adapter) return null;
    const doc = this.container.ownerDocument;
    const wrap = doc.createElement('span');
    wrap.className = 'aurebesh-table-picker';
    const toggle = this.makeButton(cmd, () => {
      pop.hidden = !pop.hidden;
      if (!pop.hidden) (pop.querySelector('input[type="url"]') as HTMLInputElement | null)?.focus();
    });

    const pop = doc.createElement('div');
    pop.className = 'aurebesh-table-pop aurebesh-media-form';
    pop.hidden = true;

    if (this.allowUrl) {
      const url = doc.createElement('input');
      url.type = 'url';
      url.placeholder = kind === 'image' ? 'https://… image link' : 'YouTube, Vimeo or .mp4/.webm link';
      url.setAttribute('aria-label', kind === 'image' ? 'Image link' : 'Video link');
      let alt: HTMLInputElement | null = null;
      if (kind === 'image') {
        alt = doc.createElement('input');
        alt.type = 'text';
        alt.placeholder = 'Description (alt text)';
        alt.setAttribute('aria-label', 'Alt text');
      }
      const insert = doc.createElement('button');
      insert.type = 'button';
      insert.textContent = 'Insert';
      const submit = () => {
        const value = url.value.trim();
        if (!value) return;
        try {
          this.exec(kind, value, alt?.value.trim());
          pop.hidden = true;
          url.value = '';
          if (alt) alt.value = '';
        } catch (err) {
          this.fail(err);
        }
      };
      insert.addEventListener('mousedown', (e) => e.preventDefault());
      insert.addEventListener('click', submit);
      url.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submit();
        }
      });
      pop.append(...(alt ? [url, alt, insert] : [url, insert]));
    }

    if (this.adapter) {
      const file = doc.createElement('input');
      file.type = 'file';
      file.hidden = true;
      file.accept = (kind === 'image' ? IMAGE_TYPES : VIDEO_TYPES).join(',');
      file.multiple = kind === 'image';
      file.addEventListener('change', () => {
        pop.hidden = true;
        void this.uploadFiles(Array.from(file.files ?? []));
        file.value = '';
      });
      const upload = doc.createElement('button');
      upload.type = 'button';
      upload.textContent = kind === 'image' ? 'Upload image…' : 'Upload video…';
      upload.addEventListener('mousedown', (e) => e.preventDefault());
      upload.addEventListener('click', () => file.click());
      pop.append(upload, file);
    }

    this.closeOnOutside(wrap, pop);
    wrap.append(toggle, pop);
    return wrap;
  }

  /** Uploads files through the configured adapter and inserts the results at the caret. */
  async uploadFiles(files: File[] | FileList): Promise<void> {
    for (const file of Array.from(files)) {
      const kind: MediaKind | null = IMAGE_TYPES.includes(file.type) ? 'image' : VIDEO_TYPES.includes(file.type) ? 'video' : null;
      if (!kind) {
        this.fail(new Error(`Unsupported file type: ${file.type || file.name}`));
        continue;
      }
      if (!this.adapter) {
        this.fail(new Error('Uploads are disabled for this editor.'));
        continue;
      }
      this.pendingUploads++;
      this.showStatus(`Uploading ${file.name}…`);
      try {
        const url = resultUrl(await this.adapter.upload(file, { kind }));
        this.exec(kind === 'image' ? 'image' : 'videoFile', url);
      } catch (err) {
        this.fail(err);
      } finally {
        if (--this.pendingUploads === 0 && !this.statusEl?.classList.contains('error')) this.hideStatus();
      }
    }
  }

  insertImage(url: string, alt?: string): void {
    this.exec('image', url, alt);
  }

  insertVideo(url: string): void {
    this.exec('video', url);
  }

  private onDrop(e: DragEvent): void {
    const files = e.dataTransfer?.files;
    if (!files?.length || !this.content.isContentEditable) return;
    e.preventDefault();
    // Put the caret where the file was dropped.
    const d = this.container.ownerDocument as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    let range: Range | null = null;
    const pos = d.caretPositionFromPoint?.(e.clientX, e.clientY);
    if (pos) {
      range = d.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
    } else {
      range = d.caretRangeFromPoint?.(e.clientX, e.clientY) ?? null;
    }
    if (range && this.content.contains(range.startContainer)) {
      const sel = d.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    void this.uploadFiles(files);
  }

  /** Clicking an image, video or embed selects it as a whole, so Backspace/Delete removes it. */
  private selectMedia(target: HTMLElement): void {
    const el = target.closest('img,video') ?? (target.tagName === 'DIV' && target.querySelector(':scope > iframe') ? target : null);
    if (!el || !this.content.contains(el) || !this.content.isContentEditable) return;
    const range = this.container.ownerDocument.createRange();
    range.selectNode(el);
    const sel = this.container.ownerDocument.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  private showStatus(message: string, isError = false): void {
    if (!this.statusEl) return;
    clearTimeout(this.statusTimer);
    this.statusEl.textContent = message;
    this.statusEl.classList.toggle('error', isError);
    this.statusEl.hidden = false;
    if (isError) this.statusTimer = setTimeout(() => this.hideStatus(), 6000);
  }

  private hideStatus(): void {
    if (this.statusEl) {
      this.statusEl.hidden = true;
      this.statusEl.classList.remove('error');
    }
  }

  private fail(err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err));
    this.showStatus(error.message, true);
    this.emit('error', error);
  }

  private closeOnOutside(wrap: HTMLElement, pop: HTMLElement): void {
    const doc = this.container.ownerDocument;
    this.listen(doc, 'mousedown', (e) => {
      if (!wrap.contains(e.target as Node)) pop.hidden = true;
    });
    this.listen(doc, 'keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') pop.hidden = true;
    });
  }

  /** Swatch palette + reset + native custom colour input, for the 'color' and 'highlight' commands. */
  private buildColorPicker(cmd: CommandDef, resetValue: string, resetLabel: string): HTMLElement {
    const doc = this.container.ownerDocument;
    const wrap = doc.createElement('span');
    wrap.className = 'aurebesh-table-picker';

    const toggle = this.makeButton(cmd, () => (pop.hidden = !pop.hidden));
    toggle.classList.add('aurebesh-swatch-btn', `aurebesh-swatch-${cmd.name}`);

    const pop = doc.createElement('div');
    pop.className = 'aurebesh-table-pop';
    pop.hidden = true;

    const apply = (value: string) => {
      pop.hidden = true;
      toggle.style.setProperty('--swatch', value === resetValue ? 'transparent' : value);
      this.exec(cmd.name, value);
    };

    const grid = doc.createElement('div');
    grid.className = 'aurebesh-color-grid';
    for (const color of this.colors) {
      const sw = doc.createElement('div');
      sw.style.background = color;
      sw.title = color;
      sw.addEventListener('mousedown', (e) => e.preventDefault());
      sw.addEventListener('click', () => apply(color));
      grid.appendChild(sw);
    }

    const reset = doc.createElement('button');
    reset.type = 'button';
    reset.className = 'aurebesh-color-reset';
    reset.textContent = resetLabel;
    reset.addEventListener('mousedown', (e) => e.preventDefault());
    reset.addEventListener('click', () => apply(resetValue));

    const custom = doc.createElement('label');
    custom.className = 'aurebesh-color-custom';
    custom.textContent = 'Custom ';
    const input = doc.createElement('input');
    input.type = 'color';
    input.value = '#3b82f6';
    // 'change' fires when the picker is closed, 'input' on every drag: only apply the final choice.
    input.addEventListener('change', () => apply(input.value));
    custom.appendChild(input);

    pop.append(grid, reset, custom);
    this.closeOnOutside(wrap, pop);
    wrap.append(toggle, pop);
    return wrap;
  }

  private buildFontSelect(): HTMLSelectElement {
    const doc = this.container.ownerDocument;
    const select = doc.createElement('select');
    select.className = 'aurebesh-font';
    select.title = 'Font';
    select.setAttribute('aria-label', 'Font');
    const placeholder = doc.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Font';
    select.appendChild(placeholder);
    for (const font of this.fonts) {
      const opt = doc.createElement('option');
      opt.value = font.family;
      opt.textContent = font.name;
      opt.style.fontFamily = font.family;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => {
      if (select.value) this.exec('font', select.value);
    });
    this.fontSelect = select;
    return select;
  }

  /** The select steals focus, so remember the last selection inside the editor and put it back. */
  private restoreSelection(): void {
    const sel = this.container.ownerDocument.getSelection();
    if (!this.lastRange || !sel || !this.content.contains(this.lastRange.startContainer)) return;
    sel.removeAllRanges();
    sel.addRange(this.lastRange);
  }

  /** Chrome adds a pointless `font-family: inherit` to inserted content; remove it and any empty style attributes. */
  private tidyStyles(): void {
    this.content.querySelectorAll<HTMLElement>('[style]').forEach((el) => {
      const style = el.getAttribute('style') ?? '';
      const cleaned = style.replace(/(?:^|;)\s*font-family:\s*inherit\s*(?=;|$)/gi, '').replace(/^\s*;\s*/, '').trim();
      if (!cleaned || cleaned === ';') el.removeAttribute('style');
      else if (cleaned !== style) el.setAttribute('style', cleaned);
    });
  }

  private updateToolbar(): void {
    const sel = this.container.ownerDocument.getSelection();
    const inside = !!sel && sel.rangeCount > 0 && this.content.contains(sel.anchorNode);
    if (inside) this.lastRange = sel!.getRangeAt(0).cloneRange();
    if (this.tableTools) this.tableTools.hidden = !(inside && currentCell());
    if (this.fontSelect && inside) {
      let current = '';
      try {
        // Browsers report either the full stack or just the first family.
        current = firstFamily(document.queryCommandValue('fontName'));
      } catch {
        /* unsupported */
      }
      const match = this.fonts.find((f) => firstFamily(f.family) === current);
      this.fontSelect.value = match ? match.family : '';
    }
    this.buttons.forEach((btn, name) => {
      const active = inside && (COMMANDS[name].isActive?.() ?? false);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  private syncEmpty(): void {
    const empty = !this.content.textContent && !this.content.querySelector('hr,li');
    this.content.classList.toggle('is-empty', empty);
  }

  /** Paste as sanitized HTML (or plain text) instead of whatever the source app put on the clipboard. */
  private onPaste(e: ClipboardEvent): void {
    const data = e.clipboardData;
    if (!data) return;
    e.preventDefault();
    // A pasted screenshot or copied file has no text with it: upload it instead of pasting.
    if (data.files.length && !data.getData('text/plain')) {
      void this.uploadFiles(data.files);
      return;
    }
    // Inside a code block always paste plain text: pasted HTML blocks would split the <pre> in two.
    if (currentPre()) {
      document.execCommand('insertText', false, data.getData('text/plain').replace(/\r\n?/g, '\n'));
      return;
    }
    const html = data.getData('text/html');
    if (html) {
      document.execCommand('insertHTML', false, sanitize(html));
      this.tidyStyles();
    }
    else document.execCommand('insertText', false, data.getData('text/plain'));
  }
}
