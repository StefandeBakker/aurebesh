import { describe, it, expect } from 'vitest';
import { extractRtfImages, extractRtfShapePictures, preparePaste, sanitize } from '../src';
import { normalizeColor } from '../src/paste';
import {
  GOOGLE_DOCS_HTML, JPEG_BYTES, NEWSLETTER_HTML, PNG_BASE64, WORD_COLUMNS_HTML, WORD_HTML, newsletterRtf, pngBytes, wordRtf,
} from './fixtures/paste';

/** What the editor inserts: prepared, then sanitized, with image markers shown as [img n]. */
const pasted = (html: string, rtf = '', policy: 'upload' | 'link' | 'remove' = 'upload', canUpload = true) => {
  const p = preparePaste(html, rtf, policy, canUpload);
  return { ...p, out: sanitize(p.html).replace(/aurebesh-img-(\d+)/g, '[img $1]') };
};

const bytesOf = (blob: Blob): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });

describe('pasting from Google Docs', () => {
  const { out, images } = pasted(GOOGLE_DOCS_HTML);

  it('turns inline styles into bold, italic, underline and colour, and drops fonts and sizes', () => {
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<em>italic</em>');
    expect(out).toContain('<u>under</u>');
    expect(out).toContain('<span style="color: #ff0000">red</span>');
    expect(out).not.toMatch(/font-family|font-size|font-weight|margin|line-height/);
    expect(out).not.toContain('docs-internal-guid');
    expect(out).not.toContain('<meta');
  });

  it('does not treat the font-weight:normal wrapper or "normal" weights as bold, and keeps the heading', () => {
    expect(out).toContain('<h1>Report</h1>');
    expect(out).toContain('Plain ');
    expect(out).not.toContain('<strong>Plain');
    expect(out).not.toContain('<strong><h1');
  });

  it('links straight to the target instead of through google.com/url, without the link styling', () => {
    expect(out).toContain('<a href="https://example.com/page">link</a>');
    expect(out).not.toMatch(/<a [^>]*>(?:<u>|<span)/);
  });

  it('keeps list structure and unwraps the paragraph inside each item', () => {
    expect(out).toContain('<ul><li>first<ul><li>nested</li></ul></li><li>second</li></ul>');
  });

  it('keeps alignment, and finds every image as a remote image in order', () => {
    expect(out).toContain('<p style="text-align: center">[img 0]</p>');
    expect(out).toContain('[img 1]');
    expect(images.map((i) => [i.kind, i.src])).toEqual([
      ['remote', 'https://lh7-rt.googleusercontent.com/docsz/AD_4nXa1?key=abc123'],
      ['remote', 'https://lh7-rt.googleusercontent.com/docsz/AD_4nXb2?key=def456'],
    ]);
  });
});

describe('pasting from Word', () => {
  const rtf = wordRtf(['png', 'png']);
  const { out, images, dropped } = pasted(WORD_HTML, rtf);

  it('keeps bold, italic, colour and highlight; drops Word classes, styles and namespaced tags', () => {
    expect(out).toContain('<b>Vet</b> en <i>cursief</i>');
    expect(out).toContain('<span style="color: #ff0000">rood</span>');
    expect(out).toContain('<span style="background-color: #ffff00">markering</span>');
    expect(out).not.toMatch(/Mso|mso-|o:p|<style|class=|font-family/);
  });

  it('turns list paragraphs into real nested lists, and tells bullets from numbers', () => {
    expect(out).toContain('<ul><li>Eerste<ul><li>Genest</li></ul></li><li>Tweede</li></ul>');
    expect(out).toContain('<ol><li>Nummer een</li><li>Nummer twee</li></ol>');
    expect(out).not.toContain('·');
  });

  it('keeps an empty paragraph as one blank line', () => {
    expect(out).toContain('<p><br></p>');
  });

  it('matches each picture on disk (file: link) with a picture from the RTF, in order', async () => {
    expect(dropped).toBe(0);
    expect(images.map((i) => i.kind)).toEqual(['local', 'local']);
    expect(images[0].src).toContain('clip_image001.png');
    expect(images[1].src).toContain('clip_image002.png');
    expect(images[0].blob?.type).toBe('image/png');
    expect(Array.from(await bytesOf(images[0].blob!))).toEqual(Array.from(pngBytes()));
    expect(out).toContain('[img 0]');
    expect(out).toContain('[img 1]');
  });

  it('counts a picture as dropped when the RTF has no usable data for it (e.g. a metafile)', () => {
    const r = pasted(WORD_HTML, wordRtf(['emf', 'png']));
    expect(r.images).toHaveLength(1); // only the second one could be recovered...
    expect(r.images[0].src).toContain('clip_image002.png'); // ...and it is matched with the right image, not shifted
    expect(r.dropped).toBe(1);
    expect(r.out).not.toContain('clip_image001');
  });

  it('drops the pictures, and says so, when the RTF is not available', () => {
    const r = pasted(WORD_HTML, '');
    expect(r.images).toHaveLength(0);
    expect(r.dropped).toBe(2);
    expect(r.out).not.toContain('file:');
  });
});

