import { describe, expect, it } from 'vitest';
import { Aurebesh, COMMANDS } from '../src';
import { ICONS, iconElement } from '../src/icons';

describe('icons', () => {
  it('draws an icon as an SVG on a 24 grid, hidden from assistive technology', () => {
    const svg = iconElement(document, 'undo')!;
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('gives nothing for an unknown name or none', () => {
    expect(iconElement(document, 'nonsense')).toBeNull();
    expect(iconElement(document, undefined)).toBeNull();
  });

  it('has an icon for every command that names one, and uses the colour of the text', () => {
    for (const cmd of Object.values(COMMANDS)) if (cmd.icon) expect(ICONS[cmd.icon], `${cmd.name} -> ${cmd.icon}`).toBeDefined();
    for (const [name, shapes] of Object.entries(ICONS)) {
      const svg = iconElement(document, name)!;
      expect(svg.outerHTML, name).not.toMatch(/#[0-9a-f]{3,6}|rgb\(/i); // no colours of its own: it follows the theme
      expect(shapes.length, name).toBeGreaterThan(0);
    }
  });

  it('draws the right-to-left icon as the mirror of the left-to-right one', () => {
    expect(iconElement(document, 'ltr')!.querySelector('[transform]')).toBeNull();
    for (const el of Array.from(iconElement(document, 'rtl')!.children)) expect(el.getAttribute('transform')).toBe('matrix(-1 0 0 1 24 0)');
  });

  it('has nothing in an icon that could run: only shapes, and no text for a font to change', () => {
    for (const name of Object.keys(ICONS)) {
      const svg = iconElement(document, name)!;
      for (const el of Array.from(svg.querySelectorAll('*'))) expect(['path', 'rect', 'circle'], name).toContain(el.tagName.toLowerCase());
      expect(svg.textContent, name).toBe('');
      for (const el of [svg, ...Array.from(svg.querySelectorAll('*'))]) for (const a of Array.from(el.attributes)) expect(a.name, name).not.toMatch(/^on|href/i);
    }
  });
});

describe('the toolbar buttons', () => {
  const build = (o: object = {}) => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    new Aurebesh(el, o);
    return el;
  };
  const btn = (el: HTMLElement, title: string) => el.querySelector(`button[title="${title}"]`) as HTMLButtonElement;

  it('show an icon for what a symbol explains badly, and text where text is clear', () => {
    const el = build();
    for (const t of ['Undo', 'Redo', 'Clear formatting', 'Bullet list', 'Numbered list', 'Align left', 'Align center', 'Align right', 'Quote', 'Inline code', 'Code block', 'Link', 'Image', 'Video', 'Table', 'Horizontal line']) {
      const b = btn(el, t);
      expect(b, t).not.toBeNull();
      expect(b.querySelector('svg.aurebesh-icon'), t).not.toBeNull();
      expect(b.textContent, t).toBe(''); // the icon alone: the name is in the tooltip and the label
    }
    // the first block stays as it is: letters and swatches
    expect(btn(el, 'Bold').textContent).toBe('B');
    expect(btn(el, 'Italic').textContent).toBe('I');
    expect(btn(el, 'Underline').textContent).toBe('U');
    expect(btn(el, 'Strikethrough').textContent).toBe('S');
    expect(btn(el, 'Heading 1').textContent).toBe('H1');
    el.remove();
  });

  it('show the colour buttons as an icon with a bar for the colour chosen last, and a small arrow for the palette', () => {
    const el = build();
    for (const t of ['Text color', 'Highlight color']) {
      const b = btn(el, t);
      expect(b.querySelector('svg.aurebesh-icon'), t).not.toBeNull();
      expect(b.querySelector('.aurebesh-icon-swatch'), t).not.toBeNull(); // the bar
      expect(b.textContent, t).toBe('');
      expect(b.classList.contains('aurebesh-swatch-btn'), t).toBe(true); // the arrow comes from this class
      expect(b.getAttribute('aria-label'), t).toBe(t);
    }
    el.remove();
  });

  it('keep their name for assistive technology and the tooltip, also without text', () => {
    const el = build();
    for (const b of Array.from(el.querySelectorAll('.aurebesh-toolbar button'))) {
      if (b.closest('.aurebesh-table-pop')) continue;
      expect(b.getAttribute('aria-label') || b.textContent?.trim(), b.outerHTML.slice(0, 80)).toBeTruthy();
    }
    expect(btn(el, 'Undo').getAttribute('aria-label')).toBe('Undo');
    el.remove();
  });

  it('use the translated label as their name, with the icon', () => {
    const el = build({ labels: { undo: 'Ongedaan maken', clear: 'Opmaak wissen' } });
    expect(btn(el, 'Ongedaan maken').getAttribute('aria-label')).toBe('Ongedaan maken');
    expect(btn(el, 'Opmaak wissen').querySelector('svg')).not.toBeNull();
    el.remove();
  });

  it('keep the pressed state, which the icon follows by its colour', () => {
    const el = build();
    expect(btn(el, 'Align left').getAttribute('aria-pressed')).toBe('false');
    el.remove();
  });
});
