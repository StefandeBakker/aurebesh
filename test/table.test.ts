import { describe, expect, it } from 'vitest';
import { sanitize } from '../src';
import { locate, modelOf } from '../src/table';
import { toMarkdown } from '../src/export';

const table = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.querySelector('table') as HTMLTableElement;
};

describe('table grid', () => {
  it('lays merged cells out over every position they cover', () => {
    const t = table('<table><tr><td colspan="2" rowspan="2" id="m">m</td><td>c1</td></tr><tr><td>c2</td></tr><tr><td>a</td><td>b</td><td>c</td></tr></table>');
    const model = modelOf(t);
    expect(model.cols).toBe(3);
    const m = t.querySelector('#m') as HTMLTableCellElement;
    expect([model.m[0][0], model.m[0][1], model.m[1][0], model.m[1][1]]).toEqual([m, m, m, m]);
    expect(locate(model, m)).toEqual({ r: 0, c: 0, rs: 2, cs: 2 });
  });

  it('survives a hostile colspan / rowspan', () => {
    const t = table('<table><tr><td colspan="99999999" rowspan="99999999">x</td></tr></table>');
    const model = modelOf(t);
    expect(model.cols).toBeLessThanOrEqual(100);
    expect(model.m.length).toBe(1);
  });

  it('pads a ragged row', () => {
    const model = modelOf(table('<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>'));
    expect(model.cols).toBe(2);
    expect(model.m[1][1]).toBeNull();
  });
});

describe('sanitizer and column widths', () => {
  it('keeps percentage widths on <col>, and drops other widths, units and attributes', () => {
    const out = sanitize(
      '<table><colgroup><col style="width: 40%; color: red"><col style="width: 200px"><col width="50"><col style="width:60.5%" onclick="x()"></colgroup><tbody><tr><td>a</td></tr></tbody></table>',
    );
    expect(out).toContain('<colgroup><col style="width: 40%"><col style="width: 60.5%"></colgroup>');
    expect(out).not.toContain('200px');
    expect(out).not.toContain('onclick');
  });

  it('removes a <colgroup> that says nothing (what Word writes)', () => {
    expect(sanitize('<table><colgroup><col width="123"><col width="45"></colgroup><tbody><tr><td>a</td></tr></tbody></table>')).toBe(
      '<table><tbody><tr><td>a</td></tr></tbody></table>',
    );
  });

  it('keeps colspan and rowspan but only plain numbers', () => {
    const out = sanitize('<table><tbody><tr><td colspan="2" rowspan="x">a</td></tr></tbody></table>');
    expect(out).toContain('colspan="2"');
    expect(out).not.toContain('rowspan');
  });
});

describe('Markdown of merged cells', () => {
  it('puts the text in the first position a merged cell covers and leaves the rest empty', () => {
    expect(toMarkdown('<table><tr><td colspan="2">wide</td><td>c</td></tr><tr><td>a</td><td>b</td><td>c2</td></tr></table>')).toBe(
      '| wide |  | c |\n| --- | --- | --- |\n| a | b | c2 |',
    );
  });
});