describe('extractRtfImages', () => {
  it('reads PNG and JPEG data, skips the \\nonshppict fallback copy, and keeps the order', async () => {
    const pictures = extractRtfImages(wordRtf(['png', 'jpeg', 'png']));
    expect(pictures.map((p) => p?.type)).toEqual(['image/png', 'image/jpeg', 'image/png']);
    expect(Array.from(await bytesOf(pictures[0]!))).toEqual(Array.from(pngBytes()));
  });

  it('does not read the first digits of the picture data as part of the \\bliptag number', async () => {
    // The data starts with digits right after the closing brace of {\*\blipuid ...}
    const bytes = Uint8Array.from([0x12, 0x34, 0x56, 0x78, 0x90, 0xab]);
    const [blob] = extractRtfImages(wordRtf(['png'], bytes));
    expect(Array.from(await bytesOf(blob!))).toEqual(Array.from(bytes));
  });

  it('gives undefined for pictures it can not use, so the order still matches the HTML', () => {
    expect(extractRtfImages(wordRtf(['emf', 'png'])).map((p) => p?.type)).toEqual([undefined, 'image/png']);
  });

  it('copes with text that has no pictures', () => {
    expect(extractRtfImages('{\\rtf1 hello}')).toEqual([]);
  });
});

describe('image policies', () => {
  const remote = '<p><img src="https://example.com/a.png" alt="a"></p>';

  it('upload (default): remote images become pending imports', () => {
    const r = pasted(remote);
    expect(r.images).toMatchObject([{ kind: 'remote', src: 'https://example.com/a.png', alt: 'a' }]);
  });
  it('link: keeps the link, nothing to import', () => {
    const r = pasted(remote, '', 'link');
    expect(r.images).toHaveLength(0);
    expect(r.out).toContain('<img src="https://example.com/a.png" alt="a">');
  });
  it('remove: leaves images out and counts them', () => {
    const r = pasted(remote, '', 'remove');
    expect(r.out).not.toContain('img');
    expect(r.dropped).toBe(1);
  });
  it('without an upload adapter a web image stays a link, and a Word picture is dropped', () => {
    expect(pasted(remote, '', 'upload', false).out).toContain('<img src="https://example.com/a.png"');
    const word = pasted(WORD_HTML, wordRtf(['png', 'png']), 'upload', false);
    expect(word.images).toHaveLength(0);
    expect(word.dropped).toBe(2);
  });
  it('images that are already inline (data:) are left alone', () => {
    const data = `<p><img src="data:image/png;base64,${PNG_BASE64}"></p>`;
    const r = pasted(data);
    expect(r.images).toHaveLength(0);
    expect(r.out).toContain('data:image/png;base64');
  });
});

