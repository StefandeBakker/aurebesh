import { gridNavigation, rovingToolbar } from './a11y';
import { columnsOf, currentColumns } from './columns';
import { handleListKey } from './lists';
import { applyMarkdown, takeFenceLanguage } from './markdown';
import { shortcutFor, shortcutLabel } from './shortcuts';
import { DEFAULT_COLORS, SAFE_COLOR } from './colors';
import { CELL_TOOLS, COMMANDS, DEFAULT_QUICKBAR, DEFAULT_TOOLBAR, TABLE_TOOLS } from './commands';
import { cellBorder, currentTable } from './table';
import { Sidebar } from './sidebar';
import type { PanelDef } from './sidebar';
import { extendToolbar } from './plugin';
import type { AurebeshPlugin, PluginContext, PluginInstance } from './plugin';
import type { SanitizeExtension } from './sanitize';
import type { Shape } from './icons';
import { iconElement } from './icons';
import type { CommandDef } from './commands';
import { currentCodeLanguage, currentPre, handleCodeKey, insertCode, setCodeLanguage } from './codeblock';
import { CODE_LANGUAGES, isKnownLanguage } from './languages';
import { clearHighlights, highlightCode } from './highlight';
import { canOpenLink, currentLink, normalizeLink, openLink } from './inline';
import { DEFAULT_LABELS, LANGUAGES, resolveLanguage } from './labels';
import type { Labels } from './labels';
import { selectedImage } from './media';
import { currentCell, handleCellArrow, handleTab, trackCellDrag } from './table';
import { attachColumnResize } from './table-resize';
import { attachTableHandles } from './table-handles';
import { CALLOUT_ID, DEFAULT_CALLOUTS, calloutCss, currentCallout, handleCalloutKey, normalizeCallouts, setCallout } from './callouts';
import type { CalloutDef } from './callouts';
import { attachSlashMenu } from './slash';
import { handleSoftBreak } from './softbreak';
import { FindBar } from './find';
import { BlockHandle } from './blockhandle';
import { toDocx } from './docx';
import type { DocxPage } from './docx';
import { download, safeFilename } from './download';
import { BlockHistory } from './history';
import type { BlockKind } from './blockops';
import { WEIGHTS, currentWeight } from './weight';
import { DEFAULT_SIZES, applyPendingSize, currentSize } from './fontsize';
import { decorationLook } from './decoration';
import type { DecorationKind } from './decoration';
import { hasInline } from './clearformat';
import type { InlineKind } from './clearformat';
import { afterListInput, boxAt, handleTaskKey, toggleChecked } from './tasks';
import type { SlashItem } from './slash';
import { BLOCK_MIME, CONTENT, LAYOUTS, blockHtml, currentRow, deleteRow, handleLayoutKey, insertBlock, normalizeLayouts, rowGap, rowTemplate, selectSpot, setRow, spotAt, spotAtCaret, spotLine } from './blocks';
import type { Spot } from './blocks';
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
import { markdownToHtml, textToHtml } from './from-markdown';
import { ModeSwitch, parseModes } from './modes';
import type { ViewMode } from './modes';
import type { OutputFormat } from './export';
import { MARKER, preparePaste } from './paste';
import type { PasteImagePolicy, PendingImage } from './paste';
import { sanitize } from './sanitize';
import { CSS, HEADLESS_CSS } from './styles';

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

/** How the text is shown. Not part of the HTML. null is the default of the editor (or the stylesheet of the page). */
export interface Layout {
  /** The widest the text gets, in px; the text is centred in a wider editor. */
  textWidth: number | null;
  /** Space around the text, in px. */
  padding: number | null;
  /** Line height as a multiple of the font size. */
  lineHeight: number | null;
}

export interface AurebeshOptions {
  /** A handle beside the block under the pointer: drag it to move the block, click it for a menu (duplicate, move, delete, turn into). Default: on (not on a touch screen); false leaves it out. */
  blockHandles?: boolean;
  /** The name of the files that are exported (without the extension), and the title of the document in them. Default: 'document'. */
  exportName?: string;
  /** Find and replace: `Mod+F` and `Mod+H` open the bar, and the `find` item in the toolbar. Default: on; false leaves those keys to the browser. */
  find?: boolean;
  /**
   * No look of its own: the editor does not bring its colours, borders, fonts and sizes, only the few rules it needs to work (see
   * `HEADLESS_CSS`), so the page styles all of it. The markup, the class names (`aurebesh-*`) and the attributes stay the same.
   * It goes for the whole page: where one editor has the built-in look, the other editors on that page have it too.
   */
  headless?: boolean;
  /** The callout types (see `CalloutDef`); default: note, tip, important, warning and caution. Their colours can also be set with CSS variables. */
  callouts?: CalloutDef[];
  /** The slash menu: typing `/` at the start of a line lists what to insert (callouts, headings, lists...). Default: on when the toolbar has the `callout` item. */
  slash?: boolean;
  /**
   * The format of `value`, of what `getValue()` and `setValue()` use without a format, and of the `change` event: 'html' (default),
   * 'markdown' (a Markdown-first editor: you give it Markdown and get Markdown back) or the name of a format that a plugin adds.
   * `getHTML()` and `getMarkdown()` stay what they say.
   */
  valueFormat?: OutputFormat;
  /**
   * A switch in the footer between the editor and the source of its content: `true` for the editor, the HTML and the Markdown, or a list
   * such as `['editor', 'markdown']`. The HTML and the Markdown are shown as text that can be edited.
   */
  modes?: boolean | ViewMode[];
  /** The view to start in (needs `modes`). Default: the editor. */
  mode?: ViewMode;
  /** Plugins: modes and tools that are not part of the editor itself (see `AurebeshPlugin`). */
  plugins?: AurebeshPlugin[];
  /** The initial layout (see `Layout`); the 'layout' toolbar item opens a panel to change it. */
  layout?: Partial<Layout>;
  /** Most characters allowed (spaces count, line breaks don't). Typing and pasting stop at the limit. */
  /** Direction of the editor itself (toolbar and base alignment): 'ltr', 'rtl' or 'auto'. Default: the page's. */
  dir?: 'ltr' | 'rtl' | 'auto';
  maxLength?: number;
  /** Show a line under the text with the number of words and characters (and the limit, if there is one). */
  counter?: boolean;
  /**
   * The language of the texts of the editor: a code such as 'nl', 'de', 'fr', 'es' or 'en' (also a tag like 'nl-BE'). Default 'auto': the
   * `lang` of the element or the page, and without one the language of the browser; English when that is not built in.
   */
  language?: string;
  /** Override single texts of the editor (tooltips, popovers) or all of a language. See `LANGUAGES` and `DEFAULT_LABELS`. */
  labels?: Partial<Labels>;
  /** Image and video settings: where uploads are stored and whether links are allowed. */
  media?: MediaOptions;
  /** Swatches offered by the 'color' and 'highlight' toolbar items (hex or rgb()). Defaults to DEFAULT_COLORS. */
  colors?: string[];
  /** The sizes of the 'size' toolbar item, in points (8 and up). Default: 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72. */
  sizes?: number[];
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
   * Items in a small strip above the toolbar. Default: undo and redo when the default
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
  /** The view changed (through `setMode` or the switch in the footer). */
  mode: ViewMode;
  /** A setting of the layout panel changed (through `setLayout` or the panel). */
  layout: Layout;
  /** The panel of the sidebar that is open changed: its id, or null when the sidebar closed. */
  panel: string | null;
  /** What the toolbar shows changed: the selection moved, or the text did. Redraw your own buttons with `isActive()` and `isEnabled()`. */
  state: undefined;
  focus: undefined;
  blur: undefined;
  /** An upload failed or a link was rejected. */
  error: Error;
}

type Listener<T> = (payload: T) => void;

export class Aurebesh {
  readonly root: HTMLElement;
  readonly content: HTMLElement;
  /** The buttons of each command: more than one when a command is both in the quickbar and in the toolbar. */
  private buttons = new Map<string, HTMLButtonElement[]>();
  private listeners = new Map<string, Set<Listener<any>>>();
  private cleanup: Array<() => void> = [];
  private highlightTimer: ReturnType<typeof setTimeout> | undefined;
  private fonts: FontDef[];
  private fontSelects: HTMLSelectElement[] = [];
  private lastRange: Range | null = null;
  private tableTools: HTMLElement | null = null;
  private rowTools: HTMLElement | null = null;
  private rowSelects: { layout?: HTMLSelectElement; gap?: HTMLSelectElement } = {};
  private lastRow: HTMLElement | null = null;
  private blockLine: HTMLElement | null = null;
  private imageTools: HTMLElement | null = null;
  private imageAltInput: HTMLInputElement | null = null;
  private linkTools: HTMLElement | null = null;
  private linkUrl: HTMLElement | null = null;
  private linkOpen: HTMLButtonElement | null = null;
  private lastLink: HTMLAnchorElement | null = null;
  private linkForm: HTMLElement | null = null;
  private tip: HTMLElement | null = null;
  private fullscreen = false;
  private formLink: HTMLAnchorElement | null = null;
  private lastImage: HTMLImageElement | null = null;
  private sizeSelects: HTMLSelectElement[] = [];
  private sizes: number[] = DEFAULT_SIZES;
  private weightSelects: HTMLSelectElement[] = [];
  private codeLanguageSelects: HTMLSelectElement[] = [];
  private codeTools: HTMLElement | null = null;
  private findBar: FindBar | null = null;
  private blockHandle: BlockHandle | null = null;
  private exportName = 'document';
  private exportItems: HTMLButtonElement[] = [];
  private blockHistory!: BlockHistory;
  private findKeys = true;
  private columnsSelects: HTMLSelectElement[] = [];
  private cellBorderSelects: HTMLSelectElement[] = [];
  private sidebar: Sidebar | null = null;
  /** The ids of the panels that the toolbar can open. */
  private panelIds: string[] = [];
  /** The panel that was open last: the one the sidebar opens with. */
  private lastPanel: string | null = null;
  /** Plugins hear about typing and read-only once they are attached (what was set before, they read in `attach`). */
  private attached = false;
  /** The commands of the editor and of its plugins. */
  private commands: Record<string, CommandDef> = COMMANDS;
  private plugins: { def: AurebeshPlugin; inst: PluginInstance }[] = [];
  private sanitizers: SanitizeExtension[] = [];
  private extraIcons: Record<string, Shape[]> = {};
  private layoutInputs: { textWidth?: HTMLInputElement; padding?: HTMLInputElement; lineHeight?: HTMLSelectElement } = {};
  private layout: Layout = { textWidth: null, padding: null, lineHeight: null };
  private labels: Labels;
  private valueFormat: OutputFormat = 'html';
  private language = 'en';
  private modeSwitch: ModeSwitch | null = null;
  private calloutTypes: CalloutDef[] = DEFAULT_CALLOUTS;
  private calloutOptions: HTMLButtonElement[] = [];
  private clearOptions: { kind: string; button: HTMLButtonElement }[] = [];
  private lineOptions: { kind: DecorationKind; style: string; button: HTMLButtonElement }[] = [];
  private readOnlyState = false;
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
  private pageSelects: HTMLSelectElement[] = [];
  private pageSpec: PageSpec | null = null;
  private orientationButtons: HTMLButtonElement[] = [];

