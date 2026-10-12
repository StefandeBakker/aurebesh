import { describe, expect, it } from 'vitest';
import { sanitize } from '../src';
import { exportTemplate, parseTemplate, resolveTicket } from '../src/ticket/engine';
import { decorate, fillLine, isAtom, lineOf, normalizeContent, offsetOf, pointAt, readLine, readLines, renderLines, unitLength } from '../src/ticket/dom';
import type { View } from '../src/ticket/dom';

const R = resolveTicket({ keywords: [{ name: 'Order.Total', sample: '12.50' }] });
const view: View = { useNames: false, describe: (it) => (it.t === 'endif' ? 'Endif' : `If ${it.field}`) };

const draw = (code: string) => {
  const content = document.createElement('div');
  content.append(...renderLines(document, parseTemplate(code, R), R, view));
  return content;
};

describe('the layout markup', () => {
  const CODE = '[*center*][*groot*]Big [*Order.Total,"%8s"*]\n[*If A,"1"*]x[*euro*][*include "F.txt"*][*Endif*]\n\n[*right*][*extragroot*]end';

  it('turns a template into lines and back, with every kind of item', () => {
    const lines = parseTemplate(CODE, R);
    const content = draw(CODE);
    expect(content.children).toHaveLength(4);
    expect(readLines(content, R)).toEqual(lines);
    expect(exportTemplate(readLines(content, R), R)).toBe(exportTemplate(lines, R));
  });

  it('draws sizes as spans around runs, and alignment as text-align', () => {
    const content = draw('plain [*groot*]big[*normaal*] plain');
    const p = content.querySelector('p')!;
    expect(p.querySelectorAll('[data-size="groot"]')).toHaveLength(1);
    expect(p.textContent).toBe('plain big plain');
    expect(draw('[*center*]x').querySelector('p')!.style.textAlign).toBe('center');
    expect(draw('x').querySelector('p')!.hasAttribute('style')).toBe(false);
  });

  it('draws fields with their sample in the width of the format, as units that cannot be edited', () => {
    const chip = draw('[*Order.Total,"%8s"*]').querySelector('[data-t="field"]') as HTMLElement;
    expect(chip.textContent).toBe('   12.50');
    expect(chip.getAttribute('contenteditable')).toBe('false');
    expect(chip.getAttribute('data-fmt')).toBe('%8s');
    expect(isAtom(chip)).toBe(true);
  });

  it('draws conditions as empty marks with a label, and commands with what they print', () => {
    const content = draw('[*If A.B,"1"*]x[*euro*][*cutbon*][*Endif*]');
    const marks = content.querySelectorAll('[data-t="if"],[data-t="endif"]');
    expect(marks).toHaveLength(2);
    expect(marks[0].textContent).toBe('');
    expect(marks[0].getAttribute('data-label')).toBe('If A.B');
    expect(Array.from(content.querySelectorAll('[data-t="cmd"]')).map((c) => c.textContent)).toEqual(['€', '✂']);
  });

  it('reads a size from the nearest size span, and ignores what the browser leaves behind', () => {
    const p = document.createElement('p');
    p.innerHTML = '<b>a</b><span data-size="groot">b<i>c</i></span> d<br>';
    expect(readLine(p, R).items).toEqual([
      { t: 'text', text: 'a', size: 'normaal' },
      { t: 'text', text: 'bc', size: 'groot' },
      { t: 'text', text: ' d', size: 'normaal' },
    ]);
  });

  it('an empty line has a <br> so it keeps its height', () => {
    const p = document.createElement('p');
    fillLine(p, { align: 'left', items: [] }, R, view);
    expect(p.innerHTML).toBe('<br>');
  });

  it('puts loose text in a paragraph, turns a div into one, and makes sure there is a line', () => {
    const c = document.createElement('div');
    c.innerHTML = 'loose <b>text</b><div style="text-align: center">in a div</div>more';
    normalizeContent(c);
    expect(Array.from(c.children).map((e) => e.tagName)).toEqual(['P', 'P', 'P']);
    expect((c.children[1] as HTMLElement).style.textAlign).toBe('center');
    const empty = document.createElement('div');
    normalizeContent(empty);
    expect(empty.innerHTML).toBe('<p><br></p>');
  });

  it('refreshes the chips after the markup came from outside (the sanitizer drops contenteditable and the text)', () => {
    const c = document.createElement('div');
    c.innerHTML = '<p><span data-t="field" data-name="Order.Total" data-fmt="%8s"></span><span data-t="if" data-field="A" data-val="1"></span></p>';
    decorate(c, R, view);
    const [chip, mark] = Array.from(c.querySelectorAll<HTMLElement>('[data-t]'));
    expect(chip.getAttribute('contenteditable')).toBe('false');
    expect(chip.textContent).toBe('   12.50');
    expect(mark.getAttribute('data-label')).toBe('If A');
  });
});