describe('columns', () => {
  it('reads a Word section\'s columns from the style sheet and puts them on a column block', () => {
    const { out } = pasted(WORD_COLUMNS_HTML);
    expect(out).toContain('<div style="column-count: 2; column-gap: 35.4pt"><p><b>Krant</b> kolom een met wat tekst die doorloopt.</p><p>Tweede alinea van de krant.</p></div>');
    // the one-column section stays an ordinary block
    expect(out).toContain('<div><p>Daarna gewone tekst.</p></div>');
    expect(out).not.toMatch(/mso-|WordSection|@page/);
  });

  it('reads column-count from CSS rules and from style attributes, also on section/article elements', () => {
    expect(pasted('<style>.cols{column-count:3;column-gap:2em}</style><div class="cols"><p>a</p></div>').out).toBe('<div style="column-count: 3; column-gap: 2em"><p>a</p></div>');
    expect(pasted('<section style="column-count: 2"><p>a</p></section>').out).toBe('<div style="column-count: 2"><p>a</p></div>');
    expect(pasted('<article style="-webkit-column-count: 2; column-gap: 1cm"><p>a</p></article>').out).toBe('<div style="column-count: 2; column-gap: 37.8px"><p>a</p></div>');
    expect(pasted('<div style="columns: 2 200px"><p>a</p></div>').out).toBe('<div style="column-count: 2"><p>a</p></div>');
  });

  it('limits to 4 columns and ignores a single column', () => {
    expect(pasted('<div style="column-count: 9"><p>a</p></div>').out).toBe('<div style="column-count: 4"><p>a</p></div>');
    expect(pasted('<div style="column-count: 1"><p>a</p></div>').out).toBe('<div><p>a</p></div>');
  });

  it('the sanitizer only allows 2-4 columns and a plain gap, and only on a div', () => {
    expect(sanitize('<div style="column-count: 2; column-gap: 2em">a</div>')).toBe('<div style="column-count: 2; column-gap: 2em">a</div>');
    expect(sanitize('<div style="column-count: 9">a</div>')).toBe('<div>a</div>');
    expect(sanitize('<div style="column-gap: expression(1)">a</div>')).toBe('<div>a</div>');
    expect(sanitize('<p style="column-count: 2">a</p>')).toBe('<p>a</p>');
  });
});

