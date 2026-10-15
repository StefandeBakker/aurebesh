/**
 * The panel beside the text. It holds one or more panels (the built-in Layout panel, and the ones that plugins add); one of them is
 * visible at a time. With a single panel the header shows its title, with several it shows tabs.
 */
import { iconElement } from './icons';

export interface PanelDef {
  id: string;
  title: string;
  /** Builds what is in the panel. Called once, when the panel is added. */
  build(): HTMLElement;
}

interface Entry {
  def: PanelDef;
  pane: HTMLElement;
}

let counter = 0;

export class Sidebar {
  readonly el: HTMLElement;
  private readonly head: HTMLElement;
  private readonly body: HTMLElement;
  private readonly entries: Entry[] = [];
  private openId: string | null = null;

  constructor(
    private readonly doc: Document,
    private readonly closeLabel: string,
    /** Called after the panel that is open changed (null: closed). */
    private readonly onChange: (id: string | null) => void,
    /** Called when the sidebar was closed from inside it (Escape or the cross): the focus goes back to the button of that panel. */
    private readonly focusBack: (id: string) => void,
  ) {
    this.el = doc.createElement('aside');
    this.el.className = 'aurebesh-panel';
    this.el.id = `aurebesh-panel-${++counter}-${Math.random().toString(36).slice(2, 6)}`;
    this.el.hidden = true;
    this.head = doc.createElement('div');
    this.head.className = 'aurebesh-panel-head';
    this.body = doc.createElement('div');
    this.body.className = 'aurebesh-panel-body';
    this.el.append(this.head, this.body);
    this.el.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation(); // not also out of full screen
      this.closeAndReturn();
    });
  }

  get ids(): string[] {
    return this.entries.map((e) => e.def.id);
  }

  get current(): string | null {
    return this.openId;
  }

  add(def: PanelDef): void {
    if (this.entries.some((e) => e.def.id === def.id)) return;
    const pane = this.doc.createElement('div');
    pane.className = 'aurebesh-panel-pane';
    pane.id = `${this.el.id}-${def.id}`;
    pane.hidden = true;
    pane.appendChild(def.build());
    this.body.appendChild(pane);
    this.entries.push({ def, pane });
    this.renderHead();
  }

  open(id: string): void {
    const entry = this.entries.find((e) => e.def.id === id);
    if (!entry) return;
    this.openId = id;
    this.el.hidden = false;
    this.el.setAttribute('aria-label', entry.def.title);
    for (const e of this.entries) e.pane.hidden = e !== entry;
    this.renderHead();
    this.onChange(id);
  }

  close(): void {
    if (this.openId === null) return;
    this.openId = null;
    this.el.hidden = true;
    this.renderHead();
    this.onChange(null);
  }

  toggle(id: string): void {
    if (this.openId === id) this.close();
    else this.open(id);
  }

  private closeAndReturn(): void {
    const id = this.openId;
    this.close();
    if (id) this.focusBack(id);
  }

  private renderHead(): void {
    const doc = this.doc;
    const tabFocus = !!(doc.activeElement as HTMLElement | null)?.classList.contains('aurebesh-panel-tab') && this.head.contains(doc.activeElement);
    this.head.replaceChildren();
    const open = this.entries.find((e) => e.def.id === this.openId);
    if (this.entries.length > 1) {
      const tabs = doc.createElement('div');
      tabs.className = 'aurebesh-panel-tabs';
      tabs.setAttribute('role', 'tablist');
      for (const e of this.entries) {
        const tab = doc.createElement('button');
        tab.type = 'button';
        tab.className = 'aurebesh-panel-tab';
        tab.id = `${e.pane.id}-tab`;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', String(e === open));
        tab.setAttribute('aria-controls', e.pane.id);
        tab.tabIndex = e === open ? 0 : -1;
        tab.textContent = e.def.title;
        tab.addEventListener('click', () => this.open(e.def.id));
        tabs.appendChild(tab);
      }
      tabs.addEventListener('keydown', (ev) => {
        if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
        const at = this.entries.findIndex((e) => `${e.pane.id}-tab` === (doc.activeElement as HTMLElement | null)?.id);
        if (at < 0) return;
        ev.preventDefault();
        const next = this.entries[(at + (ev.key === 'ArrowRight' ? 1 : -1) + this.entries.length) % this.entries.length];
        this.open(next.def.id);
        doc.getElementById(`${next.pane.id}-tab`)?.focus();
      });
      this.head.appendChild(tabs);
    } else if (open) {
      const title = doc.createElement('strong');
      title.textContent = open.def.title;
      this.head.appendChild(title);
    }
    if (tabFocus && open) doc.getElementById(`${open.pane.id}-tab`)?.focus();
    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'aurebesh-panel-close';
    close.setAttribute('aria-label', this.closeLabel);
    close.title = this.closeLabel;
    const icon = iconElement(doc, 'close');
    if (icon) close.appendChild(icon);
    close.addEventListener('click', () => this.closeAndReturn());
    this.head.appendChild(close);
  }
}
