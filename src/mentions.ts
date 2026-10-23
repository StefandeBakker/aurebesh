/**
 * Mentions: typing `@` at the start of a line (or after a space) opens a list of people; what is typed after it narrows the list, the
 * arrow keys and Enter pick one, Escape closes it. A person becomes a chip in the text: `<span data-mention="id">@Name</span>`, which
 * is one piece (Backspace takes it away whole) and stays when the HTML is saved, copied or loaded again. The editor knows nobody: the
 * application gives it a `search` function, and decides what a mention does (a notification, a link) from the event and from
 * `getMentions()`. The list is a listbox, and the text area names the option that is active (`aria-activedescendant`).
 */
export interface MentionUser {
  /** What is kept in the HTML (`data-mention`): letters, digits and `. _ - @ : +`, up to 64 characters. */
  id: string;
  /** What the chip shows after the `@`. */
  name: string;
  /** A second line in the list: an e-mail address, a team, a role. */
  description?: string;
}

export interface MentionOptions {
  /** The people for what was typed after the `@` (an empty text straight after it). It may be asynchronous; only the newest answer is shown. */
  search(query: string): MentionUser[] | Promise<MentionUser[]>;
  /** The character that opens the list. Default: `@`. */
  trigger?: string;
  /** The most people in the list. Default: 8. */
  limit?: number;
}

export interface MentionHost {
  content: HTMLElement;
  options: MentionOptions;
  t(key: string): string;
  canEdit(): boolean;
  /** Does a change of the DOM that the editor keeps in its own history: one step for undo, and the text counts as changed. */
  run(change: () => void): void;
  /** A person was mentioned. */
  mentioned(user: MentionUser): void;
}

/** The id of a person is safe in an attribute, in CSS and in a link. */
export const MENTION_ID = /^[A-Za-z0-9][\w.@:+-]{0,63}$/;

/** The look of a mention: for the editor, and for the page that shows the HTML (which has no styles of its own, only `data-mention`). */
export const mentionCss = `[data-mention]{padding:0 3px;border-radius:4px;background:color-mix(in srgb,var(--aurebesh-accent,#2563eb) 14%,transparent);color:var(--aurebesh-accent,#2563eb);white-space:nowrap}
`;

/** Makes the mentions in the text pieces that cannot be typed in (the sanitizer leaves the attribute out of what it gives back). */
export function markMentions(root: Element): void {
  root.querySelectorAll<HTMLElement>('span[data-mention]:not([contenteditable])').forEach((el) => el.setAttribute('contenteditable', 'false'));
}

/** The people mentioned in some HTML or text area, each once, in the order of the text. */
export function mentionsIn(root: ParentNode, trigger = '@'): MentionUser[] {
  const found = new Map<string, MentionUser>();
  root.querySelectorAll('span[data-mention]').forEach((el) => {
    const id = el.getAttribute('data-mention') ?? '';
    if (!MENTION_ID.test(id) || found.has(id)) return;
    const text = el.textContent ?? '';
    found.set(id, { id, name: text.startsWith(trigger) ? text.slice(trigger.length) : text });
  });
  return Array.from(found.values());
}

let counter = 0;

/** The longest text after the trigger that still searches. */
const MAX_QUERY = 40;