// Needs test/fixtures/word-newsletter.html, a reduced real clipboard that is not committed (make one with `npm run capture`).
(NEWSLETTER_HTML ? describe : describe.skip)('Word newsletter template (a real clipboard, reduced)', () => {
  const r = pasted(NEWSLETTER_HTML ?? '', newsletterRtf());
  const dom = new DOMParser().parseFromString(r.out, 'text/html');
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('keeps the text boxes out of the headings and paragraphs they were anchored to', () => {
    for (const h of Array.from(dom.querySelectorAll('h1,h2,h3'))) expect(text(h)).not.toMatch(/sidebar|insert tab/i);
    for (const p of Array.from(dom.querySelectorAll('p')).filter((el) => !el.closest('aside'))) expect(text(p)).not.toMatch(/quote is bold/i);
    expect(text(dom.querySelector('h1:not([style])'))).toBe('Story Title');
  });

  const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const banner = (re: RegExp) => Array.from(dom.querySelectorAll('div')).find((d) => re.test(text(d)) && d.querySelector('h1,h2') && !d.querySelector('div'))!;

  it('turns the sidebar into a right-floating beige box, under the page-wide header and before the heading it was attached to', () => {
    const side = Array.from(dom.querySelectorAll('aside')).find((a) => /sidebar title/i.test(text(a)))!;
    // float, width, then the fill (#e1deba at 70%) and the text margin of Word's box
    expect(side.getAttribute('style')).toMatch(/^float: right; width: 33%; background-color: rgba\(225, 222, 186, 0\.7\); padding: [\d.]+pt [\d.]+pt [\d.]+pt [\d.]+pt$/);
    const heading = Array.from(dom.querySelectorAll('h1')).find((h) => text(h) === 'Story Title')!;
    expect(before(side, heading)).toBe(true);
    expect(before(banner(/newsletter title/i), side)).toBe(true);
    expect(before(banner(/company name/i), side)).toBe(true);
  });

  it('gives the first column section 2 columns (Word\'s 3 minus the one the page-high sidebar covers) and keeps 3 where nothing covers them', () => {
    const blocks = Array.from(dom.querySelectorAll('div[style*="column-count"]'));
    expect(blocks.map((b) => b.getAttribute('style'))).toEqual(['column-count: 2; column-gap: 18pt', 'column-count: 3; column-gap: 18pt']);
  });

  it('puts the pull quote in the middle of the column text as a box that the text wraps around (not a band across the columns)', () => {
    const quote = Array.from(dom.querySelectorAll('aside')).find((a) => /quote is bold/i.test(text(a)))!;
    expect(quote.getAttribute('style')).toBe('float: left; width: 60%');
    expect(quote.getAttribute('style')).not.toContain('column-span');
    const columns = quote.parentElement!;
    expect(columns.getAttribute('style')).toMatch(/^column-count: 2; column-gap: 18pt$/);
    const index = Array.from(columns.children).indexOf(quote);
    expect(index).toBeGreaterThan(0); // not at the start...
    expect(index).toBeLessThan(columns.children.length - 1); // ...and not at the end
  });

  it('keeps the banners as full-width blocks in the order of their height on the page: title above company name', () => {
    expect(text(dom.querySelector('div > h1[style="text-align: center"]'))).toBe('[Newsletter Title]');
    expect(text(dom.querySelector('div > h2[style="text-align: center"]'))).toBe('[Type the company name]');
    expect(before(banner(/newsletter title/i), banner(/company name/i))).toBe(true);
  });

  it('gives the company name its dark background with white text, and the title its own dark brown capitals (not the heading green)', () => {
    const company = banner(/company name/i);
    expect(company.getAttribute('style')).toMatch(/^background-color: #93a299; padding: /);
    expect(company.innerHTML).toMatch(/color: #ffffff/i); // white is kept now that the fill is
    const title = banner(/newsletter title/i);
    expect(title.hasAttribute('style')).toBe(false); // no fill
    // The title is a "Title" paragraph (p.MsoTitle: #40382D, capitals), not a Heading 1 (#93A299).
    expect(title.innerHTML).toMatch(/color: #40382d; text-transform: uppercase/);
    expect(title.innerHTML).not.toMatch(/#93a299/);
  });

  it('applies the colours and capitals that Word keeps in its style sheet to the headings and subtitles', () => {
    const story = Array.from(dom.querySelectorAll('h1')).find((h) => text(h) === 'Story Title')!;
    expect(story.querySelector('span')!.getAttribute('style')).toBe('color: #93a299; text-transform: uppercase');
    const sub = Array.from(dom.querySelectorAll('p')).find((p) => text(p).startsWith('Story Subtitle'))!;
    expect(sub.querySelector('span')!.getAttribute('style')).toBe('color: #93a299');
  });

  it('keeps the beige fill of the summary box', () => {
    const summary = Array.from(dom.querySelectorAll('div')).find((d) => /summary of the information/i.test(text(d)) && !d.querySelector('div'))!;
    expect(summary.getAttribute('style')).toMatch(/^background-color: rgba\(225, 222, 186, 0\.7\); padding: /);
  });

  it('drops empty sections, section breaks and Word markup', () => {
    expect(r.out).not.toContain('column-gap: 36pt'); // the empty three-column section
    expect(r.out).not.toMatch(/mso-|v:|w:Sdt|WordSection|<br clear/i);
    expect(Array.from(dom.body.children).filter((c) => c.tagName === 'BR')).toHaveLength(0);
  });

  it('finds the floating picture (a <v:imagedata>, there is no <img>) and matches it by shape number with its size', async () => {
    expect(r.images).toHaveLength(1);
    expect(r.images[0]).toMatchObject({ kind: 'local', width: 60 }); // 300pt of a 504pt text width
    expect(r.images[0].blob?.type).toBe('image/jpeg');
    expect(Array.from(await bytesOf(r.images[0].blob!))).toEqual(Array.from(JPEG_BYTES));
    expect(r.dropped).toBe(0);
  });

  it('puts the floating picture in its own centred paragraph under the paragraph it hangs on, not inside that paragraph\'s text', () => {
    const subtitle = Array.from(dom.querySelectorAll('p')).filter((p) => text(p).startsWith('Story Subtitle')).pop()!;
    expect(subtitle.textContent).not.toContain('[img');
    const band = subtitle.nextElementSibling!;
    expect(band.tagName).toBe('P');
    expect(band.getAttribute('style')).toBe('text-align: center'); // Word places it at 20%-80% of the text width: centred
    expect(band.textContent).toBe('[img 0]');
  });

  it('shape pictures are found by number, and fill pictures and metafile fallbacks are not mistaken for pictures', async () => {
    const byShape = extractRtfShapePictures(newsletterRtf());
    expect([...byShape.keys()]).toEqual([2052]);
    expect(Array.from(await bytesOf(byShape.get(2052)!))).toEqual(Array.from(JPEG_BYTES));
    const ordered = extractRtfImages(newsletterRtf());
    expect(ordered).toHaveLength(1);
    expect(Array.from(await bytesOf(ordered[0]!))).toEqual(Array.from(JPEG_BYTES));
  });
});

describe('style sheets and text box fills', () => {
  it('applies selectors on tags, classes and tag.class, with the element\'s own style winning', () => {
    const { out } = pasted('<style>h1{color:#93A299;text-transform:uppercase} p.sub{color:#564B3C} .x{color:#ff0000}</style><h1>T</h1><p class="sub">S</p><p class="sub x" style="color:#00aa00">U</p>');
    expect(out).toBe(
      '<h1><span style="color: #93a299; text-transform: uppercase">T</span></h1>' +
        '<p><span style="color: #564b3c">S</span></p>' +
        '<p><span style="color: #00aa00">U</span></p>',
    );
  });

  it('keeps black where something around it has a colour, and drops it where it is just the default', () => {
    expect(pasted('<style>h1{color:#93A299}</style><h1><span style="color:black">x</span></h1>').out).toContain('color: #000000');
    expect(pasted('<p><span style="color:black">x</span></p>').out).toBe('<p>x</p>');
  });

  // Word puts the box's text in a one-cell table, which is also what keeps its paragraphs from closing the anchor paragraph.
  const box = (attrs: string, text = 'Hi') =>
    `<div class=WordSection1><p>Anchor<v:rect ${attrs} style='position:absolute;mso-width-percent:330;mso-left-percent:670;mso-top-percent:150'><v:textbox inset="14.4pt,1.2695mm,14.4pt,1.2695mm"><table><tr><td><p>${text}</p></td></tr></table></v:textbox></v:rect></p></div>`;

  it('reads the fill colour (without the theme index), its opacity and the text margin as padding', () => {
    const { out } = pasted(box('fillcolor="#e1deba [1302]"').replace('<v:textbox', '<v:fill opacity="46003f"/><v:textbox'));
    expect(out).toContain('background-color: rgba(225, 222, 186, 0.7); padding: 3.6pt 14.4pt 3.6pt 14.4pt');
  });

  it('a fill that is off, white or missing gives a plain box', () => {
    for (const attrs of ['fillcolor="#e1deba" filled="f"', 'fillcolor="white"', 'fillcolor="window"', '']) {
      expect(pasted(box(attrs)).out).not.toContain('background-color');
    }
  });

  it('puts boxes that sit near the top before their paragraph in the order of their height, whatever the order in the source', () => {
    const shape = (id: string, top: number) =>
      `<v:rect id="${id}" style='position:absolute;mso-width-percent:1000;mso-top-percent:${top}'><v:textbox><table><tr><td><p>${id}</p></td></tr></table></v:textbox></v:rect>`;
    const html = `<div class=WordSection1><h1>${shape('lower', 90)}${shape('higher', 80)}Heading</h1></div>`;
    expect(pasted(html).out.replace(/<\/?(?:div|p)[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()).toBe('higher lower <h1>Heading</h1>');
  });
});

describe('columns beside a floating box', () => {
  const doc = (sidebar: string, columns = 3) =>
    `<style>@page WordSection1 {size:612pt 792pt; margin:54pt 54pt 54pt 54pt;} @page WordSection2 {size:612pt 792pt; margin:54pt 54pt 54pt 54pt; mso-columns:${columns} even 18pt;} div.WordSection1{page:WordSection1} div.WordSection2{page:WordSection2}</style>` +
    `<div class=WordSection1><h1><v:rect style='position:absolute;${sidebar}'><v:textbox><table><tr><td><p>side</p></td></tr></table></v:textbox></v:rect>Title</h1></div>` +
    `<div class=WordSection2><p>a</p><p>b</p><p>c</p><p>d</p></div>`;
  const columnsOf = (html: string) => /column-count: (\d)/.exec(pasted(html).out)?.[1];

  it('a page-high box a third wide takes one of three columns, a box half as wide takes one of two', () => {
    expect(columnsOf(doc('mso-width-percent:330;mso-height-percent:830;mso-left-percent:670;mso-top-percent:150', 3))).toBe('2');
    expect(pasted(doc('mso-width-percent:500;mso-height-percent:830;mso-left-percent:500;mso-top-percent:150', 2)).out).not.toContain('column-count'); // 1 column left = no columns
  });

  it('a short box (it covers only part of the section) or a full-width one leaves the columns alone', () => {
    expect(columnsOf(doc('mso-width-percent:330;mso-height-percent:200;mso-left-percent:670;mso-top-percent:150', 3))).toBe('3');
    expect(columnsOf(doc('mso-width-percent:1000;mso-height-percent:830;mso-top-percent:150', 3))).toBe('3'); // a banner, not a sidebar
  });

  it('only the section next to the box is affected', () => {
    const two = doc('mso-width-percent:330;mso-height-percent:830;mso-left-percent:670;mso-top-percent:150', 3) +
      `<style>@page WordSection3 {mso-columns:3 even 18pt} div.WordSection3{page:WordSection3}</style><div class=WordSection3><p>x</p><p>y</p><p>z</p></div>`;
    expect(Array.from(pasted(two).out.matchAll(/column-count: (\d)/g), (m) => m[1])).toEqual(['2', '3']);
  });
});

describe('other pages', () => {
  it('applies the same style-to-tag conversion to ordinary web page markup', () => {
    const { out } = pasted('<p style="font-family: Georgia; font-size: 18px"><span style="font-weight: bold">B</span> <span style="font-style: italic; color: rgb(0, 0, 0)">I</span> <span style="text-decoration: line-through">S</span> x<span style="vertical-align: super">2</span></p>');
    expect(out).toBe('<p><strong>B</strong> <em>I</em> <s>S</s> x<sup>2</sup></p>');
  });

  it('turns h4-h6 into h3, and keeps tables', () => {
    expect(pasted('<h5>t</h5>').out).toBe('<h3>t</h3>');
    expect(pasted('<table style="width:100%"><colgroup><col></colgroup><tbody><tr><td style="background:#eee"><p>a</p></td></tr></tbody></table>').out).toContain('<table><tbody><tr><td><p>a</p></td></tr></tbody></table>');
  });

  it('removes scripts, styles and event handlers', () => {
    const { out } = pasted('<style>p{}</style><script>alert(1)</script><p onclick="x()">safe</p>');
    expect(out).toBe('<p>safe</p>');
  });

  it('normalizeColor', () => {
    expect(normalizeColor('red')).toBe('#ff0000');
    expect(normalizeColor('RGB(1, 2, 3)')).toBe('rgb(1, 2, 3)');
    expect(normalizeColor('windowtext')).toBeNull();
    expect(normalizeColor('transparent')).toBeNull();
    expect(normalizeColor('url(x)')).toBeNull();
  });
});
