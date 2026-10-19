import { describe, expect, it } from 'vitest';
import { Aurebesh, definePlugin } from '../src';

const make = (o: object = {}) => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const ed = new Aurebesh(el, o);
  return { el, ed };
};
const toggle = (el: HTMLElement) => el.querySelector('button.aurebesh-cmd-sidebar') as HTMLButtonElement;
const tabs = (el: HTMLElement) => Array.from(el.querySelectorAll('[role="tab"]')).map((t) => t.textContent);

const info = definePlugin({
  name: 'info',
  panels: [{ id: 'info', title: 'Info', label: 'i', build: () => Object.assign(document.createElement('p'), { textContent: 'numbers' }) }],
  setup: () => ({}),
});

describe('the sidebar toggle', () => {
  it('is one button that opens and closes the sidebar, with all the panels as its tabs', () => {
    const { el, ed } = make({ toolbar: ['bold', 'sidebar'], plugins: [info] });
    const btn = toggle(el);
    expect(btn.title).toBe('Sidebar');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.hasAttribute('aria-pressed')).toBe(false); // a disclosure button: aria-expanded says it
    const side = el.querySelector('.aurebesh-panel') as HTMLElement;
    expect(btn.getAttribute('aria-controls')).toBe(side.id);
    expect(side.hidden).toBe(true);
    btn.click();
    expect(side.hidden).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(tabs(el)).toEqual(['Layout', 'Blocks', 'Info']);
    expect(ed.getOpenPanel()).toBe('layout'); // the first one the first time
    btn.click();
    expect(side.hidden).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    el.remove();
  });

  it('opens with the panel that was open last', () => {
    const { el, ed } = make({ toolbar: ['sidebar'] });
    ed.openPanel('blocks');
    toggle(el).click(); // closes
    expect(ed.getOpenPanel()).toBeNull();
    toggle(el).click();
    expect(ed.getOpenPanel()).toBe('blocks');
    el.remove();
  });

  it('gives the panels no buttons of their own, and the blocks do their work all the same', () => {
    const { el } = make({ toolbar: ['sidebar'] });
    expect(el.querySelector('button.aurebesh-cmd-layout')).toBeNull();
    expect(el.querySelector('button.aurebesh-cmd-blocks')).toBeNull();
    expect(el.querySelector('.aurebesh-row-tools')).not.toBeNull(); // the tools of a row are there
    expect(el.querySelectorAll('.aurebesh-block').length).toBeGreaterThan(8);
    el.remove();
  });

  it('can be mixed with panel buttons: the panels are the same, whichever opens them', () => {
    const { el, ed } = make({ toolbar: ['sidebar', 'layout'], plugins: [info] });
    el.querySelector<HTMLButtonElement>('button.aurebesh-cmd-layout')!.click();
    expect(ed.getOpenPanel()).toBe('layout');
    expect(toggle(el).getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('button.aurebesh-cmd-layout')!.getAttribute('aria-expanded')).toBe('true');
    toggle(el).click();
    expect(ed.getOpenPanel()).toBeNull();
    el.remove();
  });

  it('keeps working as before without the item: only the panels that have a button', () => {
    const { el } = make({ toolbar: ['bold', 'layout'] });
    expect(toggle(el)).toBeNull();
    expect(tabs(el)).toEqual([]); // one panel: a title, not tabs (when open)
    expect(el.querySelector('.aurebesh-block')).toBeNull(); // no blocks without their item
    el.remove();
  });

  it('sends the focus back to the toggle when the sidebar is closed with Escape', () => {
    const { el, ed } = make({ toolbar: ['sidebar'] });
    toggle(el).click();
    const side = el.querySelector('.aurebesh-panel')!;
    side.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(ed.getOpenPanel()).toBeNull();
    expect(document.activeElement).toBe(toggle(el));
    el.remove();
  });

  it('has its name in every language', () => {
    for (const [language, name] of [['nl', 'Zijbalk'], ['de', 'Seitenleiste'], ['fr', 'Barre latérale'], ['es', 'Barra lateral']]) {
      const { el } = make({ toolbar: ['sidebar'], language });
      expect(toggle(el).title).toBe(name);
      el.remove();
    }
  });
});
