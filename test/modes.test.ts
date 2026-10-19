import { describe, expect, it, vi } from 'vitest';
import { Aurebesh } from '../src';
import { parseModes } from '../src/modes';

const make = (o: object = {}) => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const ed = new Aurebesh(el, { value: '<p>Hello <strong>world</strong></p>', ...o });
  return { el, ed };
};
const radio = (el: HTMLElement, mode: string) => el.querySelector(`.aurebesh-mode[data-mode="${mode}"]`) as HTMLButtonElement;
const field = (el: HTMLElement) => el.querySelector('.aurebesh-source') as HTMLTextAreaElement;
const type = (el: HTMLElement, text: string) => {
  const f = field(el);
  f.value = text;
  f.dispatchEvent(new Event('input', { bubbles: true }));
  f.dispatchEvent(new Event('blur'));
};

describe('parseModes', () => {
  it('reads the option and the attribute, always with the editor first', () => {
    expect(parseModes(true)).toEqual(['editor', 'html', 'markdown']);
    expect(parseModes('')).toEqual(['editor', 'html', 'markdown']);
    expect(parseModes('markdown')).toEqual(['editor', 'markdown']);
    expect(parseModes(['markdown', 'html'])).toEqual(['editor', 'html', 'markdown']);
    expect(parseModes('nonsense')).toEqual([]); // one view is no choice
    expect(parseModes(false)).toEqual([]);
    expect(parseModes(undefined)).toEqual([]);
    expect(parseModes(null)).toEqual([]);
  });
});

describe('the footer', () => {
  it('has no switch without the modes option, and shows the counter on its own', () => {
    const { el } = make({ counter: true });
    expect(el.querySelector('.aurebesh-modes')).toBeNull();
    expect(el.querySelector('.aurebesh-footer .aurebesh-count')).not.toBeNull();
    el.remove();
  });

  it('has the numbers first and the switch last, as a group of radio buttons with the editor selected', () => {
    const { el } = make({ counter: true, modes: true });
    const footer = el.querySelector('.aurebesh-footer')!;
    expect(Array.from(footer.children).map((c) => c.className)).toEqual(['aurebesh-count', 'aurebesh-modes']);
    const group = footer.querySelector('[role="radiogroup"]')!;
    expect(group.getAttribute('aria-label')).toBe('View');
    const radios = Array.from(group.querySelectorAll('[role="radio"]'));
    expect(radios.map((r) => r.textContent)).toEqual(['Editor', 'HTML', 'Markdown']);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    expect(radios.map((r) => (r as HTMLElement).tabIndex)).toEqual([0, -1, -1]);
    el.remove();
  });

  it('can offer only some of the views, and has translated texts', () => {
    const { el } = make({ modes: ['markdown'], labels: { 'ui.mode.label': 'Weergave' } });
    expect(Array.from(el.querySelectorAll('.aurebesh-mode')).map((r) => (r as HTMLElement).dataset.mode)).toEqual(['editor', 'markdown']);
    expect(el.querySelector('.aurebesh-modes')!.getAttribute('aria-label')).toBe('Weergave');
    el.remove();
  });
});

