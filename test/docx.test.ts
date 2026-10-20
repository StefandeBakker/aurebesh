import { describe, expect, it } from 'vitest';
import { crc32, unzip, utf8, zip } from '../src/zip';
import { cssColor, imageInfo, toDocxBytes } from '../src/docx';
import { createHash } from 'node:crypto';
import { crc32 as nodeCrc32 } from 'node:zlib';

/** The order of the children that Word expects in some elements (a wrong order makes Word say the file is unreadable). */
const ORDER: Record<string, string[]> = {
  'w:pPr': ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr', 'suppressLineNumbers', 'pBdr', 'shd', 'tabs', 'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct', 'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd', 'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection', 'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange'],
  'w:rPr': ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath'],
  'w:tblPr': ['tblStyle', 'tblpPr', 'tblOverlap', 'bidiVisual', 'tblStyleRowBandSize', 'tblStyleColBandSize', 'tblW', 'jc', 'tblCellSpacing', 'tblInd', 'tblBorders', 'shd', 'tblLayout', 'tblCellMar', 'tblLook'],
  'w:tcPr': ['cnfStyle', 'tcW', 'gridSpan', 'hMerge', 'vMerge', 'tcBorders', 'shd', 'noWrap', 'tcMar', 'textDirection', 'tcFitText', 'vAlign', 'hideMark'],
  'w:pBdr': ['top', 'left', 'bottom', 'right', 'between', 'bar'],
  'w:tcBorders': ['top', 'start', 'left', 'bottom', 'end', 'right', 'insideH', 'insideV', 'tl2br', 'tr2bl'],
  'w:tblBorders': ['top', 'start', 'left', 'bottom', 'end', 'right', 'insideH', 'insideV'],
  'w:lvl': ['start', 'numFmt', 'lvlRestart', 'pStyle', 'isLgl', 'suff', 'lvlText', 'lvlPicBulletId', 'legacy', 'lvlJc', 'pPr', 'rPr'],
  'w:style': ['name', 'aliases', 'basedOn', 'next', 'link', 'autoRedefine', 'hidden', 'uiPriority', 'semiHidden', 'unhideWhenUsed', 'qFormat', 'locked', 'personal', 'personalCompose', 'personalReply', 'rsid', 'pPr', 'rPr', 'tblPr', 'trPr', 'tcPr', 'tblStylePr'],
};

const parse = (xml: string): Document => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  expect(doc.getElementsByTagName('parsererror').length, 'well-formed XML').toBe(0);
  return doc;
};

const FILES = async (html: string, options = {}) => {
  const entries = unzip(await toDocxBytes(html, options));
  const text = (name: string) => new TextDecoder().decode(entries.find((e) => e.name === name)!.data);
  return { entries, text, document: parse(text('word/document.xml')) };
};

const names = (doc: Document, tag: string) => Array.from(doc.getElementsByTagName(tag));
const textOf = (doc: Document) => names(doc, 'w:t').map((t) => t.textContent).join('');

function assertOrder(doc: Document): void {
  for (const [tag, order] of Object.entries(ORDER)) {
    for (const el of Array.from(doc.getElementsByTagName(tag))) {
      let last = -1;
      for (const child of Array.from(el.children)) {
        const local = child.tagName.replace(/^w:/, '');
        const at = order.indexOf(local);
        expect(at, `<${local}> is known in <${tag}>`).toBeGreaterThanOrEqual(0);
        expect(at, `<${local}> comes in its place in <${tag}>`).toBeGreaterThanOrEqual(last);
        last = at;
      }
    }
  }
}

// a 1x1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('the ZIP file', () => {
  it('has the entries that were put in, with their CRC-32', () => {
    const bytes = zip([
      { name: 'a.txt', data: utf8('hello') },
      { name: 'ü/b.bin', data: new Uint8Array([0, 1, 2, 255]) },
    ]);
    const entries = unzip(bytes);
    expect(entries.map((e) => e.name)).toEqual(['a.txt', 'ü/b.bin']);
    expect(new TextDecoder().decode(entries[0].data)).toBe('hello');
    expect(Array.from(entries[1].data)).toEqual([0, 1, 2, 255]);
    expect(crc32(utf8('hello'))).toBe(nodeCrc32('hello'));
    expect(crc32(new Uint8Array([0, 1, 2, 255]))).toBe(nodeCrc32(Buffer.from([0, 1, 2, 255])));
    expect(createHash('sha1').update(bytes).digest('hex')).toHaveLength(40);
  });
});

