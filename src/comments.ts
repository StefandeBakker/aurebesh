/**
 * Comments on a piece of text. The piece is marked in the text itself, `<span data-comment="id">`, so that it stays with the text when
 * the HTML is saved, copied or loaded again (the same id on every piece when it runs over more blocks). What was written, the thread of
 * messages, is not in the HTML: the editor keeps it, the application gives it at the start (`comments.threads`) and saves it when the
 * `comments` event says it changed. The threads are shown in a panel of the sidebar, in the order of the text.
 */
import { restoreSelection, saveSelection } from './selection';
import { textRuns } from './inline';

export interface CommentAuthor {
  id: string;
  name: string;
}

export interface CommentMessage {
  id: string;
  author: CommentAuthor;
  text: string;
  /** When it was written, as an ISO date (`2026-10-22T09:30:00.000Z`). */
  created: string;
}

export interface CommentThread {
  /** The id that is in the text, in `data-comment`. */
  id: string;
  /** The first message is the comment itself, the others are the replies. */
  messages: CommentMessage[];
  resolved?: boolean;
}

export interface CommentsOptions {
  /** Who is writing: the comments and replies of this editor are from this person, and only the messages of this person can be deleted. */
  author: CommentAuthor;
  /** The threads that go with the text that is loaded. */
  threads?: CommentThread[];
}

export type CommentAction = 'add' | 'reply' | 'resolve' | 'reopen' | 'delete' | 'deleteMessage';

/** What the `comment` event tells. */
export interface CommentEvent {
  action: CommentAction;
  thread: CommentThread;
  /** The message that was written or deleted (for `add`, `reply` and `deleteMessage`). */
  message?: CommentMessage;
}

/** The id of a thread or a message is safe in an attribute and in a CSS selector. */
export const COMMENT_ID = /^[A-Za-z0-9][\w.:-]{0,63}$/;

const MAX_TEXT = 5000;

/** The look of a comment for a page that shows the HTML (which has no styles of its own, only `data-comment`). */
export const commentCss = `[data-comment]{background:color-mix(in srgb,var(--aurebesh-comment,#facc15) 28%,transparent);border-radius:2px}
`;

// ---- the data -------------------------------------------------------------------------------------------

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

function cleanMessage(m: any): CommentMessage | null {
  if (!m || typeof m !== 'object') return null;
  const id = str(m.id, 64);
  const text = typeof m.text === 'string' && m.text.trim() && m.text.length <= MAX_TEXT ? m.text : null;
  const authorId = str(m.author?.id, 128);
  const name = str(m.author?.name, 128);
  const created = typeof m.created === 'string' && !Number.isNaN(Date.parse(m.created)) ? m.created : null;
  if (!id || !COMMENT_ID.test(id) || !text || !authorId || !name || !created) return null;
  return { id, author: { id: authorId, name }, text, created };
}

/** Threads from the application: what is not valid (an id that is not a plain name, a thread without a message) is left out. */
export function cleanThreads(list: unknown): CommentThread[] {
  const out: CommentThread[] = [];
  const seen = new Set<string>();
  for (const t of Array.isArray(list) ? list : []) {
    const id = str(t?.id, 64);
    if (!id || !COMMENT_ID.test(id) || seen.has(id)) continue;
    const messages = (Array.isArray(t.messages) ? t.messages : []).map(cleanMessage).filter((m: CommentMessage | null): m is CommentMessage => !!m);
    if (!messages.length) continue;
    seen.add(id);
    out.push({ id, messages, ...(t.resolved === true ? { resolved: true } : {}) });
  }
  return out;
}

const clone = (t: CommentThread): CommentThread => ({ id: t.id, messages: t.messages.map((m) => ({ ...m, author: { ...m.author } })), ...(t.resolved ? { resolved: true } : {}) });

function newId(prefix: string): string {
  const c = globalThis.crypto as Crypto | undefined;
  const random = (c?.randomUUID ? c.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '');
  return prefix + random.slice(0, 12);
}

