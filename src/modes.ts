/**
 * The views of the content: the editor, the HTML and the Markdown. A small switch in the footer changes between them; the HTML and the
 * Markdown are shown as text in a field that can be edited, and what is typed there replaces the content of the editor (after a short
 * pause, when the field loses the focus and when the view is left).
 */

export type ViewMode = 'editor' | 'html' | 'markdown';
export const ALL_MODES: ViewMode[] = ['editor', 'html', 'markdown'];

/** The modes a `modes` option or attribute asks for: `true` (or an empty attribute) is all three; the editor is always one of them. */
export function parseModes(value: boolean | string | ViewMode[] | undefined | null): ViewMode[] {
  if (value === undefined || value === null || value === false) return [];
  if (value === true || value === '') return [...ALL_MODES];
  const wanted = (typeof value === 'string' ? value.split(',').map((s) => s.trim()) : value) as string[];
  const modes = ALL_MODES.filter((m) => m === 'editor' || wanted.includes(m));
  return modes.length > 1 ? modes : [];
}

export interface ModeHost {
  doc: Document;
  /** Where the field goes: next to the text. */
  stage: HTMLElement;
  /** The editable text, which the field replaces while it shows. */
  content: HTMLElement;
  /** The content as source text. */
  read(mode: 'html' | 'markdown'): string;
  /** Replaces the content by source text. It does not report a change. */
  write(mode: 'html' | 'markdown', text: string): void;
  /** The content was changed through the field: report it. */
  changed(): void;
  /** The mode changed. */
  modeChanged(mode: ViewMode): void;
  /** True when the content cannot be set from Markdown without changing it (colours, columns...). */
  lossy(): boolean;
  warn(message: string): void;
  isReadOnly(): boolean;
  t(key: string): string;
  /** Turns the tools of the editor (toolbars) on or off: they work on the text, which is not there in the other views. */
  setToolsEnabled(enabled: boolean): void;
}

let counter = 0;

export class ModeSwitch {
  readonly el: HTMLElement;
  private readonly field: HTMLTextAreaElement;
  private readonly radios = new Map<ViewMode, HTMLButtonElement>();
  private current: ViewMode = 'editor';
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly host: ModeHost, readonly modes: ViewMode[]) {
    const doc = host.doc;
    const id = `aurebesh-mode-${++counter}`;
    this.el = doc.createElement('div');
    this.el.className = 'aurebesh-modes';
    this.el.setAttribute('role', 'radiogroup');
    this.el.setAttribute('aria-label', host.t('ui.mode.label'));
    for (const mode of modes) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'aurebesh-mode';
      b.dataset.mode = mode;
      b.setAttribute('role', 'radio');
      b.textContent = host.t(`ui.mode.${mode}`);
      b.addEventListener('click', () => this.set(mode));
      this.radios.set(mode, b);
      this.el.appendChild(b);
    }
    this.el.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const rtl = doc.defaultView?.getComputedStyle(this.el).direction === 'rtl';
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (rtl && e.key === 'ArrowRight' ? -1 : 1) : rtl && e.key === 'ArrowLeft' ? 1 : -1;
      const next = modes[(modes.indexOf(this.current) + step + modes.length) % modes.length];
      this.set(next);
      this.radios.get(next)!.focus();
    });

    this.field = doc.createElement('textarea');
    this.field.className = 'aurebesh-source';
    this.field.id = id;
    this.field.hidden = true;
    this.field.spellcheck = false;
    this.field.setAttribute('autocapitalize', 'off');
    this.field.setAttribute('autocomplete', 'off');
    this.field.addEventListener('input', () => {
      this.dirty = true;
      this.grow();
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), 250);
    });
    this.field.addEventListener('blur', () => this.flush());
    host.stage.appendChild(this.field);
    this.sync();
  }

  get mode(): ViewMode {
    return this.current;
  }

  /** Applies what was typed in the field to the content, if anything was. */
  flush(): void {
    clearTimeout(this.timer);
    if (!this.dirty || this.current === 'editor') return;
    this.dirty = false;
    this.host.write(this.current, this.field.value);
    this.host.changed();
  }

  set(mode: ViewMode): void {
    if (mode === this.current || !this.modes.includes(mode)) return;
    const from = this.current;
    this.flush();
    this.current = mode;
    if (mode === 'editor') {
      this.field.hidden = true;
      this.host.content.hidden = false;
      this.host.setToolsEnabled(true);
      this.host.stage.closest('.aurebesh')?.classList.remove('aurebesh-source-mode');
    } else {
      if (from === 'editor' && mode === 'markdown' && this.host.lossy()) this.host.warn(this.host.t('ui.mode.lossy'));
      this.field.value = this.host.read(mode);
      this.field.setAttribute('aria-label', this.host.t(`ui.mode.${mode}.field`));
      this.field.lang = '';
      this.field.hidden = false;
      this.host.content.hidden = true;
      this.host.setToolsEnabled(false);
      this.host.stage.closest('.aurebesh')?.classList.add('aurebesh-source-mode');
      this.grow();
    }
    this.sync();
    this.host.modeChanged(mode);
  }

  /** Read-only and the state of the radios. */
  sync(): void {
    this.field.readOnly = this.host.isReadOnly();
    for (const [mode, b] of this.radios) {
      const on = mode === this.current;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    }
  }

  /** The field is as high as its text (the page scrolls, or the maximum height of the editor does). */
  private grow(): void {
    this.field.style.height = 'auto';
    this.field.style.height = `${this.field.scrollHeight}px`;
  }
}
