import { describe, expect, it } from 'vitest';
import { fromMarkdown, sanitize, taskListCss, toMarkdown } from '../src';

const list = '<ul data-task=""><li data-checked="true">done</li><li>todo</li></ul>';

describe('task lists in the HTML', () => {
  it('keeps the list and the checked items, and nothing else of them', () => {
    expect(sanitize(list)).toBe(list);
    expect(sanitize('<ul data-task="x" class="c"><li data-checked="yes" onclick="x()">a</li></ul>')).toBe('<ul data-task=""><li>a</li></ul>');
  });

  it('only lets an item of a task list be checked', () => {
    expect(sanitize('<ul><li data-checked="true">a</li></ul>')).toBe('<ul><li>a</li></ul>');
    expect(sanitize('<ol><li data-checked="true">a</li></ol>')).toBe('<ol><li>a</li></ol>');
  });

  it('turns the checkboxes of a pasted task list (GitHub) into the same', () => {
    const pasted = '<ul class="contains-task-list"><li class="task-list-item"><input type="checkbox" disabled checked> done</li><li class="task-list-item"><input type="checkbox" disabled> todo</li></ul>';
    expect(sanitize(pasted)).toBe('<ul data-task=""><li data-checked="true"> done</li><li> todo</li></ul>');
  });

  it('has CSS for the box, with variables for the colours', () => {
    const css = taskListCss();
    expect(css).toContain('ul[data-task]');
    expect(css).toContain('--aurebesh-task-color');
  });
});

describe('task lists in Markdown', () => {
  it('writes the boxes, also in a list inside a list', () => {
    expect(toMarkdown(list)).toBe('- [x] done\n- [ ] todo');
    const nested = '<ul data-task=""><li data-checked="true">a<ul data-task=""><li>b</li></ul></li></ul>';
    expect(toMarkdown(nested)).toBe('- [x] a\n  - [ ] b');
  });

  it('reads them back, with nesting', () => {
    expect(fromMarkdown('- [x] done\n- [ ] todo')).toBe(list);
    const md = '- [x] a\n  - [ ] b\n  - [X] c\n- [ ] d';
    expect(fromMarkdown(md)).toBe('<ul data-task=""><li data-checked="true">a<ul data-task=""><li>b</li><li data-checked="true">c</li></ul></li><li>d</li></ul>');
    expect(toMarkdown(fromMarkdown(md))).toBe('- [x] a\n  - [ ] b\n  - [x] c\n- [ ] d');
  });

  it('leaves links and numbered lists alone', () => {
    expect(fromMarkdown('- [x](https://example.com)')).not.toContain('data-task');
    expect(fromMarkdown('1. [ ] one')).not.toContain('data-task');
    expect(toMarkdown('<ul><li>[ ] not a task</li></ul>')).toBe('- \\[ \\] not a task');
  });
});