// ---- the text -------------------------------------------------------------------------------------------

const SELECTOR = 'span[data-comment]';

/** The ids that are in the text, each once, in the order of the text. */
export function commentIdsIn(root: ParentNode): string[] {
  const ids: string[] = [];
  root.querySelectorAll(SELECTOR).forEach((el) => {
    const id = el.getAttribute('data-comment') ?? '';
    if (COMMENT_ID.test(id) && !ids.includes(id)) ids.push(id);
  });
  return ids;
}

const anchorsOf = (root: ParentNode, id: string): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>(SELECTOR)).filter((el) => el.getAttribute('data-comment') === id);

/** The id of the comment (the innermost one) that a node is in. */
function commentAt(root: Element, node: Node | null): string | null {
  const el = node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);
  const span = el?.closest(SELECTOR);
  const id = span && root.contains(span) ? span.getAttribute('data-comment') : null;
  return id && COMMENT_ID.test(id) ? id : null;
}

/** Marks the text of a range as the piece that a comment is about: a span for each block that the range reaches. */
function wrap(root: Element, range: Range, id: string): number {
  let count = 0;
  for (const run of textRuns(root, range).reverse()) {
    const span = root.ownerDocument.createElement('span');
    span.setAttribute('data-comment', id);
    span.appendChild(run.extractContents()); // keeps the formatting in the text, in the pieces
    run.insertNode(span);
    count++;
  }
  return count;
}

function unwrap(root: Element, id: string): void {
  for (const span of anchorsOf(root, id)) span.replaceWith(...Array.from(span.childNodes));
  root.normalize();
}

// ---- the panel ------------------------------------------------------------------------------------------

export interface CommentsHost {
  content: HTMLElement;
  /** What the panel is in: the styles for the highlight are scoped to it. */
  root: HTMLElement;
  t(key: string, vars?: Record<string, string>): string;
  lang(): string;
  /** Whether the text can be changed (a comment is a mark in the text). */
  canEdit(): boolean;
  /** Does a change of the DOM that the editor keeps in its own history. */
  run(change: () => void): void;
  /** Shows the panel (and the tab of it). */
  show(): void;
  /** Something about the threads changed. */
  changed(event: CommentEvent | null): void;
}

let counter = 0;

const LIMIT = 90;
const short = (text: string): string => (text.length > LIMIT ? text.slice(0, LIMIT).trimEnd() + '…' : text);

export class Comments {
  private threads: CommentThread[];
  private readonly author: CommentAuthor;
  private readonly panel: HTMLElement;
  private readonly composer: HTMLElement;
  private readonly list: HTMLElement;
  private readonly done: HTMLDetailsElement;
  private readonly doneList: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly style: HTMLStyleElement;
  private readonly scope: string;
  /** The text that a new comment is about, until it is written or cancelled. */
  private pending: { saved: ReturnType<typeof saveSelection>; quote: string } | null = null;
  private active: string | null = null;
  /** What was drawn last: the panel is only drawn again when it changed. */
  private drawn = '';
  /** What was asked for in a field of the panel that is drawn again: the text of the replies that are being written. */
  private drafts = new Map<string, string>();

  constructor(
    private readonly host: CommentsHost,
    options: CommentsOptions,
  ) {
    const doc = host.content.ownerDocument;
    this.author = { id: String(options.author?.id ?? 'anonymous').slice(0, 128), name: String(options.author?.name ?? 'Anonymous').slice(0, 128) };
    this.threads = cleanThreads(options.threads);
    const n = ++counter;
    this.scope = `[data-aurebesh-comments="${n}"] .aurebesh-content`;
    host.root.setAttribute('data-aurebesh-comments', String(n));
    this.style = doc.createElement('style');
    doc.head.appendChild(this.style);

    this.panel = doc.createElement('div');
    this.panel.className = 'aurebesh-comments';
    this.composer = doc.createElement('div');
    this.composer.className = 'aurebesh-comment-thread aurebesh-comment-new';
    this.composer.hidden = true;
    this.empty = doc.createElement('div');
    this.empty.className = 'aurebesh-hint';
    this.empty.textContent = host.t('ui.comment.empty');
    this.list = doc.createElement('div');
    this.list.className = 'aurebesh-comment-list';
    this.done = doc.createElement('details');
    this.done.className = 'aurebesh-comment-done';
    const summary = doc.createElement('summary');
    this.doneList = doc.createElement('div');
    this.doneList.className = 'aurebesh-comment-list';
    this.done.append(summary, this.doneList);
    this.panel.append(this.composer, this.empty, this.list, this.done);
    this.refresh();
  }

