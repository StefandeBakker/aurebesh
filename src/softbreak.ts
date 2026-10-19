/**
 * Shift+Enter: a line break inside the block (`<br>`), where Enter starts a new block. Browsers do this by themselves, but not all the
 * same way (some make a new paragraph or a div in a list item or a heading), so it is done here, the same everywhere.
 */
export function handleSoftBreak(e: KeyboardEvent, content: HTMLElement): boolean {
  if (e.key !== 'Enter' || !e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing || !content.isContentEditable) return false;
  const doc = content.ownerDocument;
  const sel = doc.getSelection();
  const node = sel?.rangeCount ? sel.anchorNode : null;
  const el = node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);
  if (!el || !content.contains(el)) return false;
  // a code block and a caption have their own way with the key
  if (el.closest('pre,caption')) return false;
  e.preventDefault();
  doc.execCommand('insertLineBreak');
  return true;
}
