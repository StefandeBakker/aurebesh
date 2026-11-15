/**
 * A frame around the picture or the video that is picked, with a square on each corner and in the middle of each side. Dragging one
 * changes the size: a corner keeps the shape (Shift: free), a side changes that side and the other follows to keep the shape (Shift: only
 * that side). The size is written in the style of the element (see `setMediaSize`), so it is the same wherever the HTML is shown.
 * The edit is one step of the history: the element goes back to what it was and the change is made again through `run`.
 */
import { mediaSize, setMediaSize } from './media';
import type { MediaElement } from './media';

const DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type Dir = (typeof DIRS)[number];

/** The smallest a picture can be made, in pixels. */
export const MIN_WIDTH = 24;
export const MIN_HEIGHT = 16;

export interface MediaFrameHost {
  /** The editor: the frame is put in it, and placed against it. */
  root: HTMLElement;
  /** The part of the text that can be seen (the text scrolls inside the editor when it has a maximum height). */
  view: () => DOMRect;
  canEdit: () => boolean;
  /** Makes a change as one step of the history, and tells the world. */
  run: (change: () => void) => void;
  /** The widest a picture can be: the width of the text. */
  limit: () => number;
  /** Called while a size is being dragged, and after it: the fields with the size show it. */
  sized: (el: MediaElement) => void;
}

export class MediaFrame {
  readonly el: HTMLElement;
  private target: MediaElement | null = null;
  private readonly cleanup: Array<() => void> = [];

  constructor(private readonly host: MediaFrameHost) {
    const doc = host.root.ownerDocument;
    const win = doc.defaultView!;
    this.el = doc.createElement('div');
    this.el.className = 'aurebesh-media-frame';
    this.el.hidden = true;
    for (const dir of DIRS) {
      const handle = doc.createElement('div');
      handle.className = 'aurebesh-media-handle';
      handle.dataset.dir = dir;
      handle.addEventListener('pointerdown', (e) => this.start(e, handle, dir));
      this.el.appendChild(handle);
    }
    host.root.appendChild(this.el);
    const place = () => this.place();
    win.addEventListener('resize', place);
    host.root.addEventListener('scroll', place, true);
    this.cleanup.push(() => win.removeEventListener('resize', place), () => host.root.removeEventListener('scroll', place, true), () => this.el.remove());
  }

  /** Puts the frame around `target`, or takes it away. */
  show(target: MediaElement | null): void {
    if (target !== this.target) {
      this.target?.removeEventListener('load', this.onLoad);
      target?.addEventListener('load', this.onLoad);
    }
    this.target = target && this.host.canEdit() ? target : null;
    this.place();
  }

  private onLoad = (): void => this.place();

  /** Moves the frame to where the element is now. */
  place(): void {
    const t = this.target;
    if (!t || !t.isConnected) {
      this.el.hidden = true;
      return;
    }
    const r = t.getBoundingClientRect();
    const view = this.host.view();
    if (r.bottom < view.top || r.top > view.bottom || !r.width || !r.height) {
      this.el.hidden = true;
      return;
    }
    const root = this.host.root;
    const box = root.getBoundingClientRect();
    this.el.hidden = false;
    this.el.style.left = `${Math.round(r.left - box.left - root.clientLeft)}px`;
    this.el.style.top = `${Math.round(r.top - box.top - root.clientTop)}px`;
    this.el.style.width = `${Math.round(r.width)}px`;
    this.el.style.height = `${Math.round(r.height)}px`;
  }

  private start(e: PointerEvent, handle: HTMLElement, dir: Dir): void {
    const t = this.target;
    if (!t || e.button !== 0 || !this.host.canEdit()) return;
    e.preventDefault(); // no selection moves while dragging
    e.stopPropagation();
    handle.setPointerCapture(e.pointerId);
    const first = mediaSize(t);
    const ratio = first.width / Math.max(1, first.height);
    const before = t.getAttribute('style');
    const sx = dir.includes('e') ? 1 : dir.includes('w') ? -1 : 0;
    const sy = dir.includes('s') ? 1 : dir.includes('n') ? -1 : 0;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const widest = Math.max(MIN_WIDTH, this.host.limit());

    const size = (ev: PointerEvent): { width: number; height: number } => {
      let width = first.width + sx * (ev.clientX - x0);
      let height = first.height + sy * (ev.clientY - y0);
      if (!ev.shiftKey) {
        // the shape stays: a corner goes with the two together, a side with the one that is dragged
        if (sx && sy) {
          // the side that was dragged furthest decides, so a corner moved along one side goes with it
          const sw = width / first.width;
          const sh = height / first.height;
          width = first.width * (Math.abs(sw - 1) >= Math.abs(sh - 1) ? sw : sh);
        }
        else if (sy) width = height * ratio;
        width = Math.min(widest, Math.max(MIN_WIDTH, width));
        height = width / ratio;
        if (height < MIN_HEIGHT) {
          height = MIN_HEIGHT;
          width = height * ratio;
        }
      } else {
        width = Math.min(widest, Math.max(MIN_WIDTH, sx ? width : first.width));
        height = Math.max(MIN_HEIGHT, sy ? height : first.height);
      }
      return { width, height };
    };

    const move = (ev: PointerEvent) => {
      const s = size(ev);
      setMediaSize(t, s.width, s.height);
      this.place();
      this.host.sized(t);
    };
    const done = (ev: PointerEvent, keep: boolean) => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', cancel);
      if (handle.hasPointerCapture(ev.pointerId)) handle.releasePointerCapture(ev.pointerId);
      const after = t.getAttribute('style');
      const restore = () => (before === null ? t.removeAttribute('style') : t.setAttribute('style', before));
      restore();
      if (keep && after !== before) {
        // the edit as one step of the history: from what it was to what it is
        this.host.run(() => (after === null ? t.removeAttribute('style') : t.setAttribute('style', after)));
      }
      this.place();
      this.host.sized(t);
    };
    const up = (ev: PointerEvent) => done(ev, true);
    const cancel = (ev: PointerEvent) => done(ev, false);
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', cancel);
  }

  destroy(): void {
    this.target?.removeEventListener('load', this.onLoad);
    this.cleanup.forEach((fn) => fn());
    this.cleanup.length = 0;
  }
}
