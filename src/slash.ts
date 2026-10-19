/**
 * The slash menu: typing `/` at the start of a line (or after a space) opens a list of things to insert next to the caret; what is
 * typed after the slash narrows the list, the arrow keys and Enter pick one, Escape closes it. What is picked replaces `/` and what was
 * typed after it. The menu is a listbox, and the text area names the option that is active (`aria-activedescendant`).
 */
export interface SlashItem {
  id: string;
  label: string;
  /** More words that find it: `/alert` finds a callout. */
  keywords?: string;
  /** Does what the item stands for, once the `/text` is gone. */
  run(): void;
}

export interface SlashHost {
  content: HTMLElement;
  /** The items, asked for each time the menu opens. */
  items(): SlashItem[];
  t(key: string): string;
  canEdit(): boolean;
}

let counter = 0;

export function attachSlashMenu(host: SlashHost): () => void {
  const { content } = host;
  const doc = content.ownerDocument;
  const win = doc.defaultView!;
  const menu = doc.createElement('div');
  const id = `aurebesh-slash-${++counter}`;
  menu.id = id;
  menu.className = 'aurebesh-slash';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', host.t('ui.slash'));
  menu.hidden = true;
  doc.body.appendChild(menu);

  let items: SlashItem[] = [];
  let shown: SlashItem[] = [];
  let active = 0;
  let open = false;
  /** Where the slash is: the text node and the offset of the `/`. */
  let start: { node: Text; offset: number } | null = null;

  const optionId = (i: number) => `${id}-${i}`;

  function caret(): { node: Text; offset: number } | null {
    const sel = doc.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed) return null;
    const r = sel.getRangeAt(0);
    return r.startContainer.nodeType === Node.TEXT_NODE && content.contains(r.startContainer) ? { node: r.startContainer as Text, offset: r.startOffset } : null;
  }

  function close(): void {
    if (!open) return;
    open = false;
    start = null;
    menu.hidden = true;
    content.removeAttribute('aria-activedescendant');
    content.removeAttribute('aria-controls');
    content.removeAttribute('aria-expanded');
  }

  function query(): string | null {
    const at = caret();
    if (!start || !at || at.node !== start.node || at.offset <= start.offset) return null;
    const text = start.node.data.slice(start.offset, at.offset);
    return text.startsWith('/') && !/\s/.test(text) ? text.slice(1) : null;
  }

  function render(): void {
    const q = (query() ?? '').toLowerCase();
    shown = items.filter((i) => !q || `${i.label} ${i.id} ${i.keywords ?? ''}`.toLowerCase().includes(q));
    if (!shown.length) return close();
    active = Math.min(active, shown.length - 1);
    menu.replaceChildren(
      ...shown.map((item, i) => {
        const o = doc.createElement('div');
        o.id = optionId(i);
        o.className = 'aurebesh-slash-item';
        o.setAttribute('role', 'option');
        o.setAttribute('aria-selected', String(i === active));
        o.textContent = item.label;
        o.addEventListener('mousedown', (e) => e.preventDefault()); // the caret stays in the text
        o.addEventListener('click', () => choose(item));
        return o;
      }),
    );
    content.setAttribute('aria-activedescendant', optionId(active));
    place();
  }

  /** Next to the caret: below it, or above it when there is no room below. */
  function place(): void {
    const sel = doc.getSelection();
    const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
    const rect = range?.getClientRects()[0] ?? range?.getBoundingClientRect();
    if (!rect) return;
    const height = menu.offsetHeight;
    const below = rect.bottom + 6;
    const fits = below + height <= win.innerHeight - 8;
    menu.style.left = `${Math.max(8, Math.min(rect.left, win.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${fits ? below : Math.max(8, rect.top - height - 6)}px`;
  }

  function show(): void {
    items = host.items();
    active = 0;
    open = true;
    menu.hidden = false;
    content.setAttribute('aria-controls', id);
    content.setAttribute('aria-expanded', 'true');
    render();
  }

  function choose(item: SlashItem): void {
    const at = caret();
    if (start && at && at.node === start.node) {
      // the slash and what follows it go, as one step for undo
      const range = doc.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(at.node, at.offset);
      const sel = doc.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      doc.execCommand('delete');
    }
    close();
    content.focus();
    item.run();
  }

  const onInput = () => {
    if (!host.canEdit()) return;
    if (open) {
      if (query() === null) close();
      else {
        active = 0;
        render();
      }
      return;
    }
    // a slash typed at the start of a block, or after a space
    const at = caret();
    if (!at || at.offset < 1 || at.node.data[at.offset - 1] !== '/') return;
    const before = at.node.data[at.offset - 2];
    if (before !== undefined && !/\s/.test(before)) return;
    const block = at.node.parentElement;
    if (!block || block.closest('pre,code,a')) return;
    start = { node: at.node, offset: at.offset - 1 };
    show();
  };

  const onKey = (e: KeyboardEvent) => {
    if (!open || e.isComposing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
      for (const [i, o] of Array.from(menu.children).entries()) o.setAttribute('aria-selected', String(i === active));
      content.setAttribute('aria-activedescendant', optionId(active));
      (menu.children[active] as HTMLElement | undefined)?.scrollIntoView?.({ block: 'nearest' });
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopImmediatePropagation(); // the editor does not also take the Enter
      choose(shown[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation(); // not also out of full screen or a panel
      close();
    } else if (e.key === 'Backspace' && query() === '') {
      close(); // the slash itself goes: the menu is no longer wanted
    }
  };

  const onSelection = () => {
    if (open && query() === null) close();
  };

  // the page moving under the menu closes it; the menu scrolling itself (a long list) does not
  const onScroll = (e: Event) => {
    if (e.target !== menu && !menu.contains(e.target as Node)) close();
  };

  content.addEventListener('input', onInput);
  content.addEventListener('keydown', onKey, true);
  content.addEventListener('blur', close);
  content.addEventListener('mousedown', close);
  doc.addEventListener('selectionchange', onSelection);
  win.addEventListener('scroll', onScroll, true);
  return () => {
    content.removeEventListener('input', onInput);
    content.removeEventListener('keydown', onKey, true);
    content.removeEventListener('blur', close);
    content.removeEventListener('mousedown', close);
    doc.removeEventListener('selectionchange', onSelection);
    win.removeEventListener('scroll', onScroll, true);
    close();
    menu.remove();
  };
}
