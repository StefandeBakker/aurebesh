/** Table operations. They work on the current selection, so they need no reference to an editor instance. */

const ROOT = '.aurebesh-content';
/** More than this many columns or spans is not a real table; it also keeps a hostile `colspan` from making a huge grid. */
const MAX_SPAN = 100;

type Cell = HTMLTableCellElement;
type Coord = [row: number, col: number];

const elementOf = (node: Node | null | undefined): Element | null | undefined =>
  node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);

const cellOf = (el: Element | null | undefined): Cell | null => {
  const cell = el?.closest('td,th') as Cell | null | undefined;
  return cell?.closest(ROOT) ? cell : null;
};

/**
 * The cell a selection edge is in. An edge can also be set on a row or table itself (browsers do that for a selection that
 * runs over cells): `side` says whether to take the node at the offset (a start) or the one before it (an end).
 */
function cellAt(node: Node | null, offset: number, side: 'start' | 'end'): Cell | null {
  const inside = cellOf(elementOf(node));
  if (inside || !node || node.nodeType !== Node.ELEMENT_NODE) return inside;
  const child = node.childNodes[side === 'start' ? offset : offset - 1] as Element | undefined;
  if (child?.nodeType !== Node.ELEMENT_NODE) return null;
  const cells = child.matches('td,th') ? [child as Cell] : Array.from(child.querySelectorAll<Cell>('td,th'));
  return cellOf(cells[side === 'start' ? 0 : cells.length - 1]);
}

/**
 * A drag from one cell to another: browsers move the start of such a selection out of the cell (to the start of the
 * editor, for one), so which cells it ran between is remembered from the mouse.
 */
const dragged: { start: Cell | null; end: Cell | null } = { start: null, end: null };

export function trackCellDrag(content: HTMLElement): () => void {
  // While a button is held, browsers can report the event on another element, so what is under the pointer is looked up.
  const cellUnder = (e: MouseEvent) => cellOf(content.ownerDocument.elementFromPoint(e.clientX, e.clientY));
  const down = (e: MouseEvent) => {
    dragged.start = dragged.end = e.button === 0 ? cellUnder(e) : null;
  };
  const move = (e: MouseEvent) => {
    if (dragged.start && e.buttons & 1) dragged.end = cellUnder(e) ?? dragged.end;
  };
  const up = (e: MouseEvent) => {
    if (dragged.start) dragged.end = cellUnder(e) ?? dragged.end;
  };
  const forget = () => (dragged.start = dragged.end = null); // a keyboard selection is not a drag
  content.addEventListener('mousedown', down);
  content.ownerDocument.addEventListener('mousemove', move);
  content.addEventListener('keydown', forget);
  content.ownerDocument.addEventListener('mouseup', up);
  return () => {
    content.removeEventListener('keydown', forget);
    content.removeEventListener('mousedown', down);
    content.ownerDocument.removeEventListener('mousemove', move);
    content.ownerDocument.removeEventListener('mouseup', up);
    dragged.start = dragged.end = null;
  };
}

/** The cells at the two ends of the selection (the remembered drag fills in an end the browser moved out of the table). */
function selectionEnds(): Cell[] {
  const sel = document.getSelection();
  if (!sel?.rangeCount) return [];
  const r = sel.getRangeAt(0);
  // What the mouse did is more reliable than where a browser put the edges of a selection that runs over cells.
  const { start, end } = dragged;
  if (!r.collapsed && start && end && start !== end && start.isConnected && end.isConnected && start.closest('table') === end.closest('table')) return [start, end];
  return [cellAt(r.startContainer, r.startOffset, 'start'), cellAt(r.endContainer, r.endOffset, 'end')].filter((c): c is Cell => !!c);
}

export function currentCell(): Cell | null {
  const sel = document.getSelection();
  return cellOf(elementOf(sel?.anchorNode)) ?? selectionEnds()[0] ?? null;
}

function placeCaret(el: Element): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(true);
  const sel = document.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

const newCell = (tag = 'td'): Cell => {
  const c = document.createElement(tag) as Cell;
  c.appendChild(document.createElement('br'));
  return c;
};

// ---- the grid ---------------------------------------------------------------------------------------------
//
// A table with merged cells is not a simple list of rows of cells: a cell can cover several grid positions.
// Every operation therefore works on a grid (one entry per row and column, the same cell object in every
// position it covers), changes that, and writes the rows back with the colspan/rowspan worked out from it.

