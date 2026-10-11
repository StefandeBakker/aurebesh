import { describe, expect, it } from 'vitest';
import { countPages, printDocument, resolvePage, toPx } from '../src/page';

describe('resolvePage', () => {
  it('gives no page for responsive, null, undefined and an empty string', () => {
    for (const v of ['responsive', 'Responsive', null, undefined, '']) expect(resolvePage(v as any)).toBeNull();
  });

  it('knows the paper and ticket presets, with their own margins', () => {
    expect(resolvePage('a4')).toEqual({ name: 'a4', width: '210mm', height: '297mm', margin: '20mm', landscape: false });
    expect(resolvePage('A5')).toMatchObject({ name: 'a5', width: '148mm', height: '210mm' });
    expect(resolvePage('letter')).toMatchObject({ width: '215.9mm', height: '279.4mm' });
    expect(resolvePage('ticket-80')).toEqual({ name: 'ticket-80', width: '80mm', height: null, margin: '4mm', landscape: false });
    expect(resolvePage('ticket-58')).toMatchObject({ width: '58mm', height: null });
  });

  it('takes a width: a number is pixels, a string a CSS length', () => {
    expect(resolvePage(600)).toEqual({ name: 'custom', width: '600px', height: null, margin: '12px', landscape: false });
    expect(resolvePage('80mm')).toMatchObject({ name: 'custom', width: '80mm' });
    expect(resolvePage(' 21CM ')).toMatchObject({ width: '21cm' });
    expect(resolvePage('8.5in')).toMatchObject({ width: '8.5in' });
  });

  it('takes the full form: a preset with changes, or a width and height of its own', () => {
    // only a changed size makes it custom; a margin alone is still an A4 page
    expect(resolvePage({ format: 'a4', margin: '10mm' })).toMatchObject({ name: 'a4', width: '210mm', height: '297mm', margin: '10mm' });
    expect(resolvePage({ width: '100mm', height: '150mm', margin: '5mm 8mm' })).toMatchObject({ width: '100mm', height: '150mm', margin: '5mm 8mm' });
    expect(resolvePage({ format: 'a4', width: '200mm' })).toMatchObject({ name: 'custom', width: '200mm', height: '297mm' });
  });

  it('swaps width and height for landscape, but not for a page without a height', () => {
    expect(resolvePage({ format: 'a4', orientation: 'landscape' })).toMatchObject({ width: '297mm', height: '210mm', landscape: true });
    expect(resolvePage({ format: 'ticket-80', orientation: 'landscape' })).toMatchObject({ width: '80mm', height: null, landscape: false });
  });

  it('rejects what is not a page, and anything that could carry CSS or HTML along', () => {
    for (const bad of ['a7', 'wide', '10', '-5mm', '0px', '1e3px', '12em', '50%', '10px;}</style><script>x()</script>', 'url(x)']) {
      expect(() => resolvePage(bad), String(bad)).toThrow(/Aurebesh/);
    }
    expect(() => resolvePage(0)).toThrow();
    expect(() => resolvePage(NaN)).toThrow();
    expect(() => resolvePage({} as any)).toThrow();
    expect(() => resolvePage({ format: 'a4', margin: '5mm;color:red' })).toThrow();
    expect(() => resolvePage({ format: 'a4', margin: '1mm 2mm 3mm 4mm 5mm' })).toThrow();
  });
});

describe('page maths', () => {
  it('converts CSS lengths to pixels at 96 per inch', () => {
    expect(toPx('96px')).toBe(96);
    expect(toPx('1in')).toBe(96);
    expect(toPx('25.4mm')).toBeCloseTo(96);
    expect(toPx('2.54cm')).toBeCloseTo(96);
    expect(toPx('72pt')).toBeCloseTo(96);
  });

  it('counts pages: a paper page is full pages of its height, anything else is one page', () => {
    const a4 = resolvePage('a4');
    const h = toPx('297mm');
    expect(countPages(a4, 100)).toBe(1);
    expect(countPages(a4, h)).toBe(1);
    expect(countPages(a4, h + 5)).toBe(2);
    expect(countPages(a4, h * 3)).toBe(3);
    expect(countPages(resolvePage('ticket-80'), 99999)).toBe(1);
    expect(countPages(null, 99999)).toBe(1);
  });
});

describe('printDocument', () => {
  const html = '<p>hi</p>';
  it('puts the paper size and margin in @page for a page with a height', () => {
    const doc = printDocument(resolvePage('a4'), html, '.x{}', 'font-size:16px');
    expect(doc).toContain('@page{size:210mm 297mm;margin:20mm}');
    expect(doc).toContain('<div class="aurebesh-content"><p>hi</p></div>');
    expect(doc).toContain('font-size:16px');
  });
  it('gives continuous paper the length of the content, with the margin as padding', () => {
    const doc = printDocument(resolvePage('ticket-80'), html, '', '', 400);
    expect(doc).toContain('@page{size:80mm 107mm;margin:0}'); // 400 px = 105.8 mm, rounded up, plus 1 mm to be sure to fit
    expect(doc).toContain('padding:4mm');
    expect(doc).toContain('width:80mm');
  });
  it('uses a plain margin without a page format', () => {
    expect(printDocument(null, html, '', '')).toContain('@page{margin:15mm}');
  });
});
