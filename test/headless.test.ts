import { beforeEach, describe, expect, it } from 'vitest';
import { Aurebesh, DEFAULT_CSS, HEADLESS_CSS } from '../src';

const build = (options: object = {}) => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return { el, editor: new Aurebesh(el, options) };
};

describe('the headless option', () => {
  beforeEach(() => {
    document.head.querySelectorAll('style[data-aurebesh], style[data-aurebesh-headless]').forEach((s) => s.remove());
    document.body.innerHTML = '';
  });

  it('brings the few rules it needs and not the look, and says so on the root', () => {
    const { el } = build({ headless: true });
    expect(document.head.querySelector('style[data-aurebesh-headless]')).not.toBeNull();
    expect(document.head.querySelector('style[data-aurebesh]')).toBeNull();
    expect(el.querySelector('.aurebesh')!.classList.contains('aurebesh-headless')).toBe(true);
  });

  it('has the built-in look without it', () => {
    const { el } = build();
    expect(document.head.querySelector('style[data-aurebesh]')).not.toBeNull();
    expect(document.head.querySelector('style[data-aurebesh-headless]')).toBeNull();
    expect(el.querySelector('.aurebesh')!.classList.contains('aurebesh-headless')).toBe(false);
  });

  it('has the same markup, classes and toolbar, so that the page can style them', () => {
    const plain = build();
    const headless = build({ headless: true });
    const shape = (root: HTMLElement) => Array.from(root.querySelectorAll('*')).map((e) => `${e.tagName}.${Array.from(e.classList).filter((c) => c !== 'aurebesh-headless').join('.')}`);
    expect(shape(headless.el)).toEqual(shape(plain.el));
  });

  it('has no colours, borders, fonts or shadows in its CSS, and keeps what makes it work', () => {
    expect(HEADLESS_CSS).not.toMatch(/box-shadow|border-radius|font-family|font-size|--aurebesh-(?:accent|bg|border|toolbar-bg)|#[0-9a-f]{3,6}\b/i);
    for (const rule of ['.aurebesh-table-pop{position:absolute', '.aurebesh-slash{position:fixed', '.aurebesh-icon{', '[hidden]{display:none}', '.aurebesh-handles{position:absolute']) {
      expect(HEADLESS_CSS).toContain(rule);
    }
    expect(HEADLESS_CSS.length).toBeLessThan(DEFAULT_CSS.length / 2);
  });

  it('does not add the styles of its callouts', () => {
    build({ headless: true, callouts: [{ id: 'deal', color: '#ff0066' }] });
    expect(document.head.querySelector('style[data-aurebesh-callouts]')).toBeNull();
  });
});

describe('the API for your own buttons', () => {
  it('lists the commands, including those that have no button', () => {
    const { editor } = build({ headless: true, toolbar: [] });
    const names = editor.listCommands();
    for (const name of ['bold', 'italic', 'link', 'table', 'color', 'size', 'weight', 'callout', 'task', 'codeLanguage']) expect(names, name).toContain(name);
  });

  it('says that a command is not active or enabled for a name that does not exist, or without a selection', () => {
    const { editor } = build({ headless: true, toolbar: [] });
    expect(editor.isActive('nothing')).toBe(false);
    expect(editor.isEnabled('nothing')).toBe(false);
    expect(editor.isActive('bold')).toBe(false);
  });

  it('can be read-only: nothing is enabled', () => {
    const { editor } = build({ headless: true, toolbar: [], readOnly: true });
    expect(editor.isEnabled('bold')).toBe(false);
  });
});