export interface Model {
  rows: HTMLTableRowElement[];
  /** m[row][col]: the cell covering that position (null where a ragged row has nothing). */
  m: (Cell | null)[][];
  cols: number;
}

const spanOf = (cell: Element, attr: 'colspan' | 'rowspan'): number => Math.min(MAX_SPAN, Math.max(1, parseInt(cell.getAttribute(attr) ?? '', 10) || 1));

export function modelOf(table: HTMLTableElement): Model {
  const rows = Array.from(table.rows);
  const sparse: (Cell | undefined)[][] = rows.map(() => []);
  rows.forEach((tr, r) => {
    let c = 0;
    for (const cell of Array.from(tr.cells)) {
      while (sparse[r][c]) c++;
      const cs = spanOf(cell, 'colspan');
      const rs = Math.min(spanOf(cell, 'rowspan'), rows.length - r);
      for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) sparse[r + i][c + j] = cell;
      c += cs;
    }
  });
  const cols = Math.max(0, ...sparse.map((row) => row.length));
  return { rows, cols, m: sparse.map((row) => Array.from({ length: cols }, (_, c) => row[c] ?? null)) };
}

/** Where a cell sits: its top-left position and how many rows and columns it covers. */
export function locate(model: Model, cell: Cell): { r: number; c: number; rs: number; cs: number } | null {
  let r1 = -1, c1 = -1, r2 = -1, c2 = -1;
  model.m.forEach((row, r) =>
    row.forEach((x, c) => {
      if (x !== cell) return;
      if (r1 < 0) [r1, c1] = [r, c];
      if (c1 > c) c1 = c;
      r2 = r;
      if (c > c2) c2 = c;
    }),
  );
  return r1 < 0 ? null : { r: r1, c: c1, rs: r2 - r1 + 1, cs: c2 - c1 + 1 };
}

/** Gives positions that have no cell (a ragged row) an empty one, so the grid is a full rectangle. */
function fill(model: Model): void {
  model.m.forEach((row) => row.forEach((x, c) => (row[c] = x ?? newCell())));
}

function setSpan(cell: Cell, attr: 'colspan' | 'rowspan', n: number): void {
  if (n > 1) cell.setAttribute(attr, String(n));
  else cell.removeAttribute(attr);
}

/** Writes the grid back into the rows. */
function render(model: Model): void {
  const { m, rows, cols } = model;
  const placed = new Set<Cell>();
  rows.forEach((tr, r) => {
    const own: Cell[] = [];
    for (let c = 0; c < cols; c++) {
      const cell = m[r][c];
      if (!cell || placed.has(cell)) continue;
      placed.add(cell); // the first position in reading order is where the cell starts
      let cs = 0;
      for (let j = c; j < cols && m[r][j] === cell; j++) cs++;
      let rs = 0;
      for (let i = r; i < rows.length && m[i][c] === cell; i++) rs++;
      setSpan(cell, 'colspan', cs);
      setSpan(cell, 'rowspan', rs);
      own.push(cell);
    }
    tr.replaceChildren(...own);
  });
}

// ---- column widths ----------------------------------------------------------------------------------------

