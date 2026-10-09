/** Table operations. They work on the current selection, so they need no reference to an editor instance. */

const ROOT = '.aurebesh-content';

export function currentCell(): HTMLTableCellElement | null {
  const node = document.getSelection()?.anchorNode;
  const el = node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);
  const cell = el?.closest('td,th') as HTMLTableCellElement | null;
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
  const root = document.getSelection()?.anchorNode?.parentElement?.closest(ROOT);
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

export function addRow(): void {
  const cell = currentCell();
  const tr = cell?.parentElement as HTMLTableRowElement | null;
  if (!cell || !tr) return;
  const row = document.createElement('tr');
  for (let i = 0; i < tr.cells.length; i++) row.appendChild(newCell());
  tr.after(row);
  placeCaret(row.cells[Math.min(cell.cellIndex, row.cells.length - 1)]);
}

export function addColumn(): void {
  const cell = currentCell();
  const table = cell?.closest('table');
  if (!cell || !table) return;
  const idx = cell.cellIndex;
  for (const row of Array.from(table.rows)) {
    const ref = row.cells[idx];
    const added = newCell(ref?.tagName.toLowerCase() === 'th' ? 'th' : 'td');
    if (ref) ref.after(added);
    else row.appendChild(added);
  }
  const next = cell.nextElementSibling;
  if (next) placeCaret(next);
}

export function deleteRow(): void {
  const cell = currentCell();
  const tr = cell?.parentElement as HTMLTableRowElement | null;
  const table = cell?.closest('table');
  if (!cell || !tr || !table) return;
  const target = (tr.nextElementSibling ?? tr.previousElementSibling) as HTMLTableRowElement | null;
  const idx = cell.cellIndex;
  tr.remove();
  if (!table.rows.length) return deleteTable(table);
  if (target) placeCaret(target.cells[Math.min(idx, target.cells.length - 1)]);
}

export function deleteColumn(): void {
  const cell = currentCell();
  const table = cell?.closest('table');
  if (!cell || !table) return;
  const idx = cell.cellIndex;
  const row = cell.parentElement as HTMLTableRowElement;
  for (const r of Array.from(table.rows)) r.cells[idx]?.remove();
  if (!row.cells.length) return deleteTable(table);
  placeCaret(row.cells[Math.min(idx, row.cells.length - 1)]);
}

export function deleteTable(table: HTMLTableElement | null = currentCell()?.closest('table') ?? null): void {
  if (!table) return;
  // Remove the empty paragraph that insertTable() put after a trailing table, unless it is all that would be left.
  const after = table.nextElementSibling;
  const orphan = after && after.tagName === 'P' && !after.textContent && !after.nextElementSibling && table.previousElementSibling;
  if (orphan) after.remove();
  const next = table.nextElementSibling ?? table.previousElementSibling ?? table.parentElement;
  table.remove();
  if (next) placeCaret(next);
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