  /** What goes in the sidebar. */
  build(): HTMLElement {
    return this.panel;
  }

  destroy(): void {
    this.style.remove();
    this.host.root.removeAttribute('data-aurebesh-comments');
  }

  // ---- the threads ----

  getThreads(): CommentThread[] {
    return this.threads.map(clone);
  }

  setThreads(list: unknown): void {
    this.threads = cleanThreads(list);
    this.pending = null;
    this.refresh(true);
    this.host.changed(null);
  }

  private find(id: string): CommentThread | undefined {
    return this.threads.find((t) => t.id === id);
  }

  /** Starts a comment on the selected text: the panel opens with a field to write in. False when no text is selected. */
  begin(): boolean {
    const { content } = this.host;
    const sel = content.ownerDocument.getSelection();
    if (!this.host.canEdit() || !sel?.rangeCount || sel.isCollapsed || !content.contains(sel.anchorNode) || !content.contains(sel.focusNode)) return false;
    const range = sel.getRangeAt(0);
    const quote = textRuns(content, range).map((r) => r.toString()).join(' ').replace(/\s+/g, ' ').trim();
    if (!quote) return false;
    this.pending = { saved: saveSelection(content), quote };
    this.host.show();
    this.drawn = '';
    this.refresh();
    this.composer.querySelector('textarea')?.focus();
    return true;
  }

  /** Writes a comment on the text that is selected (or was when `begin` was called). Returns the thread, or null when there is nothing to comment on. */
  add(text: string): CommentThread | null {
    const body = text.trim();
    if (!body || body.length > MAX_TEXT || !this.host.canEdit()) return null;
    const { content } = this.host;
    if (this.pending) restoreSelection(content, this.pending.saved);
    const sel = content.ownerDocument.getSelection();
    if (!sel?.rangeCount || sel.isCollapsed || !content.contains(sel.anchorNode)) return null;
    const range = sel.getRangeAt(0);
    const saved = saveSelection(content);
    const id = newId('c');
    let made = 0;
    this.host.run(() => {
      made = wrap(content, range, id);
      content.normalize();
    });
    if (!made) return null;
    // the same text is selected again, and the writing goes on in the text
    restoreSelection(content, saved);
    if (this.pending) content.focus({ preventScroll: true });
    const message: CommentMessage = { id: newId('m'), author: { ...this.author }, text: body, created: new Date().toISOString() };
    const thread: CommentThread = { id, messages: [message] };
    this.threads.push(thread);
    this.pending = null;
    this.active = id;
    this.refresh(true);
    this.host.changed({ action: 'add', thread: clone(thread), message });
    return clone(thread);
  }

  reply(threadId: string, text: string): CommentMessage | null {
    const thread = this.find(threadId);
    const body = text.trim();
    if (!thread || !body || body.length > MAX_TEXT) return null;
    const message: CommentMessage = { id: newId('m'), author: { ...this.author }, text: body, created: new Date().toISOString() };
    thread.messages.push(message);
    this.drafts.delete(threadId);
    this.refresh(true);
    this.host.changed({ action: 'reply', thread: clone(thread), message });
    return message;
  }

