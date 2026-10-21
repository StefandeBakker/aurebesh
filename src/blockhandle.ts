/**
 * The handle of a block: a grip in the margin beside the block under the pointer. Dragging it moves the block (a line shows where it
 * will go), and clicking it opens a menu: duplicate, move up or down, delete, and turn into another kind of block. A block is a child
 * of the text area or of a column, so rows of columns and what is in the columns have handles of their own.
 *
 * On a screen without a pointer to hover with (a phone, a tablet) the handle stays with the block that has the caret, and is tapped for
 * the menu: there is nothing to drag with there, and the menu can move a block up and down.
 */
import { spotAt } from './blocks';
import type { Spot } from './blocks';
import { blockAtY, blockOf, canMove, canTurn, deleteBlock, duplicateBlock, hasHandle, kindOf, moveBlock, moveBy, turnInto } from './blockops';
import type { BlockKind } from './blockops';
import { iconElement } from './icons';

export const MOVE_MIME = 'application/x-aurebesh-move';

export interface BlockHandleHost {
  content: HTMLElement;
  /** What the handle and the menu are in: it is where they are positioned. */
  stage: HTMLElement;
  t(key: string): string;
  /** The name of a kind of block in the menu. */
  label(kind: BlockKind): string;
  /** Whether the text can be changed and is in the view of the editor (not read-only, not the HTML or Markdown view). */
  active(): boolean;
  /** Does a change of the DOM that the editor keeps in its own history (see history.ts), and tells that the text changed. */
  run(change: () => void): void;
  /** Shows (or hides, with null) the line that tells where a dragged block goes. */
  line(spot: Spot | null): void;
  /** The type that a block turned into a callout gets. */
  calloutType(): string;
}

const KINDS: BlockKind[] = ['p', 'h1', 'h2', 'h3', 'ul', 'ol', 'task', 'quote', 'code', 'callout'];

export class BlockHandle {
  private handle: HTMLButtonElement;
  private menu: HTMLElement;
  private block: HTMLElement | null = null;
  private dragging: HTMLElement | null = null;
  /** The block that the handle was pressed on: while the button is down the handle stays with it, whatever the pointer goes over. */
  private pressed: HTMLElement | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private cleanup: Array<() => void> = [];
  /** A screen that cannot hover: the handle follows the caret. */
  private touch: boolean;

