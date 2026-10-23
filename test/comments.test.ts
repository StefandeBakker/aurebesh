import { describe, expect, it } from 'vitest';
import { commentCss, sanitize, toMarkdown } from '../src';
import { COMMENT_ID, cleanThreads, commentIdsIn } from '../src/comments';

const dom = (html: string): HTMLElement => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
};

const message = (over: Record<string, unknown> = {}) => ({ id: 'm1', author: { id: 'ann', name: 'Ann' }, text: 'Hello', created: '2026-10-22T09:30:00.000Z', ...over });

describe('comments in the HTML', () => {
  it('keeps the id of a comment on a span, and drops one that is not a plain name', () => {
    expect(sanitize('<p>a <span data-comment="c1">b</span> c</p>')).toBe('<p>a <span data-comment="c1">b</span> c</p>');
    for (const bad of ['a b', 'x"onclick="y', '<b>', '', '-c', 'c'.repeat(65)]) {
      expect(sanitize(`<p><span data-comment="${bad.replace(/"/g, '&quot;')}">b</span></p>`)).not.toContain('data-comment');
    }
  });

  it('keeps nothing else on it, and a span can be a comment and be bold inside', () => {
    expect(sanitize('<p><span data-comment="c1" style="color: red" onclick="x()" class="y">b</span></p>')).toBe('<p><span data-comment="c1">b</span></p>');
    expect(sanitize('<p><span data-comment="c1"><strong>b</strong> c</span></p>')).toBe('<p><span data-comment="c1"><strong>b</strong> c</span></p>');
  });

  it('is only the text in Markdown', () => {
    const md = toMarkdown('<p>a <span data-comment="c1">b</span> c</p>');
    expect(md).toBe('a b c');
  });

  it('has CSS for the look, with a variable for the colour', () => {
    expect(commentCss).toContain('[data-comment]');
    expect(commentCss).toContain('--aurebesh-comment');
  });
});

describe('the ids that are in the text', () => {
  it('lists each once, in the order of the text', () => {
    const root = dom('<p><span data-comment="b">x</span> <span data-comment="a">y</span></p><p><span data-comment="b">z</span></p>');
    expect(commentIdsIn(root)).toEqual(['b', 'a']);
  });

  it('accepts the ids that the rule says', () => {
    for (const ok of ['c1', 'ann_1', 'a:b', 'a.b', 'A'.repeat(64)]) expect(COMMENT_ID.test(ok), ok).toBe(true);
    for (const no of ['', ' c', 'a b', 'a/b', '-a', '.a']) expect(COMMENT_ID.test(no), no).toBe(false);
  });
});

describe('the threads that the application gives', () => {
  it('keeps a valid thread as it is, with its state', () => {
    const t = { id: 't1', resolved: true, messages: [message(), message({ id: 'm2', text: 'Reply' })] };
    expect(cleanThreads([t])).toEqual([t]);
    expect(cleanThreads([{ id: 't1', resolved: false, messages: [message()] }])[0].resolved).toBeUndefined();
  });

  it('leaves out what is not valid: ids, empty threads, doubles, messages without text or author', () => {
    expect(cleanThreads('nope')).toEqual([]);
    expect(cleanThreads([null, 1, {}])).toEqual([]);
    expect(cleanThreads([{ id: 'bad id', messages: [message()] }])).toEqual([]);
    expect(cleanThreads([{ id: 't1', messages: [] }])).toEqual([]);
    expect(cleanThreads([{ id: 't1', messages: [message({ text: '   ' })] }])).toEqual([]);
    expect(cleanThreads([{ id: 't1', messages: [message({ author: { id: '', name: 'x' } })] }])).toEqual([]);
    expect(cleanThreads([{ id: 't1', messages: [message({ created: 'yesterday' })] }])).toEqual([]);
    expect(cleanThreads([{ id: 't1', messages: [message({ text: 'x'.repeat(5001) })] }])).toEqual([]);
    const twice = cleanThreads([
      { id: 't1', messages: [message()] },
      { id: 't1', messages: [message({ text: 'second' })] },
    ]);
    expect(twice).toHaveLength(1);
    expect(twice[0].messages[0].text).toBe('Hello');
  });

  it('drops the messages that are not valid and keeps the thread with the ones that are', () => {
    const out = cleanThreads([{ id: 't1', messages: [message({ text: '' }), message({ id: 'm2', text: 'ok' })] }]);
    expect(out[0].messages.map((m) => m.id)).toEqual(['m2']);
  });
});
