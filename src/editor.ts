import { gridNavigation, rovingToolbar } from './a11y';
import { columnsOf, currentColumns } from './columns';
import { handleListKey } from './lists';
import { applyMarkdown } from './markdown';
import { shortcutFor } from './shortcuts';
import { DEFAULT_COLORS, SAFE_COLOR } from './colors';
import { COMMANDS, DEFAULT_QUICKBAR, DEFAULT_TOOLBAR, TABLE_TOOLS } from './commands';
import { iconElement } from './icons';
import type { CommandDef } from './commands';
import { currentPre, handleCodeKey, insertCode } from './codeblock';
import { clearHighlights, highlightCode } from './highlight';
import { canOpenLink, currentLink, normalizeLink, openLink } from './inline';
import { DEFAULT_LABELS } from './labels';
import type { Labels } from './labels';
import { selectedImage } from './media';
import { currentCell, handleTab, trackCellDrag } from './table';
import { attachColumnResize } from './table-resize';
import { DEFAULT_FONTS, firstFamily, SAFE_FAMILY } from './fonts';
import type { FontDef } from './fonts';
import { base64Adapter, resultUrl } from './media';
import type { MediaAdapter, MediaKind, MediaUploadFn } from './media';
import { IMAGE_TYPES, isSafeImageSrc, VIDEO_TYPES } from './media-urls';
import { countCharacters, countText, plainText, truncateCharacters } from './stats';
import type { TextStats } from './stats';
import { PAGE_NAMES, countPages, printDocument, resolvePage, toSpec } from './page';
import type { PageFormat, PagePreset, PageSpec, ResolvedPage } from './page';
import { toMarkdown } from './export';
import type { OutputFormat } from './export';
import { MARKER, preparePaste } from './paste';
import type { PasteImagePolicy, PendingImage } from './paste';
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
  /**
   * What happens to images in pasted content (Word, Google Docs, web pages): `'upload'` copies them through the
   * adapter (default), `'link'` keeps links to the source for web images, `'remove'` leaves them out.
   * Pictures from Word's clipboard have no link and can only be uploaded.
   */
  pasteImages?: PasteImagePolicy;
}

export interface AurebeshOptions {
  /** Most characters allowed (spaces count, line breaks don't). Typing and pasting stop at the limit. */
  /** Direction of the editor itself (toolbar and base alignment): 'ltr', 'rtl' or 'auto'. Default: the page's. */
  dir?: 'ltr' | 'rtl' | 'auto';
  maxLength?: number;
  /** Show a line under the text with the number of words and characters (and the limit, if there is one). */
  counter?: boolean;
  /** Override the editor's own texts (tooltips, popovers). See `DEFAULT_LABELS` / `LABELS_NL`. */
  labels?: Partial<Labels>;
  /** Image and video settings: where uploads are stored and whether links are allowed. */
  media?: MediaOptions;
  /** Swatches offered by the 'color' and 'highlight' toolbar items (hex or rgb()). Defaults to DEFAULT_COLORS. */
  colors?: string[];
  /** Fonts offered by the 'font' toolbar item. Defaults to DEFAULT_FONTS. */
  fonts?: FontDef[];
  /** Initial HTML content. It is sanitized. */
  value?: string;
  /** Typing `# `, `- `, `1. `, `> `, ``` + Enter or `---` + Enter at the start of a line formats it. Default true. */
  markdownShortcuts?: boolean;
  placeholder?: string;
  readOnly?: boolean;
  /** Toolbar item names, '|' is a separator. Pass [] for no toolbar. */
  toolbar?: string[];
  /**
   * Items in a small strip above the toolbar, like the Quick Access Toolbar of Word. Default: undo and redo when the default
   * toolbar is used, nothing when you give a `toolbar` of your own (so they are not there twice). Pass [] for no strip.
   */
  quickbar?: string[];
  /**
   * Page format: the editor shows a sheet of that width (and height, with page breaks marked). A preset
   * ('a4', 'a5', 'a6', 'a3', 'letter', 'legal', 'ticket-80', 'ticket-58', 'responsive'), a width (a number of px, or
   * '600px', '80mm'), or `{ format, width, height, margin, orientation }`. Default: 'responsive', no sheet.
   */
  page?: PageFormat;
}

export interface AurebeshEvents {
  change: string;
  /** Fires once the editor is built and has its initial content. Registering after that still calls you (once). */
  ready: Aurebesh;
  /** Words and characters, after each change (only worked out while someone listens, or the counter or a limit is on). */
  count: TextStats;
  /** The page format changed (through `setPage` or the toolbar). null is responsive. */
  page: ResolvedPage | null;
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
  private imageTools: HTMLElement | null = null;
  private imageAltInput: HTMLInputElement | null = null;
  private linkTools: HTMLElement | null = null;
  private linkUrl: HTMLElement | null = null;
  private linkOpen: HTMLButtonElement | null = null;
  private lastLink: HTMLAnchorElement | null = null;
  private linkForm: HTMLElement | null = null;
  private formLink: HTMLAnchorElement | null = null;
  private lastImage: HTMLImageElement | null = null;
  private sizeSelect: HTMLSelectElement | null = null;
  private columnsSelect: HTMLSelectElement | null = null;
  private labels: Labels;
  private colors: string[];
  private adapter: MediaAdapter | null;
  private allowUrl: boolean;
  private pasteImages: PasteImagePolicy;
  private statusEl: HTMLElement | null = null;
  private statusTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingUploads = 0;
  private markdown: boolean;
  private maxLength: number | null = null;
  private counterEl: HTMLElement | null = null;
  private stats: TextStats = { characters: 0, charactersNoSpaces: 0, words: 0 };
  private isReady = false;
  private pointerHeld = false;
  private stage: HTMLElement;
  private page: ResolvedPage | null = null;
  private pageSelect: HTMLSelectElement | null = null;
  private pageSpec: PageSpec | null = null;
  private orientationBtn: HTMLButtonElement | null = null;

