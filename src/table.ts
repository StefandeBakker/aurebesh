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
function editTable(
  table: HTMLTableElement,
  mutate: (model: Model, copy: HTMLTableElement) => Coord | null,
  /** What to do with the selection afterwards, instead of putting the caret in the cell at the position `mutate` returned. */
  after?: (fresh: HTMLTableElement, grid: (Cell | null)[][]) => void,
): void {
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
  if (after) return after(fresh, grid);
  const cell = grid[Math.min(target[0], grid.length - 1)]?.[Math.min(target[1], (grid[0]?.length ?? 1) - 1)];
  if (cell) placeCaret(cell);
}

/** Selects the cells from the first to the last one, as a drag over them would (so that the next table command sees the same cells). */
function selectCells(grid: (Cell | null)[][], [r1, c1, r2, c2]: [number, number, number, number]): void {
  const first = grid[r1]?.[c1];
  const last = grid[r2]?.[c2];
  if (!first) return;
  if (!last || last === first) return placeCaret(first);
  const range = document.createRange();
  range.setStart(first, 0);
  range.setEnd(last, last.childNodes.length);
  const sel = document.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  dragged.start = first;
  dragged.end = last;
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
      for (const attr of ['colspan', 'rowspan', 'style']) if (old!.hasAttribute(attr)) swapped.setAttribute(attr, old!.getAttribute(attr)!);
      swapped.append(...Array.from(old!.childNodes));
      swap.set(old!, swapped);
    }
    model.m.forEach((row) => row.forEach((x, i) => (row[i] = swap.get(x!) ?? x)));
    return [r, c];
  });
}

// ---- cell properties and the caption ----------------------------------------------------------------------

/** What can be set on a cell, as the CSS property it is written as. */
export type CellProperty = 'background-color' | 'vertical-align' | 'text-align' | 'border';

/** The table around the caret: from a cell, or from its caption. */
export function currentTable(): HTMLTableElement | null {
  const table = elementOf(document.getSelection()?.anchorNode)?.closest('table') as HTMLTableElement | null | undefined;
  return table?.closest(ROOT) ? table : null;
}

/** The table and the rectangle of grid positions the selection reaches (the cell under the caret, when nothing is selected over cells). */
function selectedRect(): { table: HTMLTableElement; rect: [number, number, number, number] } | null {
  const cell = currentCell();
  const table = cell?.closest('table');
  if (!cell || !table) return null;
  const model = modelOf(table);
  const rect = rectOf(model, selectedCells(table));
  if (rect) return { table, rect };
  const at = locate(model, cell);
  return at ? { table, rect: [at.r, at.c, at.r + at.rs - 1, at.c + at.cs - 1] } : null;
}

/** The table and the cells of the selection (every cell once; the cell under the caret alone when nothing is selected over cells). */
export function selectionCells(): { table: HTMLTableElement; cells: Cell[] } | null {
  const found = selectedRect();
  if (!found) return null;
  const model = modelOf(found.table);
  const [r1, c1, r2, c2] = found.rect;
  const cells = new Set<Cell>();
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (model.m[r][c]) cells.add(model.m[r][c]!);
  return { table: found.table, cells: [...cells] };
}

/** The value of a property on the cell under the caret ('' when it has none). */
export function cellProperty(prop: CellProperty): string {
  const cell = currentCell();
  if (!cell) return '';
  return cell.style.getPropertyValue(prop).trim();
}

function writeCellProperty(cell: Cell, prop: CellProperty, value: string): void {
  if (value) cell.style.setProperty(prop, value);
  else cell.style.removeProperty(prop);
  if (!cell.getAttribute('style')?.trim()) cell.removeAttribute('style');
}

/**
 * Sets a property on all the cells of the selection (an empty value takes it away again). The change is one step for undo, and
 * the cells stay selected, so the next change goes to the same cells.
 */
export function setCellProperty(prop: CellProperty, value: string): void {
  const found = selectedRect();
  if (!found) return;
  const [r1, c1, r2, c2] = found.rect;
  editTable(
    found.table,
    (model) => {
      const done = new Set<Cell>();
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          const cell = model.m[r][c];
          if (!cell || done.has(cell)) continue;
          done.add(cell);
          writeCellProperty(cell, prop, value);
        }
      }
      return [r1, c1];
    },
    (_fresh, grid) => selectCells(grid, found.rect),
  );
}

/** Sets a property to a value, or takes it away when the cell under the caret has that value already (for a button that is on or off). */
export function toggleCellProperty(prop: CellProperty, value: string): void {
  setCellProperty(prop, cellProperty(prop) === value ? '' : value);
}

