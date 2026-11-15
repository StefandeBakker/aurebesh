/**
 * Emoji: a picker (a search box, the groups, the ones used last, and a skin tone) and short codes in the text: typing `:smi` after a
 * space lists the emoji that match, the arrow keys and Enter pick one, Escape closes the list, and `:smile:` becomes the emoji as
 * soon as the last colon is typed. This is a part of its own: the editor loads it (and the emoji with it) when the picker is opened or a
 * colon is typed, so an editor that never uses it never has the data.
 */
import { EMOJI_GROUPS, SKIN_TONES, emojiName, plain, searchEmoji, withTone } from './emoji-data';
import type { EmojiItem } from './emoji-data';

export interface EmojiHost {
  content: HTMLElement;
  t(key: string): string;
  /** The language of the editor: Dutch has names of its own, any other language shows the English ones. */
  language(): string;
  canEdit(): boolean;
  /** Does a change of the DOM that the editor keeps in its own history: one step for undo, and the text counts as changed. */
  run(change: () => void): void;
  /** Puts an emoji in the text at the caret (the selection is brought back first: the search box of the picker has had it). */
  insert(char: string): void;
}

export interface EmojiApi {
  /** The content of the dropdown of the toolbar button. `close` closes it. */
  buildPicker(close: () => void): HTMLElement;
  /** Something was typed: opens, narrows or closes the list of short codes, and makes `:name:` an emoji. */
  typed(): void;
  /** Starts a short code at the caret (the `/emoji` of the slash menu): the list shows the emoji used last. */
  start(): void;
  destroy(): void;
}

