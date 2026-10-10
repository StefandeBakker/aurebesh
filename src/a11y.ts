/** Keyboard navigation helpers (WAI-ARIA "roving tabindex" patterns). */

const buttonsOf = (bar: HTMLElement): HTMLButtonElement[] =>
  Array.from(bar.querySelectorAll<HTMLButtonElement>(':scope > button, :scope > .aurebesh-table-picker > button')).filter((b) => !b.disabled);

/**
 * A toolbar is one tab stop: Tab enters it, Left/Right (and Home/End) move between its buttons, Escape goes back to
 * the editor. Dropdown boxes inside it keep their own tab stop, as they use the arrow keys themselves.
 */
export function rovingToolbar(bar: HTMLElement, backToEditor: () => void): void {
  const setActive = (active?: HTMLElement) => buttonsOf(bar).forEach((b) => (b.tabIndex = b === active ? 0 : -1));
  setActive(buttonsOf(bar)[0]);

  bar.addEventListener('focusin', (e) => {
    const t = e.target;
    if (t instanceof HTMLButtonElement && buttonsOf(bar).includes(t)) setActive(t);
  });

  bar.addEventListener('keydown', (e) => {
    const target = e.target;
    if (e.key === 'Escape' && target instanceof HTMLElement && bar.contains(target) && !target.closest('.aurebesh-table-pop')) {
      backToEditor();
      return;
    }
    if (!(target instanceof HTMLButtonElement)) return;
    const list = buttonsOf(bar);
    const i = list.indexOf(target);
    if (i < 0) return;
    let next: HTMLButtonElement | undefined;
    if (e.key === 'ArrowRight') next = list[(i + 1) % list.length];
    else if (e.key === 'ArrowLeft') next = list[(i - 1 + list.length) % list.length];
    else if (e.key === 'Home') next = list[0];
    else if (e.key === 'End') next = list[list.length - 1];
    else return;
    e.preventDefault();
    next.focus();
  });
}

/** Arrow-key navigation through a grid of buttons (colour swatches, table size picker): one tab stop. */
export function gridNavigation(grid: HTMLElement, columns: number): void {
  const items = () => Array.from(grid.querySelectorAll<HTMLButtonElement>('button'));
  items().forEach((b, i) => (b.tabIndex = i === 0 ? 0 : -1));

  grid.addEventListener('focusin', (e) => items().forEach((b) => (b.tabIndex = b === e.target ? 0 : -1)));

  grid.addEventListener('keydown', (e) => {
    const list = items();
    const i = list.indexOf(e.target as HTMLButtonElement);
    if (i < 0) return;
    const row = i - (i % columns);
    const moves: Record<string, number> = {
      ArrowRight: i + 1,
      ArrowLeft: i - 1,
      ArrowDown: i + columns,
      ArrowUp: i - columns,
      Home: row,
      End: Math.min(row + columns - 1, list.length - 1),
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    const n = moves[e.key];
    if (n >= 0 && n < list.length) list[n].focus();
  });
}
