/** Inline formatting that needs more than a single execCommand: links and inline code. */

const ROOT = '.aurebesh-content';
const SAFE_LINK = /^(?:https?:|mailto:|tel:|#|\/)/i;

const closestIn = (selector: string): HTMLElement | null => {
  const node = document.getSelection()?.anchorNode;
  const el = node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);
  const found = el?.closest(selector) as HTMLElement | null | undefined;
  return found?.closest(ROOT) ? found : null;
};

export const currentLink = (): HTMLAnchorElement | null => closestIn('a') as HTMLAnchorElement | null;

/** Whether an address is one the editor will open: http(s), mailto, tel or a path on this site (not `#anchors`, not scripts). */
export const canOpenLink = (href: string | null | undefined): boolean => {
  const url = (href ?? '').trim();
  return !!url && !url.startsWith('#') && SAFE_LINK.test(url);
};

/** Opens a link in a new tab, without giving the new page access to this one. Returns false when the address is not openable. */
export function openLink(href: string | null | undefined): boolean {
  if (!canOpenLink(href)) return false;
  window.open((href as string).trim(), '_blank', 'noopener,noreferrer');
  return true;
}

/** Accepts what people type: `example.com`, `me@example.com`, full URLs. Throws for anything unsafe. */
export function normalizeLink(input: string): string {
  const v = input.trim();
  if (!v) return '';
  let url = v;
  if (!SAFE_LINK.test(v)) {
    if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(v)) url = `mailto:${v}`;
    else if (/^[\w-]+(?:\.[\w-]+)+(?:[/?#]|$)/.test(v)) url = `https://${v}`;
  }
  if (!SAFE_LINK.test(url)) throw new Error('Unsupported link. Use http(s)://, mailto:, tel: or a relative path.');
  return url;
}

/** Sets, changes or (with an empty url) removes a link at the selection. */
export function setLink(url: string): void {
  const sel = document.getSelection();
  if (!sel) return;
  const existing = currentLink();
  if (existing && sel.isCollapsed) {
    // Caret inside a link: act on the whole link.
    const range = document.createRange();
    range.selectNodeContents(existing);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  if (!url) {
    document.execCommand('unlink');
    return;
  }
  if (sel.isCollapsed) {
    // Nothing selected and no link here: insert the address itself as the link text.
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.textContent = url.replace(/^mailto:|^tel:/i, '');
    document.execCommand('insertHTML', false, a.outerHTML);
    return;
  }
  document.execCommand('createLink', false, url);
}

export const isInlineCode = (): boolean => {
  const code = closestIn('code');
  return !!code && !code.closest('pre');
};

/** Wraps the selected text in <code>, or unwraps it when the caret is already inside inline code. */
export function toggleInlineCode(): void {
  const sel = document.getSelection();
  if (!sel?.rangeCount) return;
  const code = closestIn('code');
  if (code && !code.closest('pre')) {
    // Typing text over a <code> keeps its formatting in Chrome, so use removeFormat on its content instead
    // (it removes <code>, and unlike DOM edits it is part of the undo history).
    const range = document.createRange();
    range.selectNodeContents(code);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('removeFormat');
    return;
  }
  if (sel.isCollapsed || closestIn('pre')) return;
  const anchor = sel.anchorNode && (sel.anchorNode.nodeType === Node.ELEMENT_NODE ? (sel.anchorNode as Element) : sel.anchorNode.parentElement);
  const root = anchor?.closest(ROOT);
  const el = document.createElement('code');
  el.textContent = sel.toString();
  el.setAttribute('data-new', '');
  document.execCommand('insertHTML', false, el.outerHTML);
  // Keep the new code selected (like Bold does), so the same shortcut can undo it.
  const fresh = root?.querySelector('code[data-new]');
  if (fresh) {
    fresh.removeAttribute('data-new');
    const range = document.createRange();
    range.selectNodeContents(fresh);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}