/** How many of the emoji that were used last the picker keeps. */
const RECENT = 24;
/** The columns of the grid in the picker. */
const COLUMNS = 6;
/** The longest short code that is looked for. */
const MAX_CODE = 40;
/** What is typed for a short code: letters, digits and the signs of a name. */
const CODE = /(?:^|[\s(])(:([\p{L}\p{N}_+-]{0,40}))$/u;
const CLOSED_CODE = /(?:^|[\s(])(:([a-z0-9_+-]{2,40}):)$/i;

/** What was picked before, and the skin tone: kept while the page is open, for all the editors of it. */
const recent: EmojiItem[] = [];
let tone = 0;

const remember = (item: EmojiItem): void => {
  const at = recent.indexOf(item);
  if (at >= 0) recent.splice(at, 1);
  recent.unshift(item);
  recent.length = Math.min(recent.length, RECENT);
};

const slugOf = (item: EmojiItem): string =>
  plain(item.name.en)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

let slugs: Map<string, EmojiItem> | null = null;
const bySlug = (slug: string): EmojiItem | undefined => {
  if (!slugs) {
    slugs = new Map();
    for (const g of EMOJI_GROUPS) for (const item of g.items) slugs.set(slugOf(item), item);
  }
  return slugs.get(slug);
};

let counter = 0;

export function createEmoji(host: EmojiHost): EmojiApi {
  const { content } = host;
  const doc = content.ownerDocument;
  const win = doc.defaultView!;

  // ---- the picker ---------------------------------------------------------------------------------------

  const button = (item: EmojiItem): HTMLButtonElement => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'aurebesh-emoji-btn';
    b.textContent = withTone(item, tone);
    const name = emojiName(item, host.language());
    b.title = name;
    b.setAttribute('aria-label', name);
    b.tabIndex = -1;
    b.addEventListener('mousedown', (e) => e.preventDefault()); // the caret stays in the text
    return b;
  };

  function buildPicker(close: () => void): HTMLElement {
    const root = doc.createElement('div');
    root.className = 'aurebesh-emoji';

    const search = doc.createElement('input');
    search.type = 'search';
    search.className = 'aurebesh-emoji-search';
    search.placeholder = host.t('ui.emojiSearch');
    search.setAttribute('aria-label', host.t('ui.emojiSearch'));
    search.autocomplete = 'off';

    const tabs = doc.createElement('div');
    tabs.className = 'aurebesh-emoji-tabs';
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', host.t('ui.emojiGroups'));

    const list = doc.createElement('div');
    list.className = 'aurebesh-emoji-list';

    const tones = doc.createElement('div');
    tones.className = 'aurebesh-emoji-tones';
    tones.setAttribute('role', 'group');
    tones.setAttribute('aria-label', host.t('ui.skinTone'));

    const pick = (item: EmojiItem) => {
      host.insert(withTone(item, tone));
      remember(item);
    };

    const grid = (items: EmojiItem[]): HTMLElement => {
      const g = doc.createElement('div');
      g.className = 'aurebesh-emoji-grid';
      for (const item of items) {
        const b = button(item);
        b.addEventListener('click', () => pick(item));
        g.appendChild(b);
      }
      return g;
    };

    const section = (id: string, title: string, items: EmojiItem[]): HTMLElement => {
      const s = doc.createElement('section');
      s.dataset.group = id;
      const h = doc.createElement('div');
      h.className = 'aurebesh-emoji-title';
      h.textContent = title;
      s.append(h, grid(items));
      return s;
    };

    const buttons = () => Array.from(list.querySelectorAll<HTMLButtonElement>('.aurebesh-emoji-btn'));

    /** One tab stop in the list: the button that has it (the first, until another is used). */
    const roving = (active?: HTMLElement) => {
      const all = buttons();
      const target = active ?? all[0];
      all.forEach((b) => (b.tabIndex = b === target ? 0 : -1));
    };

    function render(): void {
      const q = search.value.trim();
      list.replaceChildren();
      if (q) {
        const found = searchEmoji(q);
        if (!found.length) {
          const none = doc.createElement('div');
          none.className = 'aurebesh-emoji-none';
          none.textContent = host.t('ui.emojiNone');
          list.appendChild(none);
        } else list.appendChild(grid(found));
      } else {
        if (recent.length) list.appendChild(section('recent', host.t('ui.emojiRecent'), recent));
        for (const g of EMOJI_GROUPS) list.appendChild(section(g.id, host.t(`emoji.${g.id}`), g.items));
      }
      roving();
      tabs.hidden = !!q;
    }

    // the groups, to jump to one
    const tab = (id: string, icon: string, title: string) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.textContent = icon;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => {
        const s = list.querySelector<HTMLElement>(`section[data-group="${id}"]`);
        if (s) list.scrollTop = s.offsetTop - list.offsetTop;
      });
      tabs.appendChild(b);
    };
    tab('recent', '🕘', host.t('ui.emojiRecent'));
    for (const g of EMOJI_GROUPS) tab(g.id, g.icon, host.t(`emoji.${g.id}`));

    // the skin tone: for the emoji that have one
    const sample = EMOJI_GROUPS.flatMap((g) => g.items).find((i) => i.tones)!;
    const toneButtons = SKIN_TONES.map((_, i) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'aurebesh-emoji-tone';
      b.textContent = withTone(sample, i);
      b.setAttribute('aria-pressed', String(i === tone));
      b.title = host.t(`ui.skinTone${i}`);
      b.setAttribute('aria-label', b.title);
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => {
        tone = i;
        toneButtons.forEach((t, n) => t.setAttribute('aria-pressed', String(n === i)));
        render();
      });
      tones.appendChild(b);
      return b;
    });

    search.addEventListener('input', render);
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        buttons()[0]?.click();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        buttons()[0]?.focus();
      }
    });

    // arrow keys through the emoji, the way a grid works
    list.addEventListener('focusin', (e) => {
      if ((e.target as HTMLElement).classList.contains('aurebesh-emoji-btn')) roving(e.target as HTMLElement);
    });
    list.addEventListener('keydown', (e) => {
      const all = buttons();
      const i = all.indexOf(e.target as HTMLButtonElement);
      if (i < 0) return;
      const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNS, ArrowUp: -COLUMNS };
      if (e.key in step) {
        e.preventDefault();
        const next = i + step[e.key];
        if (next < 0) search.focus();
        else all[Math.min(all.length - 1, next)].focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        all[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        all[all.length - 1].focus();
      } else if (e.key === 'Escape') {
        close();
      }
    });

    // opened again: what was used since is at the top
    root.addEventListener('aurebesh-open', () => {
      if (!search.value) render();
    });
    root.append(search, tabs, list, tones);
    render();
    return root;
  }

  // ---- short codes --------------------------------------------------------------------------------------

  const menu = doc.createElement('div');
  const id = `aurebesh-emoji-${++counter}`;
  menu.id = id;
  menu.className = 'aurebesh-slash aurebesh-emoji-menu';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', host.t('ui.emojiList'));
  menu.hidden = true;
  doc.body.appendChild(menu);

  let shown: EmojiItem[] = [];
  let active = 0;
  let open = false;
  /** The list is open without a letter typed yet (it was asked for): it shows what was used last. */
  let asked = false;

  /** Where the caret is in a text: the piece of text before it. */
  function caret(): { node: Text; offset: number } | null {
    const sel = doc.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed) return null;
    const r = sel.getRangeAt(0);
    return r.startContainer.nodeType === Node.TEXT_NODE && content.contains(r.startContainer) ? { node: r.startContainer as Text, offset: r.startOffset } : null;
  }

  /** The short code at the caret: where it starts, and what was typed after the colon. */
  function code(): { node: Text; from: number; to: number; query: string } | null {
    const at = caret();
    if (!at || at.node.parentElement?.closest('pre,code,a,[data-mention]')) return null;
    const m = CODE.exec(at.node.data.slice(0, at.offset));
    if (!m) return null;
    return { node: at.node, from: at.offset - m[1].length, to: at.offset, query: m[2] };
  }

  function close(): void {
    asked = false;
    if (!open) return;
    open = false;
    shown = [];
    menu.hidden = true;
    content.removeAttribute('aria-activedescendant');
    content.removeAttribute('aria-controls');
    content.removeAttribute('aria-expanded');
  }

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

  const optionId = (i: number) => `${id}-${i}`;

  function render(): void {
    if (!shown.length) return close();
    active = Math.min(active, shown.length - 1);
    menu.replaceChildren(
      ...shown.map((item, i) => {
        const o = doc.createElement('div');
        o.id = optionId(i);
        o.className = 'aurebesh-slash-item aurebesh-emoji-item';
        o.setAttribute('role', 'option');
        o.setAttribute('aria-selected', String(i === active));
        const glyph = doc.createElement('span');
        glyph.className = 'aurebesh-emoji-glyph';
        glyph.textContent = withTone(item, tone);
        const name = doc.createElement('span');
        name.textContent = emojiName(item, host.language());
        o.append(glyph, name);
        o.addEventListener('mousedown', (e) => e.preventDefault());
        o.addEventListener('click', () => choose(item));
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

  /** The short code at the caret becomes the emoji, and the text goes on after it. */
  function replace(span: { node: Text; from: number; to: number }, item: EmojiItem): void {
    const char = withTone(item, tone);
    close();
    content.focus();
    host.run(() => {
      const range = doc.createRange();
      range.setStart(span.node, span.from);
      range.setEnd(span.node, span.to);
      range.deleteContents();
      const text = doc.createTextNode(char);
      range.insertNode(text);
      doc.getSelection()?.collapse(text, text.length);
    });
    remember(item);
  }

  function choose(item: EmojiItem): void {
    const at = code();
    if (at) replace(at, item);
  }

  function typed(): void {
    if (!host.canEdit()) return close();
    const at = caret();
    // `:smile:` is an emoji as soon as the colon at the end is there
    if (at && !at.node.parentElement?.closest('pre,code,a,[data-mention]')) {
      const done = CLOSED_CODE.exec(at.node.data.slice(0, at.offset));
      const item = done && bySlug(done[2].toLowerCase());
      if (item && done) return replace({ node: at.node, from: at.offset - done[1].length, to: at.offset }, item);
    }
    const c = code();
    // two letters after the colon, so that a colon in a sentence is left alone; a list that was asked for starts at once
    if (!c || c.query.length > MAX_CODE || (c.query.length < 2 && !asked)) return close();
    const next = c.query ? searchEmoji(c.query, 8) : recent.length ? recent.slice(0, 8) : EMOJI_GROUPS[0].items.slice(0, 8);
    if (next.map((i) => i.char).join('') !== shown.map((i) => i.char).join('')) active = 0;
    shown = next;
    render();
  }

  function start(): void {
    if (!host.canEdit()) return;
    content.focus();
    asked = true;
    doc.execCommand('insertText', false, ':'); // the editor sees it as typing, and the list follows
  }

  const onKey = (e: KeyboardEvent) => {
    if (!open || e.isComposing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
      Array.from(menu.children).forEach((o, i) => o.setAttribute('aria-selected', String(i === active)));
      content.setAttribute('aria-activedescendant', optionId(active));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopImmediatePropagation(); // the editor does not also take the Enter
      choose(shown[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    }
  };
  const onSelection = () => {
    if (open && !code()) close();
  };

  content.addEventListener('keydown', onKey, true);
  content.addEventListener('blur', close);
  content.addEventListener('mousedown', close);
  doc.addEventListener('selectionchange', onSelection);

  return {
    buildPicker,
    typed,
    start,
    destroy() {
      content.removeEventListener('keydown', onKey, true);
      content.removeEventListener('blur', close);
      content.removeEventListener('mousedown', close);
      doc.removeEventListener('selectionchange', onSelection);
      close();
      menu.remove();
    },
  };
}