  constructor(private container: HTMLElement, options: AurebeshOptions = {}) {
    const doc = container.ownerDocument;
    this.markdown = options.markdownShortcuts ?? true;
    this.labels = { ...DEFAULT_LABELS, ...options.labels } as Labels;
    const adapter = options.media?.adapter;
    this.adapter = adapter === undefined ? base64Adapter() : typeof adapter === 'function' ? { upload: adapter } : adapter;
    this.allowUrl = options.media?.allowUrl ?? true;
    this.pasteImages = options.media?.pasteImages ?? 'upload';
    this.colors = (options.colors ?? DEFAULT_COLORS).filter((c) => SAFE_COLOR.test(c));
    this.fonts = (options.fonts ?? DEFAULT_FONTS).filter((f) => SAFE_FAMILY.test(f.family));
    this.root = doc.createElement('div');
    this.root.className = 'aurebesh';
    // Without it the editor follows the page's direction (<html dir="rtl"> mirrors the toolbar too).
    if (options.dir) this.root.setAttribute('dir', options.dir);

    if (!doc.head.querySelector('style[data-aurebesh]')) {
      const style = doc.createElement('style');
      style.setAttribute('data-aurebesh', '');
      style.textContent = CSS;
      doc.head.appendChild(style);
    }

    const items = options.toolbar ?? DEFAULT_TOOLBAR;
    const quick = options.quickbar ?? (options.toolbar ? [] : DEFAULT_QUICKBAR);
    if (quick.length) this.buildQuickbar(quick);
    if (items.length) this.buildToolbar(items);

    this.content = doc.createElement('div');
    this.content.className = 'aurebesh-content';
    this.content.setAttribute('role', 'textbox');
    this.content.setAttribute('aria-multiline', 'true');
    this.content.setAttribute('aria-label', this.t('ui.editor'));
    // The stage is the "desk" the sheet lies on when a page format is set; without one it is invisible.
    this.stage = doc.createElement('div');
    this.stage.className = 'aurebesh-stage';
    this.stage.appendChild(this.content);
    this.root.appendChild(this.stage);

    this.counterEl = doc.createElement('div');
    this.counterEl.className = 'aurebesh-count';
    this.counterEl.hidden = true;
    this.root.appendChild(this.counterEl);
    this.maxLength = options.maxLength && options.maxLength > 0 ? Math.floor(options.maxLength) : null;
    this.counterEl.hidden = !options.counter;

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
    this.listen(this.content, 'keydown', (e) => this.onKeyDown(e as KeyboardEvent));
    this.listen(this.content, 'paste', (e) => this.onPaste(e as ClipboardEvent));
    this.listen(this.content, 'beforeinput', (e) => this.onBeforeInput(e as InputEvent));
    this.listen(this.content, 'dragover', (e) => {
      if ((e as DragEvent).dataTransfer?.types.includes('Files')) e.preventDefault();
    });
    this.listen(this.content, 'drop', (e) => this.onDrop(e as DragEvent));
    this.listen(this.content, 'click', (e) => this.onClick(e as MouseEvent));
    this.listen(doc, 'selectionchange', () => this.updateToolbar());
    // the link popover hangs on its link, so it follows when the page or an inner scroll area moves, or the window changes size
    if (doc.defaultView) {
      this.listen(doc.defaultView, 'scroll', () => this.placeLinkTools(), true);
      this.listen(doc.defaultView, 'resize', () => this.placeLinkTools());
    }
    // The table tools row appears when a cell is clicked, which moves the table down. Doing that in the middle of a drag
    // across cells would put the pointer on other cells, so the row waits until the button is released.
    this.cleanup.push(trackCellDrag(this.content)); // before the mouseup below, which needs what it found
    this.listen(this.content, 'mousedown', () => (this.pointerHeld = true));
    this.listen(doc, 'mouseup', () => {
      if (!this.pointerHeld) return;
      this.pointerHeld = false;
      this.updateToolbar();
    });
    this.cleanup.push(
      attachColumnResize(
        this.content,
        () => this.content.isContentEditable,
        () => {
          this.emit('change', this.getHTML());
          this.updateToolbar();
        },
      ),
    );

    this.statusEl = doc.createElement('div');
    this.statusEl.className = 'aurebesh-status';
    this.statusEl.setAttribute('role', 'status');
    this.statusEl.hidden = true;
    this.root.appendChild(this.statusEl);

    try {
      this.setPage(options.page);
    } catch (err) {
      this.fail(err); // a wrong format leaves the editor responsive, and says why
    }

    container.appendChild(this.root);
    this.scheduleHighlight();
    this.updateStats();
    // Announced a moment later, so code that registers right after `new Aurebesh(...)` hears it too.
    queueMicrotask(() => {
      this.isReady = true;
      this.emit('ready', this);
    });
  }

  /** Resolves once the editor is ready (immediately when it already is). */
  whenReady(): Promise<this> {
    return new Promise((resolve) => this.on('ready', () => resolve(this)));
  }

  /**
   * Sets the page format (see the `page` option); `null`, `undefined` or 'responsive' removes the sheet.
   * Throws for an invalid format and then changes nothing.
   */
  setPage(format?: PageFormat | null): void {
    const page = resolvePage(format);
    this.page = page;
    this.pageSpec = page ? toSpec(format) : null;
    const root = this.root;
    if (!page) {
      for (const v of ['--aurebesh-page-w', '--aurebesh-page-h', '--aurebesh-page-m']) root.style.removeProperty(v);
      root.removeAttribute('data-page');
      root.removeAttribute('data-paged');
    } else {
      root.style.setProperty('--aurebesh-page-w', page.width);
      root.style.setProperty('--aurebesh-page-m', page.margin);
      if (page.height) root.style.setProperty('--aurebesh-page-h', page.height);
      else root.style.removeProperty('--aurebesh-page-h');
      root.setAttribute('data-page', page.name);
      if (page.height) root.setAttribute('data-paged', '');
      else root.removeAttribute('data-paged');
    }
    this.syncPageUi();
    this.emit('page', page);
  }

  /** Turns the sheet to portrait or landscape. Only paper with a height turns (a ticket roll or a plain width does not); without a page format nothing happens. */
  setPageOrientation(orientation: 'portrait' | 'landscape'): void {
    if (this.pageSpec) this.setPage({ ...this.pageSpec, orientation });
  }

  /** The page format in use as CSS lengths, or null when the editor is responsive. */
  getPage(): ResolvedPage | null {
    return this.page;
  }

  /** How many pages the content takes on the current paper (1 for responsive and for continuous paper). Page breaks are approximate: text is not moved to keep a line whole. */
  getPageCount(): number {
    return countPages(this.page, this.content.offsetHeight);
  }

  private printHTML(heightPx?: number): string {
    const doc = this.container.ownerDocument;
    const style = doc.defaultView!.getComputedStyle(this.content);
    const clean = (v: string) => v.replace(/[<>{};]/g, '');
    const font = `font-family:${clean(style.fontFamily)};font-size:${clean(style.fontSize)};line-height:${clean(style.lineHeight)}`;
    const h = heightPx ?? (this.page && !this.page.height ? this.content.offsetHeight : undefined);
    return printDocument(this.page, this.getHTML(), CSS, font, h);
  }

  /**
   * A standalone HTML document of the content with the page format as `@page` size and margins: for printing, or for
   * turning into a PDF on a server (Puppeteer, Playwright: `page.pdf({ preferCSSPageSize: true })`). Code colours are not
   * included. For continuous paper (a ticket) the length is taken from the editor's own content.
   */
  getPrintHTML(): string {
    return this.printHTML();
  }

  /** Opens the print dialog for the content on the current paper (choose "Save as PDF" there for a PDF). */
  print(): Promise<void> {
    const doc = this.container.ownerDocument;
    const frame = doc.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    frame.srcdoc = this.printHTML();
    return new Promise((resolve) => {
      const done = () => {
        frame.remove();
        resolve();
      };
      frame.addEventListener('load', async () => {
        const win = frame.contentWindow;
        const inner = frame.contentDocument;
        if (!win || !inner) return done();
        await Promise.all(
          Array.from(inner.images).map((img) => (img.complete ? null : new Promise<void>((r) => void (img.onload = img.onerror = () => r())))),
        );
        if (this.page && !this.page.height) {
          // measured in the print document itself, where the width is exactly the paper's
          const style = inner.createElement('style');
          style.textContent = `@page{size:${this.page.width} ${Math.ceil((inner.body.scrollHeight * 25.4) / 96) + 1}mm;margin:0}`;
          inner.head.appendChild(style);
        }
        win.addEventListener('afterprint', done, { once: true });
        win.focus();
        win.print();
        setTimeout(done, 120_000); // a browser that never reports afterprint
      });
      doc.body.appendChild(frame);
    });
  }