describe('the parts of a Word document', () => {
  it('has what a .docx needs, in the right order, and every part is XML that is well-formed', async () => {
    const { entries, text } = await FILES('<p>hello</p>');
    expect(entries[0].name).toBe('[Content_Types].xml');
    const names2 = entries.map((e) => e.name);
    for (const required of ['_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels', 'word/styles.xml', 'word/numbering.xml', 'docProps/core.xml']) expect(names2).toContain(required);
    for (const e of entries) if (e.name.endsWith('.xml') || e.name.endsWith('.rels')) parse(text(e.name));
    // every override and every relationship points at a part that is there
    const types = parse(text('[Content_Types].xml'));
    for (const o of Array.from(types.getElementsByTagName('Override'))) expect(names2).toContain(o.getAttribute('PartName')!.slice(1));
    const rels = parse(text('word/_rels/document.xml.rels'));
    for (const r of Array.from(rels.getElementsByTagName('Relationship'))) if (!r.getAttribute('TargetMode')) expect(names2).toContain('word/' + r.getAttribute('Target'));
  });

  it('has the page: A4 by default, the format of the editor when it has one, landscape when it is wider than high', async () => {
    let { document } = await FILES('<p>x</p>');
    let size = names(document, 'w:pgSz')[0];
    expect([size.getAttribute('w:w'), size.getAttribute('w:h')]).toEqual(['11906', '16838']);
    ({ document } = await FILES('<p>x</p>', { page: { width: 297, height: 210, margin: 15 } }));
    size = names(document, 'w:pgSz')[0];
    expect(size.getAttribute('w:orient')).toBe('landscape');
    expect(names(document, 'w:pgMar')[0].getAttribute('w:left')).toBe('850');
  });

  it('has the title and the font that were given', async () => {
    const { text } = await FILES('<p>x</p>', { title: 'Q&A <1>', font: 'Georgia', fontSize: 12 });
    expect(text('docProps/core.xml')).toContain('<dc:title>Q&amp;A &lt;1&gt;</dc:title>');
    expect(text('word/styles.xml')).toContain('w:ascii="Georgia"');
    expect(text('word/styles.xml')).toContain('<w:sz w:val="24"/>');
  });
});

describe('the text of a Word document', () => {
  it('has paragraphs and headings with their styles', async () => {
    const { document } = await FILES('<h1>One</h1><h2>Two</h2><h3>Three</h3><p>Body</p>');
    expect(names(document, 'w:pStyle').map((s) => s.getAttribute('w:val'))).toEqual(['Heading1', 'Heading2', 'Heading3']);
    expect(textOf(document)).toBe('OneTwoThreeBody');
    assertOrder(document);
  });

  it('has the formatting of the text', async () => {
    const { document } = await FILES(
      '<p><strong>b</strong><em>i</em><u>u</u><s>s</s><sup>p</sup><sub>q</sub><span style="color: #dc2626; background-color: #facc15; font-size: 18pt; font-family: Georgia, serif">c</span><code>k</code></p>',
    );
    const runs = names(document, 'w:r');
    const props = (n: number) => Array.from(runs[n].getElementsByTagName('w:rPr')[0]?.children ?? []).map((c) => c.tagName.replace('w:', '') + (c.getAttribute('w:val') ? '=' + c.getAttribute('w:val') : ''));
    expect(props(0)).toEqual(['b', 'bCs']);
    expect(props(1)).toEqual(['i', 'iCs']);
    expect(props(2)).toEqual(['u=single']);
    expect(props(3)).toEqual(['strike']);
    expect(props(4)).toEqual(['vertAlign=superscript']);
    expect(props(5)).toEqual(['vertAlign=subscript']);
    expect(props(6)).toEqual(['rFonts', 'color=DC2626', 'sz=36', 'szCs=36', 'shd=clear']);
    expect(runs[6].getElementsByTagName('w:rFonts')[0].getAttribute('w:ascii')).toBe('Georgia');
    expect(runs[6].getElementsByTagName('w:shd')[0].getAttribute('w:fill')).toBe('FACC15');
    expect(runs[7].getElementsByTagName('w:rFonts')[0].getAttribute('w:ascii')).toBe('Courier New');
    assertOrder(document);
  });

  it('has the kind and the colour of an underline, and a double strikethrough', async () => {
    const { document } = await FILES('<p><u style="text-decoration-style: wavy; text-decoration-color: #dc2626">a</u><s style="text-decoration-style: double">b</s></p>');
    const u = names(document, 'w:u')[0];
    expect([u.getAttribute('w:val'), u.getAttribute('w:color')]).toEqual(['wave', 'DC2626']);
    expect(names(document, 'w:dstrike')).toHaveLength(1);
    assertOrder(document);
  });

  it('has line breaks, tabs and spaces as they are, and the text that XML cannot have is escaped or left out', async () => {
    const { document } = await FILES('<p>a<br>b &amp; &lt;c&gt;\u0001</p><pre>x\n  y\tz</pre>');
    expect(names(document, 'w:br').length).toBeGreaterThanOrEqual(2);
    expect(textOf(document)).toContain('b & <c>');
    expect(names(document, 'w:tab')).toHaveLength(1);
  });

  it('has the alignment of a block, and the other way round where the text goes from the right', async () => {
    const { document } = await FILES('<p style="text-align: center">a</p><p style="text-align: justify">b</p><p dir="rtl" style="text-align: left">c</p>');
    expect(names(document, 'w:jc').map((j) => j.getAttribute('w:val'))).toEqual(['center', 'both', 'right']);
    expect(names(document, 'w:bidi')).toHaveLength(1);
    assertOrder(document);
  });
});