  constructor(private host: BlockHandleHost) {
    const doc = host.content.ownerDocument;
    this.touch = !!doc.defaultView?.matchMedia?.('(hover: none)').matches;
    this.handle = doc.createElement('button');
    this.handle.type = 'button';
    this.handle.className = 'aurebesh-blockhandle';
    this.handle.draggable = !this.touch;
    this.handle.hidden = true;
    const name = host.t('ui.blockHandle');
    this.handle.title = name;
    this.handle.setAttribute('aria-label', name);
    this.handle.setAttribute('aria-haspopup', 'menu');
    this.handle.setAttribute('aria-expanded', 'false');
    this.handle.tabIndex = -1; // the keyboard has shortcuts and the menu key of the editor
    const grip = iconElement(doc, 'grip');
    if (grip) this.handle.appendChild(grip);
    this.menu = doc.createElement('div');
    this.menu.className = 'aurebesh-blockmenu';
    this.menu.setAttribute('role', 'menu');
    this.menu.setAttribute('aria-label', host.t('ui.blockMenu'));
    this.menu.hidden = true;
    host.stage.append(this.handle, this.menu);

    const on = (target: EventTarget, type: string, fn: (e: any) => void, capture = false) => {
      target.addEventListener(type, fn, capture);
      this.cleanup.push(() => target.removeEventListener(type, fn, capture));
    };
    on(host.stage, 'mousemove', (e: MouseEvent) => this.onMove(e));
    on(host.stage, 'mouseleave', () => this.hideSoon());
    on(this.handle, 'mouseenter', () => clearTimeout(this.hideTimer));
    on(this.handle, 'mousedown', () => (this.pressed = this.block));
    on(doc, 'mouseup', () => (this.pressed = null), true);
    on(this.handle, 'click', () => (this.menu.hidden ? this.openMenu() : this.closeMenu()));
    on(this.handle, 'dragstart', (e: DragEvent) => this.onDragStart(e));
    on(this.handle, 'dragend', () => this.endDrag());
    on(host.content, 'dragover', (e: DragEvent) => this.onDragOver(e), true);
    on(host.content, 'drop', (e: DragEvent) => this.onDrop(e), true);
    on(host.content, 'keydown', (e: KeyboardEvent) => {
      if (!this.touch && !['Shift', 'Alt', 'Control', 'Meta'].includes(e.key)) this.hide();
    });
    on(host.content, 'scroll', () => this.hide());
    // a click in the text: the handle goes until the pointer moves again; and a table that gets the caret has grips of its own along its edge
    on(host.content, 'mousedown', () => this.hide());
    on(doc, 'selectionchange', () => {
      const sel = doc.getSelection();
      if (this.block?.matches('table') && sel?.anchorNode && this.block.contains(sel.anchorNode)) this.hide();
      else if (this.touch) this.follow();
    });
    // where the handle is is where the block was: when the text or its layout changes, the handle goes until the pointer moves again
    const win = doc.defaultView;
    if (win?.MutationObserver) {
      const observer = new win.MutationObserver(() => {
        this.hide();
        if (this.touch) setTimeout(() => this.follow(), 0);
      });
      observer.observe(host.content, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'data-layout'] });
      this.cleanup.push(() => observer.disconnect());
    }
    if (win) on(win, 'resize', () => this.hide());
    on(doc, 'mousedown', (e: MouseEvent) => {
      if (!this.menu.hidden && !this.menu.contains(e.target as Node) && e.target !== this.handle && !this.handle.contains(e.target as Node)) this.closeMenu();
    });
  }

  destroy(): void {
    clearTimeout(this.hideTimer);
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    this.handle.remove();
    this.menu.remove();
  }

  // ---- the handle ----------------------------------------------------------------------------------------

  private onMove(e: MouseEvent): void {
    if (!this.menu.hidden || this.dragging || this.pressed) return;
    if (!this.host.active()) return this.hide();
    const target = e.target as Element;
    if (target === this.handle || this.handle.contains(target) || this.menu.contains(target)) {
      clearTimeout(this.hideTimer);
      return;
    }
    clearTimeout(this.hideTimer);
    const { content } = this.host;
    let block: HTMLElement | null = null;
    if (target === content) block = blockAtY(content, e.clientY); // in the margin of the text
    else if (content.contains(target)) block = blockOf(content, target);
    else return; // on the stage beside the text: the handle stays where it is, to be reached
    if (!block || !hasHandle(block)) return;
    // a table with the caret in it has grips of its own along its edge: the handle leaves them alone (the menu is still there with Alt+Shift+M)
    const sel = block.ownerDocument.getSelection();
    if (block.matches('table') && sel?.anchorNode && block.contains(sel.anchorNode)) return this.hide();
    this.show(block);
  }

  /** On a touch screen: the handle goes to the block with the caret, and goes when the caret is not in the text. */
  private follow(): void {
    if (!this.menu.hidden || this.dragging) return;
    const { content } = this.host;
    const sel = content.ownerDocument.getSelection();
    if (!this.host.active() || !sel?.rangeCount || !sel.anchorNode || !content.contains(sel.anchorNode)) return this.hide();
    const block = blockOf(content, sel.anchorNode);
    if (!block || !hasHandle(block) || (block.matches('table') && block.contains(sel.anchorNode))) return this.hide();
    this.show(block);
  }

  /** Puts the handle beside a block. */
  private show(block: HTMLElement): void {
    this.block = block;
    const { stage } = this.host;
    const stageBox = stage.getBoundingClientRect();
    const box = block.getBoundingClientRect();
    const left = Math.max(2, box.left - stageBox.left - 26) + stage.scrollLeft;
    const top = box.top - stageBox.top + stage.scrollTop + 2;
    Object.assign(this.handle.style, { left: `${left}px`, top: `${top}px` });
    this.handle.hidden = false;
  }

  hide(): void {
    if (!this.menu.hidden || this.dragging) return;
    this.handle.hidden = true;
    this.block = null;
  }

  private hideSoon(): void {
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hide(), 250);
  }

  // ---- dragging ------------------------------------------------------------------------------------------

  private onDragStart(e: DragEvent): void {
    const block = this.pressed ?? this.block;
    if (!block || !this.host.active()) {
      e.preventDefault();
      return;
    }
    this.closeMenu();
    this.dragging = block;
    e.dataTransfer?.setData(MOVE_MIME, 'move');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      try {
        e.dataTransfer.setDragImage(block, 12, 12);
      } catch {
        /* a browser that cannot: the default image */
      }
    }
    block.classList.add('aurebesh-moving');
  }

  private onDragOver(e: DragEvent): void {
    if (!this.dragging || !e.dataTransfer?.types.includes(MOVE_MIME)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const spot = spotAt(this.host.content, e.clientX, e.clientY);
    this.host.line(spot && canMove(this.dragging, spot) ? spot : null);
  }

  private onDrop(e: DragEvent): void {
    const block = this.dragging;
    if (!block || !e.dataTransfer?.types.includes(MOVE_MIME)) return;
    e.preventDefault();
    e.stopPropagation();
    const spot = spotAt(this.host.content, e.clientX, e.clientY);
    this.endDrag();
    if (spot && this.host.active()) this.host.run(() => void moveBlock(this.host.content, block, spot));
  }

  private endDrag(): void {
    this.pressed = null;
    this.dragging?.classList.remove('aurebesh-moving');
    this.dragging = null;
    this.host.line(null);
    this.handle.hidden = true;
    this.block = null;
  }

  // ---- the menu ------------------------------------------------------------------------------------------

  /** Opens the menu of the block with the handle, or (with a block) of that block. */
  openMenu(block: HTMLElement | null = this.block): void {
    if (!block || !this.host.active()) return;
    this.show(block);
    const doc = this.host.content.ownerDocument;
    const { t } = this.host;
    this.menu.replaceChildren();
    const item = (label: string, run: () => void, options: { disabled?: boolean; checked?: boolean; role?: string } = {}) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'aurebesh-blockmenu-item';
      b.setAttribute('role', options.role ?? 'menuitem');
      if (options.checked !== undefined) b.setAttribute('aria-checked', String(options.checked));
      b.textContent = label;
      b.tabIndex = -1;
      b.disabled = !!options.disabled;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => {
        this.closeMenu(false);
        this.host.run(run);
        this.hide();
      });
      this.menu.appendChild(b);
    };
    const siblings = Array.from(block.parentElement?.children ?? []).filter(hasHandle);
    const at = siblings.indexOf(block);
    const content = this.host.content;
    item(t('ui.block.duplicate'), () => void duplicateBlock(content, block));
    item(t('ui.block.moveUp'), () => void moveBy(content, block, -1), { disabled: at <= 0 });
    item(t('ui.block.moveDown'), () => void moveBy(content, block, 1), { disabled: at < 0 || at >= siblings.length - 1 });
    item(t('ui.block.delete'), () => deleteBlock(content, block));
    if (canTurn(block)) {
      const title = doc.createElement('div');
      title.className = 'aurebesh-blockmenu-title';
      title.setAttribute('role', 'presentation');
      title.textContent = t('ui.block.turnInto');
      this.menu.appendChild(title);
      const current = kindOf(block);
      for (const kind of KINDS) {
        item(this.host.label(kind), () => void turnInto(content, block, kind, this.host.calloutType()), { role: 'menuitemradio', checked: kind === current });
      }
    }
    // under the handle, inside the stage
    const left = parseFloat(this.handle.style.left) || 0;
    const top = (parseFloat(this.handle.style.top) || 0) + this.handle.offsetHeight + 4;
    Object.assign(this.menu.style, { left: `${left}px`, top: `${top}px` });
    this.menu.hidden = false;
    this.handle.setAttribute('aria-expanded', 'true');
    this.handle.hidden = false;
    const width = this.menu.offsetWidth;
    const room = this.host.stage.clientWidth + this.host.stage.scrollLeft - 4;
    if (left + width > room) this.menu.style.left = `${Math.max(2, room - width)}px`;
    // above the handle when there is no room below it in the window
    const win = doc.defaultView;
    const box = this.menu.getBoundingClientRect();
    if (win && box.bottom > win.innerHeight - 8 && box.top - this.menu.offsetHeight - this.handle.offsetHeight - 8 > 0) {
      this.menu.style.top = `${top - this.menu.offsetHeight - this.handle.offsetHeight - 8}px`;
    }
    (this.menu.querySelector('button:not(:disabled)') as HTMLElement | null)?.focus();
    this.menu.onkeydown = (e) => this.onMenuKey(e);
    this.menuBlock = block;
  }

  private menuBlock: HTMLElement | null = null;

  /** Closes the menu; the caret goes back into the text unless something else took it. */
  closeMenu(focus = true): void {
    if (this.menu.hidden) return;
    this.menu.hidden = true;
    this.handle.setAttribute('aria-expanded', 'false');
    if (focus) {
      this.host.content.focus();
      if (this.menuBlock?.isConnected) this.placeCaret(this.menuBlock);
    }
    this.menuBlock = null;
  }

  private placeCaret(block: HTMLElement): void {
    const doc = block.ownerDocument;
    const range = doc.createRange();
    range.selectNodeContents(block);
    range.collapse(true);
    const sel = doc.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  private onMenuKey(e: KeyboardEvent): void {
    const items = Array.from(this.menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const at = items.indexOf(this.menu.ownerDocument.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      items[e.key === 'Home' ? 0 : items.length - 1]?.focus();
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      this.closeMenu();
    }
  }

  // ---- the keyboard --------------------------------------------------------------------------------------

  /**
   * Alt+Shift+Up and Alt+Shift+Down move the block with the caret, and Alt+Shift+M opens its menu. True when the key was one of those.
   */
  handleKey(e: KeyboardEvent): boolean {
    if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey || e.isComposing || !this.host.active()) return false;
    const up = e.code === 'ArrowUp';
    if (!up && e.code !== 'ArrowDown' && e.code !== 'KeyM') return false;
    const sel = this.host.content.ownerDocument.getSelection();
    const block = sel?.rangeCount ? blockOf(this.host.content, sel.anchorNode) : null;
    if (!block || !hasHandle(block)) return false;
    e.preventDefault();
    if (e.code === 'KeyM') {
      this.openMenu(block);
      return true;
    }
    this.host.run(() => void moveBy(this.host.content, block, up ? -1 : 1));
    return true;
  }
}