  private syncPageUi(): void {
    const btn = this.orientationBtn;
    if (btn) {
      btn.disabled = !this.page?.height;
      btn.setAttribute('aria-pressed', String(!!this.page?.landscape));
    }
    const select = this.pageSelect;
    if (!select) return;
    const name = this.page?.name ?? 'responsive';
    select.querySelector('option[value="custom"]')?.remove();
    if (name === 'custom') {
      const opt = select.ownerDocument.createElement('option');
      opt.value = 'custom';
      opt.textContent = this.t('page.custom');
      select.appendChild(opt);
    }
    select.value = name;
  }

  /** Words and characters of the current content. */
  getStats(): TextStats {
    return countText(plainText(this.content));
  }

  /** True when the content is longer than `maxLength` (possible after setHTML, which never cuts content off). */
  isOverLimit(): boolean {
    return this.maxLength !== null && this.getStats().characters > this.maxLength;
  }

  setMaxLength(max: number | null): void {
    this.maxLength = max && max > 0 ? Math.floor(max) : null;
    this.updateStats();
  }

  setCounter(show: boolean): void {
    if (this.counterEl) this.counterEl.hidden = !show;
    this.updateStats();
  }

  /** Counts, shows the line under the text, flags an over-long text and emits `count`. Does the work only when it is used. */
  private updateStats(): void {
    const wanted = !this.counterEl?.hidden || this.maxLength !== null || !!this.listeners.get('count')?.size;
    if (!wanted) return;
    const stats = this.getStats();
    this.stats = stats;
    const over = this.maxLength !== null && stats.characters > this.maxLength;
    if (over) this.content.setAttribute('aria-invalid', 'true');
    else this.content.removeAttribute('aria-invalid');
    if (this.counterEl && !this.counterEl.hidden) {
      const words = `${stats.words} ${this.t(stats.words === 1 ? 'ui.words.one' : 'ui.words.other')}`;
      const chars = `${stats.characters}${this.maxLength !== null ? ` / ${this.maxLength}` : ''} ${this.t(stats.characters === 1 ? 'ui.characters.one' : 'ui.characters.other')}`;
      this.counterEl.textContent = `${words} · ${chars}`;
      this.counterEl.classList.toggle('over', over);
    }
    this.emit('count', stats);
  }

  /** How many more characters fit (counting the selection, which typing would replace); null without a limit. */
  private roomLeft(): number | null {
    if (this.maxLength === null) return null;
    const sel = this.container.ownerDocument.getSelection();
    const inside = !!sel && sel.rangeCount > 0 && this.content.contains(sel.anchorNode);
    const selected = inside ? countCharacters(sel!.toString()) : 0;
    return this.maxLength - this.getStats().characters + selected;
  }

  private limitReached(): void {
    this.showStatus(this.t('ui.limitReached', { max: String(this.maxLength) }), true);
  }

  /** Stops typing, dropping and replacing text at the limit; what is pasted is cut off in onPaste. Deleting is always allowed. */
  private onBeforeInput(e: InputEvent): void {
    // While an input method composes text it can't be cancelled; the over-long state is flagged and the form rejects it.
    if (this.maxLength === null || e.isComposing || !e.inputType.startsWith('insert') || e.inputType === 'insertFromPaste') return;
    const incoming = e.data ?? e.dataTransfer?.getData('text/plain') ?? '';
    const room = this.roomLeft();
    if (!incoming || room === null) return;
    const length = countCharacters(incoming);
    if (length <= room) return;
    e.preventDefault();
    if (room > 0 && e.inputType !== 'insertText') document.execCommand('insertText', false, truncateCharacters(incoming, room)); // a drop
    this.limitReached();
  }

  /**
   * The content as clean, sanitized HTML: only what the allow-list permits, no leftovers from the browser's
   * editing commands, and an empty string for an empty editor. This is what you should store.
   */
  getHTML(): string {
    return this.isEmpty() ? '' : sanitize(this.content.innerHTML);
  }

  /** The content as Markdown (GitHub flavour); '' when empty. Underline and sub/superscript stay inline HTML; colours, fonts and columns are dropped. */
  getMarkdown(): string {
    return this.isEmpty() ? '' : toMarkdown(this.getHTML());
  }

  /** The content in the given format: 'html' (default), 'markdown' or 'text'. */
  getValue(format: OutputFormat = 'html'): string {
    if (format === 'markdown') return this.getMarkdown();
    if (format === 'text') return this.isEmpty() ? '' : this.getText();
    return this.getHTML();
  }

  private onKeyDown(e: KeyboardEvent): void {
    // While an input method (Chinese, Japanese, Korean...) is composing, Enter/Tab/Space belong to it.
    if (e.isComposing || e.keyCode === 229) return;

    const shortcut = shortcutFor(e);
    if (shortcut) {
      if (shortcut === 'link') {
        const link = this.buttons.get('link');
        if (link) {
          e.preventDefault();
          link.click();
        }
        return;
      }
      e.preventDefault();
      this.exec(shortcut);
      return;
    }

    if (this.markdown) {
      const command = applyMarkdown(e);
      if (command) {
        this.exec(command);
        return;
      }
    }

    if (handleListKey(e) || handleTab(e) || handleCodeKey(e)) this.emit('change', this.getHTML());
  }

  setHTML(html: string): void {
    this.content.innerHTML = sanitize(html);
    this.syncEmpty();
    this.scheduleHighlight();
    this.updateStats();
  }

  /** True when there is no text and no image, video, table or list. */
  isEmpty(): boolean {
    return this.content.classList.contains('is-empty');
  }

  /** The text without formatting: a line break between paragraphs and at <br>, a tab between table cells. */
  getText(): string {
    return plainText(this.content);
  }

  focus(): void {
    this.content.focus();
  }

  setReadOnly(readOnly: boolean): void {
    this.content.contentEditable = readOnly ? 'false' : 'true';
    this.content.setAttribute('aria-readonly', String(readOnly));
    this.buttons.forEach((b) => (b.disabled = readOnly));
    if (this.fontSelect) this.fontSelect.disabled = readOnly;
    if (this.sizeSelect) this.sizeSelect.disabled = readOnly;
    if (this.columnsSelect) this.columnsSelect.disabled = readOnly;
  }

  setPlaceholder(text: string): void {
    this.content.setAttribute('data-placeholder', text);
    if (text) this.content.setAttribute('aria-placeholder', text);
    else this.content.removeAttribute('aria-placeholder');
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
    // Someone who registers after the editor is ready still gets `ready`, once.
    if (event === 'ready' && this.isReady) queueMicrotask(() => fn(this as unknown as AurebeshEvents[K]));
    if (event === 'count') this.updateStats();
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
    if (event === 'change') {
      this.scheduleHighlight();
      this.updateStats();
    }
    this.listeners.get(event)?.forEach((fn) => fn(payload));
  }