describe('links, lists and the rest', () => {
  it('has a link as a relationship that the text points at, once for the same address, and not for an address that is not safe', async () => {
    const { document, text } = await FILES('<p><a href="https://example.com/a?x=1&amp;y=2">one</a> <a href="https://example.com/a?x=1&amp;y=2">two</a> <a href="javascript:alert(1)">bad</a></p>');
    const links = names(document, 'w:hyperlink');
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('r:id')).toBe(links[1].getAttribute('r:id'));
    const rels = text('word/_rels/document.xml.rels');
    expect(rels).toContain('Target="https://example.com/a?x=1&amp;y=2"');
    expect(rels).toContain('TargetMode="External"');
    expect(textOf(document)).toContain('bad');
    expect(names(document, 'w:rStyle').every((s) => s.getAttribute('w:val') === 'Hyperlink')).toBe(true);
  });

  it('has bullet lists that go deeper, and numbered lists that each start again', async () => {
    const { document, text } = await FILES('<ul><li>a<ul><li>b</li></ul></li></ul><ol><li>one</li><li>two</li></ol><ol start="5"><li>five</li></ol>');
    const numbering = names(document, 'w:numPr').map((n) => [n.getElementsByTagName('w:ilvl')[0].getAttribute('w:val'), n.getElementsByTagName('w:numId')[0].getAttribute('w:val')]);
    expect(numbering).toEqual([['0', '1'], ['1', '1'], ['0', '3'], ['0', '3'], ['0', '4']]);
    const n = text('word/numbering.xml');
    expect(n).toContain('<w:num w:numId="3"><w:abstractNumId w:val="2"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/>');
    expect(n).toContain('<w:startOverride w:val="5"/>');
    assertOrder(document);
    assertOrder(parse(n));
  });

  it('has a task list with its boxes, and a nested list inside an item', async () => {
    const { document } = await FILES('<ul data-task=""><li data-checked="true">done<ul data-task=""><li>nested</li></ul></li><li>todo</li></ul>');
    expect(textOf(document)).toBe('\u2612 done\u2610 nested\u2610 todo');
    expect(names(document, 'w:numPr')).toHaveLength(0);
    expect(names(document, 'w:ind').map((i) => i.getAttribute('w:left'))).toEqual(['720', '1440', '720']);
  });

  it('has a quote, a rule, a code block and a callout', async () => {
    const { document } = await FILES('<blockquote>quoted</blockquote><hr><pre>a = 1\nb = 2</pre><div data-callout="warning"><p>careful</p></div>');
    expect(names(document, 'w:pBdr').length).toBeGreaterThanOrEqual(4);
    const text = textOf(document);
    expect(text).toContain('quoted');
    expect(text).toContain('Warning'); // the type is written, since the colour alone does not say it
    expect(text).toContain('careful');
    expect(names(document, 'w:left').some((l) => l.getAttribute('w:color') === 'D97706')).toBe(true);
    assertOrder(document);
  });
});