const DEFAULT_BORDER_COLOR = '#9aa3b2';

/** The width ('1px', 'none'...) and the colour of the border of the cell under the caret; '' for what it does not have. */
export function cellBorder(): { width: string; color: string } {
  const m = /^(\S+)\s+(?:solid|dashed|dotted|double)\s+(.+)$/.exec(cellProperty('border'));
  if (!m) return { width: '', color: '' };
  return m[1] === '0px' ? { width: 'none', color: '' } : { width: m[1], color: m[2] }; // no border is a border that is not there
}

/**
 * Sets the width of the border of the selected cells ('1px', '2px', 'none'; '' takes the border away) or its colour. A colour without a
 * width gives a thin border, a width without a colour a grey one.
 */
export function setCellBorder(part: 'width' | 'color', value: string): void {
  const now = cellBorder();
  // "No border" is written as a border of no width: browsers write `border: none` as four properties, which the sanitizer would drop
  if (part === 'width' && (value === '' || value === 'none')) return setCellProperty('border', value === '' ? '' : '0px solid transparent');
  const width = part === 'width' ? value : now.width && now.width !== 'none' ? now.width : '1px';
  const color = part === 'color' ? value : now.color || DEFAULT_BORDER_COLOR;
  setCellProperty('border', value === '' && part === 'color' ? `${width} solid ${DEFAULT_BORDER_COLOR}` : `${width} solid ${color}`);
}

/** Whether the table around the caret has a caption. */
export function hasCaption(): boolean {
  return !!currentTable()?.caption;
}

/** Adds a caption above the table (the caret goes into it), or takes it away. */
export function toggleCaption(): void {
  const table = currentTable();
  if (!table) return;
  const adding = !table.caption;
  const cell = currentCell();
  const at = cell ? locate(modelOf(table), cell) : null;
  editTable(
    table,
    (_model, copy) => {
      if (copy.caption) copy.caption.remove();
      else copy.createCaption().appendChild(document.createElement('br'));
      return [at?.r ?? 0, at?.c ?? 0];
    },
    (fresh, grid) => {
      if (adding && fresh.caption) placeCaret(fresh.caption);
      else if (grid[0]?.[0]) placeCaret(at ? grid[Math.min(at.r, grid.length - 1)][Math.min(at.c, grid[0].length - 1)] ?? grid[0][0]! : grid[0][0]!);
    },
  );
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

// ---- keyboard: up and down through the grid ---------------------------------------------------------------

type Sel = Selection & { modify?: (alter: string, direction: string, granularity: string) => void };

/** The caret of a collapsed selection: where it is on the screen, or null. */
function caretPoint(cell: Cell): { x: number; top: number; bottom: number } | null {
  const sel = document.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed) return null;
  const rect = sel.getRangeAt(0).getClientRects()[0] ?? cell.getBoundingClientRect(); // an empty line has no rectangle of its own
  return { x: rect.left, top: rect.top, bottom: rect.bottom };
}

/** Puts the caret in a cell as close to the horizontal position `x` as possible, on its first or its last line. */
function enterCell(cell: Cell, x: number, edge: 'first' | 'last'): void {
  const box = cell.getBoundingClientRect();
  const style = getComputedStyle(cell);
  const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4 || 18;
  const y = edge === 'first' ? box.top + (parseFloat(style.paddingTop) || 0) + line / 2 : box.bottom - (parseFloat(style.paddingBottom) || 0) - line / 2;
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  let range: Range | null = null;
  if (doc.caretRangeFromPoint) range = doc.caretRangeFromPoint(x, y);
  else if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
    }
  }
  if (range && cellOf(elementOf(range.startContainer)) === cell) {
    const sel = document.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    return;
  }
  const fallback = document.createRange();
  fallback.selectNodeContents(cell);
  fallback.collapse(edge === 'first');
  const sel = document.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(fallback);
}

/**
 * Up and Down at the top or the bottom line of a cell go to the cell above or below it in the grid. Browsers go by the order of the
 * cells in the HTML, which in a table with merged cells is not the order on the screen (down from a cell can end up beside it). Inside a
 * cell, and at the edge of the table, the browser does what it does. Returns true when handled.
 */
