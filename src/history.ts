/**
 * Undo for what the editor changes in the DOM itself: moving, copying, deleting and turning blocks, and replacing all. A browser has no
 * undo for those (and `insertHTML` for whole blocks merges them with the ones beside it), so each change is kept as the HTML before and
 * after it. Undo takes the HTML back when the text is as the change left it, and passes to the undo of the browser when it is not (typing
 * after a change is undone first, by the browser, and then the change). Redo is the other way.
 */
import { restoreSelection, saveSelection } from './selection';
import type { SavedSelection } from './selection';

interface Entry {
  before: string;
  after: string;
  /** Where the selection was (as numbers of characters of text before its ends), before and after the change. */
  selBefore: SavedSelection | null;
  selAfter: SavedSelection | null;
  /** What kind of edit made it and when, for steps of typing that follow each other (see `commit`). */
  kind?: string;
  time?: number;
}

const LIMIT = 100;

export class BlockHistory {
  private undos: Entry[] = [];
  private redos: Entry[] = [];

  constructor(private content: HTMLElement) {}

  /** Runs a change of the DOM and keeps it. Returns whether it changed the text. */
  run(change: () => void): boolean {
    const before = this.content.innerHTML;
    const selBefore = saveSelection(this.content);
    change();
    const after = this.content.innerHTML;
    if (after === before) return false;
    this.undos.push({ before, after, selBefore, selAfter: saveSelection(this.content) });
    if (this.undos.length > LIMIT) this.undos.shift();
    this.redos = [];
    return true;
  }

  /**
   * Keeps a change that was already made (by the browser, and put right by the editor): `before` is the text as it was. A step of the same
   * `kind` (typing, deleting) that follows the last one within a moment joins it, so that undo takes back a word and not a letter.
   */
  commit(before: string, selBefore: SavedSelection | null, kind: string): void {
    const after = this.content.innerHTML;
    const now = Date.now();
    const last = this.undos[this.undos.length - 1];
    if (after === before) return;
    this.redos = [];
    if (last && last.kind === kind && last.after === before && now - (last.time ?? 0) < 1500) {
      last.after = after;
      last.selAfter = saveSelection(this.content);
      last.time = now;
      return;
    }
    this.undos.push({ before, after, selBefore, selAfter: saveSelection(this.content), kind, time: now });
    if (this.undos.length > LIMIT) this.undos.shift();
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
    restoreSelection(this.content, entry.selBefore);
    return true;
  }

  redo(): boolean {
    if (!this.canRedo()) return false;
    const entry = this.redos.pop()!;
    this.content.innerHTML = entry.after;
    this.undos.push(entry);
    restoreSelection(this.content, entry.selAfter);
    return true;
  }

  clear(): void {
    this.undos = [];
    this.redos = [];
  }
}
