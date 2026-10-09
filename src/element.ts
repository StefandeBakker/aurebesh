import { Aurebesh } from './editor';
import type { AurebeshOptions } from './editor';

/**
 * <aurebesh-editor placeholder="Type..." readonly toolbar="bold,italic,|,link"><p>initial</p></aurebesh-editor>
 *
 * - Emits a `change` CustomEvent whose `detail` is the HTML string.
 * - `value` property: get/set the HTML.
 * - `options` property: everything that can't be an attribute (media adapter, fonts, colors...).
 *   `el.options = { media: { adapter: endpointAdapter({ url: '/api/upload' }) } }`
 */
export class AurebeshElement extends HTMLElement {
  static observedAttributes = ['placeholder', 'readonly'];
  private editor: Aurebesh | null = null;
  private pendingValue: string | null = null;
  private extraOptions: AurebeshOptions = {};
  private connectQueued = false;

  connectedCallback(): void {
    if (this.editor || this.connectQueued) return;
    // Wait a tick so frameworks can set properties (value, options) right after inserting the element.
    this.connectQueued = true;
    queueMicrotask(() => {
      this.connectQueued = false;
      if (this.isConnected && !this.editor) this.create(this.pendingValue ?? this.innerHTML);
    });
  }

  disconnectedCallback(): void {
    if (this.editor) this.pendingValue = this.editor.getHTML();
    this.editor?.destroy();
    this.editor = null;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (!this.editor) return;
    if (name === 'placeholder') this.editor.setPlaceholder(value ?? '');
    if (name === 'readonly') this.editor.setReadOnly(value !== null);
  }

  private create(initial: string): void {
    const toolbarAttr = this.getAttribute('toolbar');
    // The light-DOM content was only the initial value; the editor renders its own UI.
    this.textContent = '';
    this.editor = new Aurebesh(this, {
      value: initial,
      placeholder: this.getAttribute('placeholder') ?? '',
      readOnly: this.hasAttribute('readonly'),
      toolbar: toolbarAttr === null ? undefined : toolbarAttr.split(',').map((s) => s.trim()).filter(Boolean),
      ...this.extraOptions,
    });
    this.pendingValue = null;
    this.editor.on('change', (html) => this.dispatchEvent(new CustomEvent('change', { detail: html, bubbles: true })));
    this.editor.on('error', (error) => this.dispatchEvent(new CustomEvent('error', { detail: error, bubbles: true })));
  }

  get value(): string {
    return this.editor ? this.editor.getHTML() : this.pendingValue ?? '';
  }

  set value(html: string) {
    if (this.editor) this.editor.setHTML(html);
    else this.pendingValue = html;
  }

  get options(): AurebeshOptions {
    return this.extraOptions;
  }

  /** Setting options after the editor exists rebuilds it, keeping the current content. */
  set options(options: AurebeshOptions) {
    this.extraOptions = options ?? {};
    if (!this.editor) return;
    const html = this.editor.getHTML();
    this.editor.destroy();
    this.editor = null;
    this.create(html);
  }

  /** The underlying Aurebesh instance (available once connected). */
  get instance(): Aurebesh | null {
    return this.editor;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('aurebesh-editor')) {
  customElements.define('aurebesh-editor', AurebeshElement);
}
