/**
 * Dragging a column border changes the column widths. The widths are stored as percentages in a <colgroup>
 * (`<col style="width: 40%">`), so a table keeps its proportions when the editor or the page is resized.
 * It edits the DOM directly, so the browser's undo does not cover it.
 */
import { locate, modelOf, readWidths, writeWidths } from './table';

/** How close to a border (in px) the pointer has to be to grab it. */
const GRAB = 4;
/** A column never gets narrower than this many percent. */
const MIN_WIDTH = 5;

interface Border {
  table: HTMLTableElement;
  /** The border between column `index` and column `index + 1`. */
  index: number;
}

/** The column border under the pointer, if there is one: not the outer edges of the table. */
function borderAt(e: MouseEvent, content: HTMLElement): Border | null {
  const cell = (e.target as Element | null)?.closest?.('td,th') as HTMLTableCellElement | null | undefined;
  const table = cell?.closest('table');
  if (!cell || !table || !content.contains(table)) return null;
  const rect = cell.getBoundingClientRect();
  const nearLeft = e.clientX - rect.left <= GRAB;
  const nearRight = rect.right - e.clientX <= GRAB;
  if (!nearLeft && !nearRight) return null;
  const model = modelOf(table);
  const at = locate(model, cell);
  if (!at) return null;
  const rtl = cell.ownerDocument.defaultView!.getComputedStyle(table).direction === 'rtl';
  // The border on the visual right of a cell is the one after its last column, unless the table runs right-to-left.
  const index = nearRight === !rtl ? at.c + at.cs - 1 : at.c - 1;
  return index >= 0 && index < model.cols - 1 ? { table, index } : null;
}

/**
 * Makes the column borders of the tables in `content` draggable. `canEdit` is asked every time (a read-only editor
 * doesn't resize) and `onChange` is called once after a drag. Returns a function that removes it all again.
 */
export function attachColumnResize(content: HTMLElement, canEdit: () => boolean, onChange: () => void): () => void {
  const doc = content.ownerDocument;
  let hover: Border | null = null;
  let dragging = false;

  const setHover = (border: Border | null) => {
    hover = border;
    content.classList.toggle('aurebesh-col-resize', !!border);
  };

  const onMove = (e: MouseEvent) => {
    if (dragging) return;
    setHover(canEdit() && e.buttons === 0 ? borderAt(e, content) : null);
  };

  const onDown = (e: MouseEvent) => {
    if (e.button !== 0 || !hover || !canEdit()) return;
    const { table, index } = hover;
    e.preventDefault(); // no text selection while dragging
    const model = modelOf(table);
    const widths = readWidths(table, model.cols);
    const start = widths.slice();
    const startX = e.clientX;
    const tableWidth = table.getBoundingClientRect().width || 1;
    const rtl = doc.defaultView!.getComputedStyle(table).direction === 'rtl';
    dragging = true;
    content.classList.add('aurebesh-col-resizing');

    const drag = (ev: MouseEvent) => {
      const pct = (((ev.clientX - startX) * (rtl ? -1 : 1)) / tableWidth) * 100;
      const d = Math.max(-(start[index] - MIN_WIDTH), Math.min(start[index + 1] - MIN_WIDTH, pct));
      widths[index] = start[index] + d;
      widths[index + 1] = start[index + 1] - d;
      writeWidths(table, widths);
    };
    const up = () => {
      doc.removeEventListener('mousemove', drag);
      doc.removeEventListener('mouseup', up);
      dragging = false;
      content.classList.remove('aurebesh-col-resizing');
      setHover(null);
      onChange();
    };
    doc.addEventListener('mousemove', drag);
    doc.addEventListener('mouseup', up);
  };

  content.addEventListener('mousemove', onMove);
  content.addEventListener('mousedown', onDown, true);
  return () => {
    content.removeEventListener('mousemove', onMove);
    content.removeEventListener('mousedown', onDown, true);
    content.classList.remove('aurebesh-col-resize', 'aurebesh-col-resizing');
  };
}