export function handleCellArrow(e: KeyboardEvent): boolean {
  if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return false;
  const sel = document.getSelection() as Sel | null;
  if (!sel?.rangeCount || !sel.isCollapsed || !sel.modify) return false;
  const cell = cellOf(elementOf(sel.anchorNode));
  const table = cell?.closest('table');
  if (!cell || !table) return false;
  const down = e.key === 'ArrowDown';
  const caret = caretPoint(cell);
  if (!caret) return false;

  // Another line in the cell: move by one line, as the browser would; when that leaves the cell, the caret is back where it was.
  const saved = sel.getRangeAt(0).cloneRange();
  sel.modify('move', down ? 'forward' : 'backward', 'line');
  const stayed = cellOf(elementOf(sel.anchorNode)) === cell;
  const moved = sel.anchorNode !== saved.startContainer || sel.anchorOffset !== saved.startOffset;
  if (stayed && moved) {
    e.preventDefault();
    return true;
  }
  sel.removeAllRanges();
  sel.addRange(saved);

  const model = modelOf(table);
  const at = locate(model, cell);
  const row = at ? (down ? at.r + at.rs : at.r - 1) : -1;
  if (!at) return false;
  if (row < 0 || row >= model.m.length) {
    // past the edge of the table: on to the block after (or before) it, not to the next cell in the HTML, which is where a browser goes
    const next = down ? table.nextElementSibling : table.previousElementSibling;
    if (!next) return false;
    const range = document.createRange();
    range.selectNodeContents(next);
    range.collapse(down);
    sel.removeAllRanges();
    sel.addRange(range);
    e.preventDefault();
    return true;
  }
  // the cell in that row that is under the caret
  let target: Cell | null = null;
  for (const candidate of new Set(model.m[row])) {
    const box = candidate?.getBoundingClientRect();
    if (candidate && box && caret.x >= box.left - 1 && caret.x < box.right) target = candidate;
  }
  target ??= model.m[row][at.c];
  if (!target) return false;
  e.preventDefault();
  enterCell(target, caret.x, down ? 'first' : 'last');
  return true;
}

// ---- copying and pasting rows and columns -----------------------------------------------------------------

interface Copied {
  /** What a line is: a row (its cells from left to right) or a column (its cells from top to bottom). */
  kind: 'row' | 'column';
  lines: { tag: string; html: string; style: string | null }[][];
}

/** What was copied last: it can be pasted in any table of the page. */
let copied: Copied | null = null;

/** Whether rows ('row') or columns ('column') were copied, so there is something to paste. */
export function hasCopied(kind: 'row' | 'column'): boolean {
  return copied?.kind === kind;
}

const entryOf = (cell: Cell | null | undefined) => ({ tag: cell?.tagName === 'TH' ? 'th' : 'td', html: cell?.innerHTML ?? '', style: cell?.getAttribute('style') ?? null });
const emptyEntry = (tag: string) => ({ tag, html: '', style: null });

/** The text of the copied cells as a spreadsheet takes it (tabs between cells, a line for each row), and as a table. */
function toClipboard(lines: Copied['lines'], kind: Copied['kind']): void {
  const rows = kind === 'row' ? lines : lines[0].map((_, r) => lines.map((line) => line[r]));
  const text = rows.map((row) => row.map((x) => (x.html ? htmlText(x.html) : '')).join('\t')).join('\n');
  const html = `<table><tbody>${rows.map((row) => `<tr>${row.map((x) => `<${x.tag}${x.style ? ` style="${x.style.replace(/"/g, '&quot;')}"` : ''}>${x.html}</${x.tag}>`).join('')}</tr>`).join('')}</tbody></table>`;
  const clipboard = navigator.clipboard as Clipboard | undefined;
  if (!clipboard?.write || typeof ClipboardItem === 'undefined') return;
  clipboard
    .write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })])
    .catch(() => {}); // not allowed here (no permission, or not a secure page): what was copied can still be pasted in the editor
}