/** The `<col>` elements of the table's `<colgroup>`, if it has one that matches the number of columns. */
export function colsOf(table: HTMLTableElement): HTMLTableColElement[] {
  return Array.from(table.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col'));
}

export function readWidths(table: HTMLTableElement, count: number): number[] {
  const cols = colsOf(table);
  return Array.from({ length: count }, (_, i) => {
    const w = parseFloat(cols[i]?.style.width ?? '');
    return w > 0 ? w : 100 / count;
  });
}

export function writeWidths(table: HTMLTableElement, widths: number[]): void {
  let group = table.querySelector(':scope > colgroup');
  if (!group) {
    group = document.createElement('colgroup');
    table.insertBefore(group, table.firstChild);
  }
  const total = widths.reduce((a, b) => a + b, 0) || 1;
  group.replaceChildren(
    ...widths.map((w) => {
      const col = document.createElement('col');
      col.style.width = `${Math.round((w / total) * 10000) / 100}%`;
      return col;
    }),
  );
}

/** Keeps the widths in step with a column that was added or removed (`added` / `removed` is the column index). */
function adjustWidths(table: HTMLTableElement, before: number, change: { added?: number; removed?: number }): void {
  const group = table.querySelector(':scope > colgroup');
  if (!group) return;
  if (colsOf(table).length !== before) return void group.remove(); // it did not match the table: back to equal columns
  const widths = readWidths(table, before);
  if (change.added !== undefined) widths.splice(change.added, 0, widths.reduce((a, b) => a + b, 0) / widths.length);
  if (change.removed !== undefined) widths.splice(change.removed, 1);
  if (widths.length) writeWidths(table, widths);
  else group.remove();
}

// ---- editing ----------------------------------------------------------------------------------------------

/**
 * A browser can't put the caret after a trailing block (table, video...), so make sure a paragraph follows it.
 * Browsers differ in what they add themselves (some produce <br><br>), so normalise that too.
 */
export function ensureParagraphAfter(block: Element): void {
  const next = block.nextElementSibling;
  if (!next) {
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    block.after(p);
  } else if (next.tagName === 'P' && !next.textContent && next.querySelectorAll('br').length > 1) {
    next.innerHTML = '<br>';
  }
}

export function insertTable(rows: number, cols: number): void {
  const root = elementOf(document.getSelection()?.anchorNode)?.closest(ROOT);
  if (!root || rows < 1 || cols < 1) return;
  const row = `<tr>${'<td><br></td>'.repeat(cols)}</tr>`;
  document.execCommand('insertHTML', false, `<table data-new><tbody>${row.repeat(rows)}</tbody></table>`);
  const table = root.querySelector('table[data-new]');
  if (!table) return;
  table.removeAttribute('data-new');
  ensureParagraphAfter(table);
  const first = table.querySelector('td');
  if (first) placeCaret(first);
}

/**
 * Edits a copy of the table's grid and swaps it in with `insertHTML`, so the browser records it in its undo history
 * (plain DOM edits would be invisible to Ctrl+Z). `mutate` changes the grid and returns the position to put the caret
 * in, or null when nothing is left and the table should go.
 */
function editTable(table: HTMLTableElement, mutate: (model: Model, copy: HTMLTableElement) => Coord | null): void {
  const root = table.closest(ROOT);
  if (!root) return;
  const copy = table.cloneNode(true) as HTMLTableElement;
  const model = modelOf(copy);
  fill(model);
  const target = mutate(model, copy);
  if (!target || !model.rows.length || !model.cols) return deleteTable(table);
  render(model);
  copy.setAttribute('data-new', '');
  selectNodes(table);
  document.execCommand('insertHTML', false, copy.outerHTML);
  const fresh = root.querySelector('table[data-new]') as HTMLTableElement | null;
  if (!fresh) return;
  fresh.removeAttribute('data-new');
  const grid = modelOf(fresh).m;
  const cell = grid[Math.min(target[0], grid.length - 1)]?.[Math.min(target[1], (grid[0]?.length ?? 1) - 1)];
  if (cell) placeCaret(cell);
}

function selectNodes(first: Node, last: Node = first): void {
  const range = document.createRange();
  range.setStartBefore(first);
  range.setEndAfter(last);
  const sel = document.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

/** The table and where the cell under the caret starts, measured before anything is changed. */
function here(): { table: HTMLTableElement; cell: Cell; at: { r: number; c: number; rs: number; cs: number } } | null {
  const cell = currentCell();
  const table = cell?.closest('table');
  if (!cell || !table) return null;
  const at = locate(modelOf(table), cell);
  return at ? { table, cell, at } : null;
}

export function addRow(): void {
  const h = here();
  if (!h) return;
  const { r, c, rs } = h.at;
  const below = r + rs - 1; // after the last row the cell covers
  editTable(h.table, (model) => {
    const { m, rows, cols } = model;
    const fresh: Cell[] = [];
    for (let i = 0; i < cols; i++) {
      const up = m[below][i]!;
      const down = m[below + 1]?.[i];
      // A cell that continues into the next row grows to take in the new one; any other position gets a cell of its own.
      fresh.push(down && down === up ? up : newCell());
    }
    const tr = document.createElement('tr');
    rows[below].after(tr);
    rows.splice(below + 1, 0, tr);
    m.splice(below + 1, 0, fresh);
    return [below + 1, c];
  });
}

export function addColumn(): void {
  const h = here();
  if (!h) return;
  const { r, c, cs } = h.at;
  const right = c + cs - 1; // after the last column the cell covers
  const before = modelOf(h.table).cols;
  editTable(h.table, (model, copy) => {
    const made = new Map<Cell, Cell>();
    model.m.forEach((row) => {
      const left = row[right]!;
      const next = row[right + 1];
      let entry: Cell;
      if (next && next === left) {
        entry = left; // a cell that continues into the next column grows to take in the new one
      } else {
        // one new cell next to a cell that spans several rows, shared by those rows
        entry = made.get(left) ?? newCell(left.tagName === 'TH' ? 'th' : 'td');
        made.set(left, entry);
      }
      row.splice(right + 1, 0, entry);
    });
    model.cols++;
    adjustWidths(copy, before, { added: right + 1 });
    return [r, right + 1];
  });
}

export function deleteRow(): void {
  const h = here();
  if (!h) return;
  const { r, c } = h.at;
  editTable(h.table, (model) => {
    const [tr] = model.rows.splice(r, 1);
    model.m.splice(r, 1);
    // a cell that only lived in this row goes with it; one that continues keeps going from the next row
    tr.remove();
    return model.rows.length ? [Math.min(r, model.rows.length - 1), c] : null;
  });
}

export function deleteColumn(): void {
  const h = here();
  if (!h) return;
  const { r, c } = h.at;
  const before = modelOf(h.table).cols;
  editTable(h.table, (model, copy) => {
    model.m.forEach((row) => row.splice(c, 1));
    model.cols--;
    adjustWidths(copy, before, { removed: c });
    return model.cols ? [r, Math.min(c, model.cols - 1)] : null;
  });
}

/** Turns the first row into header cells (<th>), or back into normal cells. */
export function toggleHeaderRow(): void {
  const h = here();
  if (!h) return;
  const { r, c } = h.at;
  editTable(h.table, (model) => {
    const first = new Set(model.m[0]);
    const toHeader = ![...first].every((x) => x!.tagName === 'TH');
    const swap = new Map<Cell, Cell>();
    for (const old of first) {
      const swapped = document.createElement(toHeader ? 'th' : 'td') as Cell;
      for (const attr of ['colspan', 'rowspan']) if (old!.hasAttribute(attr)) swapped.setAttribute(attr, old!.getAttribute(attr)!);
      swapped.append(...Array.from(old!.childNodes));
      swap.set(old!, swapped);
    }
    model.m.forEach((row) => row.forEach((x, i) => (row[i] = swap.get(x!) ?? x)));
    return [r, c];
  });
}

// ---- merging and splitting --------------------------------------------------------------------------------

/**
 * The cells the selection reaches in the table around the caret. A drag from one cell to another selects the rectangle
 * between them (the text between them in reading order would also take in the rest of the rows in between), so for that
 * only the cell it started in and the cell it ended in count; the rectangle is worked out from those.
 * Firefox selects cells as several ranges, one per cell.
 */
function selectedCells(table: HTMLTableElement): Cell[] {
  const sel = document.getSelection();
  if (!sel?.rangeCount) return [];
  if (sel.rangeCount === 1) {
    const ends = selectionEnds().filter((c) => c.closest('table') === table);
    if (ends.length) return ends;
  }
  const ranges = Array.from({ length: sel.rangeCount }, (_, i) => sel.getRangeAt(i));
  return Array.from(table.querySelectorAll<Cell>('td,th')).filter((cell) => cell.closest('table') === table && ranges.some((r) => r.intersectsNode(cell)));
}

/** The smallest rectangle of grid positions that holds the cells whole: a cell sticking out of it is taken in too. */
function rectOf(model: Model, cells: Cell[]): [r1: number, c1: number, r2: number, c2: number] | null {
  let rect: [number, number, number, number] | null = null;
  for (const cell of cells) {
    const at = locate(model, cell);
    if (!at) continue;
    const [r1, c1, r2, c2] = [at.r, at.c, at.r + at.rs - 1, at.c + at.cs - 1];
    rect = rect ? [Math.min(rect[0], r1), Math.min(rect[1], c1), Math.max(rect[2], r2), Math.max(rect[3], c2)] : [r1, c1, r2, c2];
  }
  if (!rect) return null;
  for (let grown = true; grown; ) {
    grown = false;
    for (let r = rect[0]; r <= rect[2]; r++) {
      for (let c = rect[1]; c <= rect[3]; c++) {
        const at = model.m[r][c] && locate(model, model.m[r][c]!);
        if (!at) continue;
        const next: [number, number, number, number] = [Math.min(rect[0], at.r), Math.min(rect[1], at.c), Math.max(rect[2], at.r + at.rs - 1), Math.max(rect[3], at.c + at.cs - 1)];
        if (next.some((v, i) => v !== rect![i])) {
          rect = next;
          grown = true;
        }
      }
    }
  }
  return rect;
}

const hasContent = (cell: Cell): boolean => !!cell.textContent?.trim() || !!cell.querySelector('img,video,iframe,hr,table,li');

/** Merging cells keeps what is in all of them, one after the other. */
function moveContent(from: Cell, to: Cell): void {
  if (!hasContent(from)) return;
  if (!hasContent(to)) to.replaceChildren();
  else if (to.lastChild?.nodeName !== 'BR') to.appendChild(document.createElement('br'));
  for (const node of Array.from(from.childNodes)) to.appendChild(node);
}

/** Whether the selection runs over two or more cells that could be merged. */
export function canMerge(): boolean {
  const cell = currentCell();
  const table = cell?.closest('table');
  if (!cell || !table) return false;
  const model = modelOf(table);
  const rect = rectOf(model, selectedCells(table));
  return !!rect && new Set(model.m.slice(rect[0], rect[2] + 1).flatMap((row) => row.slice(rect[1], rect[3] + 1))).size > 1;
}

/** Merges the selected cells into one (the top-left one), taking in any merged cell that sticks out of the selection. */
export function mergeCells(): void {
  const cell = currentCell();
  const table = cell?.closest('table');
  if (!cell || !table) return;
  const rect = rectOf(modelOf(table), selectedCells(table));
  if (!rect || !canMerge()) return;
  const [r1, c1, r2, c2] = rect;
  editTable(table, (model) => {
    const keep = model.m[r1][c1]!;
    const others = new Set<Cell>();
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (model.m[r][c] !== keep) others.add(model.m[r][c]!);
    // reading order, so the text of the merged cells stays in the order it was in
    [...others]
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      .forEach((other) => moveContent(other, keep));
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) model.m[r][c] = keep;
    return [r1, c1];
  });
}

/** Whether the cell under the caret is a merged one. */
export function canSplit(): boolean {
  const cell = currentCell();
  return !!cell && (spanOf(cell, 'colspan') > 1 || spanOf(cell, 'rowspan') > 1);
}

/** Splits a merged cell back into single cells; the text stays in the first. */
export function splitCell(): void {
  const h = here();
  if (!h || (h.at.cs === 1 && h.at.rs === 1)) return;
  const { r, c, rs, cs } = h.at;
  editTable(h.table, (model) => {
    for (let i = r; i < r + rs; i++) for (let j = c; j < c + cs; j++) if (i !== r || j !== c) model.m[i][j] = newCell(h.cell.tagName === 'TH' ? 'th' : 'td');
    return [r, c];
  });
}

export function deleteTable(table: HTMLTableElement | null = currentCell()?.closest('table') ?? null): void {
  const root = table?.closest(ROOT);
  if (!table || !root) return;
  // Take the empty paragraph that insertTable() put after a trailing table along, unless it is all that would be left.
  const after = table.nextElementSibling;
  const orphan = after && after.tagName === 'P' && !after.textContent && !after.nextElementSibling && table.previousElementSibling;
  selectNodes(table, orphan ? after : table);
  document.execCommand('delete');
  if (table.isConnected) table.remove(); // a browser that refused to delete the selection
  if (!root.firstChild) root.innerHTML = '<p><br></p>';
  const sel = document.getSelection();
  if (sel && (!sel.rangeCount || !root.contains(sel.anchorNode))) placeCaret(root.lastElementChild ?? root);
}

/** Tab / Shift+Tab moves between cells; Tab in the last cell adds a row. Returns true when handled. */
export function handleTab(e: KeyboardEvent): boolean {
  if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return false;
  const cell = currentCell();
  const table = cell?.closest('table');
  if (!cell || !table) return false;
  e.preventDefault();
  const cells = Array.from(table.querySelectorAll('td,th'));
  const i = cells.indexOf(cell);
  const step = e.shiftKey ? -1 : 1;
  if (step === 1 && i === cells.length - 1) {
    // the new row goes below the last row, not below a tall cell that happens to be last in reading order
    const lastRow = table.rows[table.rows.length - 1];
    placeCaret(lastRow.cells[lastRow.cells.length - 1]);
    addRow();
    const row = currentCell()?.parentElement as HTMLTableRowElement | undefined;
    if (row?.cells[0]) placeCaret(row.cells[0]);
    return true;
  }
  const next = cells[i + step];
  if (next) placeCaret(next);
  return true;
}