  resolve(threadId: string, resolved = true): void {
    const thread = this.find(threadId);
    if (!thread || !!thread.resolved === resolved) return;
    if (resolved) thread.resolved = true;
    else delete thread.resolved;
    this.refresh(true);
    this.host.changed({ action: resolved ? 'resolve' : 'reopen', thread: clone(thread) });
  }

  /** Takes a thread away, with its mark in the text. */
  remove(threadId: string): void {
    const thread = this.find(threadId);
    if (!thread) return;
    this.threads = this.threads.filter((t) => t !== thread);
    if (this.host.canEdit() && anchorsOf(this.host.content, threadId).length) this.host.run(() => unwrap(this.host.content, threadId));
    this.drafts.delete(threadId);
    this.refresh(true);
    this.host.changed({ action: 'delete', thread: clone(thread) });
  }

  /** Takes a message away; the thread goes with it when it was the only one. */
  removeMessage(threadId: string, messageId: string): void {
    const thread = this.find(threadId);
    const message = thread?.messages.find((m) => m.id === messageId);
    if (!thread || !message) return;
    if (thread.messages.length === 1) return this.remove(threadId);
    thread.messages = thread.messages.filter((m) => m !== message);
    this.refresh(true);
    this.host.changed({ action: 'deleteMessage', thread: clone(thread), message });
  }

  /** Selects the text of a comment and scrolls it into view. */
  select(threadId: string): void {
    const [first] = anchorsOf(this.host.content, threadId);
    if (!first) return;
    const doc = this.host.content.ownerDocument;
    const last = anchorsOf(this.host.content, threadId).pop()!;
    const range = doc.createRange();
    // inside the first and the last piece, so that the caret is in the comment (and the comment is the active one)
    range.setStart(first, 0);
    range.setEnd(last, last.childNodes.length);
    this.host.content.focus({ preventScroll: true });
    const sel = doc.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    first.scrollIntoView?.({ block: 'center' });
    this.setActive(threadId);
  }

  // ---- what is shown ----

  /** The text or the caret changed: the comment that has the caret is the one that is active, and a comment whose text is gone shows it. */
  sync(): void {
    const sel = this.host.content.ownerDocument.getSelection();
    const id = sel?.rangeCount ? commentAt(this.host.content, sel.anchorNode) : null;
    this.setActive(id && this.find(id) ? id : null);
    this.refresh();
  }

  private setActive(id: string | null): void {
    if (this.active === id) return;
    this.active = id;
    this.refresh(true);
  }

  /** Draws the highlights and the panel again when something they show changed. */
  refresh(force = false): void {
    const anchored = commentIdsIn(this.host.content);
    const key = JSON.stringify([this.threads, anchored, this.active, this.pending?.quote ?? null]);
    this.paintStyles();
    if (!force && key === this.drawn) return;
    this.drawn = key;
    this.render(anchored);
  }

  private paintStyles(): void {
    const open = this.threads.filter((t) => !t.resolved).map((t) => t.id);
    const rule = (id: string, strength: number) => `${this.scope} [data-comment="${id}"]{background:color-mix(in srgb,var(--aurebesh-comment,#facc15) ${strength}%,transparent);border-radius:2px}`;
    const css = open.map((id) => rule(id, id === this.active ? 60 : 28)).join('\n');
    if (this.style.textContent !== css) this.style.textContent = css;
  }

