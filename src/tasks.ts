/**
 * Task lists (checklists): a list with a box before every item that can be checked. In the HTML it is a `ul` with `data-task` and an `li`
 * with `data-checked="true"` when it is checked; the box is drawn by CSS (see `taskListCss`), so there is no input in the text to edit.
 */
const ROOT = '.aurebesh-content';
const TASK_LIST = 'ul[data-task]';

/** The list item that has the caret, when it is in the editor. */
function currentItem(): HTMLLIElement | null {
  const node = document.getSelection()?.anchorNode;
  const el = node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);
  const li = el?.closest('li') as HTMLLIElement | null | undefined;
  return li?.closest(ROOT) ? li : null;
}

/** The item of a task list that has the caret, or null. */
export function currentTask(): HTMLLIElement | null {
  const li = currentItem();
  return li?.parentElement?.matches(TASK_LIST) ? li : null;
}

export function isTaskList(): boolean {
  return currentTask() !== null;
}

/** Makes a list (and the lists in it) a task list, or an ordinary one again. */
function setTask(ul: Element, on: boolean): void {
  for (const list of [ul, ...Array.from(ul.querySelectorAll('ul'))]) {
    if (on) list.setAttribute('data-task', '');
    else {
      list.removeAttribute('data-task');
      list.querySelectorAll(':scope > li').forEach((li) => li.removeAttribute('data-checked'));
    }
  }
}

/** The task list button: the lines with the caret become a task list; in one already they become an ordinary list again. */
export function toggleTaskList(): void {
  let li = currentItem();
  if (li?.parentElement?.matches(TASK_LIST)) {
    setTask(li.parentElement, false);
    return;
  }
  // a paragraph, or a numbered list, becomes a bullet list first
  if (!li || li.parentElement?.tagName !== 'UL') {
    document.execCommand('insertUnorderedList');
    li = currentItem();
  }
  if (li?.parentElement?.tagName === 'UL') setTask(li.parentElement, true);
}

/** Checks or unchecks an item; returns whether it is checked now. */
export function toggleChecked(li: Element): boolean {
  const on = li.getAttribute('data-checked') !== 'true';
  if (on) li.setAttribute('data-checked', 'true');
  else li.removeAttribute('data-checked');
  return on;
}

/** The item whose box is under the pointer, when the pointer is on the box of an item (not on its text or on the items inside it). */
export function boxAt(e: MouseEvent): HTMLLIElement | null {
  const target = e.target instanceof Element ? e.target : null;
  const li = target?.closest('li') as HTMLLIElement | null | undefined;
  if (!li || !li.parentElement?.matches(TASK_LIST) || !li.closest(ROOT)) return null;
  const style = getComputedStyle(li);
  const size = parseFloat(style.fontSize) || 16;
  const line = parseFloat(style.lineHeight) || size * 1.5;
  const rect = li.getBoundingClientRect();
  const x = style.direction === 'rtl' ? rect.right - e.clientX : e.clientX - rect.left;
  const y = e.clientY - rect.top;
  return x >= 0 && x <= size * 1.7 && y >= 0 && y <= line + (parseFloat(style.paddingTop) || 0) ? li : null;
}

/**
 * After a key press that changes the lists: a new item made with Enter is not checked, even when the item it came from is, and a list
 * inside an item of a task list (made by indenting) is a task list too.
 */
export function afterListInput(inputType: string): boolean {
  const li = currentItem();
  if (!li) return false;
  if (inputType === 'insertParagraph' && li.parentElement?.matches(TASK_LIST) && li.hasAttribute('data-checked')) {
    li.removeAttribute('data-checked');
    return true;
  }
  {
    const ul = li.parentElement;
    // the browser puts the new list in the list, or in the item before it
    const outer = ul?.parentElement;
    const host = outer?.tagName === 'LI' ? outer.parentElement : outer;
    if (ul?.tagName === 'UL' && !ul.hasAttribute('data-task') && host?.matches(TASK_LIST)) {
      ul.setAttribute('data-task', '');
      return true;
    }
  }
  return false;
}

/**
 * Mod+Enter checks or unchecks the item with the caret. Returns the new state, or null when the key was something else.
 */
export function handleTaskKey(e: KeyboardEvent): boolean | null {
  if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.isComposing) return null;
  const li = currentTask();
  if (!li) return null;
  e.preventDefault();
  return toggleChecked(li);
}

/** The CSS of a task list: the box in front of every item. Also for a page that only shows the HTML. */
export function taskListCss(): string {
  const check = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23fff' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12.5l4.5 4.5L19 7.5'/%3E%3C/svg%3E\")";
  return (
    `ul[data-task]{list-style:none;padding-inline-start:0}\n` +
    `ul[data-task] ul[data-task]{padding-inline-start:1.7em}\n` +
    `ul[data-task]>li{position:relative;padding-inline-start:1.7em}\n` +
    `ul[data-task]>li::before{content:'';position:absolute;inset-inline-start:0;top:.25em;box-sizing:border-box;width:1em;height:1em;border:2px solid var(--aurebesh-task-border,#8a94a6);border-radius:var(--aurebesh-task-radius,4px);background:transparent}\n` +
    `ul[data-task]>li[data-checked="true"]::before{border-color:var(--aurebesh-task-color,#2563eb);background:var(--aurebesh-task-color,#2563eb) ${check} center/80% no-repeat}\n`
  );
}
