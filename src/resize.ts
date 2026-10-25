/**
 * The height of the editor, which the user can change: a bar under the text with a grip that is dragged (with a mouse, a finger or a pen)
 * or moved with the arrow keys (Enter goes back to the start). Until it is used the editor is as high as the text (at least its minimum height); after that it has a
 * height of its own and the text scrolls inside it. A double click on the bar goes back to the start. The height is the one of the
 * text (and the sidebar next to it), not of the toolbar. The editor does not keep the height: the `resized` event gives it.
 */
export interface ResizeOptions {
  /** The height to start with, in pixels. Default: as high as the text. */
  height?: number;
  /** The lowest the text area can be, in pixels. Default: its minimum height (150). */
  min?: number;
  /** The highest the text area can be, in pixels. Default: the height of the window. */
  max?: number;
}

export interface ResizeHost {
  root: HTMLElement;
  /** The element that gets the height: the text with the sidebar beside it. */
  target(): HTMLElement;
  /** The minimum height that the styles give the text area, when the options do not say. */
  minimum(): number;
  t(key: string): string;
  /** The height changed (null: back to as high as the text). */
  resized(height: number | null): void;
}

const STEP = 24;
const PAGE = 200;

export class Resizer {
  readonly el: HTMLElement;
  private height: number | null = null;
  private dragging: { y: number; start: number } | null = null;
  private cleanup: Array<() => void> = [];

  constructor(
    private readonly host: ResizeHost,
    private readonly options: ResizeOptions,
  ) {
    const doc = host.root.ownerDocument;
    const win = doc.defaultView;
    this.el = doc.createElement('div');
    this.el.className = 'aurebesh-resize';
    this.el.setAttribute('role', 'separator');
    this.el.setAttribute('aria-orientation', 'horizontal');
    this.el.setAttribute('aria-label', host.t('ui.resize'));
    this.el.title = host.t('ui.resize');
    this.el.tabIndex = 0;
    const grip = doc.createElement('span');
    grip.className = 'aurebesh-resize-grip';
    this.el.appendChild(grip);

    const on = (target: EventTarget, type: string, fn: (e: any) => void) => {
      target.addEventListener(type, fn);
      this.cleanup.push(() => target.removeEventListener(type, fn));
    };
    on(this.el, 'pointerdown', (e: PointerEvent) => this.down(e));
    on(this.el, 'pointermove', (e: PointerEvent) => this.move(e));
    on(this.el, 'pointerup', (e: PointerEvent) => this.up(e));
    on(this.el, 'pointercancel', (e: PointerEvent) => this.up(e));
    on(this.el, 'dblclick', () => this.reset());
    on(this.el, 'keydown', (e: KeyboardEvent) => this.key(e));
    // a window that gets smaller takes the editor along: it cannot stay higher than the window
    if (win) on(win, 'resize', () => this.height !== null && this.set(this.height, true));

    if (options.height !== undefined) this.set(options.height, false);
    else this.aria();
  }

  destroy(): void {
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    this.el.remove();
  }

  get current(): number | null {
    return this.height;
  }

  /** The lowest and the highest height that is allowed now. */
  limits(): { min: number; max: number } {
    const min = Math.max(40, this.options.min ?? this.host.minimum());
    const window = this.host.root.ownerDocument.defaultView?.innerHeight ?? Infinity;
    const max = Math.max(min, this.options.max ?? window);
    return { min, max };
  }

  /** Gives the editor a height in pixels (within the limits), or with null takes it back to as high as the text. */
  set(height: number | null, quiet = false): void {
    const { root } = this.host;
    if (height === null) {
      this.height = null;
      root.classList.remove('aurebesh-sized');
      root.style.removeProperty('--aurebesh-height');
      root.style.removeProperty('--aurebesh-max-height');
    } else if (Number.isFinite(height)) {
      const { min, max } = this.limits();
      this.height = Math.round(Math.min(max, Math.max(min, height)));
      root.classList.add('aurebesh-sized');
      root.style.setProperty('--aurebesh-height', `${this.height}px`);
      // the height of the user is the one that counts, also where the page gave the text a maximum height
      root.style.setProperty('--aurebesh-max-height', 'none');
    } else return;
    this.aria();
    if (!quiet) this.host.resized(this.height);
  }

  /** Back to the start: the height of the options, or as high as the text. */
  reset(): void {
    this.set(this.options.height ?? null);
  }

  private aria(): void {
    const { min, max } = this.limits();
    this.el.setAttribute('aria-valuemin', String(min));
    this.el.setAttribute('aria-valuemax', String(Math.round(max)));
    const now = this.height ?? Math.round(this.host.target().getBoundingClientRect().height);
    this.el.setAttribute('aria-valuenow', String(now));
  }

  private down(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    this.dragging = { y: e.clientY, start: this.host.target().getBoundingClientRect().height };
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer that is not known (a test, an odd browser): the events of the bar itself are enough */
    }
    this.host.root.classList.add('aurebesh-resizing');
    this.el.focus({ preventScroll: true });
  }

  private move(e: PointerEvent): void {
    if (!this.dragging) return;
    this.set(this.dragging.start + e.clientY - this.dragging.y, true);
  }

  private up(e: PointerEvent): void {
    if (!this.dragging) return;
    this.move(e);
    this.dragging = null;
    this.host.root.classList.remove('aurebesh-resizing');
    try {
      this.el.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    this.host.resized(this.height);
  }

  private key(e: KeyboardEvent): void {
    const now = this.height ?? this.host.target().getBoundingClientRect().height;
    const { min, max } = this.limits();
    let next: number | null = null;
    if (e.key === 'ArrowDown') next = now + STEP;
    else if (e.key === 'ArrowUp') next = now - STEP;
    else if (e.key === 'PageDown') next = now + PAGE;
    else if (e.key === 'PageUp') next = now - PAGE;
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    else if (e.key === 'Enter') {
      e.preventDefault();
      this.reset();
      return;
    }
    if (next === null) return;
    e.preventDefault();
    this.set(next);
  }
}