describe('tables and layouts', () => {
  it('has a table with its columns, a header row, merged cells, widths and shading', async () => {
    const { document } = await FILES(
      '<table><colgroup><col style="width: 25%"><col style="width: 75%"></colgroup><tbody>' +
        '<tr><th>H1</th><th>H2</th></tr>' +
        '<tr><td rowspan="2" style="background-color: #fef3c7">a</td><td>b</td></tr>' +
        '<tr><td>c</td></tr>' +
        '<tr><td colspan="2">wide</td></tr></tbody></table>',
    );
    expect(names(document, 'w:tbl')).toHaveLength(1);
    expect(names(document, 'w:gridCol').map((g) => parseInt(g.getAttribute('w:w')!, 10)).map((n, _, all) => Math.round((n / (all[0] + all[1])) * 100))).toEqual([25, 75]);
    expect(names(document, 'w:tblHeader')).toHaveLength(1);
    expect(names(document, 'w:tr')).toHaveLength(4);
    expect(names(document, 'w:vMerge').map((v) => v.getAttribute('w:val'))).toEqual(['restart', null]);
    expect(names(document, 'w:gridSpan')[0].getAttribute('w:val')).toBe('2');
    expect(names(document, 'w:shd').some((s) => s.getAttribute('w:fill') === 'FEF3C7')).toBe(true);
    // every cell has a paragraph to end with
    for (const tc of names(document, 'w:tc')) expect(tc.lastElementChild!.tagName).toBe('w:p');
    assertOrder(document);
  });

  it('has the borders of a cell, and none where they were taken away', async () => {
    const { document } = await FILES('<table><tbody><tr><td style="border: 3px solid #dc2626">a</td><td style="border: 0px solid transparent">b</td></tr></tbody></table>');
    const borders = names(document, 'w:tcBorders');
    expect(borders[0].getElementsByTagName('w:top')[0].getAttribute('w:color')).toBe('DC2626');
    expect(borders[0].getElementsByTagName('w:top')[0].getAttribute('w:sz')).toBe('18');
    expect(borders[1].getElementsByTagName('w:top')[0].getAttribute('w:val')).toBe('nil');
    assertOrder(document);
  });

  it('keeps two tables with nothing between them apart, and a table at the end has a paragraph after it', async () => {
    const { document } = await FILES('<table><tbody><tr><td>1</td></tr></tbody></table><table><tbody><tr><td>2</td></tr></tbody></table>');
    const body = names(document, 'w:body')[0];
    const kinds = Array.from(body.children).map((c) => c.tagName);
    expect(kinds).toEqual(['w:tbl', 'w:p', 'w:tbl', 'w:p', 'w:sectPr']);
  });

  it('has a row of columns as a table without borders, with the widths of the layout', async () => {
    const { document } = await FILES('<div data-layout="row" style="display: grid; grid-template-columns: 3fr 7fr; gap: 16px"><div data-layout="col"><p>left</p></div><div data-layout="col"><p>right</p></div></div>');
    const widths = names(document, 'w:gridCol').map((g) => parseInt(g.getAttribute('w:w')!, 10));
    expect(Math.round((widths[0] / (widths[0] + widths[1])) * 100)).toBe(30);
    expect(names(document, 'w:tblBorders')[0].getElementsByTagName('w:top')[0].getAttribute('w:val')).toBe('nil');
    expect(textOf(document)).toBe('leftright');
    assertOrder(document);
  });
});

