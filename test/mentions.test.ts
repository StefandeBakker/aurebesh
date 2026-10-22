import { describe, expect, it } from 'vitest';
import { fromMarkdown, mentionCss, mentionsIn, sanitize, toMarkdown } from '../src';
import { MENTION_ID, markMentions } from '../src/mentions';

const dom = (html: string): HTMLElement => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
};

describe('mentions in the HTML', () => {
  it('keeps the id of a person, and drops one that is not a plain name', () => {
    expect(sanitize('<p>Hi <span data-mention="ann">@Ann</span></p>')).toBe('<p>Hi <span data-mention="ann">@Ann</span></p>');
    expect(sanitize('<p><span data-mention="ann.smith@example.com">@Ann</span></p>')).toContain('data-mention="ann.smith@example.com"');
    for (const bad of ['a b', 'x"onclick="y', '<b>', '', '-ann', 'a'.repeat(65)]) {
      expect(sanitize(`<p><span data-mention="${bad.replace(/"/g, '&quot;')}">@x</span></p>`)).not.toContain('data-mention');
    }
  });

  it('keeps nothing else on it: no look, no handler, no editability', () => {
    const out = sanitize('<p><span data-mention="ann" style="color: red; background: url(x)" onclick="x()" contenteditable="false" class="c">@Ann</span></p>');
    expect(out).toBe('<p><span data-mention="ann">@Ann</span></p>');
  });

  it('accepts the ids that the rule says', () => {
    for (const ok of ['ann', 'a1', 'ann-smith', 'ann_smith', 'u:42', 'a.b@c.d', 'A'.repeat(64)]) expect(MENTION_ID.test(ok), ok).toBe(true);
    for (const no of ['', ' ann', 'a b', 'a/b', 'a;b', 'é', '.a']) expect(MENTION_ID.test(no), no).toBe(false);
  });
});

describe('mentionsIn and markMentions', () => {
  it('lists each person once, in the order of the text, with the name without the @', () => {
    const root = dom('<p><span data-mention="bo">@Bo Li</span> and <span data-mention="ann">@Ann</span> and <span data-mention="bo">@Bo Li</span></p>');
    expect(mentionsIn(root)).toEqual([
      { id: 'bo', name: 'Bo Li' },
      { id: 'ann', name: 'Ann' },
    ]);
  });

  it('leaves out an id that is not valid, and works with another trigger', () => {
    expect(mentionsIn(dom('<span data-mention="a b">@x</span>'))).toEqual([]);
    expect(mentionsIn(dom('<span data-mention="ann">#Ann</span>'), '#')).toEqual([{ id: 'ann', name: 'Ann' }]);
  });

  it('makes the mentions pieces that cannot be typed in, once', () => {
    const root = dom('<p><span data-mention="ann">@Ann</span><span>plain</span></p>');
    markMentions(root);
    const spans = root.querySelectorAll('span');
    expect(spans[0].getAttribute('contenteditable')).toBe('false');
    expect(spans[1].hasAttribute('contenteditable')).toBe(false);
  });
});

describe('mentions in other formats', () => {
  it('is the text of the chip in Markdown, and text in a Markdown round trip', () => {
    const md = toMarkdown('<p>Hi <span data-mention="ann">@Ann Smith</span>!</p>');
    expect(md).toContain('@Ann Smith');
    expect(md).not.toContain('data-mention');
    expect(fromMarkdown(md)).toContain('@Ann Smith');
  });

  it('has CSS for the look, with a variable for the colour', () => {
    expect(mentionCss).toContain('[data-mention]');
    expect(mentionCss).toContain('--aurebesh-accent');
  });
});