describe('the views', () => {
  it('shows the HTML as text, in a field that is named, and hides the text and the tools', () => {
    const { el, ed } = make({ modes: true });
    radio(el, 'html').click();
    expect(ed.getMode()).toBe('html');
    expect(field(el).hidden).toBe(false);
    expect(field(el).value).toBe('<p>Hello <strong>world</strong></p>');
    expect(field(el).getAttribute('aria-label')).toBe('HTML of the text');
    expect((el.querySelector('.aurebesh-content') as HTMLElement).hidden).toBe(true);
    expect(el.querySelector('.aurebesh')!.classList.contains('aurebesh-source-mode')).toBe(true);
    for (const bar of Array.from(el.querySelectorAll('.aurebesh-toolbar'))) expect((bar as HTMLElement).inert).toBe(true);
    expect(radio(el, 'html').getAttribute('aria-checked')).toBe('true');
    expect(radio(el, 'editor').getAttribute('aria-checked')).toBe('false');
    el.remove();
  });

  it('shows the Markdown, and what is typed there becomes the content, with a change event in the value format', () => {
    const { el, ed } = make({ modes: true });
    const seen: string[] = [];
    ed.on('change', (v) => seen.push(v));
    radio(el, 'markdown').click();
    expect(field(el).value).toBe('Hello **world**');
    type(el, '# New\n\n- a\n- b');
    expect(ed.getHTML()).toBe('<h1>New</h1><ul><li>a</li><li>b</li></ul>');
    expect(seen[seen.length - 1]).toBe('<h1>New</h1><ul><li>a</li><li>b</li></ul>');
    expect(field(el).value).toBe('# New\n\n- a\n- b'); // what was typed is left as it is
    el.remove();
  });

  it('edits the HTML and sanitizes it', () => {
    const { el, ed } = make({ modes: true });
    radio(el, 'html').click();
    type(el, '<p onclick="x()">safe</p><script>alert(1)</script>');
    expect(ed.getHTML()).toBe('<p>safe</p>');
    el.remove();
  });

  it('goes back to the editor with the text, the tools and the focus where they belong', () => {
    const { el, ed } = make({ modes: true });
    radio(el, 'markdown').click();
    type(el, 'changed **text**');
    radio(el, 'editor').click();
    expect(ed.getMode()).toBe('editor');
    expect(field(el).hidden).toBe(true);
    expect((el.querySelector('.aurebesh-content') as HTMLElement).hidden).toBe(false);
    expect(el.querySelector('.aurebesh-content')!.innerHTML).toBe('<p>changed <strong>text</strong></p>');
    for (const bar of Array.from(el.querySelectorAll('.aurebesh-toolbar'))) expect((bar as HTMLElement).inert).toBe(false);
    expect(el.querySelector('.aurebesh')!.classList.contains('aurebesh-source-mode')).toBe(false);
    el.remove();
  });

  it('applies what was typed when the view is left or the content is read, also without a blur', () => {
    const { el, ed } = make({ modes: true });
    radio(el, 'markdown').click();
    const f = field(el);
    f.value = 'direct';
    f.dispatchEvent(new Event('input', { bubbles: true })); // no blur, no pause
    expect(ed.getHTML()).toBe('<p>direct</p>'); // reading it is enough
    f.value = 'second';
    f.dispatchEvent(new Event('input', { bubbles: true }));
    radio(el, 'html').click(); // leaving the view
    expect(field(el).value).toBe('<p>second</p>');
    el.remove();
  });

  it('switches from the HTML view to the Markdown view with the typed text carried over', () => {
    const { el } = make({ modes: true });
    radio(el, 'html').click();
    type(el, '<h2>Title</h2>');
    radio(el, 'markdown').click();
    expect(field(el).value).toBe('## Title');
    el.remove();
  });

  it('warns once when Markdown cannot hold what is in the text', () => {
    const { el } = make({ modes: true, value: '<p><span style="color: red">red</span></p><div style="column-count: 2"><p>a</p><p>b</p></div>' });
    radio(el, 'markdown').click();
    expect(el.querySelector('.aurebesh-status')!.textContent).toMatch(/Markdown cannot hold/);
    el.remove();
    const plain = make({ modes: true });
    radio(plain.el, 'markdown').click();
    expect((plain.el.querySelector('.aurebesh-status') as HTMLElement).hidden).toBe(true);
    plain.el.remove();
  });

  it('keeps the field read-only when the editor is, and still lets the views be switched', () => {
    const { el, ed } = make({ modes: true, readOnly: true });
    radio(el, 'html').click();
    expect(field(el).readOnly).toBe(true);
    ed.setReadOnly(false);
    expect(field(el).readOnly).toBe(false);
    el.remove();
  });

  it('is controlled from code too: setMode, getMode and the mode event; a mode that is not offered does nothing', () => {
    const { el, ed } = make({ modes: ['markdown'] });
    const seen = vi.fn();
    ed.on('mode', seen);
    ed.setMode('html');
    expect(ed.getMode()).toBe('editor');
    ed.setMode('markdown');
    expect(ed.getMode()).toBe('markdown');
    ed.setMode('editor');
    expect(seen.mock.calls.map((c) => c[0])).toEqual(['markdown', 'editor']);
    el.remove();
  });

  it('starts in the view of the mode option, and moves with the arrow keys', () => {
    const { el, ed } = make({ modes: true, mode: 'markdown' });
    expect(ed.getMode()).toBe('markdown');
    expect(field(el).value).toBe('Hello **world**');
    radio(el, 'markdown').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(ed.getMode()).toBe('editor'); // round: the Markdown is the last one
    radio(el, 'editor').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(ed.getMode()).toBe('markdown');
    el.remove();
  });

  it('counts the words and characters of what was typed in a view, in the footer', () => {
    const { el } = make({ modes: true, counter: true });
    radio(el, 'markdown').click();
    type(el, 'one two three');
    expect(el.querySelector('.aurebesh-count')!.textContent).toBe('3 words · 13 characters');
    el.remove();
  });
});
