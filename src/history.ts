/**
 * Undo for what the editor changes in the DOM itself: moving, copying, deleting and turning blocks, and replacing all. A browser has no
 * undo for those (and `insertHTML` for whole blocks merges them with the ones beside it), so each change is kept as the HTML before and
 * after it. Undo takes the HTML back when the text is as the change left it, and passes to the undo of the browser when it is not (typing
 * after a change is undone first, by the browser, and then the change). Redo is the other way.
 */
interface Entry {
  before: string;
  after: string;
  /** Where the caret was, as the number of characters of text before it, before and after the change. */
  caretBefore: number;
  caretAfter: number;
}

const LIMIT = 100;

export class BlockHistory {
  private undos: Entry[] = [];
  private redos: Entry[] = [];

  constructor(private content: HTMLElement) {}

  /** The number of characters of text before the caret, or -1 when the caret is not in the text. */
  private caret(): number {
    const sel = this.content.ownerDocument.getSelection();
    if (!sel?.rangeCount || !this.content.contains(sel.anchorNode)) return -1;
    const range = this.content.ownerDocument.createRange();
    range.selectNodeContents(this.content);
    range.setEnd(sel.anchorNode!, sel.anchorOffset);
    return range.toString().length;
  }

  private place(chars: number): void {
    const doc = this.content.ownerDocument;
    const sel = doc.getSelection();
    if (chars < 0 || !sel) return;
    const walker = doc.createTreeWalker(this.content, NodeFilter.SHOW_TEXT);
    let left = chars;
    let last: Text | null = null;
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      last = n;
      if (left <= n.length) {
        const range = doc.createRange();
        range.setStart(n, left);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      left -= n.length;
    }
    if (last) {
      const range = doc.createRange();
      range.setStart(last, last.length);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  /** Runs a change of the DOM and keeps it. Returns whether it changed the text. */
  run(change: () => void): boolean {
    const before = this.content.innerHTML;
    const caretBefore = this.caret();
    change();
    const after = this.content.innerHTML;
    if (after === before) return false;
    this.undos.push({ before, after, caretBefore, caretAfter: this.caret() });
    if (this.undos.length > LIMIT) this.undos.shift();
    this.redos = [];
    return true;
  }

  /** Something else changed the text (typing...): what can be done again is no longer where it was. */
  edited(): void {
    this.redos = [];
  }

  /** Whether the last change is the one that undo is to take back: the text is as it left it. */
  canUndo(): boolean {
    const top = this.undos[this.undos.length - 1];
    return !!top && this.content.innerHTML === top.after;
  }

  canRedo(): boolean {
    const top = this.redos[this.redos.length - 1];
    return !!top && this.content.innerHTML === top.before;
  }

  /** Takes the last change back. False when it is not its turn (the browser has something to undo first). */
  undo(): boolean {
    if (!this.canUndo()) return false;
    const entry = this.undos.pop()!;
    this.content.innerHTML = entry.before;
    this.redos.push(entry);
    this.place(entry.caretBefore);
    return true;
  }

  redo(): boolean {
    if (!this.canRedo()) return false;
    const entry = this.redos.pop()!;
    this.content.innerHTML = entry.after;
    this.undos.push(entry);
    this.place(entry.caretAfter);
    return true;
  }

  clear(): void {
    this.undos = [];
    this.redos = [];
  }
}
