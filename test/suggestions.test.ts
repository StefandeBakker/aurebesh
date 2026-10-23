import { describe, expect, it } from 'vitest';
import { sanitize, suggestionCss, suggestionsIn, toMarkdown } from '../src';
import { acceptIn, diffText, finalHtml, rejectIn } from '../src/suggestions';

const ins = (text: string, id = 's1', extra = '') => `<span data-suggestion="${id}" data-kind="insert" data-author="ann" data-name="Ann" data-date="2026-10-22T09:00:00.000Z"${extra}>${text}</span>`;
const del = (text: string, id = 's1') => `<span data-suggestion="${id}" data-kind="delete" data-author="ann" data-name="Ann" data-date="2026-10-22T09:00:00.000Z">${text}</span>`;

const dom = (html: string): HTMLElement => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
};

describe('suggestions in the HTML', () => {
  it('keeps a suggestion with its id, kind, author, name and date', () => {
    const html = `<p>a ${ins('b')} c ${del('d', 's2')}</p>`;
    expect(sanitize(html)).toBe(html);
  });

  it('drops the marks when the id or the kind is not valid, and the parts that are not', () => {
    expect(sanitize('<p><span data-suggestion="a b" data-kind="insert">x</span></p>')).toBe('<p>x</p>');
    expect(sanitize('<p><span data-suggestion="s1" data-kind="other">x</span></p>')).toBe('<p>x</p>');
    expect(sanitize('<p><span data-kind="insert" data-author="ann">x</span></p>')).toBe('<p>x</p>');
    const out = sanitize('<p><span data-suggestion="s1" data-kind="insert" data-author="" data-name="a\u0001b" data-date="yesterday">x</span></p>');
    expect(out).toBe('<p><span data-suggestion="s1" data-kind="insert">x</span></p>');
  });

  it('keeps nothing else on it: no look, no handler', () => {
    const out = sanitize(`<p>${ins('x', 's1', ' style="color:red" onclick="y()" class="z" contenteditable="false"')}</p>`);
    expect(out).toBe(`<p>${ins('x')}</p>`);
  });

  it('has CSS for the look, with variables for the colours', () => {
    expect(suggestionCss).toContain('data-kind="insert"');
    expect(suggestionCss).toContain('--aurebesh-insert');
    expect(suggestionCss).toContain('--aurebesh-delete');
  });
});

describe('the suggestions in the text', () => {
  it('lists them in the order of the text, a replacement as one, with the author and the text', () => {
    const root = dom(`<p>${ins('new', 's1')} and ${del('old', 's2')}${ins('fresh', 's2')}</p><p>${ins(' more', 's1')}</p>`);
    const list = suggestionsIn(root);
    expect(list.map((s) => [s.id, s.kind, s.inserted, s.deleted])).toEqual([
      ['s1', 'insert', 'new more', ''],
      ['s2', 'replace', 'fresh', 'old'],
    ]);
    expect(list[0].author).toEqual({ id: 'ann', name: 'Ann' });
    expect(list[0].date).toBe('2026-10-22T09:00:00.000Z');
  });

  it('accepts: the insertion stays, the deletion goes; rejects: the other way', () => {
    const html = `<p>a ${del('old')}${ins('new')} b</p>`;
    const accepted = dom(html);
    acceptIn(accepted, 's1');
    expect(accepted.innerHTML).toBe('<p>a new b</p>');
    const rejected = dom(html);
    rejectIn(rejected, 's1');
    expect(rejected.innerHTML).toBe('<p>a old b</p>');
  });

  it('accepts and rejects every piece of a suggestion that runs over blocks, and leaves the others', () => {
    const root = dom(`<p>${ins('one')}</p><p>${ins('two')} ${ins('keep', 's2')}</p>`);
    rejectIn(root, 's1');
    expect(root.innerHTML).toBe(`<p></p><p> ${ins('keep', 's2')}</p>`);
  });

  it('gives the text as it reads when everything is accepted', () => {
    expect(finalHtml(`<p>a ${del('old')}${ins('new')} b</p>`)).toBe('<p>a new b</p>');
    expect(finalHtml('<p>no marks</p>')).toBe('<p>no marks</p>');
    expect(toMarkdown(finalHtml(`<p>a ${del('old')}${ins('new')}</p>`))).toBe('a new');
  });
});

describe('finding what changed', () => {
  it('finds an insertion, a deletion and a replacement', () => {
    expect(diffText('one two', 'one new two', null)).toEqual({ at: 4, removed: 0, inserted: 'new ' });
    expect(diffText('one two three', 'one three', 4)).toEqual({ at: 4, removed: 4, inserted: '' });
    expect(diffText('one two three', 'one 2 three', 5)).toEqual({ at: 4, removed: 3, inserted: '2' });
    expect(diffText('same', 'same', 3)).toBeNull();
  });

  it('puts a change where the caret is when the same letters repeat', () => {
    // a letter typed in "aaa": it can be anywhere in it, it is where the caret ended up
    expect(diffText('aaa', 'aaaa', 2)).toEqual({ at: 1, removed: 0, inserted: 'a' });
    expect(diffText('aaa', 'aaaa', 4)).toEqual({ at: 3, removed: 0, inserted: 'a' });
    // a letter deleted from "aaa": the caret is where it was
    expect(diffText('aaa', 'aa', 1)).toEqual({ at: 1, removed: 1, inserted: '' });
  });

  it('does not count a space that a browser turns into a no-break space, and back', () => {
    expect(diffText('one two', 'one two', null)).toBeNull();
    expect(diffText('one two', 'one new two', null)).toEqual({ at: 4, removed: 0, inserted: 'new ' });
    expect(diffText('one  two', 'one two', null)?.removed).toBe(1);
  });
});