function htmlText(html: string): string {
  const box = document.createElement('div');
  box.innerHTML = html;
  return (box.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Copies the rows the selection reaches (the whole rows). A merged cell is copied as the one cell it is, in the row it starts in; the
 * rows are also put on the clipboard as a table and as text, for a spreadsheet or another document.
 */
export function copyRows(): void {
  const found = selectedRect();
  if (!found) return;
  const [r1, , r2] = found.rect;
  const model = modelOf(found.table);
  const lines: Copied['lines'] = [];
  for (let r = r1; r <= r2; r++) {
    const line: Copied['lines'][number] = [];
    for (let c = 0; c < model.cols; c++) {
      const cell = model.m[r][c];
      const at = cell && locate(model, cell);
      const origin = !!at && at.c === c && (at.r === r || (r === r1 && at.r < r1));
      line.push(origin ? entryOf(cell) : emptyEntry(entryOf(cell).tag));
    }
    lines.push(line);
  }
  copied = { kind: 'row', lines };
  toClipboard(lines, 'row');
}

/** Copies the columns the selection reaches, like `copyRows`. */
export function copyColumns(): void {
  const found = selectedRect();
  if (!found) return;
  const [, c1, , c2] = found.rect;
  const model = modelOf(found.table);
  const lines: Copied['lines'] = [];
  for (let c = c1; c <= c2; c++) {
    const line: Copied['lines'][number] = [];
    for (let r = 0; r < model.m.length; r++) {
      const cell = model.m[r][c];
      const at = cell && locate(model, cell);
      const origin = !!at && at.r === r && (at.c === c || (c === c1 && at.c < c1));
      line.push(origin ? entryOf(cell) : emptyEntry(entryOf(cell).tag));
    }
    lines.push(line);
  }
  copied = { kind: 'column', lines };
  toClipboard(lines, 'column');
}

function fromEntry(entry: Copied['lines'][number][number]): Cell {
  const cell = newCell(entry.tag);
  if (entry.html) cell.innerHTML = entry.html; // an empty one keeps the line break a new cell has
  if (entry.style) cell.setAttribute('style', entry.style);
  return cell;
}

/** Pastes the copied rows below the row of the cell under the caret. */
export function pasteRows(): void {
  const h = here();
  if (!h || copied?.kind !== 'row') return;
  const lines = copied.lines;
  const { c, rs } = h.at;
  const below = h.at.r + rs - 1;
  editTable(h.table, (model) => {
    const { m, rows, cols } = model;
    lines.forEach((line, k) => {
      const at = below + k;
      const fresh: Cell[] = [];
      for (let i = 0; i < cols; i++) {
        const up = m[at][i]!;
        const down = m[at + 1]?.[i];
        // like a new row: a cell that continues into the next row grows to take in the new one
        fresh.push(down && down === up ? up : fromEntry(line[i] ?? emptyEntry('td')));
      }
      const tr = document.createElement('tr');
      rows[at].after(tr);
      rows.splice(at + 1, 0, tr);
      m.splice(at + 1, 0, fresh);
    });
    return [below + 1, c];
  });
}

/** Pastes the copied columns right of the column of the cell under the caret. */
export function pasteColumns(): void {
  const h = here();
  if (!h || copied?.kind !== 'column') return;
  const lines = copied.lines;
  const { r, c, cs } = h.at;
  const right = c + cs - 1;
  editTable(h.table, (model, copy) => {
    lines.forEach((line, k) => {
      const at = right + k;
      const before = model.cols;
      const made = new Map<Cell, Cell>();
      model.m.forEach((row, i) => {
        const left = row[at]!;
        const next = row[at + 1];
        let entry: Cell;
        if (next && next === left) entry = left; // a cell that continues into the next column grows to take in the new one
        else {
          entry = made.get(left) ?? fromEntry(line[i] ?? emptyEntry(left.tagName === 'TH' ? 'th' : 'td'));
          made.set(left, entry);
        }
        row.splice(at + 1, 0, entry);
      });
      model.cols++;
      adjustWidths(copy, before, { added: at + 1 });
    });
    return [r, right + 1];
  });
}

// ---- moving rows and columns, selecting them --------------------------------------------------------------

/** Whether a cell that is merged over several rows (`axis` 'row') or columns lies in the given range of rows or columns. */
function spansIn(model: Model, axis: 'row' | 'column', from: number, to: number): boolean {
  const [lo, hi] = [Math.min(from, to), Math.max(from, to)];
  const seen = new Set<Cell>();
  for (let r = 0; r < model.m.length; r++) {
    for (let c = 0; c < model.cols; c++) {
      if ((axis === 'row' ? r : c) < lo || (axis === 'row' ? r : c) > hi) continue;
      const cell = model.m[r][c];
      if (!cell || seen.has(cell)) continue;
      seen.add(cell);
      if (spanOf(cell, axis === 'row' ? 'rowspan' : 'colspan') > 1) return true;
    }
  }
  return false;
}

/** Whether row `from` can move to the place of row `to`: not when a cell that is merged over rows lies in between. */
export function canMoveRow(table: HTMLTableElement, from: number, to: number): boolean {
  const model = modelOf(table);
  return from !== to && from >= 0 && to >= 0 && from < model.m.length && to < model.m.length && !spansIn(model, 'row', from, to);
}

export function canMoveColumn(table: HTMLTableElement, from: number, to: number): boolean {
  const model = modelOf(table);
  return from !== to && from >= 0 && to >= 0 && from < model.cols && to < model.cols && !spansIn(model, 'column', from, to);
}

/** Moves a row so that it ends up as row `to` (the rows in between shift by one). One step for undo; false when it cannot. */
export function moveRow(table: HTMLTableElement, from: number, to: number): boolean {
  if (!canMoveRow(table, from, to)) return false;
  editTable(
    table,
    (model) => {
      const { m, rows } = model;
      const [tr] = rows.splice(from, 1);
      const [line] = m.splice(from, 1);
      // without the moved row, the row at index `to` is the one it goes in front of (or, at the end, it goes after the last one)
      const ref = rows[to];
      if (ref) ref.before(tr);
      else rows[rows.length - 1].after(tr);
      rows.splice(to, 0, tr);
      m.splice(to, 0, line);
      return [to, 0];
    },
    (fresh, grid) => selectCells(grid, [to, 0, to, (grid[0]?.length ?? 1) - 1]),
  );
  return true;
}

/** Moves a column so that it ends up as column `to`, with its width. One step for undo; false when it cannot. */
export function moveColumn(table: HTMLTableElement, from: number, to: number): boolean {
  if (!canMoveColumn(table, from, to)) return false;
  editTable(
    table,
    (model, copy) => {
      const widths = readWidths(copy, model.cols);
      const hadWidths = !!copy.querySelector(':scope > colgroup') && colsOf(copy).length === model.cols;
      model.m.forEach((row) => {
        const [cell] = row.splice(from, 1);
        row.splice(to, 0, cell);
      });
      if (hadWidths) {
        const [w] = widths.splice(from, 1);
        widths.splice(to, 0, w);
        writeWidths(copy, widths);
      }
      return [0, to];
    },
    (fresh, grid) => selectCells(grid, [0, to, grid.length - 1, to]),
  );
  return true;
}

/** Selects all the cells of a row or of a column, as a drag over them would. */
export function selectLine(table: HTMLTableElement, axis: 'row' | 'column', index: number): void {
  const model = modelOf(table);
  const rect: [number, number, number, number] = axis === 'row' ? [index, 0, index, model.cols - 1] : [0, index, model.m.length - 1, index];
  if (axis === 'row' ? index >= model.m.length : index >= model.cols) return;
  selectCells(model.m, rect);
}

/** The index of the row (`axis` 'row') or the first column of the cell under the caret, or -1. */
export function currentIndex(axis: 'row' | 'column'): number {
  const cell = currentCell();
  const table = cell?.closest('table');
  const at = cell && table ? locate(modelOf(table), cell) : null;
  return at ? (axis === 'row' ? at.r : at.c) : -1;
}

/** The step in the grid for a move on the screen: left in a table that runs right to left is to a higher column. */
function gridStep(table: HTMLTableElement, axis: 'row' | 'column', step: -1 | 1): number {
  return axis === 'column' && getComputedStyle(table).direction === 'rtl' ? -step : step;
}

/** Moves the row (`axis` 'row') or the column of the cell under the caret one place: -1 up or left, 1 down or right. */
export function moveCurrent(axis: 'row' | 'column', step: -1 | 1): void {
  const table = currentCell()?.closest('table');
  const index = currentIndex(axis);
  if (table && index >= 0) (axis === 'row' ? moveRow : moveColumn)(table, index, index + gridStep(table, axis, step));
}

/** Whether the row or the column of the cell under the caret can move that way. */
export function canMoveCurrent(axis: 'row' | 'column', step: -1 | 1): boolean {
  const table = currentCell()?.closest('table');
  const index = currentIndex(axis);
  return !!table && index >= 0 && (axis === 'row' ? canMoveRow : canMoveColumn)(table, index, index + gridStep(table, axis, step));
}

/** Tab / Shift+Tab moves between cells; Tab in the last cell adds a row. Returns true when handled. */
export function handleTab(e: KeyboardEvent): boolean {
  if ((e.key !== 'Tab' && e.key !== 'Enter') || e.ctrlKey || e.altKey || e.metaKey) return false;
  // in the caption, Enter and Tab go on to the first cell (a line break in a caption is not wanted)
  const caption = elementOf(document.getSelection()?.anchorNode)?.closest('caption');
  if (caption?.closest(ROOT)) {
    const first = caption.closest('table')?.querySelector('td,th');
    if (e.key === 'Enter' || !e.shiftKey) {
      if (first) placeCaret(first);
      e.preventDefault();
      return true;
    }
    return false;
  }
  if (e.key === 'Enter') return false;
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
  else if (step === -1) {
    // Shift+Tab in the first cell goes to the end of what is before the table
    const before = table.previousElementSibling;
    if (before) {
      const range = document.createRange();
      range.selectNodeContents(before);
      range.collapse(false);
      const sel = document.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }
  return true;
}
