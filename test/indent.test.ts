import { describe, expect, it } from 'vitest';
import { canIndent } from '../src/indent';

function selectRange(start: Node, startOffset: number, end: Node = start, endOffset = startOffset): void {
  const range = document.createRange();
  range.setStart(start, startOffset);
  range.setEnd(end, endOffset);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('indent availability in lists', () => {
  it('uses the nested list item at a collapsed caret instead of its ancestors', () => {
    const content = document.createElement('div');
    content.className = 'aurebesh-content';
    content.innerHTML = '<ul><li>parent<ul><li>child</li></ul></li></ul>';
    document.body.appendChild(content);
    const text = content.querySelector('ul ul li')!.firstChild!;
    selectRange(text, 2);
    expect(canIndent(-1)).toBe(true);
    content.remove();
  });

  it('checks every intersected list item for an expanded selection', () => {
    const content = document.createElement('div');
    content.className = 'aurebesh-content';
    content.innerHTML = '<ul><li>first</li><li>second</li></ul>';
    document.body.appendChild(content);
    const items = content.querySelectorAll('li');
    selectRange(items[0].firstChild!, 0, items[1].firstChild!, 3);
    expect(canIndent(1)).toBe(true);
    content.remove();
  });
});
