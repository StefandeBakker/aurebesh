import { describe, expect, it } from 'vitest';
import { blockOf, canMove, canTurn, deleteBlock, duplicateBlock, kindOf, moveBlock, moveBy, turnInto } from '../src/blockops';

/** An editor's text area in the page. There are no blocks around the ones that the tests use, so they are changed in the DOM (the browser's undo needs a real browser: see the e2e tests). */
const content = (html: string): HTMLElement => {
  document.body.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'aurebesh-content';
  el.contentEditable = 'true';
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
};
const kid = (c: HTMLElement, i: number) => c.children[i] as HTMLElement;

describe('the block of a node', () => {
  it('is the child of the text area that holds it, or of a column', () => {
    const c = content('<p>one <strong>two</strong></p><div data-layout="row"><div data-layout="col"><h2>head</h2><p>in col</p></div></div>');
    expect(blockOf(c, c.querySelector('strong')!.firstChild)).toBe(kid(c, 0));
    expect(blockOf(c, c.querySelector('h2'))).toBe(c.querySelector('h2'));
    expect(blockOf(c, c.querySelector('[data-layout="col"]'))).toBe(kid(c, 1)); // the column itself: the row is the block
    expect(blockOf(c, c)).toBeNull();
    expect(blockOf(c, document.body)).toBeNull();
  });
});

describe('where a block can go', () => {
  it('not into itself, and not to where it is', () => {
    const c = content('<p>a</p><p>b</p><div data-layout="row"><div data-layout="col"><p>x</p></div></div>');
    const [a, b, row] = [kid(c, 0), kid(c, 1), kid(c, 2)];
    expect(canMove(a, { parent: c, before: a })).toBe(false);
    expect(canMove(a, { parent: c, before: b })).toBe(false); // right where it is
    expect(canMove(a, { parent: c, before: null })).toBe(true);
    expect(canMove(row, { parent: row.querySelector('[data-layout="col"]') as HTMLElement, before: null })).toBe(false); // into its own column
    expect(canMove(a, { parent: row.querySelector('[data-layout="col"]') as HTMLElement, before: null })).toBe(true);
  });
});

describe('moving a block', () => {
  it('puts it before another block, and at the end', () => {
    const c = content('<p>a</p><p>b</p><p>c</p>');
    expect(moveBlock(c, kid(c, 0), { parent: c, before: null })).toBe(true);
    expect(c.innerHTML).toBe('<p>b</p><p>c</p><p>a</p>');
    expect(moveBlock(c, kid(c, 2), { parent: c, before: kid(c, 0) })).toBe(true);
    expect(c.innerHTML).toBe('<p>a</p><p>b</p><p>c</p>');
    expect(moveBlock(c, kid(c, 1), { parent: c, before: kid(c, 1) })).toBe(false);
  });

  it('moves up and down among the blocks beside it, and stops at the ends', () => {
    const c = content('<p>a</p><h2>b</h2><ul><li>c</li></ul>');
    expect(moveBy(c, kid(c, 1), -1)).toBe(true);
    expect(c.innerHTML).toBe('<h2>b</h2><p>a</p><ul><li>c</li></ul>');
    expect(moveBy(c, kid(c, 0), -1)).toBe(false);
    expect(moveBy(c, kid(c, 1), 1)).toBe(true);
    expect(c.innerHTML).toBe('<h2>b</h2><ul><li>c</li></ul><p>a</p>');
    expect(moveBy(c, kid(c, 2), 1)).toBe(false);
  });

  it('does not move the paragraph that is only there to type in, and a table goes as a whole', () => {
    const c = content('<table><tbody><tr><td>x</td></tr></tbody></table><p>after</p>');
    expect(moveBy(c, kid(c, 0), 1)).toBe(true);
    expect(c.innerHTML).toBe('<p>after</p><table><tbody><tr><td>x</td></tr></tbody></table>');
  });

  it('takes a block out of a column and into one, and a column that is left empty gets a paragraph', () => {
    const c = content('<p>out</p><div data-layout="row"><div data-layout="col"><p>in</p></div><div data-layout="col"><p>other</p></div></div>');
    const cols = c.querySelectorAll<HTMLElement>('[data-layout="col"]');
    expect(moveBlock(c, kid(c, 0), { parent: cols[0], before: null })).toBe(true);
    expect(c.querySelector('[data-layout="col"]')!.innerHTML).toBe('<p>in</p><p>out</p>');
    const moved = c.querySelector('[data-layout="col"]')!.lastElementChild as HTMLElement;
    expect(moveBlock(c, moved, { parent: c, before: null })).toBe(true);
    expect(c.lastElementChild!.textContent).toBe('out');
    expect(c.querySelectorAll('[data-layout="col"]')[0].innerHTML).toBe('<p>in</p>');
    const only = c.querySelectorAll<HTMLElement>('[data-layout="col"]')[1].firstElementChild as HTMLElement;
    moveBlock(c, only, { parent: c, before: null });
    expect(c.querySelectorAll('[data-layout="col"]')[1].innerHTML).toBe('<p><br></p>');
  });
});