  private render(anchored: string[]): void {
    const { t } = this.host;
    // the order of the text, then the threads whose text is gone
    const order = (a: CommentThread, b: CommentThread) => {
      const [x, y] = [anchored.indexOf(a.id), anchored.indexOf(b.id)];
      return (x < 0 ? Infinity : x) - (y < 0 ? Infinity : y);
    };
    const open = this.threads.filter((th) => !th.resolved).sort(order);
    const done = this.threads.filter((th) => th.resolved).sort(order);

    this.renderComposer();
    this.empty.hidden = this.threads.length > 0 || !!this.pending;
    this.list.replaceChildren(...open.map((th) => this.card(th, anchored.includes(th.id))));
    this.done.hidden = !done.length;
    this.done.querySelector('summary')!.textContent = t('ui.comment.resolved', { count: String(done.length) });
    this.doneList.replaceChildren(...done.map((th) => this.card(th, anchored.includes(th.id))));
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = this.host.content.ownerDocument.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  private button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
    const b = this.el('button', `aurebesh-comment-btn${primary ? ' is-primary' : ''}`, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  private field(placeholder: string, value: string, onSubmit: (text: string) => void, onInput?: (text: string) => void, onCancel?: () => void): HTMLTextAreaElement {
    const area = this.el('textarea');
    area.rows = 3;
    area.placeholder = placeholder;
    area.value = value;
    area.maxLength = MAX_TEXT;
    area.setAttribute('aria-label', placeholder);
    area.addEventListener('input', () => onInput?.(area.value));
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onSubmit(area.value);
      } else if (e.key === 'Escape' && onCancel) {
        e.preventDefault();
        e.stopPropagation(); // not also the sidebar
        onCancel();
      }
    });
    return area;
  }

  private renderComposer(): void {
    const { t } = this.host;
    this.composer.hidden = !this.pending;
    if (!this.pending) return this.composer.replaceChildren();
    const cancel = () => {
      this.pending = null;
      this.refresh(true);
      this.host.content.focus();
    };
    const area = this.field(t('ui.comment.placeholder'), '', (text) => this.add(text), undefined, cancel);
    const actions = this.el('div', 'aurebesh-comment-actions');
    actions.append(this.button(t('ui.comment.add'), () => this.add(area.value), true), this.button(t('ui.comment.cancel'), cancel));
    const quote = this.el('div', 'aurebesh-comment-quote', short(this.pending.quote));
    this.composer.replaceChildren(this.el('strong', undefined, t('ui.comment.new')), quote, area, actions);
  }

  private time(iso: string): string {
    try {
      return new Intl.DateTimeFormat(this.host.lang(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  private card(thread: CommentThread, anchored: boolean): HTMLElement {
    const { t } = this.host;
    const card = this.el('article', 'aurebesh-comment-thread');
    card.setAttribute('data-thread', thread.id);
    if (thread.id === this.active) {
      card.classList.add('is-active');
      card.setAttribute('aria-current', 'true');
    }
    const quoteText = anchored ? short(anchorsOf(this.host.content, thread.id).map((a) => a.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim()) : t('ui.comment.orphan');
    const quote = this.el('button', 'aurebesh-comment-quote', quoteText);
    quote.type = 'button';
    quote.disabled = !anchored;
    quote.addEventListener('click', () => this.select(thread.id));
    card.appendChild(quote);

    for (const message of thread.messages) {
      const box = this.el('div', 'aurebesh-comment-msg');
      const head = this.el('div', 'aurebesh-comment-head');
      head.append(this.el('strong', undefined, message.author.name), this.el('span', 'aurebesh-comment-time', this.time(message.created)));
      box.append(head, this.el('div', 'aurebesh-comment-text', message.text));
      if (message.author.id === this.author.id) {
        const del = this.button(t('ui.comment.delete'), () => this.removeMessage(thread.id, message.id));
        del.classList.add('is-quiet');
        box.appendChild(del);
      }
      card.appendChild(box);
    }

    const reply = this.field(
      t('ui.comment.replyPlaceholder'),
      this.drafts.get(thread.id) ?? '',
      (text) => this.reply(thread.id, text),
      (text) => (text ? this.drafts.set(thread.id, text) : this.drafts.delete(thread.id)),
    );
    reply.rows = 2;
    const actions = this.el('div', 'aurebesh-comment-actions');
    actions.append(
      this.button(t('ui.comment.reply'), () => this.reply(thread.id, reply.value), true),
      this.button(thread.resolved ? t('ui.comment.reopen') : t('ui.comment.resolve'), () => this.resolve(thread.id, !thread.resolved)),
    );
    card.append(reply, actions);
    return card;
  }
}
