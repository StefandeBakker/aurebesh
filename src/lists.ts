/** Tab / Shift+Tab inside a list item indents / outdents it (nested lists). */

const ROOT = '.aurebesh-content';

function currentItem(): HTMLLIElement | null {
  const node = document.getSelection()?.anchorNode;
  const el = node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);
  const li = el?.closest('li') as HTMLLIElement | null | undefined;
  return li?.closest(ROOT) ? li : null;
}

/** Returns true when the key was handled. Tab stays inside the editor while the caret is in a list. */
export function handleListKey(e: KeyboardEvent): boolean {
  if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return false;
  const li = currentItem();
  if (!li) return false;
  e.preventDefault();
  const checked = li.getAttribute('data-checked'); // the browser makes a new item of a task when it moves it a level out
  if (e.shiftKey) {
    // Only nested items can move out one level; a top-level item stays in its list.
    const outer = li.parentElement?.parentElement;
    const nested = !!outer && outer.tagName !== 'DIV' && /^(?:LI|UL|OL)$/.test(outer.tagName);
    if (nested) document.execCommand('outdent');
  } else if (li.previousElementSibling) {
    // The first item has nothing to nest under.
    document.execCommand('indent');
  }
  const now = currentItem();
  if (checked !== null && now && !now.hasAttribute('data-checked') && now.parentElement?.matches('ul[data-task]')) now.setAttribute('data-checked', checked);
  return true;
}

// ---- the look of the marker ------------------------------------------------------------------------------

/**
 * The look of the marker of a list: a bullet list has a disc, a circle or a square, a numbered list has numbers, letters or Roman
 * numerals. It is the `list-style-type` in the style of the `<ul>` or `<ol>` (the sanitizer keeps these and no other); the default look has no style.
 */
export type ListKind = 'ul' | 'ol';

export const BULLET_STYLES = ['disc', 'circle', 'square'];
export const NUMBER_STYLES = ['decimal', 'lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman'];

/** The look that has no style of its own in the HTML: what a list is without one. */
export const DEFAULT_LIST_STYLE: Record<ListKind, string> = { ul: 'disc', ol: 'decimal' };

/** What the marker looks like in the dropdown: the first of them, as it is written. */
export const LIST_SAMPLES: Record<string, string> = {
  disc: '●',
  circle: '○',
  square: '■',
  decimal: '1. 2. 3.',
  'lower-alpha': 'a. b. c.',
  'upper-alpha': 'A. B. C.',
  'lower-roman': 'i. ii. iii.',
  'upper-roman': 'I. II. III.',
};

const exec = (cmd: string) => document.execCommand(cmd, false);

/** The list that the caret is in (the innermost, not a task list), or null. */
export function currentList(): HTMLElement | null {
  const sel = document.getSelection();
  const node = sel?.anchorNode;
  const el = node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);
  const list = el?.closest('ul:not([data-task]),ol');
  return list && list.closest('.aurebesh-content') ? (list as HTMLElement) : null;
}

/** The style of the marker of the list that the caret is in, when it is a list of this kind. */
export function currentListStyle(kind: ListKind): string | null {
  const list = currentList();
  if (!list || list.tagName.toLowerCase() !== kind) return null;
  return list.style.listStyleType || DEFAULT_LIST_STYLE[kind];
}

/** Gives the list that the caret is in this look; where there is no list of this kind it becomes one first. */
export function setListStyle(kind: ListKind, style: string): void {
  const valid = kind === 'ul' ? BULLET_STYLES : NUMBER_STYLES;
  if (!valid.includes(style)) return;
  let list = currentList();
  if (!list || list.tagName.toLowerCase() !== kind) {
    exec(kind === 'ul' ? 'insertUnorderedList' : 'insertOrderedList');
    list = currentList();
  }
  if (!list || list.tagName.toLowerCase() !== kind) return;
  if (style === DEFAULT_LIST_STYLE[kind]) list.style.removeProperty('list-style-type');
  else list.style.setProperty('list-style-type', style);
  if (!list.getAttribute('style')?.trim()) list.removeAttribute('style');
}
