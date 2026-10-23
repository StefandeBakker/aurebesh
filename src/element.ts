import { Aurebesh } from './editor';
import { toMarkdown } from './export';
import { markdownToHtml } from './from-markdown';
import { parseModes } from './modes';
import type { ViewMode } from './modes';
import type { AurebeshOptions } from './editor';
import type { OutputFormat } from './export';
import { PAGE_NAMES } from './page';
import type { PageFormat, PagePreset } from './page';

const isPageName = (s: string): s is PagePreset => (PAGE_NAMES as string[]).includes(s.toLowerCase());

// On the server (SSR) there is no HTMLElement: fall back to an empty class so importing this file doesn't throw.
const BaseElement: typeof HTMLElement = typeof HTMLElement === 'undefined' ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

/**
 * <aurebesh-editor name="body" placeholder="Type..." readonly required toolbar="bold,italic,|,link"><p>initial</p></aurebesh-editor>
 *
 * - Emits a `change` CustomEvent whose `detail` is the HTML string, an `error` event, a `ready` event (detail: the
 *   Aurebesh instance) and a `count` event (detail: `{ characters, charactersNoSpaces, words }`).
 * - `page="a4"` (or `a5`, `a6`, `a3`, `letter`, `legal`, `ticket-80`, `ticket-58`, `responsive`, or a width like `80mm` / `600px`)
 *   shows the editor as a sheet of that size; `page-orientation="landscape"` and `page-margin="15mm"` adjust it. A `page` event
 *   (detail: the page, or null) fires when it changes, also from the toolbar's `page` item.
 * - `maxlength="500"` limits the characters (typing and pasting are cut off, longer text is invalid in a form);
 *   `counter` shows "12 words · 80 / 500 characters" under the text.
 * - `value` property: get/set the HTML.
 * - `options` property: everything that can't be an attribute (media adapter, fonts, colors, labels...).
 *   `el.options = { media: { adapter: endpointAdapter({ url: '/api/upload' }) } }`
 * - Works inside a <form>: with a `name` its HTML is submitted, `required` is validated, reset restores the initial content.
 */
export class AurebeshElement extends BaseElement {
  static observedAttributes = ['language', 'headless', 'placeholder', 'readonly', 'required', 'maxlength', 'counter', 'format', 'page', 'page-orientation', 'page-margin'];
  static formAssociated = true;

  private editor: Aurebesh | null = null;
  private pendingValue: string | null = null;
  private initialHtml = '';
  private extraOptions: AurebeshOptions = {};
  private connectQueued = false;
  private internals: ElementInternals | null = null;

  constructor() {
    super();
    try {
      this.internals = this.attachInternals?.() ?? null;
    } catch {
      this.internals = null; // very old browser
    }
  }

  connectedCallback(): void {
    if (this.editor || this.connectQueued) return;
    // Wait a tick so frameworks can set properties (value, options) right after inserting the element.
    this.connectQueued = true;
    queueMicrotask(() => {
      this.connectQueued = false;
      if (this.isConnected && !this.editor) this.create(this.pendingValue ?? this.lightValue());
    });
  }

  disconnectedCallback(): void {
    if (this.editor) this.pendingValue = this.editor.getValue();
    this.editor?.destroy();
    this.editor = null;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (!this.editor) return;
    if (name === 'language' || name === 'headless') this.rebuild(); // the texts and the styles are made when the editor is built
    if (name === 'placeholder') this.editor.setPlaceholder(value ?? '');
    if (name === 'readonly') this.editor.setReadOnly(value !== null);
    if (name === 'required' || name === 'format') this.syncForm();
    if (name === 'maxlength') {
      this.editor.setMaxLength(this.maxLengthAttr() ?? null);
      this.syncForm();
    }
    if (name === 'counter') this.editor.setCounter(value !== null);
    if (name === 'page' || name === 'page-orientation' || name === 'page-margin') {
      try {
        this.editor.setPage(this.pageFromAttributes());
      } catch (err) {
        this.dispatchEvent(new CustomEvent('error', { detail: err, bubbles: true }));
      }
    }
  }

