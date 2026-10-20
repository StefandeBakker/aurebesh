import { describe, expect, it } from 'vitest';
import { findRanges, replaceRanges } from '../src/find';

const dom = (html: string): HTMLElement => {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
};
const texts = (root: Element, query: string, options = {}) => findRanges(root, query, options).map((r) => r.toString());

describe('finding text', () => {
  it('finds every match, in any case unless asked not to', () => {
    const root = dom('<p>Cat cat CAT category</p>');
    expect(texts(root, 'cat')).toEqual(['Cat', 'cat', 'CAT', 'cat']);
    expect(texts(root, 'cat', { matchCase: true })).toEqual(['cat', 'cat']);
  });

  it('can find whole words only, with letters, digits and underscores as word characters', () => {
    const root = dom('<p>cat cats concat cat_x cat1 (cat) cat.</p>');
    expect(texts(root, 'cat', { wholeWord: true })).toEqual(['cat', 'cat', 'cat']);
    expect(texts(dom('<p>été et été</p>'), 'et', { wholeWord: true })).toEqual(['et']);
  });

  it('reads what is typed as text, not as a pattern', () => {
    const root = dom('<p>a.b a*b (a) [x] $1 a\\b</p>');
    expect(texts(root, 'a.b')).toEqual(['a.b']);
    expect(texts(root, 'a*b')).toEqual(['a*b']);
    expect(texts(root, '(a)')).toEqual(['(a)']);
    expect(texts(root, '[x]')).toEqual(['[x]']);
    expect(texts(root, '$1')).toEqual(['$1']);
    expect(texts(root, 'a\\b')).toEqual(['a\\b']);
  });

  it('finds a match over formatting, but not over blocks or line breaks', () => {
    const root = dom('<p>hello <strong>wor</strong>ld and <em>hel</em><em>lo</em></p><p>hel</p><p>lo</p><p>one<br>two</p>');
    expect(texts(root, 'hello world')).toEqual(['hello world']);
    expect(texts(root, 'hello')).toEqual(['hello', 'hello']);
    expect(texts(root, 'hello', { matchCase: true }).length).toBe(2); // not "hel" + "lo" in two paragraphs
    expect(texts(root, 'onetwo')).toEqual([]);
  });

  it('finds in lists, table cells, headings and code, and has no match for nothing', () => {
    const root = dom('<ul><li>x item</li></ul><table><tbody><tr><td>x cell</td></tr></tbody></table><h2>x head</h2><pre>x code</pre>');
    expect(texts(root, 'x')).toEqual(['x', 'x', 'x', 'x']);
    expect(findRanges(root, '')).toEqual([]);
    expect(findRanges(root, 'zzz')).toEqual([]);
  });

  it('gives the matches in the order of the text', () => {
    const root = dom('<p>a1 a2</p><p>a3</p>');
    expect(findRanges(root, 'a').length).toBe(3);
    const [one, two, three] = findRanges(root, 'a\\d'.replace('\\d', '')).map((r) => r.startContainer.textContent);
    expect([one, two, three]).toEqual(['a1 a2', 'a1 a2', 'a3']);
  });
});

describe('replacing text', () => {
  it('replaces every match, also with nothing, and keeps the formatting around', () => {
    const root = dom('<p>one <strong>two</strong> one</p><p>one</p>');
    expect(replaceRanges(root, findRanges(root, 'one'), 'ONE')).toBe(3);
    expect(root.innerHTML).toBe('<p>ONE <strong>two</strong> ONE</p><p>ONE</p>');
    const gone = dom('<p>a x b x c</p>');
    replaceRanges(gone, findRanges(gone, ' x'), '');
    expect(gone.innerHTML).toBe('<p>a b c</p>');
  });

  it('replaces a match over formatting: the replacement has the formatting where the match started', () => {
    const root = dom('<p>say <strong>hel</strong>lo <em>wor</em>ld</p>');
    replaceRanges(root, findRanges(root, 'hello world'), 'hi');
    expect(root.innerHTML).toBe('<p>say <strong>hi</strong></p>');
  });

  it('removes the formatting that has nothing left, and does not treat the replacement as markup', () => {
    const root = dom('<p>a <b>x</b> b</p>');
    replaceRanges(root, findRanges(root, 'x'), '');
    expect(root.innerHTML).toBe('<p>a  b</p>');
    const markup = dom('<p>a</p>');
    replaceRanges(markup, findRanges(markup, 'a'), '<b>$&</b>');
    expect(markup.innerHTML).toBe('<p>&lt;b&gt;$&amp;&lt;/b&gt;</p>');
  });

  it('does not find the replacement again when it has the text in it', () => {
    const root = dom('<p>aa</p>');
    expect(replaceRanges(root, findRanges(root, 'a'), 'aa')).toBe(2);
    expect(root.textContent).toBe('aaaa');
  });
});
