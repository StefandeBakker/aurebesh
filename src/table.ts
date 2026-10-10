/** Table operations. They work on the current selection, so they need no reference to an editor instance. */

const ROOT = '.aurebesh-content';

type Coord = [row: number, col: number];

const elementOf = (node: Node | null | undefined): Element | null | undefined =>
  node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);

export function currentCell(): HTMLTableCellElement | null {
  const cell = elementOf(document.getSelection()?.anchorNode)?.closest('td,th') as HTMLTableCellElement | null | undefined;
  return cell?.closest(ROOT) ? cell : null;
}

function placeCaret(el: Element): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(true);
  const sel = document.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

const newCell = (tag = 'td') => {
  const c = document.createElement(tag);
  c.appendChild(document.createElement('br'));
  return c;
};

const coords = (cell: HTMLTableCellElement): Coord => [(cell.parentElement as HTMLTableRowElement).rowIndex, cell.cellIndex];

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
 * Edits a copy of the table and swaps it in with `insertHTML`, so the browser records it in its undo history
 * (plain DOM edits would be invisible to Ctrl+Z). `mutate` returns the cell to put the caret in, or null when
 * nothing is left and the table should go.
 */
function replaceTable(table: HTMLTableElement, mutate: (copy: HTMLTableElement) => Coord | null): void {
  const root = table.closest(ROOT);
  if (!root) return;
  const copy = table.cloneNode(true) as HTMLTableElement;
  const target = mutate(copy);
  if (!target) return deleteTable(table);
  copy.setAttribute('data-new', '');
  selectNodes(table);
  document.execCommand('insertHTML', false, copy.outerHTML);
  const fresh = root.querySelector('table[data-new]') as HTMLTableElement | null;
  if (!fresh) return;
  fresh.removeAttribute('data-new');
  const row = fresh.rows[Math.min(target[0], fresh.rows.length - 1)];
  const cell = row?.cells[Math.min(target[1], row.cells.length - 1)];
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

export function addRow(): void {
  const cell = currentCell();
  const table = cell?.closest('table');
  if (!cell || !table) return;
  const [r, c] = coords(cell);
  replaceTable(table, (copy) => {
    const tr = copy.rows[r];
    const row = document.createElement('tr');
    for (let i = 0; i < tr.cells.length; i++) row.appendChild(newCell());
    tr.after(row);
    return [r + 1, c];
  });
}

export function addColumn(): void {
  const cell = currentCell();
  const table = cell?.closest('table');
  if (!cell || !table) return;
  const [r, c] = coords(cell);
  replaceTable(table, (copy) => {
    for (const row of Array.from(copy.rows)) {
      const ref = row.cells[c];
      const added = newCell(ref?.tagName === 'TH' ? 'th' : 'td');
      if (ref) ref.after(added);
      else row.appendChild(added);
    }
    return [r, c + 1];
  });
}

export function deleteRow(): void {
  const cell = currentCell();
  const table = cell?.closest('table');
  if (!cell || !table) return;
  const [r, c] = coords(cell);
  replaceTable(table, (copy) => {
    copy.rows[r].remove();
    return copy.rows.length ? [Math.min(r, copy.rows.length - 1), c] : null;
  });
}

export function deleteColumn(): void {
  const cell = currentCell();
  const table = cell?.closest('table');
  if (!cell || !table) return;
  const [r, c] = coords(cell);
  replaceTable(table, (copy) => {
    for (const row of Array.from(copy.rows)) row.cells[c]?.remove();
    return Array.from(copy.rows).some((row) => row.cells.length) ? [r, c] : null;
  });
}

/** Turns the first row into header cells (<th>), or back into normal cells. */
export function toggleHeaderRow(): void {
  const cell = currentCell();
  const table = cell?.closest('table');
  if (!cell || !table) return;
  const [r, c] = coords(cell);
  replaceTable(table, (copy) => {
    const first = copy.rows[0];
    const toHeader = !Array.from(first.cells).every((x) => x.tagName === 'TH');
    for (const old of Array.from(first.cells)) {
      const swapped = document.createElement(toHeader ? 'th' : 'td');
      for (const attr of ['colspan', 'rowspan']) if (old.hasAttribute(attr)) swapped.setAttribute(attr, old.getAttribute(attr)!);
      swapped.append(...Array.from(old.childNodes));
      old.replaceWith(swapped);
    }
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
    addRow();
    const row = currentCell()?.parentElement as HTMLTableRowElement | undefined;
    if (row) placeCaret(row.cells[0]);
    return true;
  }
  const next = cells[i + step];
  if (next) placeCaret(next);
  return true;
}