  /** `page="a4"`, `page="80mm"`, `page="a4" page-orientation="landscape" page-margin="15mm"`. */
  private pageFromAttributes(): PageFormat | undefined {
    const page = this.getAttribute('page')?.trim();
    if (!page) return undefined;
    const orientation = this.getAttribute('page-orientation') === 'landscape' ? 'landscape' : undefined;
    const margin = this.getAttribute('page-margin') ?? undefined;
    if (!orientation && margin === undefined) return page;
    return { ...(isPageName(page) ? { format: page.toLowerCase() as PagePreset } : { width: page }), orientation, margin };
  }

  private maxLengthAttr(): number | undefined {
    const n = parseInt(this.getAttribute('maxlength') ?? '', 10);
    return n > 0 ? n : undefined;
  }

  // ---- form association ------------------------------------------------------------------------------

  formResetCallback(): void {
    this.value = this.initialHtml;
  }

  formDisabledCallback(disabled: boolean): void {
    this.editor?.setReadOnly(disabled || this.hasAttribute('readonly'));
  }

  formStateRestoreCallback(state: string | File | FormData | null): void {
    if (typeof state === 'string') this.value = state;
  }

  private syncForm(): void {
    if (!this.internals || !this.editor) return;
    const html = this.editor.isEmpty() ? '' : this.editor.getHTML();
    this.internals.setFormValue(html ? this.editor.getValue(this.format) : '');
    if (this.hasAttribute('required') && !html) {
      this.internals.setValidity({ valueMissing: true }, 'Please fill in this field.', this.editor.content);
    } else if (this.editor.isOverLimit()) {
      this.internals.setValidity({ tooLong: true }, 'The text is too long.', this.editor.content);
    } else {
      this.internals.setValidity({});
    }
  }

  // ---------------------------------------------------------------------------------------------------

  /** The format of `value`: the `value-format` attribute, or the `valueFormat` option. 'html' unless one of them says otherwise. */
  private valueFormat(): OutputFormat {
    return (this.getAttribute('value-format') ?? this.extraOptions.valueFormat ?? 'html') as OutputFormat;
  }

  /** What is written inside the element is the initial value: HTML, or the text of it when the value is not HTML (Markdown). */
  private lightValue(): string {
    return this.valueFormat() === 'html' ? this.innerHTML : this.textContent ?? '';
  }