  /** Repaints code highlights shortly after the last change (cheap, and the DOM is not touched). */
  private scheduleHighlight(): void {
    clearTimeout(this.highlightTimer);
    this.highlightTimer = setTimeout(() => highlightCode(this.content), 50);
  }

  private listen(target: EventTarget, type: string, fn: (e: Event) => void, capture = false): void {
    target.addEventListener(type, fn, capture);
    this.cleanup.push(() => target.removeEventListener(type, fn, capture));
  }

  /** The small strip above the toolbar: buttons that are about the document rather than the text (undo, redo). */
  private buildQuickbar(items: string[]): void {
    const bar = this.container.ownerDocument.createElement('div');
    bar.className = 'aurebesh-toolbar aurebesh-quickbar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', this.t('ui.quickbar'));
    for (const item of items) {
      const cmd = COMMANDS[item];
      if (cmd) bar.appendChild(this.makeButton(cmd));
    }
    this.root.appendChild(bar);
    rovingToolbar(bar, () => this.content.focus());
  }

  /** One toolbar item as an element, or null for a name that is not a command (or an upload that is not available). */
  private buildToolbarItem(item: string): HTMLElement | null {
    const cmd = COMMANDS[item];
    if (!cmd) return null;
    if (item === 'font') return this.buildFontSelect();
    if (item === 'size') return this.buildSizeSelect();
    if (item === 'columns') return this.buildColumnsSelect();
    if (item === 'orientation') return this.buildOrientationButton();
    if (item === 'page') return this.buildPageSelect();
    if (item === 'link') return this.buildLinkPicker(cmd);
    if (item === 'color') return this.buildColorPicker(cmd, 'inherit', this.t('ui.automatic'));
    if (item === 'highlight') return this.buildColorPicker(cmd, 'transparent', this.t('ui.noHighlight'));
    if (item === 'table') return this.buildTablePicker();
    if (item === 'image' || item === 'video') return this.buildMediaPicker(item, cmd);
    return this.makeButton(cmd);
  }

  /**
   * The toolbar is blocks, like the groups of the ribbon in Word: `|` starts a new block and `/` a new row inside the block, so a
   * block can be two rows of buttons on top of each other. A block moves as a whole when the toolbar is narrow, it is never cut in two.
   * Without any `/` every block is a single row, which wraps like before.
   */
  private buildToolbar(items: string[]): void {
    const doc = this.container.ownerDocument;
    const bar = doc.createElement('div');
    bar.className = 'aurebesh-toolbar';
    bar.setAttribute('role', 'toolbar');
    const groups: HTMLElement[][][] = [[[]]]; // blocks of rows of elements
    for (const item of items) {
      const group = groups[groups.length - 1];
      if (item === '|') {
        if (group.some((row) => row.length)) groups.push([[]]);
        continue;
      }
      if (item === '/') {
        if (group[group.length - 1].length) group.push([]);
        continue;
      }
      const el = this.buildToolbarItem(item);
      if (el) group[group.length - 1].push(el);
    }
    for (const rows of groups) {
      const filled = rows.filter((row) => row.length);
      if (!filled.length) continue;
      const block = doc.createElement('div');
      block.className = 'aurebesh-group';
      block.setAttribute('role', 'group');
      for (const nodes of filled) {
        const row = doc.createElement('div');
        row.className = 'aurebesh-row';
        row.append(...nodes);
        block.appendChild(row);
      }
      bar.appendChild(block);
    }
    bar.setAttribute('aria-label', this.t('ui.toolbar'));
    this.root.appendChild(bar);
    rovingToolbar(bar, () => this.content.focus());

    if (items.includes('table')) {
      const tools = doc.createElement('div');
      tools.className = 'aurebesh-toolbar aurebesh-table-tools';
      tools.setAttribute('role', 'toolbar');
      tools.setAttribute('aria-label', this.t('ui.tableTools'));
      tools.hidden = true;
      for (const name of TABLE_TOOLS) tools.appendChild(this.makeButton(COMMANDS[name]));
      this.tableTools = tools;
      this.root.appendChild(tools);
      rovingToolbar(tools, () => this.content.focus());
    }

    if (items.includes('image')) this.buildImageTools();
    if (items.includes('link')) this.buildLinkTools();
  }

  /** Row that appears while the caret is in a link: its address, Open (new tab), Edit and Remove. */
  private buildLinkTools(): void {
    const doc = this.container.ownerDocument;
    const tools = doc.createElement('div');
    tools.className = 'aurebesh-toolbar aurebesh-link-tools';
    tools.setAttribute('role', 'toolbar');
    tools.setAttribute('aria-label', this.t('ui.linkTools'));
    tools.hidden = true;

    const url = doc.createElement('span');
    url.className = 'aurebesh-link-url';
    this.linkUrl = url;
    tools.appendChild(url);

    const add = (label: string, run: () => void): HTMLButtonElement => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the caret in the link
      b.addEventListener('click', run);
      tools.appendChild(b);
      return b;
    };
    this.linkOpen = add(this.t('ui.openLink'), () => openLink(this.lastLink?.getAttribute('href')));
    add(this.t('ui.editLink'), () => this.buttons.get('link')?.click());
    add(this.t('ui.removeLink'), () => this.exec('link', ''));

    this.linkTools = tools;
    this.root.appendChild(tools);
    rovingToolbar(tools, () => this.content.focus());
  }

  /** Where the link popover and the link form hang: on the link, or at the caret when there is none yet. */
  private linkAnchor(): DOMRect | null {
    const link = this.linkForm && !this.linkForm.hidden ? this.formLink : this.lastLink;
    if (link && link.isConnected) return link.getClientRects()[0] ?? link.getBoundingClientRect();
    const range = this.lastRange;
    if (!range || !this.content.contains(range.startContainer)) return null;
    const r = range.getClientRects()[0] ?? range.getBoundingClientRect();
    if (r.width || r.height) return r;
    const el = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
    return el ? el.getBoundingClientRect() : null;
  }

  private placeLinkTools(): void {
    const tools = this.linkTools;
    if (tools && !tools.hidden && this.lastLink?.isConnected) this.hang(tools, this.lastLink.getClientRects()[0] ?? this.lastLink.getBoundingClientRect());
    const form = this.linkForm;
    if (form && !form.hidden) {
      const r = this.linkAnchor();
      if (r) this.hang(form, r);
    }
  }

  /**
   * Hangs a popover on a rectangle (a link, or the caret): above it when there is room in the text area, otherwise beside it (the
   * link is on the first line), and below it when the sides are too narrow as well.
   */
  private hang(pop: HTMLElement, r: DOMRect): void {
    const rootBox = this.root.getBoundingClientRect();
    const parent = (pop.offsetParent as HTMLElement | null) ?? this.root;
    const origin = parent.getBoundingClientRect();
    // the part of the text that can be seen: the editor scrolls inside itself when it has a maximum height
    const view = (this.root.hasAttribute('data-page') ? this.stage : this.content).getBoundingClientRect();
    const top = view.top;
    const gap = 6;
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const clampX = (x: number) => Math.max(rootBox.left, Math.min(x, rootBox.right - w));
    let x = clampX(r.left);
    let y: number;
    let where = 'above';
    if (r.top - top >= h + gap) {
      y = r.top - h - gap;
    } else if (r.right + gap + w <= rootBox.right) {
      where = 'beside';
      x = r.right + gap;
      y = Math.max(top, r.top + r.height / 2 - h / 2);
    } else if (r.left - gap - w >= rootBox.left) {
      where = 'beside';
      x = r.left - gap - w;
      y = Math.max(top, r.top + r.height / 2 - h / 2);
    } else {
      where = 'below';
      y = r.bottom + gap;
    }
    pop.dataset.place = where;
    pop.style.margin = '0';
    pop.style.insetInlineStart = 'auto';
    pop.style.left = `${Math.round(x - origin.left - parent.clientLeft)}px`;
    pop.style.top = `${Math.round(y - origin.top - parent.clientTop)}px`;
    pop.style.visibility = r.bottom < view.top || r.top > view.bottom ? 'hidden' : '';
  }

  /** Text for a key: the `labels` option, then the built-in English text. `{name}` placeholders are filled from `vars`. */
  private t(key: string, vars: Record<string, string> = {}): string {
    return (this.labels[key] ?? key).replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
  }

  /** Tooltip / aria-label for a toolbar command. */
  private title(cmd: CommandDef): string {
    return this.labels[cmd.name] ?? cmd.title;
  }

  /** Second toolbar row that appears while an image is selected: width, alignment, alt text, remove. */
  private buildImageTools(): void {
    const doc = this.container.ownerDocument;
    const tools = doc.createElement('div');
    tools.className = 'aurebesh-toolbar aurebesh-image-tools';
    tools.setAttribute('role', 'toolbar');
    tools.setAttribute('aria-label', this.t('ui.imageTools'));
    tools.hidden = true;
    const add = (face: string | { icon?: string; label: string }, title: string, run: () => void) => {
      const b = doc.createElement('button');
      b.type = 'button';
      if (typeof face === 'string') b.textContent = face;
      else this.face(b, face);
      b.title = title;
      b.setAttribute('aria-label', title);
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', run);
      tools.appendChild(b);
    };
    for (const pct of ['25', '50', '75', '100']) add(`${pct}%`, `${pct}%`, () => this.exec('imageWidth', pct));
    add({ icon: 'fullWidth', label: '↔' }, this.t('ui.fullWidth'), () => this.exec('imageWidth', ''));
    for (const [where, cmd] of [['left', 'alignLeft'], ['center', 'alignCenter'], ['right', 'alignRight']] as const) {
      add(COMMANDS[cmd], this.labels[cmd] ?? COMMANDS[cmd].title, () => this.exec('imageAlign', where));
    }
    const alt = doc.createElement('input');
    alt.type = 'text';
    alt.className = 'aurebesh-alt';
    alt.placeholder = this.t('ui.altText');
    alt.setAttribute('aria-label', this.t('ui.altText'));
    // The input takes focus (and the selection with it), so the image is remembered while typing.
    alt.addEventListener('change', () => {
      if (this.lastImage) {
        if (alt.value) this.lastImage.setAttribute('alt', alt.value);
        else this.lastImage.removeAttribute('alt');
        this.emit('change', this.getHTML());
      }
    });
    this.imageAltInput = alt;
    tools.appendChild(alt);
    add({ icon: 'trash', label: '✕' }, this.t('ui.removeImage'), () => {
      if (!this.lastImage) return;
      const range = doc.createRange();
      range.selectNode(this.lastImage);
      const sel = doc.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      this.content.focus();
      doc.execCommand('delete');
      this.lastImage = null;
      tools.hidden = true;
      this.emit('change', this.getHTML());
    });
    this.imageTools = tools;
    this.root.appendChild(tools);
    rovingToolbar(tools, () => this.content.focus());
  }

  /** What a button shows: its icon, or its text when it has none. */
  private face(btn: HTMLElement, cmd: { icon?: string; label: string }): void {
    const icon = iconElement(btn.ownerDocument, cmd.icon);
    if (icon) btn.replaceChildren(icon);
    else btn.textContent = cmd.label;
  }

  private makeButton(cmd: CommandDef, onClick: (e: MouseEvent) => void = () => this.exec(cmd.name)): HTMLButtonElement {
    const btn = this.container.ownerDocument.createElement('button');
    btn.type = 'button';
    this.face(btn, cmd);
    btn.title = this.title(cmd);
    btn.setAttribute('aria-label', this.title(cmd));
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

    const toggle = this.makeButton(COMMANDS.table, (e) => {
      pop.hidden = !pop.hidden;
      highlight(0, 0);
      if (!pop.hidden && e.detail === 0) cells[0].focus(); // opened with the keyboard: move into the grid
    });

    const pop = doc.createElement('div');
    pop.className = 'aurebesh-table-pop';
    pop.hidden = true;
    const grid = doc.createElement('div');
    grid.className = 'aurebesh-table-grid';
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', this.t('ui.table'));
    grid.style.gridTemplateColumns = `repeat(${COLS}, var(--aurebesh-cell, 18px))`;
    const label = doc.createElement('div');
    label.className = 'aurebesh-table-label';
    label.setAttribute('aria-live', 'polite');
    label.textContent = this.t('ui.table');
    const cells: HTMLButtonElement[] = [];
    const highlight = (r: number, c: number) => {
      cells.forEach((cell, i) => cell.classList.toggle('on', Math.floor(i / COLS) < r && i % COLS < c));
      label.textContent = r && c ? `${r} × ${c}` : this.t('ui.table');
    };
    for (let i = 0; i < ROWS * COLS; i++) {
      const cell = doc.createElement('button');
      cell.type = 'button';
      const r = Math.floor(i / COLS) + 1;
      const c = (i % COLS) + 1;
      cell.setAttribute('aria-label', `${r} × ${c}`);
      cell.addEventListener('mouseenter', () => highlight(r, c));
      cell.addEventListener('focus', () => highlight(r, c));
      cell.addEventListener('mousedown', (e) => e.preventDefault());
      cell.addEventListener('click', () => {
        pop.hidden = true;
        this.exec('table', `${r}x${c}`);
      });
      cells.push(cell);
      grid.appendChild(cell);
    }
    grid.addEventListener('mouseleave', () => highlight(0, 0));
    gridNavigation(grid, COLS);
    pop.append(grid, label);

    this.closeOnOutside(wrap, pop, toggle);

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
      url.placeholder = this.t(kind === 'image' ? 'ui.imageLink' : 'ui.videoLink');
      url.setAttribute('aria-label', url.placeholder);
      let alt: HTMLInputElement | null = null;
      if (kind === 'image') {
        alt = doc.createElement('input');
        alt.type = 'text';
        alt.placeholder = this.t('ui.altText');
        alt.setAttribute('aria-label', alt.placeholder);
      }
      const insert = doc.createElement('button');
      insert.type = 'button';
      insert.textContent = this.t('ui.insert');
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
      upload.textContent = this.t(kind === 'image' ? 'ui.uploadImage' : 'ui.uploadVideo');
      upload.addEventListener('mousedown', (e) => e.preventDefault());
      upload.addEventListener('click', () => file.click());
      pop.append(upload, file);
    }

    this.closeOnOutside(wrap, pop, toggle);
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
      this.showStatus(this.t('ui.uploading', { name: file.name }));
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

  /**
   * A click on a link: Ctrl/Cmd+click opens it while editing (a plain click only places the caret, which shows the link row),
   * and in a read-only editor a plain click opens it. Otherwise a click on an image, video or embed selects it.
   */
  private onClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const link = target.closest('a');
    if (link && this.content.contains(link)) {
      if (!this.content.isContentEditable || e.ctrlKey || e.metaKey) {
        e.preventDefault();
        openLink(link.getAttribute('href'));
      }
      return;
    }
    this.selectMedia(target);
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
    this.statusEl.setAttribute('role', isError ? 'alert' : 'status'); // errors are announced right away
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

  /**
   * Popover behaviour shared by all pickers: the toggle button announces it (aria-haspopup / aria-expanded),
   * a click outside or Escape closes it, and Escape returns the focus to the button that opened it.
   */
  private closeOnOutside(wrap: HTMLElement, pop: HTMLElement, toggle: HTMLElement): void {
    const doc = this.container.ownerDocument;
    toggle.setAttribute('aria-haspopup', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    // Pickers open and close by flipping `hidden`; mirror that into aria-expanded in one place.
    const watcher = new MutationObserver(() => toggle.setAttribute('aria-expanded', String(!pop.hidden)));
    watcher.observe(pop, { attributes: true, attributeFilter: ['hidden'] });
    this.cleanup.push(() => watcher.disconnect());

    this.listen(doc, 'mousedown', (e) => {
      if (!wrap.contains(e.target as Node)) pop.hidden = true;
    });
    this.listen(doc, 'keydown', (e) => {
      if ((e as KeyboardEvent).key !== 'Escape' || pop.hidden) return;
      pop.hidden = true;
      if (wrap.contains(doc.activeElement)) toggle.focus();
    });
  }

  /** Swatch palette + reset + native custom colour input, for the 'color' and 'highlight' commands. */
  private buildColorPicker(cmd: CommandDef, resetValue: string, resetLabel: string): HTMLElement {
    const doc = this.container.ownerDocument;
    const wrap = doc.createElement('span');
    wrap.className = 'aurebesh-table-picker';

    const toggle = this.makeButton(cmd, (e) => {
      pop.hidden = !pop.hidden;
      if (!pop.hidden && e.detail === 0) (grid.querySelector('button') as HTMLElement | null)?.focus(); // opened with the keyboard
    });
    toggle.classList.add('aurebesh-swatch-btn', `aurebesh-swatch-${cmd.name}`);

    const pop = doc.createElement('div');
    pop.className = 'aurebesh-table-pop';
    pop.hidden = true;

    const apply = (value: string) => {
      pop.hidden = true;
      // the bar under the icon shows the colour chosen last; resetting goes back to its default
      if (value === resetValue) toggle.style.removeProperty('--swatch');
      else toggle.style.setProperty('--swatch', value);
      this.exec(cmd.name, value);
    };

    const grid = doc.createElement('div');
    grid.className = 'aurebesh-color-grid';
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', this.title(cmd));
    for (const color of this.colors) {
      const sw = doc.createElement('button');
      sw.type = 'button';
      sw.style.background = color;
      sw.title = color;
      sw.setAttribute('aria-label', color);
      sw.addEventListener('mousedown', (e) => e.preventDefault());
      sw.addEventListener('click', () => apply(color));
      grid.appendChild(sw);
    }
    gridNavigation(grid, 10);

    const reset = doc.createElement('button');
    reset.type = 'button';
    reset.className = 'aurebesh-color-reset';
    reset.textContent = resetLabel;
    reset.addEventListener('mousedown', (e) => e.preventDefault());
    reset.addEventListener('click', () => apply(resetValue));

    const custom = doc.createElement('label');
    custom.className = 'aurebesh-color-custom';
    custom.textContent = `${this.t('ui.custom')} `;
    const input = doc.createElement('input');
    input.type = 'color';
    input.value = '#3b82f6';
    // 'change' fires when the picker is closed, 'input' on every drag: only apply the final choice.
    input.addEventListener('change', () => apply(input.value));
    custom.appendChild(input);

    pop.append(grid, reset, custom);
    this.closeOnOutside(wrap, pop, toggle);
    wrap.append(toggle, pop);
    return wrap;
  }

  private buildFontSelect(): HTMLSelectElement {
    const doc = this.container.ownerDocument;
    const select = doc.createElement('select');
    select.className = 'aurebesh-font';
    select.title = this.t('ui.font');
    select.setAttribute('aria-label', this.t('ui.font'));
    const placeholder = doc.createElement('option');
    placeholder.value = '';
    placeholder.textContent = this.t('ui.font');
    this.asPlaceholder(placeholder);
    select.appendChild(placeholder);
    for (const font of this.fonts) {
      const opt = doc.createElement('option');
      opt.value = font.family;
      opt.textContent = font.name;
      opt.style.fontFamily = font.family;
      select.appendChild(opt);
    }
    select.value = '';
    select.addEventListener('change', () => {
      if (select.value) this.exec('font', select.value);
    });
    this.fontSelect = select;
    return select;
  }

  /** Number of newspaper columns for the selected blocks; always shows the current value (1 = no columns). */
  private buildColumnsSelect(): HTMLSelectElement {
    const doc = this.container.ownerDocument;
    const select = doc.createElement('select');
    select.className = 'aurebesh-columns';
    select.title = this.title(COMMANDS.columns);
    select.setAttribute('aria-label', this.t('ui.columns'));
    for (const n of ['1', '2', '3', '4']) {
      const opt = doc.createElement('option');
      opt.value = n;
      opt.textContent = this.t(`columns.${n}`);
      select.appendChild(opt);
    }
    select.addEventListener('change', () => this.exec('columns', select.value));
    this.columnsSelect = select;
    return select;
  }

  /** Turns the sheet: pressed is landscape. Off when there is no paper with a height to turn. */
  private buildOrientationButton(): HTMLButtonElement {
    const doc = this.container.ownerDocument;
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'aurebesh-orientation';
    this.face(btn, COMMANDS.orientation);
    const title = this.title(COMMANDS.orientation);
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.setAttribute('aria-pressed', 'false');
    btn.disabled = true;
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => this.setPageOrientation(this.page?.landscape ? 'portrait' : 'landscape'));
    this.orientationBtn = btn;
    return btn;
  }

  /** Page format: choosing one sets it for the whole document (not for the selection). */
  private buildPageSelect(): HTMLSelectElement {
    const doc = this.container.ownerDocument;
    const select = doc.createElement('select');
    select.className = 'aurebesh-pagesel';
    select.title = this.title(COMMANDS.page);
    select.setAttribute('aria-label', this.t('ui.page'));
    for (const name of PAGE_NAMES) {
      const opt = doc.createElement('option');
      opt.value = name;
      opt.textContent = this.t(`page.${name}`);
      select.appendChild(opt);
    }
    select.addEventListener('change', () => {
      try {
        // choosing another paper keeps the sheet turned the way it is
        this.setPage(select.value === 'responsive' ? null : { format: select.value as PagePreset, orientation: this.page?.landscape ? 'landscape' : 'portrait' });
      } catch (err) {
        this.fail(err);
      }
    });
    this.pageSelect = select;
    return select;
  }

  /** The select's title ("Font", "Size"): shown while nothing is chosen, but not offered as a choice in the list. */
  private asPlaceholder(option: HTMLOptionElement): void {
    option.value = '';
    option.disabled = true;
    option.hidden = true;
  }

  /** Text size: the browser's steps small .. huge. Picks apply to the selection and the box returns to its title. */
  private buildSizeSelect(): HTMLSelectElement {
    const doc = this.container.ownerDocument;
    const select = doc.createElement('select');
    select.className = 'aurebesh-size';
    select.title = this.t('ui.size');
    select.setAttribute('aria-label', this.t('ui.size'));
    const placeholder = doc.createElement('option');
    placeholder.value = '';
    placeholder.textContent = this.t('ui.size');
    this.asPlaceholder(placeholder);
    select.appendChild(placeholder);
    for (const [step, key] of [['2', 'size.small'], ['3', 'size.normal'], ['4', 'size.large'], ['5', 'size.larger'], ['6', 'size.huge']]) {
      const opt = doc.createElement('option');
      opt.value = step;
      opt.textContent = this.t(key);
      select.appendChild(opt);
    }
    select.value = '';
    select.addEventListener('change', () => {
      const chosen = select.value;
      if (!chosen) return;
      this.exec('size', chosen);
      // With only a caret there is no text to measure yet: show the choice until the caret moves.
      if (this.container.ownerDocument.getSelection()?.isCollapsed) select.value = chosen;
    });
    this.sizeSelect = select;
    return select;
  }

  /**
   * The element holding the first piece of text that is really selected. A selection dragged over a sized word often
   * starts at the very end of the text before it, so the start container itself says nothing about the selected text.
   */
  private firstSelectedElement(range: Range): HTMLElement | null {
    const toElement = (n: Node | null): HTMLElement | null => (n && (n.nodeType === Node.ELEMENT_NODE ? (n as HTMLElement) : n.parentElement)) || null;
    if (!range.collapsed) {
      const ancestor = range.commonAncestorContainer;
      const root = ancestor.nodeType === Node.ELEMENT_NODE ? ancestor : ancestor.parentNode!;
      const walker = this.container.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
        if (!range.intersectsNode(n)) continue;
        const from = n === range.startContainer ? range.startOffset : 0;
        const to = n === range.endContainer ? range.endOffset : n.length;
        if (n.data.slice(from, to).trim()) return toElement(n);
      }
    }
    let node: Node = range.startContainer;
    if (node.nodeType === Node.ELEMENT_NODE) node = node.childNodes[range.startOffset] ?? node;
    return toElement(node);
  }

  /**
   * The size step (as used by the size select) of the selected text: an explicit keyword size when there is one,
   * otherwise measured from the real font size, so `<font size>`, `1.5em` and nested sizes work as well.
   */
  private currentSizeStep(range: Range): string {
    const keywords: Record<string, string> = { 'x-small': '1', small: '2', medium: '3', large: '4', 'x-large': '5', 'xx-large': '6', 'xxx-large': '7' };
    const start = this.firstSelectedElement(range);
    for (let el = start; el && el !== this.content; el = el.parentElement) {
      if (/^H[1-6]$/.test(el.tagName)) return ''; // headings have their own size
      const size = el.style?.fontSize;
      if (size && keywords[size]) return keywords[size];
    }
    if (!start) return '';
    const view = this.container.ownerDocument.defaultView;
    if (!view) return '3';
    const ratio = parseFloat(view.getComputedStyle(start).fontSize) / parseFloat(view.getComputedStyle(this.content).fontSize);
    if (!ratio) return '3';
    // relative to normal text: small 13/16, normal 1, large 18/16, larger 1.5, huge 2
    const steps: [string, number][] = [['2', 0.8125], ['3', 1], ['4', 1.125], ['5', 1.5], ['6', 2]];
    const [step, value] = steps.reduce((best, s) => (Math.abs(s[1] - ratio) < Math.abs(best[1] - ratio) ? s : best));
    return Math.abs(value - ratio) / value < 0.06 ? step : '';
  }

  /** Link popover: edits the link at the caret (field is prefilled), applies, or removes it. */
  private buildLinkPicker(cmd: CommandDef): HTMLElement {
    const doc = this.container.ownerDocument;
    const wrap = doc.createElement('span');
    wrap.className = 'aurebesh-table-picker';
    const pop = doc.createElement('div');
    pop.className = 'aurebesh-table-pop aurebesh-media-form aurebesh-link-form';
    pop.hidden = true;

    const input = doc.createElement('input');
    input.type = 'text';
    input.inputMode = 'url';
    input.placeholder = this.t('ui.linkAddress');
    input.setAttribute('aria-label', this.t('ui.linkAddress'));
    const apply = doc.createElement('button');
    apply.type = 'button';
    apply.textContent = this.t('ui.apply');
    const remove = doc.createElement('button');
    remove.type = 'button';
    remove.textContent = this.t('ui.removeLink');

    const run = (url: string) => {
      try {
        this.exec('link', url);
        pop.hidden = true;
        this.updateToolbar();
      } catch (err) {
        this.fail(err);
      }
    };
    apply.addEventListener('mousedown', (e) => e.preventDefault());
    apply.addEventListener('click', () => {
      try {
        run(normalizeLink(input.value));
      } catch (err) {
        this.fail(err);
      }
    });
    remove.addEventListener('mousedown', (e) => e.preventDefault());
    remove.addEventListener('click', () => run(''));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        apply.click();
      }
    });

    const toggle = this.makeButton(cmd, () => {
      pop.hidden = !pop.hidden;
      if (pop.hidden) return;
      const existing = currentLink();
      this.formLink = existing;
      this.updateToolbar(); // the small popover on the link makes way for the form
      this.placeLinkTools();
      input.value = existing?.getAttribute('href') ?? '';
      remove.hidden = !existing;
      input.focus();
      input.select();
    });

    pop.append(input, apply, remove);
    this.linkForm = pop;
    this.closeOnOutside(wrap, pop, toggle);
    wrap.append(toggle, pop);
    return wrap;
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
    if (this.tableTools && !this.pointerHeld) this.tableTools.hidden = !(inside && currentCell());
    if (this.linkTools) {
      const link = inside && this.content.isContentEditable ? currentLink() : null;
      if (link) {
        this.lastLink = link;
        const href = link.getAttribute('href') ?? '';
        if (this.linkUrl) {
          this.linkUrl.textContent = href;
          this.linkUrl.title = href;
        }
        if (this.linkOpen) this.linkOpen.disabled = !canOpenLink(href);
      }
      this.linkTools.hidden = (!link && !this.linkTools.contains(this.container.ownerDocument.activeElement)) || !!(this.linkForm && !this.linkForm.hidden);
      this.placeLinkTools();
    }
    if (this.imageTools) {
      const img = inside ? selectedImage() : null;
      if (img) {
        this.lastImage = img;
        if (this.imageAltInput) this.imageAltInput.value = img.getAttribute('alt') ?? '';
      }
      // Stay visible while the alt-text field has focus (it takes the selection with it).
      this.imageTools.hidden = !img && !this.imageTools.contains(this.container.ownerDocument.activeElement);
    }    if (this.columnsSelect && inside) this.columnsSelect.value = String(currentColumns());
    if (this.sizeSelect && inside) {
      const step = this.currentSizeStep(sel!.getRangeAt(0));
      this.sizeSelect.value = Array.from(this.sizeSelect.options).some((o) => o.value === step) ? step : '';
    }
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
      const enabled = COMMANDS[name].isEnabled;
      if (enabled) btn.disabled = !this.content.isContentEditable || !(inside && enabled());
    });
  }

  private syncEmpty(): void {
    const empty = !this.content.textContent && !this.content.querySelector('hr,li,img,video,iframe,table');
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
    // With a limit, what doesn't fit is cut off: as plain text, since cutting formatted content in the middle breaks it.
    const room = this.roomLeft();
    const plain = data.getData('text/plain');
    const fits = room === null || countCharacters(plain) <= room;
    if (!fits) {
      const cut = truncateCharacters(plain, Math.max(room!, 0));
      if (room! > 0) {
        if (currentPre()) insertCode(cut);
        else document.execCommand('insertText', false, cut);
      }
      this.limitReached();
      return;
    }
    // Inside a code block always paste plain text: pasted HTML blocks would split the <pre> in two.
    if (currentPre()) {
      insertCode(plain);
      return;
    }
    const html = data.getData('text/html');
    if (!html) {
      document.execCommand('insertText', false, plain);
      return;
    }
    // Word, Google Docs and web pages: keep the meaningful formatting, drop the rest, and bring the images along.
    const prepared = preparePaste(html, data.getData('text/rtf'), this.pasteImages, !!this.adapter);
    document.execCommand('insertHTML', false, sanitize(prepared.html));
    this.tidyStyles();
    const found = this.placePlaceholders(prepared.images);
    this.snapFloatsToGutter();
    void this.importPastedImages(prepared.images, found, prepared.dropped);
  }

  /**
   * In Word a pull quote hangs over the gutter between two columns, with text on both sides. Text columns can't flow around
   * an object that straddles them, so a box inside the columns is put against the gutter instead: floated right when it is in
   * a column to the left of the middle, left when it is to the right of it. Which column a box lands in depends on how the text
   * flows, so this is measured after the content is in place (and again once the images have loaded).
   */
  private snapFloatsToGutter(): void {
    const view = this.container.ownerDocument.defaultView;
    if (!view) return;
    const snap = () => {
      this.content.querySelectorAll<HTMLElement>('div[style*="column-count"] > aside[style*="float"]').forEach((box) => {
        const block = box.parentElement as HTMLElement;
        const columns = columnsOf(block);
        if (columns < 2) return;
        const gap = parseFloat(view.getComputedStyle(block).columnGap) || 0;
        const blockRect = block.getBoundingClientRect();
        const boxRect = box.getBoundingClientRect();
        const columnWidth = (blockRect.width - gap * (columns - 1)) / columns;
        const index = Math.floor((boxRect.left + boxRect.width / 2 - blockRect.left) / (columnWidth + gap));
        const middle = (columns - 1) / 2;
        if (index < middle) box.style.cssFloat = 'right';
        else if (index > middle) box.style.cssFloat = 'left';
      });
    };
    view.requestAnimationFrame(() => {
      snap();
      view.requestAnimationFrame(snap); // a second pass: moving a box can change what flows where
    });
  }

  /** Swaps the markers `preparePaste` left in the HTML for visible "importing" placeholders. */
  private placePlaceholders(images: PendingImage[]): Map<number, HTMLElement> {
    const found = new Map<number, HTMLElement>();
    if (!images.length) return found;
    const doc = this.container.ownerDocument;
    const walker = doc.createTreeWalker(this.content, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n as Text).data.includes('')) nodes.push(n as Text);
    for (const node of nodes) {
      const parts: Node[] = [];
      let last = 0;
      for (const m of node.data.matchAll(MARKER)) {
        parts.push(doc.createTextNode(node.data.slice(last, m.index)));
        const span = doc.createElement('span');
        span.className = 'aurebesh-pending'; // removed again by the sanitizer if it is still there when you read the HTML
        span.contentEditable = 'false';
        span.setAttribute('data-label', this.t('ui.importingImage'));
        found.set(Number(m[1]), span);
        parts.push(span);
        last = (m.index ?? 0) + m[0].length;
      }
      parts.push(doc.createTextNode(node.data.slice(last)));
      node.replaceWith(...parts);
    }
    return found;
  }

  /**
   * Copies pasted images through the upload adapter, a few at a time, replacing each placeholder when its image is
   * ready. A remote image that can't be copied (blocked by CORS, too big...) stays a link to its source; an image from
   * Word's clipboard data has no source to fall back on and is removed. Problems are reported once, at the end.
   */
  private async importPastedImages(images: PendingImage[], found: Map<number, HTMLElement>, dropped: number): Promise<void> {
    let linked = 0;
    let failed = 0;
    if (images.length && this.adapter) {
      const adapter = this.adapter;
      this.pendingUploads++;
      this.showStatus(this.t('ui.importingImages', { count: String(images.length) }));
      const queue = images.map((item, i) => ({ item, place: found.get(i) }));
      const worker = async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          const { item, place } = next;
          try {
            const file = item.blob ? this.toFile(item.blob) : await this.fetchRemoteImage(item.src);
            this.swapPlaceholder(place, resultUrl(await adapter.upload(file, { kind: 'image' })), item.alt, item.width);
          } catch {
            if (item.kind === 'remote' && isSafeImageSrc(item.src)) {
              linked++;
              this.swapPlaceholder(place, item.src, item.alt, item.width);
            } else {
              failed++;
              place?.remove();
            }
          }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      if (--this.pendingUploads === 0) this.hideStatus();
      this.syncEmpty();
      this.snapFloatsToGutter(); // the images are in: the text may have flowed differently
      this.emit('change', this.getHTML());
    }
    const problems = [
      dropped && this.t('ui.imagesDropped', { count: String(dropped) }),
      failed && this.t('ui.imagesFailed', { count: String(failed) }),
      linked && this.t('ui.imagesLinked', { count: String(linked) }),
    ].filter(Boolean) as string[];
    if (problems.length) this.fail(new Error(problems.join(' ')));
  }

  private swapPlaceholder(place: HTMLElement | undefined, url: string, alt: string, widthPct?: number): void {
    if (!place?.isConnected) return; // the person deleted it meanwhile
    if (!isSafeImageSrc(url)) throw new Error('Unsupported image URL.');
    const img = this.container.ownerDocument.createElement('img');
    img.setAttribute('src', url);
    if (alt) img.setAttribute('alt', alt);
    if (widthPct && widthPct < 100) img.style.width = `${widthPct}%`;
    place.replaceWith(img);
  }

  private toFile(blob: Blob): File {
    const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1] || 'png';
    return new File([blob], `pasted-image.${ext}`, { type: blob.type });
  }

  private async fetchRemoteImage(url: string): Promise<File> {
    // No cookies and no referrer: a pasted image link must not identify this page or the person to its host.
    const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error(`Could not download the image (${res.status})`);
    const blob = await res.blob();
    if (!IMAGE_TYPES.includes(blob.type)) throw new Error('Not a supported image type');
    return this.toFile(blob);
  }
}