describe('copying and deleting a block', () => {
  it('puts a copy after it', () => {
    const c = content('<h2>head</h2>');
    expect(duplicateBlock(c, kid(c, 0))).not.toBeNull();
    expect(c.innerHTML).toBe('<h2>head</h2><h2>head</h2>');
  });

  it('takes a block away, and leaves an empty paragraph where it was the only one', () => {
    const c = content('<p>a</p><p>b</p>');
    deleteBlock(c, kid(c, 0));
    expect(c.innerHTML).toBe('<p>b</p>');
    deleteBlock(c, kid(c, 0));
    expect(c.innerHTML).toBe('<p><br></p>');
  });
});

describe('turning a block into another kind', () => {
  it('knows the kind of a block, and which can be turned', () => {
    const c = content('<p>a</p><h2>b</h2><ul data-task=""><li>c</li></ul><table><tbody><tr><td>x</td></tr></tbody></table><div data-callout="tip"><p>d</p></div><pre>e</pre>');
    expect(Array.from(c.children).map(kindOf)).toEqual(['p', 'h2', 'task', null, 'callout', 'code']);
    expect(Array.from(c.children).map(canTurn)).toEqual([true, true, true, false, true, true]);
  });

  it('keeps the text and the formatting in it', () => {
    for (const [kind, expected] of [
      ['h1', '<h1>one <strong>two</strong></h1>'],
      ['quote', '<blockquote>one <strong>two</strong></blockquote>'],
      ['ul', '<ul><li>one <strong>two</strong></li></ul>'],
      ['ol', '<ol><li>one <strong>two</strong></li></ol>'],
      ['task', '<ul data-task=""><li>one <strong>two</strong></li></ul>'],
      ['callout', '<div data-callout="note"><p>one <strong>two</strong></p></div>'],
    ] as const) {
      const c = content('<p>one <strong>two</strong></p>');
      expect(turnInto(c, kid(c, 0), kind), kind).not.toBeNull();
      expect(c.innerHTML, kind).toBe(expected);
    }
  });

  it('turns a list into paragraphs, one for each item, and a list into another kind of list with its nesting', () => {
    const c = content('<ul><li>a<ul><li>nested</li></ul></li><li>b</li></ul>');
    turnInto(c, kid(c, 0), 'task');
    expect(c.innerHTML).toBe('<ul data-task=""><li>a<ul data-task=""><li>nested</li></ul></li><li>b</li></ul>');
    turnInto(c, kid(c, 0), 'ol');
    expect(c.innerHTML).toBe('<ol><li>a<ol><li>nested</li></ol></li><li>b</li></ol>');
    turnInto(c, kid(c, 0), 'p');
    expect(c.innerHTML).toBe('<p>a</p><p>nested</p><p>b</p>');
  });

  it('turns code into text with its lines, and text into code without its formatting', () => {
    const c = content('<pre>one\ntwo &lt;b&gt;</pre>');
    turnInto(c, kid(c, 0), 'p');
    expect(c.innerHTML).toBe('<p>one</p><p>two &lt;b&gt;</p>');
    const d = content('<p>a <em>b</em></p>');
    turnInto(d, kid(d, 0), 'code');
    expect(d.innerHTML).toBe('<pre>a b</pre>');
  });

  it('does not turn a table, and an empty block stays empty', () => {
    const c = content('<table><tbody><tr><td>x</td></tr></tbody></table>');
    expect(turnInto(c, kid(c, 0), 'p')).toBeNull();
    const d = content('<p><br></p>');
    turnInto(d, kid(d, 0), 'h2');
    expect(d.innerHTML).toBe('<h2><br></h2>');
  });
});
