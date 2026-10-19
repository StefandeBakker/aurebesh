/**
 * Handles on the table that has the caret (or the pointer): on the column borders and the row borders to drag them wider or taller, and
 * a grip at every row and every column to drag it to another place, or to tap it to select it. They are made with pointer events, so
 * they work with a mouse, a finger and a pen alike, and they are bigger on a touch screen. The cells that are selected are shown with
 * a frame, which is what Merge works on.
 *
 * The handles are not part of the text: they are in a layer over it, which is as big as the text area, so what has scrolled out of it
 * is not shown. The widths of the columns are stored as percentages and the heights of the rows in pixels, which the browser's undo
 * does not cover (as with dragging a column border by itself); moving a row or a column is one step for undo.
 */
import { canMoveColumn, canMoveRow, currentTable, locate, modelOf, moveColumn, moveRow, readWidths, selectionCells, selectLine, writeWidths } from './table';

/** A column is never narrower than this many percent, and a row never lower than this many pixels. */
const MIN_COLUMN = 5;
const MIN_ROW = 24;
/** How far (px) a grip is dragged before it is a move and not a tap. */
const MOVE_AFTER = 6;

export interface HandlesHost {
  content: HTMLElement;
  stage: HTMLElement;
  /** Whether the text can be changed: no handles in a read-only editor. */
  canEdit(): boolean;
  /** Something was changed by a drag. */
  changed(): void;
  /** Gives the focus to the text (before a table command, which works on the selection). */
  focus(): void;
  /** Says why a row or a column cannot move. */
  warn(message: string): void;
  t(key: string): string;
}

type Kind = 'col' | 'row' | 'col-grip' | 'row-grip';

interface Handle {
  el: HTMLElement;
  kind: Kind;
  index: number;
  /** For a border: the rows (of a column border) or the columns (of a row border) where it is a border between two cells. */
  from?: number;
  to?: number;
}

const px = (n: number): string => `${Math.round(n * 10) / 10}px`;