describe('pictures', () => {
  it('knows the type and the size of a picture from its first bytes', () => {
    const png = Uint8Array.from(atob(PNG.split(',')[1]), (c) => c.charCodeAt(0));
    expect(imageInfo(png)).toEqual({ type: 'png', width: 1, height: 1 });
    expect(imageInfo(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 3, 0, 2, 0, 0, 0]))).toEqual({ type: 'gif', width: 3, height: 2 });
    expect(imageInfo(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it('puts a picture in the document, with its description, at the width that the text gives it', async () => {
    const { entries, document, text } = await FILES(`<p><img src="${PNG}" alt="A dot" style="width: 50%"></p>`);
    const media = entries.filter((e) => e.name.startsWith('word/media/'));
    expect(media.map((m) => m.name)).toEqual(['word/media/image1.png']);
    expect(text('[Content_Types].xml')).toContain('Extension="png" ContentType="image/png"');
    expect(text('word/_rels/document.xml.rels')).toContain('Target="media/image1.png"');
    const extent = names(document, 'wp:extent')[0];
    expect(parseInt(extent.getAttribute('cx')!, 10)).toBeGreaterThan(0);
    expect(extent.getAttribute('cx')).toBe(extent.getAttribute('cy')); // a square stays square
    expect(names(document, 'wp:docPr')[0].getAttribute('descr')).toBe('A dot');
    expect(names(document, 'a:blip')[0].getAttribute('r:embed')).toMatch(/^rId\d+$/);
  });

  it('centres a picture that is centred, and keeps a picture that cannot be had as its description', async () => {
    const centred = await FILES(`<p><img src="${PNG}" style="display: block; margin-left: auto; margin-right: auto"></p>`);
    expect(names(centred.document, 'w:jc')[0].getAttribute('w:val')).toBe('center');
    const missing = await FILES('<p><img src="https://example.com/x.png" alt="Lost"></p>', { images: false });
    expect(names(missing.document, 'w:drawing')).toHaveLength(0);
    expect(textOf(missing.document)).toBe('[Lost]');
    const given = await FILES('<p><img src="https://example.com/x.png"></p>', { images: async () => Uint8Array.from(atob(PNG.split(',')[1]), (c) => c.charCodeAt(0)) });
    expect(names(given.document, 'w:drawing')).toHaveLength(1);
  });
});

describe('colours', () => {
  it('reads the colours of CSS', () => {
    expect(cssColor('#dc2626')).toBe('DC2626');
    expect(cssColor('#fff')).toBe('FFFFFF');
    expect(cssColor('rgb(220, 38, 38)')).toBe('DC2626');
    expect(cssColor('rgba(0, 0, 0, 0)')).toBeNull();
    expect(cssColor('red')).toBe('FF0000');
    expect(cssColor('transparent')).toBeNull();
    expect(cssColor('bogus')).toBeNull();
  });
});

describe('a document with everything in it', () => {
  const ALL =
    '<h1>Report</h1><p style="text-align: right" dir="rtl">שלום <strong>עולם</strong></p>' +
    '<div data-layout="row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px">' +
    '<div data-layout="col"><h2>Left</h2><ul><li>a<ol><li>b</li></ol></li></ul></div>' +
    '<div data-layout="col"><div data-callout="caution"><p>Mind <a href="https://example.com">the gap</a></p></div>' +
    '<table><tbody><tr><td><ul><li>in a cell</li></ul><table><tbody><tr><td>nested</td></tr></tbody></table></td><td rowspan="2">x</td></tr><tr><td>y</td></tr></tbody></table></div></div>' +
    '<blockquote><p>one</p><p>two</p></blockquote><aside><p>box</p></aside><pre data-language="python">print(1)\nprint(2)</pre>' +
    '<ul data-task=""><li data-checked="true">done</li></ul><hr><p>end<sup>1</sup> <mark>m</mark> <code>c</code> <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="></p>';

  it('is a well-formed document with every element in the order that Word wants', async () => {
    const { entries, document, text } = await FILES(ALL, { title: 'Report' });
    for (const e of entries) if (e.name.endsWith('.xml') || e.name.endsWith('.rels')) parse(text(e.name));
    assertOrder(document);
    // every paragraph in a cell, a column and the body is a whole <w:p>, and nothing is left open
    expect(names(document, 'w:tbl').length).toBe(3);
    for (const tc of names(document, 'w:tc')) expect(tc.lastElementChild!.tagName).toBe('w:p');
    const body = names(document, 'w:body')[0];
    expect(body.lastElementChild!.tagName).toBe('w:sectPr');
    expect(textOf(document)).toContain('Report');
    expect(textOf(document)).toContain('nested');
    expect(textOf(document)).toContain('Caution');
    expect(names(document, 'w:bidi')).toHaveLength(1);
  });

  it('gives each id once: pictures, relationships and numbers of lists', async () => {
    const { document, text } = await FILES(ALL + ALL);
    const ids = names(document, 'wp:docPr').map((d) => d.getAttribute('id'));
    expect(new Set(ids).size).toBe(ids.length);
    const rels = Array.from(parse(text('word/_rels/document.xml.rels')).getElementsByTagName('Relationship')).map((r) => r.getAttribute('Id'));
    expect(new Set(rels).size).toBe(rels.length);
    const nums = Array.from(parse(text('word/numbering.xml')).getElementsByTagName('w:num')).map((n) => n.getAttribute('w:numId'));
    expect(new Set(nums).size).toBe(nums.length);
    // every number a list uses is one that numbering.xml has
    for (const n of names(document, 'w:numId')) expect(nums).toContain(n.getAttribute('w:val'));
    // every relationship the text uses is there
    for (const el of [...names(document, 'w:hyperlink'), ...names(document, 'a:blip')]) expect(rels).toContain(el.getAttribute('r:id') ?? el.getAttribute('r:embed'));
  });

  it('copes with an empty document, odd input, and a lot of text', async () => {
    for (const html of ['', '<p></p>', '<table></table>', '<ul></ul>', '<p>\u0000\u0008</p>', '<div></div><div><span></span></div>', 'bare text', '<p>' + 'word '.repeat(20000) + '</p>']) {
      const { document } = await FILES(html);
      assertOrder(document);
      expect(names(document, 'w:sectPr')).toHaveLength(1);
    }
  });
});