export function attachMentions(host: MentionHost): () => void {
  const { content } = host;
  const doc = content.ownerDocument;
  const win = doc.defaultView!;
  const trigger = host.options.trigger && host.options.trigger.length === 1 ? host.options.trigger : '@';
  const limit = Math.max(1, host.options.limit ?? 8);
  const menu = doc.createElement('div');
  const id = `aurebesh-mention-${++counter}`;
  menu.id = id;
  menu.className = 'aurebesh-slash aurebesh-mention-menu';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', host.t('ui.mention'));
  menu.hidden = true;
  doc.body.appendChild(menu);

  let shown: MentionUser[] = [];
  let active = 0;
  let open = false;
  /** The newest search: an answer that comes after a newer question is not shown. */
  let latest = 0;
  /** Where the trigger is: the text node and the offset of it. */
  let start: { node: Text; offset: number } | null = null;

  const optionId = (i: number) => `${id}-${i}`;

  function caret(): { node: Text; offset: number } | null {
    const sel = doc.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed) return null;
    const r = sel.getRangeAt(0);
    return r.startContainer.nodeType === Node.TEXT_NODE && content.contains(r.startContainer) ? { node: r.startContainer as Text, offset: r.startOffset } : null;
  }

  function close(): void {
    latest++;
    start = null;
    if (!open) return;
    open = false;
    shown = [];
    menu.hidden = true;
    content.removeAttribute('aria-activedescendant');
    content.removeAttribute('aria-controls');
    content.removeAttribute('aria-expanded');
  }

  /** What is typed after the trigger, or null when the caret is no longer in that piece of text. */
  function query(): string | null {
    const at = caret();
    if (!start || !at || at.node !== start.node || at.offset <= start.offset) return null;
    const text = start.node.data.slice(start.offset, at.offset);
    if (!text.startsWith(trigger)) return null;
    const q = text.slice(1);
    // a name can have a space in it, but not a line or a stretch of spaces
    return q.length > MAX_QUERY || /\n|\s\s/.test(q) ? null : q;
  }

  function render(): void {
    if (!shown.length) return close();
    active = Math.min(active, shown.length - 1);
    menu.replaceChildren(
      ...shown.map((user, i) => {
        const o = doc.createElement('div');
        o.id = optionId(i);
        o.className = 'aurebesh-slash-item';
        o.setAttribute('role', 'option');
        o.setAttribute('aria-selected', String(i === active));
        const name = doc.createElement('div');
        name.className = 'aurebesh-mention-name';
        name.textContent = user.name;
        o.appendChild(name);
        if (user.description) {
          const more = doc.createElement('div');
          more.className = 'aurebesh-mention-desc';
          more.textContent = user.description;
          o.appendChild(more);
        }
        o.addEventListener('mousedown', (e) => e.preventDefault()); // the caret stays in the text
        o.addEventListener('click', () => choose(user));
        return o;
      }),
    );
    menu.hidden = false;
    content.setAttribute('aria-activedescendant', optionId(active));
    content.setAttribute('aria-controls', id);
    content.setAttribute('aria-expanded', 'true');
    open = true;
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

  /** Asks for the people for what is typed now; the list follows when the answer is there. */
  function refresh(): void {
    const q = query();
    if (q === null) return close();
    const mine = ++latest;
    const show = (users: MentionUser[]) => {
      if (mine !== latest || query() === null) return;
      const next = (Array.isArray(users) ? users : []).filter((u) => u && typeof u.name === 'string' && u.name && MENTION_ID.test(String(u.id))).slice(0, limit);
      if (next.map((u) => u.id).join('\n') !== shown.map((u) => u.id).join('\n')) active = 0;
      shown = next;
      render();
    };
    try {
      const found = host.options.search(q);
      if (found && typeof (found as Promise<MentionUser[]>).then === 'function') (found as Promise<MentionUser[]>).then(show, () => mine === latest && close());
      else show(found as MentionUser[]);
    } catch {
      close();
    }
  }

  function choose(user: MentionUser): void {
    const at = caret();
    if (!start || !at || at.node !== start.node) return close();
    const from = start;
    close();
    content.focus();
    // The trigger and what follows it are replaced by the chip, and the text goes on after it. It is done in the DOM itself (and kept in
    // the history of the editor, as one step): a browser that inserts HTML turns a span that has a look from the CSS of the page into a
    // span with that look in `style`, and leaves `data-mention` out.
    host.run(() => {
      const range = doc.createRange();
      range.setStart(from.node, from.offset);
      range.setEnd(at.node, at.offset);
      range.deleteContents();
      const chip = doc.createElement('span');
      chip.setAttribute('data-mention', user.id);
      chip.setAttribute('contenteditable', 'false');
      chip.textContent = trigger + user.name;
      const space = doc.createTextNode(' ');
      range.insertNode(space);
      range.insertNode(chip);
      doc.getSelection()?.collapse(space, 1);
    });
    host.mentioned({ id: user.id, name: user.name, ...(user.description ? { description: user.description } : {}) });
  }

  const onInput = () => {
    if (!host.canEdit()) return;
    if (start) return refresh(); // a search is going on, or the list is open
    // the trigger, typed at the start of a block or after a space (not in an address: name@host)
    const at = caret();
    if (!at || at.offset < 1 || at.node.data[at.offset - 1] !== trigger) return;
    const before = at.node.data[at.offset - 2];
    if (before !== undefined && !/\s/.test(before)) return;
    const block = at.node.parentElement;
    if (!block || block.closest('pre,code,a,[data-mention]')) return;
    start = { node: at.node, offset: at.offset - 1 };
    refresh();
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
    }
  };

  const onSelection = () => {
    if (start && query() === null) close();
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