  /** Builds the editor. `initial` is in the format of `value`, or HTML (`isHtml`: from the editor that is being replaced). */
  private create(initial: string, isHtml = false): void {
    const toolbarAttr = this.getAttribute('toolbar');
    const valueFormat = this.valueFormat();
    if (isHtml && valueFormat === 'markdown') initial = toMarkdown(initial);
    // The light-DOM content was only the initial value; the editor renders its own UI.
    this.textContent = '';
    this.editor = new Aurebesh(this, {
      valueFormat,
      value: initial,
      placeholder: this.getAttribute('placeholder') ?? '',
      readOnly: this.hasAttribute('readonly'),
      // `dir` is a global attribute, so the host element (or the page) already passes it on; only an explicit one is an option.
      dir: ['ltr', 'rtl', 'auto'].includes(this.getAttribute('dir') ?? '') ? (this.getAttribute('dir') as 'ltr' | 'rtl' | 'auto') : undefined,
      page: this.pageFromAttributes(),
      maxLength: this.maxLengthAttr(),
      counter: this.hasAttribute('counter'),
      toolbar: toolbarAttr === null ? undefined : toolbarAttr.split(',').map((s) => s.trim()).filter(Boolean),
      // `modes` alone shows the switch with all three views; `modes="markdown"` only the editor and the Markdown
      modes: this.hasAttribute('modes') ? parseModes(this.getAttribute('modes')) : undefined,
      mode: (this.getAttribute('mode') as ViewMode | null) ?? undefined,
      language: this.getAttribute('language') ?? undefined,
      headless: this.hasAttribute('headless'),
      quickbar: this.hasAttribute('quickbar') ? (this.getAttribute('quickbar') ?? '').split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      ...this.extraOptions,
    });
    this.initialHtml = this.editor.getValue();
    this.pendingValue = null;
    this.editor.on('change', (html) => {
      this.syncForm();
      this.dispatchEvent(new CustomEvent('change', { detail: html, bubbles: true }));
    });
    this.editor.on('error', (error) => this.dispatchEvent(new CustomEvent('error', { detail: error, bubbles: true })));
    this.editor.on('page', (page) => this.dispatchEvent(new CustomEvent('page', { detail: page, bubbles: true })));
    this.editor.on('comment', (detail) => this.dispatchEvent(new CustomEvent('comment', { detail, bubbles: true })));
    this.editor.on('comments', (detail) => this.dispatchEvent(new CustomEvent('comments', { detail, bubbles: true })));
    this.editor.on('mention', (user) => this.dispatchEvent(new CustomEvent('mention', { detail: user, bubbles: true })));
    this.editor.on('mode', (mode) => this.dispatchEvent(new CustomEvent('mode', { detail: mode, bubbles: true })));
    this.editor.on('layout', (layout) => this.dispatchEvent(new CustomEvent('layout', { detail: layout, bubbles: true })));
    this.editor.on('ready', () => this.dispatchEvent(new CustomEvent('ready', { detail: this.editor })));
    // the events of the plugins become DOM events too
    for (const plugin of this.extraOptions.plugins ?? []) {
      for (const name of plugin.events ?? []) this.editor.on(name, (detail) => this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true })));
    }
    this.editor.on('count', (stats) => {
      this.syncForm();
      this.dispatchEvent(new CustomEvent('count', { detail: stats, bubbles: true }));
    });
    this.syncForm();
  }

  get value(): string {
    return this.editor ? this.editor.getValue() : this.pendingValue ?? '';
  }

  set value(html: string) {
    if (this.editor) {
      // Frameworks hand back what we just emitted; setting it again would reset the caret.
      if (html !== this.editor.getValue()) this.editor.setValue(html);
      this.syncForm();
    } else {
      this.pendingValue = html;
    }
  }

  get options(): AurebeshOptions {
    return this.extraOptions;
  }

  /**
   * Setting options after the editor exists rebuilds it, keeping the current content.
   * An equal value (same content, functions compared by identity) is ignored, so frameworks that re-pass
   * an options object on every render don't rebuild the editor.
   */
  set options(options: AurebeshOptions) {
    const next = options ?? {};
    if (isSame(this.extraOptions, next)) return;
    this.extraOptions = next;
    this.rebuild();
  }

  /** Builds the editor again with the content it has. */
  private rebuild(): void {
    if (!this.editor) return;
    const html = this.editor.getHTML();
    this.editor.destroy();
    this.editor = null;
    this.create(html, true);
  }

  /** What is submitted with a form: the `format` attribute, "html", "markdown", "text" or a format that a plugin adds; by default the format of `value`. */
  get format(): OutputFormat {
    const f = this.getAttribute('format') ?? '';
    return f === 'markdown' || f === 'text' || this.editor?.hasOutput(f) ? f : this.valueFormat();
  }

  set format(f: OutputFormat) {
    this.setAttribute('format', f);
  }

  get markdown(): string {
    return this.editor ? this.editor.getMarkdown() : '';
  }

  /** Sets the content from Markdown. */
  set markdown(markdown: string) {
    if (this.editor) this.editor.setMarkdown(markdown);
    else this.pendingValue = this.valueFormat() === 'markdown' ? markdown : markdownToHtml(markdown);
  }

  get text(): string {
    return this.editor ? this.editor.getValue('text') : '';
  }

  /** Form validity: `valueMissing` (required and empty) or `tooLong` (more characters than `maxlength`). */
  get validity(): ValidityState {
    return this.internals!.validity;
  }

  checkValidity(): boolean {
    return this.internals ? this.internals.checkValidity() : true;
  }

  reportValidity(): boolean {
    return this.internals ? this.internals.reportValidity() : true;
  }

  /** The underlying Aurebesh instance (available once connected). */
  get instance(): Aurebesh | null {
    return this.editor;
  }
}

/** Structural equality for option objects: plain data is compared by content, functions by identity. */
function isSame(a: unknown, b: unknown, depth = 4): boolean {
  if (a === b) return true;
  if (depth === 0 || typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => isSame((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], depth - 1));
}

declare global {
  interface HTMLElementTagNameMap {
    'aurebesh-editor': AurebeshElement;
  }
}

/** Registers <aurebesh-editor>. Safe to call many times and on the server (where it does nothing). */
export function defineAurebeshElement(name = 'aurebesh-editor'): void {
  if (typeof customElements !== 'undefined' && !customElements.get(name)) customElements.define(name, AurebeshElement);
}

defineAurebeshElement();