describe('positions in a line', () => {
  const line = () => draw('ab[*groot*]cd[*Order.Total*]e[*normaal*]f').querySelector('p') as HTMLElement;

  it('counts characters and chips', () => {
    expect(unitLength(line())).toBe(2 + 2 + 1 + 1 + 1);
  });

  it('gives a point in the markup the position it has in the line, and back', () => {
    const p = line();
    for (let n = 0; n <= 7; n++) {
      const [node, off] = pointAt(p, n);
      expect(offsetOf(p, node, off), `position ${n}`).toBe(n);
    }
  });

  it('places a point inside text, inside a size span, and between a chip and the text', () => {
    const p = line();
    const [n2] = pointAt(p, 2);
    expect(n2.nodeType).toBe(3);
    expect(offsetOf(p, p.querySelector('[data-size]')!.firstChild!, 1)).toBe(3); // after "c"
    expect(offsetOf(p, p, 0)).toBe(0);
    expect(offsetOf(p, p, p.childNodes.length)).toBe(7);
    expect(pointAt(p, 99)[0]).toBe(p); // past the end: the end of the line
  });

  it('finds the line a node is in', () => {
    const c = draw('one\ntwo');
    const second = c.children[1] as HTMLElement;
    expect(lineOf(c, second.firstChild)).toBe(second);
    expect(lineOf(c, second)).toBe(second);
    expect(lineOf(c, document.createElement('x'))).toBeNull();
  });
});

describe('the sanitizer and the layout markup', () => {
  it('keeps the chips, size groups and marks with their values', () => {
    const html =
      '<p style="text-align: center"><span data-size="groot">a<span data-t="field" data-name="Order.Total" data-fmt="%8s">x</span></span><span data-t="cmd" data-name="include" data-arg="F.txt"></span><span data-t="if" data-field="A.B" data-val="1" data-not=""></span><span data-t="endif"></span></p>';
    expect(sanitize(html)).toBe(html);
  });

  it('drops values that could break out of the markup, and a chip without its name', () => {
    const out = sanitize(
      '<p><span data-t="field" data-name="a b">1</span><span data-t="field" data-name="A" data-fmt=\'"><script>x</script>\'>2</span><span data-t="evil" data-name="A">3</span><span data-t="if">4</span><span data-size="a b">5</span></p>',
    );
    expect(out).not.toContain('script');
    expect(out).not.toContain('a b');
    expect(out).not.toContain('evil');
    expect(out).not.toContain('data-t="if"'); // an If needs a field
    expect(out).toContain('data-name="A"'); // the second chip stays, without the bad format
  });

  it('does not let a span carry anything else', () => {
    const out = sanitize('<p><span data-t="field" data-name="A" onclick="x()" class="y" id="z" style="position:fixed">q</span></p>');
    expect(out).toBe('<p><span data-t="field" data-name="A">q</span></p>');
  });
});