export function attachTableHandles(host: HandlesHost): () => void {
  const { content, stage } = host;
  const doc = content.ownerDocument;
  const win = doc.defaultView!;
  const layer = doc.createElement('div');
  layer.className = 'aurebesh-handles';
  layer.setAttribute('aria-hidden', 'true');
  stage.appendChild(layer);

  let table: HTMLTableElement | null = null;
  let hovered: HTMLTableElement | null = null;
  let handles: Handle[] = [];
  let busy = false; // a drag is going on: the handles stay as they are
  let frame = 0;
  let leaveTimer: ReturnType<typeof setTimeout> | undefined;

  const element = (className: string, parent: HTMLElement = layer): HTMLDivElement => {
    const el = doc.createElement('div');
    el.className = className;
    parent.appendChild(el);
    return el;
  };

  /** Where the layer is: over the text area, so that what is outside it is cut off. */
  function placeLayer(): DOMRect {
    const cr = content.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    layer.style.left = px(cr.left - sr.left - stage.clientLeft + stage.scrollLeft);
    layer.style.top = px(cr.top - sr.top - stage.clientTop + stage.scrollTop);
    layer.style.width = px(content.clientWidth);
    layer.style.height = px(content.clientHeight);
    return cr;
  }

  function rtl(t: HTMLTableElement): boolean {
    return win.getComputedStyle(t).direction === 'rtl';
  }

  /** Puts the handles where the borders and the rows are. */
  function position(): void {
    if (!table || !table.isConnected) return;
    const cr = placeLayer();
    const tr = table.getBoundingClientRect();
    const model = modelOf(table);
    const backwards = rtl(table);
    // the visual edge of a column in the first row that has a cell starting or ending there
    const edge = (col: number, side: 'near' | 'far'): number => {
      for (const row of model.m) {
        const cell = row[col];
        const at = cell && locate(model, cell);
        if (!cell || !at) continue;
        const r = cell.getBoundingClientRect();
        const last = col === at.c + at.cs - 1;
        const first = col === at.c;
        if (side === 'far' ? last : first) return (side === 'far') === !backwards ? r.right : r.left;
      }
      return NaN;
    };
    for (const h of handles) {
      const el = h.el;
      if (h.kind === 'col') {
        // only where the border is between two cells: not through a cell that is merged over both columns
        const top = model.rows[h.from!].getBoundingClientRect().top;
        const bottom = model.rows[h.to!].getBoundingClientRect().bottom;
        const cell = model.m[h.from!][h.index]!.getBoundingClientRect();
        el.style.left = px((backwards ? cell.left : cell.right) - cr.left);
        el.style.top = px(top - cr.top);
        el.style.height = px(bottom - top);
      } else if (h.kind === 'row') {
        const row = model.m[h.index];
        const boxes = new Set<Element>();
        for (let col = h.from!; col <= h.to!; col++) if (row[col]) boxes.add(row[col]!);
        const rects = [...boxes].map((cell) => cell.getBoundingClientRect());
        const left = Math.min(...rects.map((r) => r.left));
        const right = Math.max(...rects.map((r) => r.right));
        const r = model.rows[h.index].getBoundingClientRect();
        el.style.top = px(r.bottom - cr.top);
        el.style.left = px(left - cr.left);
        el.style.width = px(right - left);
      } else if (h.kind === 'col-grip') {
        const a = edge(h.index, 'near');
        const b = edge(h.index, 'far');
        el.style.left = px((a + b) / 2 - cr.left);
        el.style.top = px(Math.max(0, tr.top - cr.top - 16));
      } else {
        const r = model.rows[h.index].getBoundingClientRect();
        el.style.top = px((r.top + r.bottom) / 2 - cr.top);
        el.style.left = px(Math.max(0, tr.left - cr.left - 14));
      }
    }
    for (const frame of Array.from(layer.querySelectorAll<HTMLElement>('.aurebesh-cell-sel'))) {
      const cell = (frame as HTMLElement & { cell?: Element }).cell;
      if (!cell) continue;
      const r = cell.getBoundingClientRect();
      Object.assign(frame.style, { left: px(r.left - cr.left), top: px(r.top - cr.top), width: px(r.width), height: px(r.height) });
    }
  }

  /** Makes the handles for the table that is active, and the frames of the selected cells. */
  function build(): void {
    layer.replaceChildren();
    handles = [];
    const next = host.canEdit() ? currentTable() ?? hovered : null;
    table = next && content.contains(next) ? next : null;
    if (!table) return;
    const model = modelOf(table);
    const add = (kind: Kind, index: number, className: string, run?: [number, number]) => {
      const el = element(`aurebesh-handle aurebesh-handle-${kind} ${className}`);
      handles.push({ el, kind, index, from: run?.[0], to: run?.[1] });
      el.addEventListener('pointerdown', (e) => start(e, kind, index, el));
      return el;
    };
    // a border is made of the stretches where it lies between two different cells
    const runs = (length: number, border: (i: number) => boolean): [number, number][] => {
      const out: [number, number][] = [];
      for (let i = 0; i < length; i++) {
        if (!border(i)) continue;
        const last = out[out.length - 1];
        if (last && last[1] === i - 1) last[1] = i;
        else out.push([i, i]);
      }
      return out;
    };
    for (let i = 0; i < model.cols - 1; i++) for (const run of runs(model.m.length, (r) => model.m[r][i] !== model.m[r][i + 1])) add('col', i, '', run);
    for (let j = 0; j < model.rows.length; j++) {
      // the last row has no row below it: its border is the edge of the table, all along
      for (const run of runs(model.cols, (col) => j === model.rows.length - 1 || model.m[j][col] !== model.m[j + 1][col])) add('row', j, '', run);
    }
    for (let c = 0; c < model.cols; c++) add('col-grip', c, '').title = host.t('ui.columnHandle');
    for (let r = 0; r < model.rows.length; r++) add('row-grip', r, '').title = host.t('ui.rowHandle');
    const selected = selectionCells();
    if (selected && selected.table === table && selected.cells.length > 1) {
      for (const cell of selected.cells) {
        const frame = element('aurebesh-cell-sel') as HTMLElement & { cell?: Element };
        frame.cell = cell;
      }
    }
    position();
  }

  function update(): void {
    frame = 0;
    if (busy) return;
    build();
  }

  const schedule = (): void => {
    if (!frame) frame = win.requestAnimationFrame(update);
  };

  // ---- dragging --------------------------------------------------------------------------------------------------

  function start(e: PointerEvent, kind: Kind, index: number, el: HTMLElement): void {
    if (!table || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    e.stopPropagation();
    const t = table;
    try {
      el.setPointerCapture?.(e.pointerId); // so that the drag goes on outside the handle
    } catch {
      /* a pointer that is not known (a test, an odd browser): the events of the handle itself are enough */
    }
    busy = true;
    el.classList.add('is-dragging');
    const x0 = e.clientX;
    const y0 = e.clientY;
    const done = () => {
      busy = false;
      el.classList.remove('is-dragging');
      layer.querySelector('.aurebesh-drop')?.remove();
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      schedule();
    };
    const cancel = () => done();
    let move: (ev: PointerEvent) => void;
    let up: (ev: PointerEvent) => void;

    if (kind === 'col') {
      const model = modelOf(t);
      const widths = readWidths(t, model.cols);
      const begin = widths.slice();
      const total = t.getBoundingClientRect().width || 1;
      const sign = rtl(t) ? -1 : 1;
      let changed = false;
      move = (ev) => {
        const pct = (((ev.clientX - x0) * sign) / total) * 100;
        const d = Math.max(-(begin[index] - MIN_COLUMN), Math.min(begin[index + 1] - MIN_COLUMN, pct));
        widths[index] = begin[index] + d;
        widths[index + 1] = begin[index + 1] - d;
        writeWidths(t, widths);
        changed = true;
        position();
      };
      up = () => {
        done();
        if (changed) host.changed();
      };
    } else if (kind === 'row') {
      const row = modelOf(t).rows[index];
      const begin = row.getBoundingClientRect().height;
      let changed = false;
      move = (ev) => {
        row.style.height = `${Math.round(Math.max(MIN_ROW, begin + ev.clientY - y0))}px`;
        changed = true;
        position();
      };
      up = () => {
        done();
        if (changed) host.changed();
      };
    } else {
      // a grip: a tap selects the row or the column, a drag moves it
      const axis = kind === 'row-grip' ? 'row' : 'column';
      const model = modelOf(t);
      const count = axis === 'row' ? model.rows.length : model.cols;
      let target = index;
      let moving = false;
      const slots = (): [number, number][] =>
        Array.from({ length: count }, (_, i) => {
          if (axis === 'row') {
            const r = model.rows[i].getBoundingClientRect();
            return [r.top, r.bottom] as [number, number];
          }
          const cell = model.m.map((row) => row[i]).find((c) => c);
          const r = cell!.getBoundingClientRect();
          return [r.left, r.right] as [number, number];
        });
      move = (ev) => {
        if (!moving && Math.hypot(ev.clientX - x0, ev.clientY - y0) < MOVE_AFTER) return;
        moving = true;
        const at = axis === 'row' ? ev.clientY : ev.clientX;
        const all = slots();
        const mirrored = axis === 'column' && rtl(t);
        let found = all.findIndex(([a, b]) => at >= a && at < b);
        if (found < 0) found = at < Math.min(...all.map((s) => s[0])) ? (mirrored ? count - 1 : 0) : mirrored ? 0 : count - 1;
        target = found;
        // the line shows where it will go: before the slot it moves up to, after the one it moves down to
        const cr = content.getBoundingClientRect();
        const tr = t.getBoundingClientRect();
        const slot = all[target];
        const after = mirrored ? target < index : target > index;
        const line = layer.querySelector<HTMLElement>('.aurebesh-drop') ?? element('aurebesh-drop');
        if (axis === 'row') {
          Object.assign(line.style, { left: px(tr.left - cr.left), width: px(tr.width), top: px((after ? slot[1] : slot[0]) - cr.top - 1), height: '3px' });
        } else {
          const edge = (after ? slot[1] : slot[0]) === slot[1] ? slot[1] : slot[0];
          Object.assign(line.style, { top: px(tr.top - cr.top), height: px(tr.height), left: px(edge - cr.left - 1), width: '3px' });
        }
      };
      up = () => {
        done();
        host.focus();
        if (!moving) return selectLine(t, axis, index);
        if (target === index) return;
        if (!(axis === 'row' ? canMoveRow(t, index, target) : canMoveColumn(t, index, target))) {
          host.warn(host.t(axis === 'row' ? 'ui.cannotMoveRow' : 'ui.cannotMoveColumn'));
          return;
        }
        (axis === 'row' ? moveRow : moveColumn)(t, index, target);
        host.changed();
      };
    }
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
  }

  // ---- what makes the handles come and go ------------------------------------------------------------------------

  const over = (e: Event) => {
    clearTimeout(leaveTimer);
    const t = (e.target as Element | null)?.closest?.('table') as HTMLTableElement | null | undefined;
    if (t && content.contains(t) && t !== hovered) {
      hovered = t;
      schedule();
    }
  };
  const leave = () => {
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      hovered = null;
      schedule();
    }, 400);
  };
  const keep = () => clearTimeout(leaveTimer); // the pointer went onto a handle: that is still the table

  const mutations = new MutationObserver(schedule);
  mutations.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'colspan', 'rowspan', 'contenteditable'] });
  content.addEventListener('pointerover', over);
  content.addEventListener('pointerleave', leave);
  layer.addEventListener('pointerover', keep);
  layer.addEventListener('pointerleave', leave);
  doc.addEventListener('selectionchange', schedule);
  content.addEventListener('scroll', schedule);
  stage.addEventListener('scroll', schedule);
  win.addEventListener('scroll', schedule, true);
  win.addEventListener('resize', schedule);
  schedule();

  return () => {
    clearTimeout(leaveTimer);
    win.cancelAnimationFrame(frame);
    mutations.disconnect();
    content.removeEventListener('pointerover', over);
    content.removeEventListener('pointerleave', leave);
    doc.removeEventListener('selectionchange', schedule);
    content.removeEventListener('scroll', schedule);
    stage.removeEventListener('scroll', schedule);
    win.removeEventListener('scroll', schedule, true);
    win.removeEventListener('resize', schedule);
    layer.remove();
  };
}