  constructor(private container: HTMLElement, options: AurebeshOptions = {}) {
    const doc = container.ownerDocument;
    const plugins = options.plugins ?? [];
    this.valueFormat = options.valueFormat ?? 'html';
    this.findKeys = options.find !== false;
    this.exportName = safeFilename(options.exportName);
    if (options.sizes) this.sizes = options.sizes.filter((n) => Number.isFinite(n) && n >= 8 && n <= 200);
    if (options.callouts) {
      this.calloutTypes = options.callouts.filter((t) => CALLOUT_ID.test(t.id));
      // the styles of the types the page gave: after the built-in ones, so that they win
      const sig = JSON.stringify(this.calloutTypes);
      // (a headless editor has no look of its own, and the page styles the callouts too: `calloutCss()` is there to start from)
      if (!options.headless && !Array.from(doc.head.querySelectorAll('style[data-aurebesh-callouts]')).some((s) => s.getAttribute('data-aurebesh-callouts') === sig)) {
        const style = doc.createElement('style');
        style.setAttribute('data-aurebesh-callouts', sig);
        style.textContent = calloutCss(this.calloutTypes);
        doc.head.appendChild(style);
      }
    }
    this.language = resolveLanguage(options.language, container);
    this.labels = { ...DEFAULT_LABELS, ...LANGUAGES[this.language], ...Object.assign({}, ...plugins.map((p) => p.labels)), ...options.labels } as Labels;
    this.commands = { ...COMMANDS };
    for (const p of plugins) {
      Object.assign(this.commands, p.commands);
      Object.assign(this.extraIcons, p.icons);
      if (p.sanitize) this.sanitizers.push(p.sanitize);
      for (const panel of p.panels ?? []) {
        this.commands[panel.id] ??= { name: panel.id, icon: panel.icon, label: panel.label ?? panel.title.slice(0, 2), title: panel.title, run: () => {} };
      }
    }
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

    for (const p of plugins) {
      if (p.css && !Array.from(doc.head.querySelectorAll('style[data-aurebesh-plugin]')).some((s) => s.getAttribute('data-aurebesh-plugin') === p.name)) {
        const style = doc.createElement('style');
        style.setAttribute('data-aurebesh-plugin', p.name);
        style.textContent = p.css;
        doc.head.appendChild(style);
      }
    }
    this.plugins = plugins.map((def) => ({ def, inst: def.setup(this.pluginContext()) }));
    this.markdown = options.markdownShortcuts ?? this.plugins.find((p) => p.inst.markdownShortcuts !== undefined)?.inst.markdownShortcuts ?? true;

    if (options.headless) {
      if (!doc.head.querySelector('style[data-aurebesh-headless]')) {
        const style = doc.createElement('style');
        style.setAttribute('data-aurebesh-headless', '');
        style.textContent = HEADLESS_CSS;
        doc.head.appendChild(style);
      }
      this.root.classList.add('aurebesh-headless');
    } else if (!doc.head.querySelector('style[data-aurebesh]')) {
      const style = doc.createElement('style');
      style.setAttribute('data-aurebesh', '');
      style.textContent = CSS;
      doc.head.appendChild(style);
    }

    const pluginToolbar = this.plugins.find((p) => p.inst.toolbar)?.inst.toolbar;
    const baseItems = options.toolbar ?? pluginToolbar ?? DEFAULT_TOOLBAR;
    const items = baseItems.length ? extendToolbar(baseItems, this.plugins.flatMap((p) => p.inst.toolbarExtend ?? [])) : baseItems;
    const quick = options.quickbar ?? (options.toolbar || pluginToolbar ? [] : DEFAULT_QUICKBAR);
    const commands = [...items, ...quick];
    // the panels there are: those with a button of their own in the toolbar, and with the `sidebar` item all of them
    const known = ['layout', 'blocks', ...plugins.flatMap((p) => (p.panels ?? []).map((panel) => panel.id))];
    this.panelIds = known.filter((id) => commands.includes('sidebar') || commands.includes(id));
    if (quick.length) this.buildQuickbar(quick);
    if (items.length) this.buildToolbar(items);
    this.buildContextualTools(commands);

    this.content = doc.createElement('div');
    this.content.className = 'aurebesh-content';
    this.content.setAttribute('role', 'textbox');
    this.content.setAttribute('aria-multiline', 'true');
    this.content.setAttribute('aria-label', this.t('ui.editor'));
    // The stage is the "desk" the sheet lies on when a page format is set; without one it is invisible.
    this.blockHistory = new BlockHistory(this.content);
    this.stage = doc.createElement('div');
    this.stage.className = 'aurebesh-stage';
    this.stage.appendChild(this.content);
    const panels: PanelDef[] = [];
    if (this.panelIds.includes('layout')) panels.push({ id: 'layout', title: this.t('ui.layout'), build: () => this.buildLayoutPanel() });
    if (this.panelIds.includes('blocks')) panels.push({ id: 'blocks', title: this.t('ui.blocks'), build: () => this.buildBlocksPanel() });
    for (const p of plugins) for (const panel of p.panels ?? []) if (this.panelIds.includes(panel.id)) panels.push(panel);
    if (panels.length) {
      // the text with the sidebar beside it
      const sidebar = new Sidebar(
        doc,
        this.t('ui.close'),
        (open) => {
          for (const id of panels.map((p) => p.id)) this.buttons.get(id)?.forEach((b) => b.setAttribute('aria-expanded', String(id === open)));
          this.buttons.get('sidebar')?.forEach((b) => b.setAttribute('aria-expanded', String(open !== null)));
          if (open) this.lastPanel = open;
          this.placeLinkTools();
          this.emit('panel', open);
        },
        (id) => (this.buttons.get(id)?.[0] ?? this.buttons.get('sidebar')?.[0])?.focus(),
      );
      this.sidebar = sidebar;
      for (const panel of panels) {
        sidebar.add(panel);
        this.buttons.get(panel.id)?.forEach((b) => b.setAttribute('aria-controls', sidebar.el.id));
      }
      this.buttons.get('sidebar')?.forEach((b) => b.setAttribute('aria-controls', sidebar.el.id));
      const body = doc.createElement('div');
      body.className = 'aurebesh-body';
      body.append(this.stage, sidebar.el);
      this.root.appendChild(body);
    } else {
      this.root.appendChild(this.stage);
    }

    this.counterEl = doc.createElement('div');
    this.counterEl.className = 'aurebesh-count';
    this.counterEl.hidden = true;
    // the footer: the numbers on the left, the switch between the views on the right
    const footer = doc.createElement('div');
    footer.className = 'aurebesh-footer';
    footer.appendChild(this.counterEl);
    const modes = parseModes(options.modes);
    if (modes.length) {
      this.modeSwitch = new ModeSwitch(
        {
          doc,
          stage: this.stage,
          content: this.content,
          read: (mode) => (mode === 'html' ? this.getHTML() : this.getMarkdown()),
          write: (mode, text) => (mode === 'html' ? this.setHTML(text) : this.setMarkdown(text)),
          changed: () => this.emitChange(),
          modeChanged: (mode) => this.emit('mode', mode),
          lossy: () => this.clean(markdownToHtml(this.getMarkdown())) !== this.getHTML(),
          warn: (message) => this.showStatus(message),
          isReadOnly: () => this.readOnlyState,
          t: (key) => this.t(key),
          setToolsEnabled: (enabled) => this.root.querySelectorAll('.aurebesh-toolbar, .aurebesh-quickbar').forEach((bar) => ((bar as HTMLElement).inert = !enabled)),
        },
        modes,
      );
      footer.appendChild(this.modeSwitch.el);
    }
    if (options.blockHandles !== false) {
      this.root.classList.add('aurebesh-has-handles');
      this.blockHandle = new BlockHandle({
        content: this.content,
        stage: this.stage,
        t: (key) => this.t(key),
        label: (kind) => this.blockLabel(kind),
        active: () => this.content.isContentEditable && (!this.modeSwitch || this.modeSwitch.mode === 'editor'),
        run: (change) => this.runChange(change),
        line: (spot) => this.showBlockLine(spot),
        calloutType: () => this.calloutTypes[0]?.id ?? 'note',
      });
    }
    this.root.appendChild(footer);
    this.floatPops();
    this.maxLength = options.maxLength && options.maxLength > 0 ? Math.floor(options.maxLength) : null;
    this.counterEl.hidden = !options.counter;

    this.setPlaceholder(options.placeholder ?? '');
    this.setReadOnly(options.readOnly ?? false);
    if (options.value) this.content.innerHTML = this.clean(this.toHtml(options.value, this.valueFormat));
    this.syncEmpty();
    if (options.mode) this.modeSwitch?.set(options.mode);

    this.listen(this.content, 'input', (e) => {
      afterListInput((e as InputEvent).inputType ?? '');
      // Deleting an embed leaves its empty wrapper behind.
      this.content.querySelectorAll(':scope > div:empty').forEach((d) => d.remove());
      // a list that the browser made inside a paragraph (the list button on a paragraph) takes the place of it
      this.content.querySelectorAll(':scope > p > :is(ul, ol)').forEach((list) => {
        const p = list.parentElement!;
        if (p.children.length !== 1 || Array.from(p.childNodes).some((n) => n !== list && n.textContent!.trim())) return;
        // moving it must not move the caret
        const sel = this.container.ownerDocument.getSelection();
        const keep = sel?.rangeCount && sel.anchorNode ? [sel.anchorNode, sel.anchorOffset, sel.focusNode!, sel.focusOffset] as const : null;
        p.replaceWith(list);
        if (keep) sel!.setBaseAndExtent(keep[0], keep[1], keep[2], keep[3]);
      });
      normalizeLayouts(this.content);
      normalizeCallouts(this.content);
      if (!(e as InputEvent).inputType?.startsWith('history')) this.blockHistory.edited();
      applyPendingSize();
      this.findBar?.refresh();
      this.syncEmpty();
      this.plugins.forEach((p) => p.inst.input?.());
      this.emitChange();
    });
    // the box of a task: a click checks or unchecks it, and leaves the caret where it was
    this.listen(this.content, 'mousedown', (e) => {
      if (!this.content.isContentEditable) return;
      const li = boxAt(e as MouseEvent);
      if (!li) return;
      e.preventDefault();
      toggleChecked(li);
      this.emitChange();
    });
    this.listen(this.content, 'focus', () => this.emit('focus', undefined));
    this.listen(this.content, 'blur', () => this.emit('blur', undefined));
    this.listen(this.content, 'keydown', (e) => this.onKeyDown(e as KeyboardEvent));
    this.listen(this.content, 'paste', (e) => this.onPaste(e as ClipboardEvent));
    this.listen(this.content, 'beforeinput', (e) => this.onBeforeInput(e as InputEvent));
    this.listen(this.content, 'dragover', (e) => {
      const drag = e as DragEvent;
      if (drag.dataTransfer?.types.includes(BLOCK_MIME)) {
        if (!this.content.isContentEditable) return;
        e.preventDefault(); // a block can be dropped here
        const spot = spotAt(this.content, drag.clientX, drag.clientY);
        this.showBlockLine(spot);
        return;
      }
      // Files are taken by the editor, anything else only when a plugin says it wants it (it then gets the `drop`).
      if (drag.dataTransfer?.types.includes('Files') || this.plugins.some((p) => p.inst.dragover?.(drag))) e.preventDefault();
    });
    this.listen(this.content, 'dragleave', () => this.showBlockLine(null));
    this.listen(this.content.ownerDocument, 'dragend', () => this.showBlockLine(null));
    this.listen(this.content, 'drop', (e) => this.onDrop(e as DragEvent));
    this.listen(this.content, 'click', (e) => this.onClick(e as MouseEvent));
    this.listen(doc, 'selectionchange', () => this.updateToolbar());
    // Escape leaves full screen, unless it is closing a popover
    this.listen(this.root, 'keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape' && this.fullscreen && !this.root.querySelector('.aurebesh-table-pop:not([hidden])')) this.setFullscreen(false);
    });
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
          this.emitChange();
          this.updateToolbar();
        },
      ),
    );

    if (options.slash ?? commands.includes('callout')) {
      this.cleanup.push(attachSlashMenu({ content: this.content, items: () => this.slashItems(), t: (key) => this.t(key), canEdit: () => this.content.isContentEditable }));
    }

    if (commands.includes('table')) {
      this.cleanup.push(
        attachTableHandles({
          content: this.content,
          stage: this.stage,
          canEdit: () => this.content.isContentEditable,
          changed: () => {
            this.emitChange();
            this.updateToolbar();
          },
          focus: () => this.content.focus(),
          warn: (message) => this.showStatus(message, true),
          t: (key) => this.t(key),
        }),
      );
    }

    this.statusEl = doc.createElement('div');
    this.statusEl.className = 'aurebesh-status';
    this.statusEl.setAttribute('role', 'status');
    this.statusEl.hidden = true;
    this.root.appendChild(this.statusEl);
    for (const p of this.plugins) {
      try {
        p.inst.attach?.();
      } catch (err) {
        this.fail(err);
      }
    }
    this.attached = true;

    try {
      this.setPage(options.page);
    } catch (err) {
      this.fail(err); // a wrong format leaves the editor responsive, and says why
    }
    if (options.layout) this.setLayout(options.layout);

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

  private printHTML(heightPx?: number, title?: string): string {
    const doc = this.container.ownerDocument;
    const style = doc.defaultView!.getComputedStyle(this.content);
    const clean = (v: string) => v.replace(/[<>{};]/g, '');
    const font = `font-family:${clean(style.fontFamily)};font-size:${clean(style.fontSize)};line-height:${clean(style.lineHeight)}`;
    const h = heightPx ?? (this.page && !this.page.height ? this.content.offsetHeight : undefined);
    return printDocument(this.page, this.getHTML(), CSS, font, h, title ?? this.exportName);
  }

  /**
   * A standalone HTML document of the content with the page format as `@page` size and margins: for printing, or for
   * turning into a PDF on a server (Puppeteer, Playwright: `page.pdf({ preferCSSPageSize: true })`). Code colours are not
   * included. For continuous paper (a ticket) the length is taken from the editor's own content.
   */
  getPrintHTML(title?: string): string {
    return this.printHTML(undefined, title);
  }

  /** Opens the print dialog for the content on the current paper (choose "Save as PDF" there for a PDF). */
  print(title?: string): Promise<void> {
    const doc = this.container.ownerDocument;
    const frame = doc.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    frame.srcdoc = this.printHTML(undefined, title);
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
    for (const btn of this.orientationButtons) {
      btn.disabled = this.content.getAttribute('aria-readonly') === 'true' || !this.page?.height;
      btn.setAttribute('aria-pressed', String(!!this.page?.landscape));
    }
    const name = this.page?.name ?? 'responsive';
    for (const select of this.pageSelects) {
      select.querySelector('option[value="custom"]')?.remove();
      if (name === 'custom') {
        const opt = select.ownerDocument.createElement('option');
        opt.value = 'custom';
        opt.textContent = this.t('page.custom');
        select.appendChild(opt);
      }
      select.value = name;
    }
    // on a sheet the width and the space around the text are the sheet's own
    for (const input of [this.layoutInputs.textWidth, this.layoutInputs.padding]) if (input) input.disabled = !!this.page;
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
    // the undo and redo of the browser (its keys and its menu): a change that the editor made itself goes first, when it is its turn
    if (e.inputType === 'historyUndo' && this.blockHistory.canUndo()) {
      e.preventDefault();
      this.undo();
      return;
    }
    if (e.inputType === 'historyRedo' && this.blockHistory.canRedo()) {
      e.preventDefault();
      this.redo();
      return;
    }
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
    this.modeSwitch?.flush(); // what was typed in the HTML or Markdown view counts
    return this.isEmpty() ? '' : this.clean(this.content.innerHTML);
  }

  /** The content as Markdown (GitHub flavour); '' when empty. Underline and sub/superscript stay inline HTML; colours, fonts and columns are dropped. */
  getMarkdown(): string {
    return this.isEmpty() ? '' : toMarkdown(this.getHTML());
  }

  /** The content in the given format: 'html', 'markdown' or 'text' (default: the `valueFormat` option, 'html' unless set). */
  getValue(format: OutputFormat = this.valueFormat): string {
    for (const p of this.plugins) {
      const out = p.inst.output?.[format];
      if (out) return out();
    }
    if (format === 'markdown') return this.getMarkdown();
    if (format === 'text') return this.isEmpty() ? '' : this.getText();
    return this.getHTML();
  }

  /**
   * Sets the content from Markdown (GitHub flavour). It is read as in `toMarkdown`'s other direction and sanitized like any HTML, so
   * Markdown that holds HTML cannot bring anything unsafe in. Like `setHTML` it does not send `change`.
   */
  setMarkdown(markdown: string): void {
    this.setHTML(markdownToHtml(markdown));
  }

  /**
   * Sets the content from a value: 'html', 'markdown', 'text' (blocks of lines become paragraphs, nothing is read as markup), or a
   * format that a plugin reads (its `load`, the other side of its `output`). Default: the `valueFormat` option.
   */
  setValue(value: string, format: OutputFormat = this.valueFormat): void {
    this.setHTML(this.toHtml(value, format));
  }

  /** HTML for a value of a format. */
  private toHtml(value: string, format: OutputFormat): string {
    for (const p of this.plugins) {
      const load = p.inst.load?.[format];
      if (load) return load(value);
    }
    if (format === 'html') return value;
    if (format === 'markdown') return markdownToHtml(value);
    if (format === 'text') return textToHtml(value);
    throw new Error(`Aurebesh: no plugin reads the format "${format}"`);
  }

  /** What `change` sends: the content in the `valueFormat`. */
  private emitChange(): void {
    this.emit('change', this.getValue(this.valueFormat));
  }

  private onKeyDown(e: KeyboardEvent): void {
    // While an input method (Chinese, Japanese, Korean...) is composing, Enter/Tab/Space belong to it.
    if (e.isComposing || e.keyCode === 229) return;
    if (this.plugins.some((p) => p.inst.keydown?.(e))) return;

    if (this.blockHandle?.handleKey(e)) {
      this.syncEmpty();
      this.emitChange();
      return;
    }
    // Mod+Z and Mod+Shift+Z / Mod+Y: a change that the editor made itself, when it is its turn
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.isComposing && ['KeyZ', 'KeyY'].includes(e.code)) {
      const redo = e.code === 'KeyY' || e.shiftKey;
      if (redo ? this.blockHistory.canRedo() : this.blockHistory.canUndo()) {
        e.preventDefault();
        if (redo) this.redo();
        else this.undo();
        return;
      }
    }
    const shortcut = shortcutFor(e);
    if (shortcut && (shortcut === 'find' || shortcut === 'findReplace') && !this.findKeys) return; // the browser's own find
    if (shortcut) {
      if (shortcut === 'link') {
        const link = this.buttons.get('link')?.[0];
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
        const language = takeFenceLanguage();
        if (language && command === 'codeblock') {
          setCodeLanguage(language);
          this.scheduleHighlight();
          this.emitChange();
        }
        return;
      }
    }

    if (handleCellArrow(e)) return; // moving the caret, not changing the text
    if (handleSoftBreak(e, this.content)) {
      this.syncEmpty();
      this.emitChange();
      return;
    }
    if (handleTaskKey(e) !== null) {
      this.emitChange();
      return;
    }
    if (handleLayoutKey(e, this.content)) return; // Backspace at the start of a column would take the layout apart
    // in a callout, Backspace and Enter change the DOM themselves: in the history of the editor
    if ((e.key === 'Backspace' || e.key === 'Enter') && currentCallout(this.content)) {
      let handled = false;
      this.runChange(() => (handled = handleCalloutKey(e, this.content)));
      if (handled) return;
    }
    if (handleListKey(e) || handleTab(e) || handleCodeKey(e)) this.emitChange();
  }

  setHTML(html: string): void {
    this.blockHistory.clear(); // what was done before is of another text
    this.content.innerHTML = this.clean(html);
    this.syncEmpty();
    this.scheduleHighlight();
    this.updateStats();
    if (this.attached) this.plugins.forEach((p) => p.inst.input?.());
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
    this.readOnlyState = readOnly;
    this.content.contentEditable = readOnly ? 'false' : 'true';
    this.content.setAttribute('aria-readonly', String(readOnly));
    this.buttons.forEach((list) => list.forEach((b) => (b.disabled = readOnly)));
    this.fontSelects.forEach((s) => (s.disabled = readOnly));
    this.sizeSelects.forEach((s) => (s.disabled = readOnly));
    this.findBar?.refresh();
    this.codeLanguageSelects.forEach((s) => (s.disabled = readOnly || !currentPre()));
    this.weightSelects.forEach((s) => (s.disabled = readOnly));
    this.orientationButtons.forEach((b) => (b.disabled = readOnly || !this.page?.height));
    this.columnsSelects.forEach((s) => (s.disabled = readOnly));
    this.cellBorderSelects.forEach((s) => (s.disabled = readOnly));
    if (this.attached) this.plugins.forEach((p) => p.inst.readOnlyChanged?.());
    this.modeSwitch?.sync();
    this.updateToolbar();
  }

  /** The language of the texts of the editor, as it was worked out: 'en', 'nl', 'de', 'fr' or 'es'. */
  getLanguage(): string {
    return this.language;
  }

  /** The view: 'editor', 'html' or 'markdown' (the last two need the `modes` option). */
  getMode(): ViewMode {
    return this.modeSwitch?.mode ?? 'editor';
  }

  setMode(mode: ViewMode): void {
    this.modeSwitch?.set(mode);
  }

  setPlaceholder(text: string): void {
    this.content.setAttribute('data-placeholder', text);
    if (text) this.content.setAttribute('aria-placeholder', text);
    else this.content.removeAttribute('aria-placeholder');
  }

  /** Run a toolbar command by name, e.g. editor.exec('bold'). */
  /** The names of the commands: what `exec()` takes (also those of the plugins). */
  listCommands(): string[] {
    return Object.keys(this.commands);
  }

  /** Whether a command is on at the selection (bold in bold text, a list in a list). For your own buttons. */
  isActive(name: string): boolean {
    const cmd = this.commands[name];
    if (!cmd) return false;
    if (name === 'fullscreen') return this.fullscreen;
    const sel = this.container.ownerDocument.getSelection();
    const inside = !!sel && sel.rangeCount > 0 && this.content.contains(sel.anchorNode);
    return inside && (cmd.isActive?.() ?? false);
  }

  /** Whether a command can be used at the selection (a table command outside a table cannot). False in a read-only editor. */
  isEnabled(name: string): boolean {
    const cmd = this.commands[name];
    if (!cmd || !this.content.isContentEditable) return false;
    if (!cmd.isEnabled) return true;
    const sel = this.container.ownerDocument.getSelection();
    return !!sel && sel.rangeCount > 0 && this.content.contains(sel.anchorNode) && cmd.isEnabled();
  }

  /**
   * Shows the bar to find and replace, with the selected text (or `query`) as the text to find. `replace` shows the row to replace
   * with. Not in the HTML and Markdown views, where there is no text of the editor to search.
   */
  openFind(options: { query?: string; replace?: boolean } = {}): void {
    if (this.modeSwitch && this.modeSwitch.mode !== 'editor') return;
    if (!this.findBar) {
      this.findBar = new FindBar({
        content: this.content,
        root: this.root,
        before: () => this.root.querySelector('.aurebesh-body'),
        t: (key, vars) => this.t(key, vars),
        canEdit: () => this.content.isContentEditable,
        run: (change) => this.runChange(change),
        changed: () => {
          this.syncEmpty();
          this.emitChange();
        },
        restore: (html) => {
          this.content.innerHTML = html;
          this.syncEmpty();
          this.emitChange();
        },
      });
    }
    this.findBar.open(options);
  }

  /**
   * Does a change of the DOM that a browser has no undo for (moving blocks, replace all), and keeps it in the history of the editor: undo
   * and redo (the keys, the buttons, the menu of the browser) take it back and do it again when the text is as the change left it.
   */
  private runChange(change: () => void): void {
    if (!this.content.isContentEditable) return;
    if (this.blockHistory.run(change)) {
      this.syncEmpty();
      this.emitChange();
      this.updateToolbar();
    }
  }

  /** Undo: a change that the editor made itself when it is the turn of that, else the undo of the browser. */
  undo(): void {
    this.content.focus();
    if (this.blockHistory.undo()) {
      this.syncEmpty();
      this.emitChange();
      this.updateToolbar();
    } else document.execCommand('undo');
  }

  redo(): void {
    this.content.focus();
    if (this.blockHistory.redo()) {
      this.syncEmpty();
      this.emitChange();
      this.updateToolbar();
    } else document.execCommand('redo');
  }

  /** The page of the editor as the page of a Word document (in millimetres), or null for a responsive editor. */
  private docxPage(): Partial<DocxPage> | null {
    const mm = (css: string | null | undefined): number | undefined => {
      const m = /^([\d.]+)(mm|cm|in|px|pt)$/.exec((css ?? '').trim());
      if (!m) return undefined;
      const n = parseFloat(m[1]);
      return m[2] === 'mm' ? n : m[2] === 'cm' ? n * 10 : m[2] === 'in' ? n * 25.4 : m[2] === 'pt' ? (n * 25.4) / 72 : (n * 25.4) / 96;
    };
    if (!this.page) return null;
    return { width: mm(this.page.width), height: mm(this.page.height), margin: mm(this.page.margin) };
  }

  /** The content as a Word document (.docx). Pictures that are not in the HTML itself are fetched, which needs the host to allow it. */
  toDocx(options: { title?: string; images?: boolean } = {}): Promise<Blob> {
    const style = this.container.ownerDocument.defaultView?.getComputedStyle(this.content);
    const family = style?.fontFamily?.split(',')[0]?.replace(/["']/g, '').trim();
    const generic = !family || /^(?:system-ui|ui-.*|-apple-system|sans-serif|serif|monospace|inherit)$/i.test(family);
    const size = style ? Math.round(parseFloat(style.fontSize) * 0.75 * 2) / 2 : 0;
    return toDocx(this.getHTML(), {
      title: options.title ?? this.exportName,
      page: this.docxPage(),
      font: generic ? undefined : family,
      fontSize: size > 6 && size < 40 ? size : undefined,
      images: options.images,
    });
  }

  /** The formats that `export()` has: the built-in ones and what the plugins write. */
  exportFormats(): string[] {
    const own = ['pdf', 'docx', 'html', 'markdown', 'text'];
    const more = this.plugins.flatMap((p) => [...Object.keys(p.inst.export ?? {}), ...Object.keys(p.inst.output ?? {})]);
    return [...own, ...more.filter((f, i) => !own.includes(f) && more.indexOf(f) === i)];
  }

  /**
   * Saves the content as a file: `'docx'` (Word), `'html'` (a page that looks as the editor does, with the page format as its paper),
   * `'markdown'`, `'text'`, or a format that a plugin writes. `'pdf'` opens the print dialog on the content on its paper, where
   * `Save as PDF` makes the file (the browser has no other way to make a PDF without a library). `filename` is without the extension.
   */
  async export(format: OutputFormat, options: { filename?: string; title?: string } = {}): Promise<void> {
    const doc = this.container.ownerDocument;
    const name = safeFilename(options.filename ?? this.exportName);
    const title = options.title ?? name;
    try {
      this.modeSwitch?.flush();
      // a plugin that writes the format makes the file itself
      const made = this.plugins.map((p) => p.inst.export?.[format]).find(Boolean);
      if (made) {
        const file = await made();
        download(doc, file, `${name}.${format}`, 'text/plain;charset=utf-8');
        return;
      }
      if (format === 'pdf') return await this.print(title);
      if (format === 'docx') {
        download(doc, await this.toDocx({ title }), `${name}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      } else if (format === 'html') download(doc, this.getPrintHTML(title), `${name}.html`, 'text/html;charset=utf-8');
      else if (format === 'markdown') download(doc, this.getMarkdown(), `${name}.md`, 'text/markdown;charset=utf-8');
      else if (format === 'text') download(doc, this.isEmpty() ? '' : this.getText(), `${name}.txt`, 'text/plain;charset=utf-8');
      else if (this.exportFormats().includes(format)) download(doc, this.getValue(format), `${name}.${format}`, 'text/plain;charset=utf-8');
      else throw new Error(`Aurebesh: no export format "${format}"`);
    } catch (err) {
      this.fail(err);
    }
  }

  /** The button with the list of the formats that the content can be saved as. */
  private buildExportMenu(cmd: CommandDef): HTMLElement {
    const doc = this.container.ownerDocument;
    const wrap = doc.createElement('span');
    wrap.className = 'aurebesh-table-picker';
    const toggle = this.makeButton(cmd, (e) => {
      pop.hidden = !pop.hidden;
      if (!pop.hidden && e.detail === 0) (pop.querySelector('button') as HTMLElement | null)?.focus();
    });
    toggle.setAttribute('aria-haspopup', 'menu');
    const pop = doc.createElement('div');
    pop.className = 'aurebesh-table-pop aurebesh-export-pop';
    pop.hidden = true;
    pop.setAttribute('role', 'menu');
    pop.setAttribute('aria-label', this.title(cmd));
    const label = (format: string) => (['pdf', 'docx', 'html', 'markdown', 'text'].includes(format) && !this.plugins.some((p) => p.inst.export?.[format]) ? this.t(`ui.export.${format}`) : format);
    for (const format of this.exportFormats()) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'aurebesh-export-item';
      b.setAttribute('role', 'menuitem');
      b.dataset.format = format;
      b.textContent = label(format);
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', async () => {
        pop.hidden = true;
        b.setAttribute('aria-busy', 'true');
        try {
          await this.export(format);
        } finally {
          b.removeAttribute('aria-busy');
        }
      });
      pop.appendChild(b);
      this.exportItems.push(b);
    }
    pop.addEventListener('keydown', (e) => {
      const items = Array.from(pop.querySelectorAll('button'));
      const at = items.indexOf(doc.activeElement as HTMLButtonElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }
    });
    this.closeOnOutside(wrap, pop, toggle);
    wrap.append(toggle, pop);
    return wrap;
  }

  /** The name of a kind of block, in the menu of the handle. */
  private blockLabel(kind: BlockKind): string {
    const names: Record<BlockKind, string> = { p: this.t('ui.block.paragraph'), h1: 'h1', h2: 'h2', h3: 'h3', ul: 'ul', ol: 'ol', task: 'task', quote: 'quote', code: 'codeblock', callout: 'callout' };
    return kind === 'p' ? names.p : this.title(this.commands[names[kind]]);
  }

  /** Closes the bar to find and replace. */
  closeFind(): void {
    this.findBar?.close();
  }

  exec(name: string, arg?: string, extra?: string): void {
    if (name === 'export') {
      if (arg) void this.export(arg);
      return;
    }
    if (name === 'undo' || name === 'redo') {
      if (name === 'undo') this.undo();
      else this.redo();
      this.updateToolbar();
      return;
    }
    if (name === 'findReplace' || name === 'find') {
      this.openFind({ replace: name === 'findReplace' || arg === 'replace' });
      return;
    }
    const cmd = this.commands[name];
    if (!cmd) throw new Error(`Aurebesh: unknown command "${name}"`);
    // the callout button is a list built here: exec('callout', 'warning') does what a choice in it does, '' or 'none' takes the callout away
    if (name === 'callout') {
      this.applyCallout(arg && arg !== 'none' ? arg : null);
      return;
    }
    const hadFocus = this.content.ownerDocument.activeElement === this.content;
    this.content.focus();
    // Focusing from a popover input or the font select moves the caret to the start: put it back.
    if (!hadFocus) this.restoreSelection();
    if (cmd.domEdit) this.blockHistory.run(() => cmd.run(arg, extra));
    else cmd.run(arg, extra);
    this.tidyStyles();
    this.syncEmpty();
    this.emitChange();
    this.updateToolbar();
  }

  on<K extends keyof AurebeshEvents>(event: K, fn: Listener<AurebeshEvents[K]>): () => void;
  /** An event of a plugin. */
  on(event: string, fn: Listener<any>): () => void;
  on(event: string, fn: Listener<any>): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(fn);
    // Someone who registers after the editor is ready still gets `ready`, once.
    if (event === 'ready' && this.isReady) queueMicrotask(() => fn(this));
    if (event === 'count') this.updateStats();
    return () => set.delete(fn);
  }

  destroy(): void {
    this.plugins.forEach((p) => p.inst.destroy?.());
    clearTimeout(this.highlightTimer);
    clearHighlights(this.content);
    this.findBar?.destroy();
    this.blockHandle?.destroy();
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    this.listeners.clear();
    this.root.remove();
  }

  /** An event of a plugin (any name). */
  private emitAny(event: string, payload: unknown): void {
    this.listeners.get(event)?.forEach((fn) => fn(payload));
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

  /**
   * A toolbar that scrolls sideways (on a narrow screen) would cut off its dropdowns, so while it does they are fixed to the window,
   * under their button, and they close when the toolbar is scrolled.
   */
  private floatPops(): void {
    const win = this.root.ownerDocument.defaultView;
    if (!win?.MutationObserver) return;
    const clear = (pop: HTMLElement) => {
      delete pop.dataset.floated;
      for (const p of ['position', 'left', 'top', 'margin', 'max-height', 'overflow-y', 'inset-inline-start']) pop.style.removeProperty(p);
    };
    const observer = new win.MutationObserver((records) => {
      for (const record of records) {
        const pop = record.target as HTMLElement;
        if (!pop.matches('.aurebesh-table-pop')) continue;
        const bar = pop.closest('.aurebesh-toolbar');
        if (pop.hidden || !bar || win.getComputedStyle(bar).overflowX === 'visible') {
          if (pop.dataset.floated) clear(pop);
          continue;
        }
        const anchor = (pop.parentElement ?? pop).getBoundingClientRect();
        const width = pop.offsetWidth;
        const top = Math.round(anchor.bottom + 4);
        pop.dataset.floated = '1';
        pop.style.position = 'fixed';
        pop.style.margin = '0';
        pop.style.insetInlineStart = 'auto';
        pop.style.left = `${Math.round(Math.max(8, Math.min(anchor.left, win.innerWidth - width - 8)))}px`;
        pop.style.top = `${top}px`;
        pop.style.maxHeight = `${Math.max(120, win.innerHeight - top - 8)}px`;
        pop.style.overflowY = 'auto';
      }
    });
    observer.observe(this.root, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
    this.cleanup.push(() => observer.disconnect());
    this.listen(
      this.root,
      'scroll',
      (e) => {
        if ((e.target as HTMLElement).classList?.contains('aurebesh-toolbar')) this.root.querySelectorAll<HTMLElement>('[data-floated]').forEach((p) => (p.hidden = true));
      },
      true,
    );
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
      const control = this.buildToolbarItem(item); // the same control as in the toolbar: a picker stays a picker
      if (control) bar.appendChild(control);
    }
    this.root.appendChild(bar);
    rovingToolbar(bar, () => this.content.focus());
  }

  /** One toolbar item as an element, or null for a name that is not a command (or an upload that is not available). */
  private buildToolbarItem(item: string): HTMLElement | null {
    for (const p of this.plugins) {
      const own = p.inst.buildItem?.(item);
      if (own !== undefined) return own;
    }
    const cmd = this.commands[item];
    if (!cmd) return null;
    if (item === 'callout') return this.buildCalloutPicker(cmd);
    if (item === 'strikeStyle') return this.buildLinePicker(cmd, 'strike');
    if (item === 'underlineStyle') return this.buildLinePicker(cmd, 'underline');
    if (item === 'clearStyle') return this.buildClearPicker(cmd);
    if (item === 'sidebar') return this.buildSidebarToggle(cmd);
    if (this.panelIds.includes(item)) return this.buildPanelButton(cmd);
    if (item === 'font') return this.buildFontSelect();
    if (item === 'size') return this.buildSizeSelect();
    if (item === 'weight') return this.buildWeightSelect();
    if (item === 'export') return this.buildExportMenu(cmd);
    if (item === 'codeLanguage') return this.buildCodeLanguageSelect();
    if (item === 'columns') return this.buildColumnsSelect();
    if (item === 'orientation') return this.buildOrientationButton();
    if (item === 'fullscreen') return this.makeButton(cmd, () => this.setFullscreen(!this.fullscreen));
    if (item === 'page') return this.buildPageSelect();
    if (item === 'link') return this.buildLinkPicker(cmd);
    if (item === 'color') return this.buildColorPicker(cmd, 'inherit', this.t('ui.automatic'));
    if (item === 'highlight') return this.buildColorPicker(cmd, 'transparent', this.t('ui.noHighlight'));
    if (item === 'table') return this.buildTablePicker();
    if (item === 'image' || item === 'video') return this.buildMediaPicker(item, cmd);
    return this.makeButton(cmd);
  }

  /**
   * The toolbar is blocks: `|` starts a new block and `/` a new row inside the block, so a
   * block can be two rows of buttons on top of each other. A block moves as a whole when the toolbar is narrow, it is never cut in two.
   * Without any `/` every block is a single row, which wraps like before.
   */
  private buildToolbar(items: string[]): void {
    const doc = this.container.ownerDocument;
    const bar = doc.createElement('div');
    bar.className = 'aurebesh-toolbar';
    bar.setAttribute('role', 'toolbar');
    const groups: HTMLElement[][][] = [[[]]]; // blocks of rows of elements
    const labels = new Map<HTMLElement[][], string>(); // the name above a block
    const atEnd = new Set<HTMLElement[][]>(); // blocks that go to the far end of the toolbar
    for (const item of items) {
      const group = groups[groups.length - 1];
      if (item === '|' || item === '>') {
        if (item === '>') atEnd.add(group.some((row) => row.length) ? (groups.push([[]]), groups[groups.length - 1]) : group);
        else if (group.some((row) => row.length)) groups.push([[]]);
        continue;
      }
      if (item.startsWith('#')) {
        labels.set(group, item.slice(1).trim());
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
      let filled = rows.filter((row) => row.length);
      if (!filled.length) continue;
      // a named block with more than three buttons and no rows of its own (no `/`) goes to the next line after every three
      if (labels.has(rows) && filled.length === 1 && filled[0].length > 3) {
        const all = filled[0];
        filled = Array.from({ length: Math.ceil(all.length / 3) }, (_, i) => all.slice(i * 3, i * 3 + 3));
      }
      const block = doc.createElement('div');
      block.className = 'aurebesh-group';
      block.setAttribute('role', 'group');
      const label = labels.get(rows);
      if (label) {
        // like the groups of a ribbon: the name of the block above its buttons
        const name = doc.createElement('div');
        name.className = 'aurebesh-group-label';
        name.setAttribute('aria-hidden', 'true');
        name.textContent = label;
        block.setAttribute('aria-label', label);
        block.appendChild(name);
        this.root.classList.add('aurebesh-ribbon');
      }
      if (atEnd.has(rows)) block.classList.add('aurebesh-group-end');
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
  }

  private buildContextualTools(commands: string[]): void {
    const doc = this.container.ownerDocument;
    if (commands.includes('table')) {
      const tools = doc.createElement('div');
      tools.className = 'aurebesh-toolbar aurebesh-table-tools';
      tools.setAttribute('role', 'toolbar');
      tools.setAttribute('aria-label', this.t('ui.tableTools'));
      tools.hidden = true;
      for (const name of TABLE_TOOLS) tools.appendChild(this.makeButton(COMMANDS[name]));
      // the look of the selected cells: background, border, how the text sits, and the caption
      tools.appendChild(this.buildColorPicker(COMMANDS.cellBackground, '', this.t('ui.noFill')));
      tools.appendChild(this.buildCellBorder());
      tools.appendChild(this.buildColorPicker(COMMANDS.cellBorderColor, '', this.t('ui.defaultBorderColor')));
      for (const name of CELL_TOOLS) tools.appendChild(this.makeButton(COMMANDS[name]));
      this.tableTools = tools;
      this.root.appendChild(tools);
      rovingToolbar(tools, () => this.content.focus());
    }

    if (this.panelIds.includes('blocks')) this.buildRowTools();
    if (commands.includes('image')) this.buildImageTools();
    // the language of a code block: a row of its own while the caret is in one, unless the toolbar has the box itself
    if (commands.includes('codeblock') && !commands.includes('codeLanguage')) this.buildCodeTools();
    if (commands.includes('link')) this.buildLinkTools();
  }

  /** The width of the border of the selected cells. */
  private buildCellBorder(): HTMLSelectElement {
    const doc = this.container.ownerDocument;
    const select = doc.createElement('select');
    select.className = 'aurebesh-cellborder';
    select.title = this.title(COMMANDS.cellBorder);
    select.setAttribute('aria-label', this.title(COMMANDS.cellBorder));
    for (const [value, key] of [['', 'default'], ['none', 'none'], ['1px', 'thin'], ['2px', 'medium'], ['4px', 'thick']]) {
      const opt = doc.createElement('option');
      opt.value = value;
      opt.textContent = this.t(`border.${key}`);
      select.appendChild(opt);
    }
    select.addEventListener('change', () => this.exec('cellBorder', select.value));
    this.cellBorderSelects.push(select);
    return select;
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
    add(this.t('ui.editLink'), () => this.buttons.get('link')?.[0]?.click());
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
        this.emitChange();
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
      this.emitChange();
    });
    this.imageTools = tools;
    this.root.appendChild(tools);
    rovingToolbar(tools, () => this.content.focus());
  }

  /** What a button shows: its icon, or its text when it has none. */
  private face(btn: HTMLElement, cmd: { icon?: string; label: string }): void {
    const icon = iconElement(btn.ownerDocument, cmd.icon, this.extraIcons);
    if (icon) btn.replaceChildren(icon);
    else btn.textContent = cmd.label;
  }

  /** The tooltip of a button: its name, and its shortcut next to it. It replaces the browser's own title while it shows. */
  private tooltip(btn: HTMLElement, command: string): void {
    const show = (swap: boolean) => {
      const name = btn.getAttribute('title') ?? btn.dataset.title;
      if (!name) return;
      const doc = btn.ownerDocument;
      if (!this.tip) {
        this.tip = doc.createElement('div');
        this.tip.className = 'aurebesh-tip';
        this.tip.setAttribute('aria-hidden', 'true');
        this.root.appendChild(this.tip);
      }
      const tip = this.tip;
      // The browser shows its own tooltip for a title after a moment; with the pointer on the button ours replaces it. The title
      // comes back as soon as the pointer leaves or clicks, so it is there for anything that looks for it (and for the keyboard).
      if (swap) {
        btn.dataset.title = name;
        btn.removeAttribute('title');
      }
      tip.textContent = name;
      const keys = shortcutLabel(command);
      if (keys) {
        const kbd = doc.createElement('kbd');
        kbd.textContent = keys;
        tip.appendChild(kbd);
      }
      tip.hidden = false;
      const root = this.root.getBoundingClientRect();
      const r = btn.getBoundingClientRect();
      const x = Math.max(root.left, Math.min(r.left + r.width / 2 - tip.offsetWidth / 2, root.right - tip.offsetWidth));
      tip.style.left = `${Math.round(x - root.left - this.root.clientLeft)}px`;
      tip.style.top = `${Math.round(r.bottom - root.top - this.root.clientTop + 6)}px`;
    };
    const hide = () => {
      if (btn.dataset.title) {
        btn.setAttribute('title', btn.dataset.title);
        delete btn.dataset.title;
      }
      if (this.tip) this.tip.hidden = true;
    };
    btn.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'touch') show(true); // a finger has no hover: the tip would only flash at every tap
    });
    btn.addEventListener('pointerleave', hide);
    btn.addEventListener('pointerdown', () => {
      if (btn.dataset.title) {
        btn.setAttribute('title', btn.dataset.title);
        delete btn.dataset.title;
      }
    });
    btn.addEventListener('focus', () => btn.matches(':focus-visible') && show(false));
    btn.addEventListener('blur', hide);
    btn.addEventListener('keydown', (e) => e.key === 'Escape' && hide());
  }

  /** The toolbar button that opens and closes a panel of the sidebar. */
  private buildPanelButton(cmd: CommandDef): HTMLButtonElement {
    const btn = this.makeButton(cmd, () => this.sidebar?.toggle(cmd.name));
    btn.setAttribute('aria-expanded', 'false');
    return btn;
  }

  /** The button with the list of what can be taken away from the selected text, without the rest of its formatting. */
  private buildClearPicker(cmd: CommandDef): HTMLElement {
    const doc = this.container.ownerDocument;
    const wrap = doc.createElement('span');
    wrap.className = 'aurebesh-table-picker';
    const toggle = this.makeButton(cmd, (e) => {
      pop.hidden = !pop.hidden;
      if (!pop.hidden && e.detail === 0) (pop.querySelector('button:not([disabled])') as HTMLElement | null)?.focus();
    });
    toggle.classList.add('aurebesh-swatch-btn');
    const pop = doc.createElement('div');
    pop.className = 'aurebesh-table-pop aurebesh-strike-pop aurebesh-clear-pop';
    pop.hidden = true;
    pop.setAttribute('role', 'group');
    pop.setAttribute('aria-label', this.title(cmd));
    const kinds: [string, string][] = [
      ['bold', this.title(this.commands.bold)],
      ['italic', this.title(this.commands.italic)],
      ['underline', this.title(this.commands.underline)],
      ['strike', this.title(this.commands.strike)],
      ['color', this.title(this.commands.color)],
      ['highlight', this.title(this.commands.highlight)],
      ['all', this.title(this.commands.clear)],
    ];
    for (const [kind, label] of kinds) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'aurebesh-strike-option';
      b.textContent = label;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => {
        pop.hidden = true;
        this.exec('clearStyle', kind);
      });
      pop.appendChild(b);
      this.clearOptions.push({ kind, button: b });
    }
    this.closeOnOutside(wrap, pop, toggle);
    wrap.append(toggle, pop);
    return wrap;
  }

  /** The button with the look of an underline or a strikethrough: the kind of line, and a colour. */
  private buildLinePicker(cmd: CommandDef, kind: DecorationKind): HTMLElement {
    const doc = this.container.ownerDocument;
    const wrap = doc.createElement('span');
    wrap.className = 'aurebesh-table-picker';
    const toggle = this.makeButton(cmd, (e) => {
      pop.hidden = !pop.hidden;
      if (!pop.hidden && e.detail === 0) (pop.querySelector('button') as HTMLElement | null)?.focus();
    });
    toggle.classList.add('aurebesh-swatch-btn');
    const pop = doc.createElement('div');
    pop.className = 'aurebesh-table-pop aurebesh-strike-pop';
    pop.hidden = true;
    pop.setAttribute('role', 'group');
    pop.setAttribute('aria-label', this.title(cmd));
    const apply = (arg: string, value?: string) => {
      pop.hidden = true;
      this.exec(cmd.name, arg, value);
    };
    // a strikethrough has a single and a double line; an underline has five kinds
    const styles = kind === 'strike' ? ['solid', 'double'] : ['solid', 'dashed', 'dotted', 'double', 'wavy'];
    for (const style of styles) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'aurebesh-strike-option';
      b.setAttribute('aria-pressed', 'false');
      const sample = doc.createElement(kind === 'strike' ? 's' : 'u');
      sample.textContent = this.t(kind === 'strike' ? `ui.strike.${style === 'solid' ? 'single' : style}` : `ui.underline.${style}`);
      if (style !== 'solid') sample.style.textDecorationStyle = style;
      b.appendChild(sample);
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => apply(style));
      pop.appendChild(b);
      this.lineOptions.push({ kind, style, button: b });
    }
    const grid = doc.createElement('div');
    grid.className = 'aurebesh-color-grid';
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', this.t(`ui.${kind}.color`));
    for (const color of this.colors) {
      const sw = doc.createElement('button');
      sw.type = 'button';
      sw.style.background = color;
      sw.title = color;
      sw.setAttribute('aria-label', color);
      sw.addEventListener('mousedown', (e) => e.preventDefault());
      sw.addEventListener('click', () => apply('color', color));
      grid.appendChild(sw);
    }
    gridNavigation(grid, 10);
    const reset = doc.createElement('button');
    reset.type = 'button';
    reset.className = 'aurebesh-color-reset';
    reset.textContent = this.t('ui.automatic');
    reset.addEventListener('mousedown', (e) => e.preventDefault());
    reset.addEventListener('click', () => apply('color'));
    pop.append(grid, reset);
    this.closeOnOutside(wrap, pop, toggle);
    wrap.append(toggle, pop);
    return wrap;
  }

  private calloutLabel(def: CalloutDef): string {
    return def.label ?? this.labels[`callout.${def.id}`] ?? def.id;
  }

  /** Puts the blocks of the selection in a callout of the type (or takes the callout away, with null). */
  applyCallout(type: string | null): void {
    if (!this.content.isContentEditable) return;
    if (!this.content.contains(this.container.ownerDocument.getSelection()?.anchorNode ?? null)) this.restoreSelection();
    this.content.focus();
    this.runChange(() => setCallout(this.content, type));
  }

  /** The button with the list of callout types: the selection goes in one, the one it is in is marked, and "no callout" takes it away. */
  private buildCalloutPicker(cmd: CommandDef): HTMLElement {
    const doc = this.container.ownerDocument;
    const wrap = doc.createElement('span');
    wrap.className = 'aurebesh-table-picker';
    const toggle = this.makeButton(cmd, () => {
      pop.hidden = !pop.hidden;
      if (!pop.hidden && !this.calloutOptions.length) return;
    });
    const pop = doc.createElement('div');
    pop.className = 'aurebesh-table-pop aurebesh-callout-list';
    pop.hidden = true;
    pop.setAttribute('role', 'group');
    pop.setAttribute('aria-label', this.title(cmd));
    const option = (label: string, type: string | null, color?: string) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'aurebesh-callout-option';
      b.dataset.calloutType = type ?? '';
      b.setAttribute('aria-pressed', 'false');
      const dot = doc.createElement('span');
      dot.className = 'aurebesh-callout-dot';
      if (color) dot.style.setProperty('--c', color);
      else dot.style.background = 'transparent';
      dot.style.border = color ? '' : '1px dashed currentColor';
      b.append(dot, doc.createTextNode(label));
      b.addEventListener('mousedown', (e) => e.preventDefault()); // the selection stays in the text
      b.addEventListener('click', () => {
        pop.hidden = true;
        this.applyCallout(type);
      });
      pop.appendChild(b);
      this.calloutOptions.push(b);
    };
    for (const def of this.calloutTypes) option(this.calloutLabel(def), def.id, def.color);
    option(this.t('ui.callout.none'), null);
    this.closeOnOutside(wrap, pop, toggle);
    wrap.append(toggle, pop);
    return wrap;
  }

  /** What the slash menu offers: the callouts, the headings, the lists and more. */
  private slashItems(): SlashItem[] {
    const items: SlashItem[] = this.calloutTypes.map((def) => ({
      id: `callout-${def.id}`,
      label: this.calloutLabel(def),
      keywords: 'callout alert admonition',
      run: () => this.applyCallout(def.id),
    }));
    for (const name of ['h1', 'h2', 'h3', 'ul', 'ol', 'task', 'quote', 'codeblock', 'hr']) {
      items.push({ id: name, label: this.title(this.commands[name]), run: () => this.exec(name) });
    }
    if (this.panelIds.includes('blocks')) {
      for (const l of LAYOUTS) items.push({ id: l.id, label: this.t(`block.${l.id}`), keywords: 'row columns layout', run: () => this.addBlock(l.id) });
    }
    return items;
  }

  /** The toolbar button that shows and hides the sidebar: it opens with the panel that was open last, or the first one. */
  private buildSidebarToggle(cmd: CommandDef): HTMLButtonElement {
    const btn = this.makeButton(cmd, () => {
      if (!this.sidebar) return;
      if (this.sidebar.current) this.sidebar.close();
      else this.sidebar.open(this.lastPanel && this.sidebar.ids.includes(this.lastPanel) ? this.lastPanel : this.sidebar.ids[0]);
    });
    btn.setAttribute('aria-expanded', 'false');
    btn.removeAttribute('aria-pressed'); // it is a disclosure button: aria-expanded says it
    return btn;
  }

  /** Opens a panel of the sidebar (the one with this id). */
  openPanel(id: string): void {
    this.sidebar?.open(id);
  }

  closePanel(): void {
    this.sidebar?.close();
  }

  /** The id of the panel that is open, or null. */
  getOpenPanel(): string | null {
    return this.sidebar?.current ?? null;
  }

  /** True when a plugin adds an output format of this name. */
  hasOutput(format: string): boolean {
    return this.plugins.some((p) => !!p.inst.output?.[format]);
  }

  /** What the plugin with this name offers (its `api`), or undefined. */
  plugin<T = object>(name: string): T | undefined {
    return this.plugins.find((p) => p.def.name === name)?.inst.api as T | undefined;
  }

  private clean(html: string): string {
    return sanitize(html, this.sanitizers);
  }

  private pluginContext(): PluginContext {
    const editor = this;
    return {
      editor,
      doc: this.container.ownerDocument,
      root: this.root,
      get content() {
        return editor.content;
      },
      get stage() {
        return editor.stage;
      },
      t: (key, vars) => this.t(key, vars),
      titleOf: (command) => this.labels[command] ?? this.commands[command]?.title ?? command,
      changed: () => {
        this.syncEmpty();
        this.emitChange();
        this.updateToolbar();
      },
      emit: (name, detail) => this.emitAny(name, detail),
      fail: (err) => this.fail(err),
      listen: (target, type, fn) => this.listen(target, type, fn),
      focus: () => this.content.focus(),
      insert: (content, at) => this.insert(content, at),
      restoreSelection: () => this.restoreSelection(),
      closeOnOutside: (wrap, pop, toggle) => this.closeOnOutside(wrap, pop, toggle),
      isEditable: () => this.content.isContentEditable,
      openPanel: (id) => this.openPanel(id),
      closePanel: () => this.closePanel(),
      openPanelId: () => this.getOpenPanel(),
    };
  }

  /** The panel beside the text: the columns, and how the text is shown. */
  private buildLayoutPanel(): HTMLElement {
    const doc = this.container.ownerDocument;
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
      const e = doc.createElement(tag);
      if (className) e.className = className;
      if (text) e.textContent = text;
      return e;
    };
    const panel = el('div', 'aurebesh-panel-layout');

    const field = (label: string, control: HTMLElement, unit?: string) => {
      const wrap = el('label', 'aurebesh-field');
      wrap.appendChild(el('span', 'aurebesh-field-label', label));
      if (unit) {
        const box = el('span', 'aurebesh-field-box');
        box.append(control, el('span', 'aurebesh-field-unit', unit));
        wrap.appendChild(box);
      } else wrap.appendChild(control);
      return wrap;
    };

    // how the text is shown
    const view = el('div', 'aurebesh-panel-section');
    view.appendChild(field(this.t('ui.layoutWidth'), this.buildPageSelect()));
    const number = (key: 'textWidth' | 'padding', min: number, max: number) => {
      const input = el('input');
      input.type = 'number';
      input.min = String(min);
      input.max = String(max);
      input.step = '4';
      input.placeholder = '–';
      input.addEventListener('change', () => {
        const v = input.value === '' ? null : Number(input.value);
        this.setLayout({ [key]: v === null || Number.isNaN(v) ? null : Math.max(min, Math.min(max, v)) });
      });
      this.layoutInputs[key] = input;
      return input;
    };
    view.appendChild(field(this.t('ui.textWidth'), number('textWidth', 240, 2400), 'px'));
    view.appendChild(field(this.t('ui.padding'), number('padding', 0, 200), 'px'));
    const line = el('select');
    for (const v of ['', '1.2', '1.4', '1.5', '1.7', '2']) {
      const opt = el('option', undefined, v ? v.replace('.', ',') : '–');
      opt.value = v;
      line.appendChild(opt);
    }
    line.addEventListener('change', () => this.setLayout({ lineHeight: line.value ? Number(line.value) : null }));
    this.layoutInputs.lineHeight = line;
    view.appendChild(field(this.t('ui.lineHeight'), line));
    view.appendChild(el('div', 'aurebesh-hint', this.t('ui.layoutNote')));

    panel.append(view);
    return panel;
  }

  /** Changes how the text is shown (what you leave out stays as it is). Nothing of it goes into the HTML. */
  setLayout(layout: Partial<Layout>): void {
    this.layout = { ...this.layout, ...layout };
    const { textWidth, padding, lineHeight } = this.layout;
    const set = (name: string, value: string | null) => (value === null ? this.root.style.removeProperty(name) : this.root.style.setProperty(name, value));
    set('--aurebesh-text-width', textWidth === null ? null : `${textWidth}px`);
    set('--aurebesh-pad-x', padding === null ? null : `${padding}px`);
    set('--aurebesh-pad-y', padding === null ? null : `${padding}px`);
    set('--aurebesh-line', lineHeight === null ? null : String(lineHeight));
    const { textWidth: w, padding: p, lineHeight: l } = this.layoutInputs;
    if (w) w.value = textWidth === null ? '' : String(textWidth);
    if (p) p.value = padding === null ? '' : String(padding);
    if (l) l.value = lineHeight === null ? '' : String(lineHeight);
    this.placeLinkTools();
    this.emit('layout', { ...this.layout });
  }

  getLayout(): Layout {
    return { ...this.layout };
  }

  private setFullscreen(on: boolean): void {
    this.fullscreen = on;
    this.root.classList.toggle('aurebesh-fullscreen', on);
    this.buttons.get('fullscreen')?.forEach((b) => b.setAttribute('aria-pressed', String(on)));
    this.placeLinkTools();
  }

  private makeButton(cmd: CommandDef, onClick: (e: MouseEvent) => void = () => this.exec(cmd.name)): HTMLButtonElement {
    const btn = this.container.ownerDocument.createElement('button');
    btn.type = 'button';
    btn.classList.add(`aurebesh-cmd-${cmd.name}`);
    this.face(btn, cmd);
    btn.title = this.title(cmd);
    btn.setAttribute('aria-label', this.title(cmd));
    btn.setAttribute('aria-pressed', 'false');
    // Keep the selection in the editor when clicking a button.
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', onClick);
    this.tooltip(btn, cmd.name);
    this.buttons.set(cmd.name, [...(this.buttons.get(cmd.name) ?? []), btn]);
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

  /** Shows (or hides, with null) the line that tells where a dragged block would go. */
  private showBlockLine(spot: Spot | null): void {
    if (!spot) {
      this.blockLine?.remove();
      this.blockLine = null;
      return;
    }
    if (!this.blockLine) {
      this.blockLine = this.container.ownerDocument.createElement('div');
      this.blockLine.className = 'aurebesh-blockdrop';
      this.blockLine.setAttribute('aria-hidden', 'true');
      this.container.ownerDocument.body.appendChild(this.blockLine);
    }
    const line = spotLine(spot);
    Object.assign(this.blockLine.style, { left: `${line.left}px`, width: `${line.width}px`, top: `${line.top}px` });
  }

  /** Puts a building block in the text: at the spot, or after the block that has the caret. The image asks for a file first. */
  addBlock(id: string, spot?: Spot | null): void {
    if (!this.content.isContentEditable) return;
    if (!spot) {
      this.restoreSelection(); // the click was in the sidebar: where the caret was
      spot = spotAtCaret(this.content);
    }
    if (id === 'image') {
      const input = this.container.ownerDocument.createElement('input');
      input.type = 'file';
      input.accept = IMAGE_TYPES.join(',');
      const at = spot;
      input.addEventListener('change', () => {
        if (!input.files?.length) return;
        selectSpot(this.content, at);
        void this.uploadFiles(input.files);
      });
      input.click();
      return;
    }
    if (!insertBlock(this.content, blockHtml(id, (key) => this.t(key)), spot)) return;
    this.syncEmpty();
    this.emitChange();
    this.updateToolbar();
  }

  /** The panel with the building blocks: layouts and content, to drag into the text or to click. */
  private buildBlocksPanel(): HTMLElement {
    const doc = this.container.ownerDocument;
    const panel = doc.createElement('div');
    panel.className = 'aurebesh-panel-blocks';
    const hint = doc.createElement('div');
    hint.className = 'aurebesh-hint';
    hint.textContent = this.t('ui.blocks.hint');
    panel.appendChild(hint);
    const section = (title: string) => {
      const heading = doc.createElement('div');
      heading.className = 'aurebesh-blocks-title';
      heading.textContent = title;
      const grid = doc.createElement('div');
      grid.className = 'aurebesh-blocks';
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-label', title);
      panel.append(heading, grid);
      return grid;
    };
    const add = (grid: HTMLElement, id: string, preview: Element) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'aurebesh-block';
      b.draggable = true;
      b.dataset.block = id;
      const name = this.t(`block.${id}`);
      b.title = name;
      b.setAttribute('aria-label', name);
      const label = doc.createElement('span');
      label.textContent = name;
      b.append(preview, label);
      b.addEventListener('click', () => this.addBlock(id));
      b.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData(BLOCK_MIME, id);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
      });
      grid.appendChild(b);
    };
    const layouts = section(this.t('ui.blocks.layout'));
    for (const l of LAYOUTS) {
      const bars = doc.createElement('span');
      bars.className = 'aurebesh-block-bars';
      for (const part of l.template.split(' ')) {
        const bar = doc.createElement('span');
        bar.style.flex = String(parseFloat(part));
        bars.appendChild(bar);
      }
      add(layouts, l.id, bars);
    }
    const content = section(this.t('ui.blocks.content'));
    const icons: Record<string, string> = { heading: 'blockHeading', text: 'blockText', image: 'image', button: 'blockButton', divider: 'hr' };
    for (const id of CONTENT) {
      const icon = iconElement(doc, icons[id], this.extraIcons);
      add(content, id, icon ?? doc.createElement('span'));
    }
    return panel;
  }

  /** The row that appears while the caret is in a layout row: how its columns are distributed, the gap between them, and Delete. */
  private buildRowTools(): void {
    const doc = this.container.ownerDocument;
    const tools = doc.createElement('div');
    tools.className = 'aurebesh-toolbar aurebesh-row-tools';
    tools.setAttribute('role', 'toolbar');
    tools.setAttribute('aria-label', this.t('ui.rowTools'));
    tools.hidden = true;
    const select = (className: string, label: string, options: [string, string][]) => {
      const s = doc.createElement('select');
      s.className = className;
      s.title = label;
      s.setAttribute('aria-label', label);
      for (const [value, text] of options) {
        const o = doc.createElement('option');
        o.value = value;
        o.textContent = text;
        s.appendChild(o);
      }
      tools.appendChild(s);
      return s;
    };
    const layout = select('aurebesh-rowlayout', this.t('ui.rowLayout'), LAYOUTS.map((l) => [l.template, this.t(`block.${l.id}`)]));
    const gap = select('aurebesh-rowgap', this.t('ui.rowGap'), [0, 8, 16, 24, 32].map((n) => [String(n), `${n}px`]));
    layout.addEventListener('change', () => this.changeRow(layout.value));
    gap.addEventListener('change', () => this.changeRow(undefined, Number(gap.value)));
    this.rowSelects = { layout, gap };
    const del = this.makeButton(COMMANDS.rowDelete, () => {
      const row = this.lastRow;
      if (!row || !row.isConnected) return;
      deleteRow(this.content, row);
      this.syncEmpty();
      this.emitChange();
      this.updateToolbar();
    });
    tools.appendChild(del);
    this.rowTools = tools;
    this.root.appendChild(tools);
    rovingToolbar(tools, () => this.content.focus());
  }

  private changeRow(template?: string, gap?: number): void {
    const row = this.lastRow;
    if (!row || !row.isConnected) return;
    this.content.focus();
    setRow(this.content, row, template ?? rowTemplate(row), gap ?? rowGap(row));
    this.syncEmpty();
    this.emitChange();
    this.updateToolbar();
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
    const block = e.dataTransfer?.getData(BLOCK_MIME);
    if (block) {
      e.preventDefault();
      this.showBlockLine(null);
      if (this.content.isContentEditable) this.addBlock(block, spotAt(this.content, e.clientX, e.clientY));
      return;
    }
    if (this.plugins.some((p) => p.inst.drop?.(e))) return;
    const files = e.dataTransfer?.files;
    if (!files?.length || !this.content.isContentEditable) return;
    e.preventDefault();
    this.placeCaretAt(e.clientX, e.clientY); // where the file was dropped
    void this.uploadFiles(files);
  }

  /** After inserting something that is not editable (a field chip), the browser leaves the caret inside it, where typing and Backspace do nothing: move it behind. */
  private caretOutOfIsland(): void {
    const sel = this.container.ownerDocument.getSelection();
    const node = sel?.anchorNode;
    if (!sel || !node) return;
    const island = (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement)?.closest('[contenteditable="false"]');
    if (!island || !this.content.contains(island) || island === this.content) return;
    const range = this.container.ownerDocument.createRange();
    range.setStartAfter(island);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /** Puts the caret at a point of the screen. False (and nothing changes) when that point is not in the text. */
  private placeCaretAt(x: number, y: number): boolean {
    const d = this.container.ownerDocument as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    let range: Range | null = null;
    const pos = d.caretPositionFromPoint?.(x, y);
    if (pos) {
      range = d.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
    } else {
      range = d.caretRangeFromPoint?.(x, y) ?? null;
    }
    if (!range || !this.content.contains(range.startContainer)) return false;
    const sel = d.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    return true;
  }

  /**
   * Puts HTML (or a node) in the text, at the caret or at a point of the screen (`at`, e.g. where something was dropped). It goes through
   * the sanitizer, so what a plugin wants to keep must be in its `sanitize`, and it is one step for undo. False when nothing was inserted
   * (read-only, the point is outside the text, or nothing is left after sanitizing).
   */
  insert(content: string | Node, at?: { x: number; y: number }): boolean {
    if (!this.content.isContentEditable) return false;
    const doc = this.container.ownerDocument;
    const hadFocus = doc.activeElement === this.content;
    this.content.focus();
    if (at) {
      if (!this.placeCaretAt(at.x, at.y)) return false;
    } else if (!hadFocus) this.restoreSelection();
    let html = content as string;
    if (typeof content !== 'string') {
      const box = doc.createElement('div');
      box.appendChild(content.cloneNode(true));
      html = box.innerHTML;
    }
    const clean = this.clean(html);
    if (!clean) return false;
    doc.execCommand('insertHTML', false, clean);
    this.caretOutOfIsland();
    this.tidyStyles();
    this.syncEmpty();
    this.emitChange();
    this.updateToolbar();
    return true;
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
    this.fontSelects.push(select);
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
    this.columnsSelects.push(select);
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
    this.orientationButtons.push(btn);
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
    this.pageSelects.push(select);
    return select;
  }

  /** The select's title ("Font", "Size"): shown while nothing is chosen, but not offered as a choice in the list. */
  private asPlaceholder(option: HTMLOptionElement): void {
    option.value = '';
    option.disabled = true;
    option.hidden = true;
  }

  /** Text size: the browser's steps small .. huge. Picks apply to the selection and the box returns to its title. */
  /** The language of the code block that has the caret: Auto (the generic colours), Plain text and the languages with a grammar. */
  private buildCodeLanguageSelect(): HTMLSelectElement {
    const doc = this.container.ownerDocument;
    const select = doc.createElement('select');
    select.className = 'aurebesh-codelang';
    select.title = this.title(this.commands.codeLanguage);
    select.setAttribute('aria-label', this.title(this.commands.codeLanguage));
    const auto = doc.createElement('option');
    auto.value = '';
    auto.textContent = this.t('ui.codeLanguage.auto');
    select.appendChild(auto);
    for (const lang of CODE_LANGUAGES) {
      const opt = doc.createElement('option');
      opt.value = lang.id;
      opt.textContent = lang.id === 'text' ? this.t('ui.codeLanguage.text') : lang.name;
      select.appendChild(opt);
    }
    select.disabled = true; // until the caret is in a code block
    select.addEventListener('change', () => this.exec('codeLanguage', select.value || 'auto'));
    this.codeLanguageSelects.push(select);
    return select;
  }

  /** The row with the language of the code block, shown while the caret is in a code block. */
  private buildCodeTools(): void {
    const doc = this.container.ownerDocument;
    const tools = doc.createElement('div');
    tools.className = 'aurebesh-toolbar aurebesh-code-tools';
    tools.setAttribute('role', 'toolbar');
    tools.setAttribute('aria-label', this.title(this.commands.codeLanguage));
    tools.hidden = true;
    const name = doc.createElement('span');
    name.className = 'aurebesh-tools-label';
    name.setAttribute('aria-hidden', 'true');
    name.textContent = this.title(this.commands.codeLanguage);
    tools.append(name, this.buildCodeLanguageSelect());
    this.codeTools = tools;
    this.root.appendChild(tools);
    rovingToolbar(tools, () => this.content.focus());
  }

  /** Shows the language of the code block with the caret in a box; a language that is not in the list is shown as it is. */
  private showCodeLanguage(select: HTMLSelectElement, id: string | null, inCode: boolean): void {
    select.disabled = !inCode || !this.content.isContentEditable;
    select.querySelector('option[data-other]')?.remove();
    const value = id ?? '';
    if (value && !isKnownLanguage(value)) {
      const other = select.ownerDocument.createElement('option');
      other.value = value;
      other.textContent = value;
      other.setAttribute('data-other', '');
      select.appendChild(other);
    }
    select.value = value;
  }

  /** The weight of the selected text, from light to bold; it shows the weight of the text that has the caret. */
  private buildWeightSelect(): HTMLSelectElement {
    const doc = this.container.ownerDocument;
    const select = doc.createElement('select');
    select.className = 'aurebesh-weight';
    select.title = this.t('ui.weight');
    select.setAttribute('aria-label', this.t('ui.weight'));
    const placeholder = doc.createElement('option');
    placeholder.value = '';
    placeholder.textContent = this.t('ui.weight');
    this.asPlaceholder(placeholder);
    select.appendChild(placeholder);
    for (const weight of WEIGHTS) {
      const opt = doc.createElement('option');
      opt.value = String(weight);
      opt.textContent = this.t(`weight.${weight}`);
      select.appendChild(opt);
    }
    select.value = '';
    select.addEventListener('change', () => {
      if (select.value) this.exec('weight', select.value);
    });
    this.weightSelects.push(select);
    return select;
  }

  /** The size of the selected text in points; it shows the size of the text that has the caret. */
  private buildSizeSelect(): HTMLSelectElement {
    const doc = this.container.ownerDocument;
    const select = doc.createElement('select');
    select.className = 'aurebesh-size';
    const name = `${this.t('ui.size')} (pt)`;
    select.title = name;
    select.setAttribute('aria-label', name);
    const placeholder = doc.createElement('option');
    placeholder.value = '';
    placeholder.textContent = this.t('ui.size');
    this.asPlaceholder(placeholder);
    select.appendChild(placeholder);
    for (const points of this.sizes) {
      const opt = doc.createElement('option');
      opt.value = String(points);
      opt.textContent = String(points);
      select.appendChild(opt);
    }
    const reset = doc.createElement('option');
    reset.value = 'default';
    reset.textContent = this.t('ui.sizeDefault');
    select.appendChild(reset);
    select.value = '';
    select.addEventListener('change', () => {
      const chosen = select.value;
      if (!chosen) return;
      this.exec('size', chosen);
      // With only a caret there is no text to measure yet: show the choice until the caret moves.
      if (this.container.ownerDocument.getSelection()?.isCollapsed) select.value = chosen === 'default' ? '' : chosen;
    });
    this.sizeSelects.push(select);
    return select;
  }

  /** Shows a size in the box: one of the sizes in it, or (for text that has another size) a choice of its own that goes with the next one. */
  private showSize(select: HTMLSelectElement, points: number | null): void {
    select.querySelector('option[data-other]')?.remove();
    if (points === null) {
      select.value = '';
      return;
    }
    const value = String(points);
    if (!Array.from(select.options).some((o) => o.value === value)) {
      const other = select.ownerDocument.createElement('option');
      other.value = value;
      other.textContent = value;
      other.setAttribute('data-other', '');
      select.insertBefore(other, select.options[1] ?? null);
    }
    select.value = value;
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
      this.linkForm = pop;
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
    if (this.tableTools && !this.pointerHeld) this.tableTools.hidden = !(inside && currentTable());
    // the kinds that the selected text does not have cannot be taken away
    for (const { kind, button } of this.clearOptions) {
      const has = kind === 'all' || kind === 'color' || kind === 'highlight' || (inside && hasInline(kind as InlineKind));
      button.disabled = !has;
    }
    if (this.lineOptions.length) {
      const looks = { underline: inside ? decorationLook('underline') : null, strike: inside ? decorationLook('strike') : null };
      for (const { kind, style, button } of this.lineOptions) button.setAttribute('aria-pressed', String(looks[kind]?.style === style));
    }
    if (this.calloutOptions.length) {
      const now = inside ? currentCallout(this.content)?.getAttribute('data-callout') ?? '' : '';
      for (const b of this.calloutOptions) b.setAttribute('aria-pressed', String((b.dataset.calloutType ?? '') === now && (now !== '' || b.dataset.calloutType === '')));
      for (const list of this.buttons.get('callout') ?? []) list.setAttribute('aria-pressed', String(now !== ''));
    }
    if (this.rowTools) {
      const row = inside && this.content.isContentEditable ? currentRow(this.content) : null;
      if (row) {
        this.lastRow = row;
        const { layout, gap } = this.rowSelects;
        if (layout) {
          const template = rowTemplate(row);
          // a distribution that is not one of the presets (from other HTML) is shown as it is
          layout.querySelector('option[data-custom]')?.remove();
          if (!Array.from(layout.options).some((o) => o.value === template)) {
            const o = this.container.ownerDocument.createElement('option');
            o.value = template;
            o.dataset.custom = '';
            o.textContent = template;
            layout.appendChild(o);
          }
          layout.value = template;
        }
        if (gap) gap.value = String(rowGap(row));
      }
      this.rowTools.hidden = !row && !this.rowTools.contains(this.container.ownerDocument.activeElement);
    }
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
    }
    if (inside) {
      const n = currentColumns();
      this.columnsSelects.forEach((s) => (s.value = String(n)));
      if (this.cellBorderSelects.length) {
        const width = cellBorder().width;
        this.cellBorderSelects.forEach((s) => (s.value = Array.from(s.options).some((o) => o.value === width) ? width : ""));
      }
    }
    if (inside) {
      const points = currentSize();
      this.sizeSelects.forEach((select) => this.showSize(select, points));
    }
    if (this.codeLanguageSelects.length) {
      const code = inside ? currentPre() : null;
      this.codeLanguageSelects.forEach((select) => this.showCodeLanguage(select, code ? currentCodeLanguage() : null, !!code));
      if (this.codeTools) this.codeTools.hidden = !code && !this.codeTools.contains(this.container.ownerDocument.activeElement);
    }
    if (inside) {
      const weight = String(currentWeight() ?? '');
      this.weightSelects.forEach((select) => (select.value = Array.from(select.options).some((o) => o.value === weight) ? weight : ''));
    }
    if (inside) {
      let current = '';
      try {
        // Browsers report either the full stack or just the first family.
        current = firstFamily(document.queryCommandValue('fontName'));
      } catch {
        /* unsupported */
      }
      const match = this.fonts.find((f) => firstFamily(f.family) === current);
      this.fontSelects.forEach((select) => (select.value = match ? match.family : ''));
    }
    this.buttons.forEach((list, name) => {
      if (name === 'sidebar' || name === 'callout' || name === 'export' || name === 'strikeStyle' || name === 'underlineStyle' || name === 'clearStyle') return; // aria-expanded says it, and the callout picker sets its own state
      const active = name === 'fullscreen' ? this.fullscreen : inside && (this.commands[name].isActive?.() ?? false);
      const enabled = this.commands[name].isEnabled;
      for (const btn of list) {
        btn.setAttribute('aria-pressed', String(active));
        if (enabled) btn.disabled = !this.content.isContentEditable || !(inside && enabled());
      }
    });
    this.emit('state', undefined);
  }

  private syncEmpty(): void {
    const empty = !this.content.textContent && !this.content.querySelector('hr,li,img,video,iframe,table');
    this.content.classList.toggle('is-empty', empty);
  }

  /** Paste as sanitized HTML (or plain text) instead of whatever the source app put on the clipboard. */
  private onPaste(e: ClipboardEvent): void {
    if (this.plugins.some((p) => p.inst.paste?.(e))) return;
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
    document.execCommand('insertHTML', false, this.clean(prepared.html));
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
      this.emitChange();
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
