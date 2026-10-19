import { describe, expect, it } from 'vitest';
import { Aurebesh, sanitize } from '../src';
import { shortcutLabel } from '../src/shortcuts';

const build = (o: object) => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  new Aurebesh(el, o);
  return el;
};

describe('named blocks in the toolbar', () => {
  it('shows the name of a block (#Name) above its buttons and gives the editor the larger ribbon look', () => {
    const el = build({ toolbar: ['#History', 'undo', 'redo', '|', '#Text', 'bold'] });
    expect(el.querySelector('.aurebesh')!.classList.contains('aurebesh-ribbon')).toBe(true);
    const groups = Array.from(el.querySelectorAll('.aurebesh-toolbar .aurebesh-group'));
    expect(groups.map((g) => g.querySelector('.aurebesh-group-label')!.textContent)).toEqual(['History', 'Text']);
    expect(groups[0].getAttribute('aria-label')).toBe('History'); // the visible name is hidden from screen readers: the group has it
    expect(groups[0].querySelector('.aurebesh-group-label')!.getAttribute('aria-hidden')).toBe('true');
    expect(groups[0].querySelectorAll('button')).toHaveLength(2);
    el.remove();
  });

  it('keeps the compact look when no block has a name', () => {
    const el = build({ toolbar: ['bold', '|', 'italic'] });
    expect(el.querySelector('.aurebesh')!.classList.contains('aurebesh-ribbon')).toBe(false);
    expect(el.querySelector('.aurebesh-group-label')).toBeNull();
    el.remove();
  });

  it('puts the blocks after > at the far end of the toolbar', () => {
    const el = build({ toolbar: ['#A', 'bold', '>', '#B', 'fullscreen'] });
    const groups = Array.from(el.querySelectorAll('.aurebesh-toolbar .aurebesh-group'));
    expect(groups.map((g) => g.classList.contains('aurebesh-group-end'))).toEqual([false, true]);
    el.remove();
  });
});

describe('full screen', () => {
  it('toggles with its button, shows the pressed state, and Escape leaves it', () => {
    const el = build({ toolbar: ['bold', 'fullscreen'] });
    const root = el.querySelector('.aurebesh')!;
    const btn = el.querySelector('button[title="Full screen"]') as HTMLButtonElement;
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    btn.click();
    expect(root.classList.contains('aurebesh-fullscreen')).toBe(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    el.querySelector('.aurebesh-content')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(root.classList.contains('aurebesh-fullscreen')).toBe(false);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    el.remove();
  });
});

describe('indent', () => {
  it('keeps the indent of a block (steps of 24px) and drops anything else', () => {
    expect(sanitize('<p style="margin-inline-start: 48px">a</p>')).toBe('<p style="margin-inline-start: 48px">a</p>');
    expect(sanitize('<p style="margin-inline-start: 50px">a</p>')).toBe('<p>a</p>');
    expect(sanitize('<p style="margin-inline-start: 24px; position: fixed">a</p>')).toBe('<p style="margin-inline-start: 24px">a</p>');
    expect(sanitize('<p style="margin-inline-start: 240px">a</p>')).toBe('<p>a</p>'); // at most eight steps
  });
});

describe('shortcuts in the tooltips', () => {
  it('names the shortcut of a command, and none for a command without one', () => {
    expect(shortcutLabel('link')).toMatch(/^(?:Ctrl\+K|⌘K)$/);
    expect(shortcutLabel('strike')).toMatch(/^(?:Ctrl\+Shift\+X|⇧⌘X)$/);
    expect(shortcutLabel('fullscreen')).toBeNull();
  });
});

describe('the layout panel', () => {
  it('initializes contextual controls and the layout panel for quickbar-only items', () => {
    const el = build({ toolbar: [], quickbar: ['table', 'image', 'link', 'layout'] });
    expect(el.querySelector('.aurebesh-table-tools')).not.toBeNull();
    expect(el.querySelector('.aurebesh-image-tools')).not.toBeNull();
    expect(el.querySelector('.aurebesh-link-tools')).not.toBeNull();
    expect(el.querySelector('.aurebesh-panel')).not.toBeNull();
    el.remove();
  });

  it('is only there with the layout item, closed, and its button opens and closes it', () => {
    const none = build({ toolbar: ['bold'] });
    expect(none.querySelector('.aurebesh-panel')).toBeNull();
    none.remove();

    const el = build({ toolbar: ['bold', 'layout'] });
    const panel = el.querySelector('.aurebesh-panel') as HTMLElement;
    const btn = el.querySelector('button[title="Layout"]') as HTMLButtonElement;
    expect(panel.hidden).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    btn.click();
    expect(panel.hidden).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    (panel.querySelector('.aurebesh-panel-close') as HTMLButtonElement).click();
    expect(panel.hidden).toBe(true);
    expect(el.querySelector('.aurebesh-body')!.contains(panel)).toBe(true);
    el.remove();
  });

  it('sets how the text is shown through variables and reports it, without touching the HTML', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const ed = new Aurebesh(el, { toolbar: ['layout'], value: '<p>hi</p>' });
    const seen: unknown[] = [];
    ed.on('layout', (l) => seen.push(l));
    ed.setLayout({ textWidth: 800, padding: 48, lineHeight: 1.7 });
    const root = el.querySelector('.aurebesh') as HTMLElement;
    expect(root.style.getPropertyValue('--aurebesh-text-width')).toBe('800px');
    expect(root.style.getPropertyValue('--aurebesh-pad-x')).toBe('48px');
    expect(root.style.getPropertyValue('--aurebesh-line')).toBe('1.7');
    expect((el.querySelector('.aurebesh-panel input[type="number"]') as HTMLInputElement).value).toBe('800');
    expect(ed.getLayout()).toEqual({ textWidth: 800, padding: 48, lineHeight: 1.7 });
    expect(seen).toHaveLength(1);
    ed.setLayout({ textWidth: null });
    expect(root.style.getPropertyValue('--aurebesh-text-width')).toBe('');
    expect(ed.getLayout().padding).toBe(48); // what is left out stays
    expect(ed.getHTML()).toBe('<p>hi</p>');
    el.remove();
  });

  it('starts from the layout option, and has no columns: the building blocks do that', () => {
    const el = build({ toolbar: ['layout'], layout: { lineHeight: 1.5 } });
    expect((el.querySelector('.aurebesh') as HTMLElement).style.getPropertyValue('--aurebesh-line')).toBe('1.5');
    expect(el.querySelector('.aurebesh-tile')).toBeNull();
    expect(Array.from(el.querySelectorAll('.aurebesh-panel .aurebesh-field-label')).map((l) => l.textContent)).toEqual(['Width', 'Maximum text width', 'Padding', 'Line spacing']);
    el.remove();
  });
});
