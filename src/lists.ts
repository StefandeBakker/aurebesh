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
