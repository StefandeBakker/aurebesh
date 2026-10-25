import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { fromDocx } from '../src/docx-import';
import { toDocxBytes } from '../src/docx';
import { crc32, unzipAll, utf8, zip } from '../src/zip';
import type { ZipEntry } from '../src/zip';

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' +
  'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"';

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

interface Parts {
  body: string;
  styles?: string;
  numbering?: string;
  rels?: string;
  comments?: string;
  extended?: string;
  media?: Record<string, Uint8Array>;
  core?: string;
  sect?: string;
}

const xml = (root: string, inner: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><${root} ${NS}>${inner}</${root}>`;

function build(parts: Parts): ZipEntry[] {
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: utf8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>') },
    { name: 'word/document.xml', data: utf8(xml('w:document', `<w:body>${parts.body}${parts.sect ?? ''}</w:body>`)) },
  ];
  if (parts.styles) entries.push({ name: 'word/styles.xml', data: utf8(xml('w:styles', parts.styles)) });
  if (parts.numbering) entries.push({ name: 'word/numbering.xml', data: utf8(xml('w:numbering', parts.numbering)) });
  if (parts.rels) entries.push({ name: 'word/_rels/document.xml.rels', data: utf8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${parts.rels}</Relationships>`) });
  if (parts.comments) entries.push({ name: 'word/comments.xml', data: utf8(xml('w:comments', parts.comments)) });
  if (parts.extended) entries.push({ name: 'word/commentsExtended.xml', data: utf8(xml('w15:commentsEx', parts.extended)) });
  if (parts.core) entries.push({ name: 'docProps/core.xml', data: utf8(`<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">${parts.core}</cp:coreProperties>`) });
  for (const [name, data] of Object.entries(parts.media ?? {})) entries.push({ name, data });
  return entries;
}

const docx = (parts: Parts) => zip(build(parts));

/** A ZIP file with the files deflated, as a word processor writes it. */
function deflated(entries: ZipEntry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = utf8(e.name);
    const packed = new Uint8Array(deflateRawSync(e.data));
    const crc = crc32(e.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 8, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, packed.length, true);
    lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const dir = new Uint8Array(46 + name.length);
    const dv = new DataView(dir.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint16(10, 8, true);
    dv.setUint32(16, crc, true);
    dv.setUint32(20, packed.length, true);
    dv.setUint32(24, e.data.length, true);
    dv.setUint16(28, name.length, true);
    dv.setUint32(42, offset, true);
    dir.set(name, 46);
    parts.push(local, packed);
    central.push(dir);
    offset += local.length + packed.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, size, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const p = (text: string, props = '') => `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const run = (text: string, rPr = '') => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;

const STYLES = `
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading5"><w:name w:val="heading 5"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:rPr><w:i/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr></w:style>
  <w:style w:type="character" w:styleId="Strong"><w:name w:val="Strong"/><w:rPr><w:b/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Big"><w:name w:val="Big"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="40"/><w:color w:val="FF0000"/></w:rPr></w:style>`;

const NUMBERING = `
  <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
  <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="lowerLetter"/></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>`;

const num = (id: number, level = 0) => `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${id}"/></w:numPr>`;

describe('reading a ZIP file', () => {
  it('reads stored and deflated files, and the names are the ones that were written', async () => {
    const entries = [
      { name: 'a.txt', data: utf8('stored text') },
      { name: 'dir/b.txt', data: utf8('x'.repeat(5000)) },
    ];
    for (const bytes of [zip(entries), deflated(entries)]) {
      const files = await unzipAll(bytes);
      expect(Array.from(files.keys())).toEqual(['a.txt', 'dir/b.txt']);
      expect(new TextDecoder().decode(files.get('a.txt'))).toBe('stored text');
      expect(files.get('dir/b.txt')!.length).toBe(5000);
    }
  });

  it('does not unpack what is larger than the limits say, and does not read what is not a ZIP file', async () => {
    const big = deflated([{ name: 'big.txt', data: new Uint8Array(100000) }]);
    await expect(unzipAll(big, { maxSize: 50000 })).rejects.toThrow(/too large/);
    await expect(unzipAll(zip([{ name: 'a', data: utf8('x') }, { name: 'b', data: utf8('y') }]), { maxEntries: 1 })).rejects.toThrow(/too many/);
    await expect(unzipAll(utf8('not a zip file at all, just text'))).rejects.toThrow(/Not a ZIP/);
  });
});

describe('a document of the exporter, read back', () => {
  it('gives back the headings, the text and its formatting, the lists, the links and the table', async () => {
    const html =
      '<h1>Title</h1><p>Some <strong>bold</strong>, <em>italic</em>, <u>underlined</u>, <s>struck</s>, x<sup>2</sup> and <a href="https://example.com/">a link</a>.</p>' +
      '<ul><li>one<ul><li>nested</li></ul></li><li>two</li></ul><ol><li>first</li><li>second</li></ol>' +
      '<table><tbody><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>';
    const out = await fromDocx(await toDocxBytes(html));
    expect(out.html).toContain('<h1>Title</h1>');
    expect(out.html).toContain('<strong>bold</strong>');
    expect(out.html).toContain('<em>italic</em>');
    expect(out.html).toContain('<u>underlined</u>');
    expect(out.html).toContain('<s>struck</s>');
    expect(out.html).toContain('<sup>2</sup>');
    expect(out.html).toContain('<a href="https://example.com/">a link</a>');
    expect(out.html).toMatch(/<ul><li>one<ul><li>nested<\/li><\/ul><\/li><li>two<\/li><\/ul>/);
    expect(out.html).toMatch(/<ol><li>first<\/li><li>second<\/li><\/ol>/);
    expect(out.html).toMatch(/<table>.*<th[^>]*>A<\/th><th[^>]*>B<\/th>.*<td>1<\/td><td>2<\/td>/);
    expect(out.html).not.toContain('<strong>A');
    expect(out.html.endsWith('</table>')).toBe(true);
  });

  it('gives back a table with merged cells, a picture, the colour and the size of the page', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const html = `<p><span style="color: #ff0000">red</span> <img src="${png}" alt="a pixel" width="40"></p><table><tbody><tr><td colspan="2">wide</td></tr><tr><td rowspan="2">tall</td><td>x</td></tr><tr><td>y</td></tr></tbody></table>`;
    const out = await fromDocx(await toDocxBytes(html, { page: { width: 210, height: 297, margin: 20 } }));
    expect(out.html).toContain('color: #ff0000');
    expect(out.html).toMatch(/<img src="data:image\/png;base64,[^"]+" alt="a pixel" width="\d+">/);
    expect(out.html).toContain('colspan="2"');
    expect(out.html).toContain('rowspan="2"');
    expect(out.page).toEqual({ width: '210mm', height: '297mm', margin: '20mm' });
  });
});

describe('HTML with line breaks and an indent between the blocks, written as a Word document', () => {
  it('has no empty paragraphs from them, and keeps the space between words', async () => {
    const html = '<h1>Title</h1>\n  <p>One <b>two</b> <i>three</i></p>\n\n  <ul>\n    <li>a</li>\n  </ul>\n  <p>End</p>\n';
    const out = await fromDocx(await toDocxBytes(html));
    expect(out.html).toBe('<h1>Title</h1><p>One <strong>two</strong> <em>three</em></p><ul><li>a</li></ul><p>End</p>');
  });
});

describe('a document of a word processor', () => {
  it('turns the styles of headings into headings, with the levels beyond three as the third', async () => {
    const out = await fromDocx(docx({ styles: STYLES, body: p('One', '<w:pStyle w:val="Heading1"/>') + p('Two', '<w:pStyle w:val="Heading2"/>') + p('Five', '<w:pStyle w:val="Heading5"/>') + p('Text') }));
    expect(out.html).toBe('<h1>One</h1><h2>Two</h2><h3>Five</h3><p>Text</p>');
  });

  it('does not write the formatting that the style or the document says for everything: bold in a heading, the size of the text', async () => {
    const out = await fromDocx(docx({ styles: STYLES, body: p('Heading', '<w:pStyle w:val="Heading1"/>') + p('Normal text') }));
    expect(out.html).not.toContain('strong');
    expect(out.html).not.toContain('style=');
  });

  it('reads the formatting of a run, of its character style and of the style of the paragraph', async () => {
    const body =
      `<w:p>${run('bold', '<w:b/>')}${run('italic', '<w:i/>')}${run('strong', '<w:rStyle w:val="Strong"/>')}${run('off', '<w:b w:val="0"/>')}` +
      `${run('under', '<w:u w:val="single"/>')}${run('none', '<w:u w:val="none"/>')}${run('strike', '<w:strike/>')}${run('sup', '<w:vertAlign w:val="superscript"/>')}${run('sub', '<w:vertAlign w:val="subscript"/>')}</w:p>` +
      p('quoted', '<w:pStyle w:val="Quote"/>') +
      `<w:p><w:pPr><w:pStyle w:val="Big"/></w:pPr>${run('big and red')}</w:p>` +
      `<w:p>${run('small', '<w:sz w:val="18"/>')}${run('same size', '<w:sz w:val="22"/>')}${run('colour', '<w:color w:val="00FF00"/>')}${run('auto', '<w:color w:val="auto"/>')}${run('mark', '<w:highlight w:val="yellow"/>')}${run('fill', '<w:shd w:fill="ABCDEF"/>')}${run('font', '<w:rFonts w:ascii="Courier New"/>')}${run('same font', '<w:rFonts w:ascii="Calibri"/>')}${run('caps', '<w:caps/>')}</w:p>`;
    const out = await fromDocx(docx({ styles: STYLES, body }));
    const [first, quote, big, last] = out.html.match(/<blockquote>.*?<\/blockquote>|<p>.*?<\/p>/g)!;
    expect(first).toBe('<p><strong>bold</strong><em>italic</em><strong>strong</strong>off<u>under</u>none<s>strike</s><sup>sup</sup><sub>sub</sub></p>');
    expect(quote).toBe('<blockquote><p><em>quoted</em></p></blockquote>');
    expect(big).toContain('font-size: 20pt');
    expect(big).toContain('color: #ff0000');
    expect(last).toContain('<span style="font-size: 9pt">small</span>');
    expect(last).toContain('same size');
    expect(last).not.toContain('11pt');
    expect(last).toContain('<span style="color: #00ff00">colour</span>');
    expect(last).not.toContain('auto</span>');
    expect(last).toContain('background-color: #ffff00');
    expect(last).toContain('background-color: #abcdef');
    expect(last).toContain("font-family: 'Courier New'");
    expect(last).not.toContain('Calibri');
    expect(last).toContain('text-transform: uppercase');
  });

  it('puts pieces of the same formatting together', async () => {
    const body = `<w:p>${run('a', '<w:b/>')}${run('b', '<w:b/>')}${run('c')}${run('d')}</w:p>`;
    expect((await fromDocx(docx({ body }))).html).toBe('<p><strong>ab</strong>cd</p>');
  });

  it('keeps spaces, tabs and line breaks, and escapes what is HTML', async () => {
    const body = `<w:p>${run('  two  spaces &amp; &lt;b&gt;')}<w:r><w:tab/><w:t>after tab</w:t></w:r><w:r><w:br/><w:t>new line</w:t></w:r><w:r><w:br w:type="page"/></w:r></w:p>`;
    const html = (await fromDocx(docx({ body }))).html;
    expect(html).toContain('<p>  two  spaces &amp; &lt;b&gt;');
    expect(html).toContain('    after tab');
    expect(html).toContain('<br>new line');
    expect(html.match(/<br>/g)).toHaveLength(1); // a page break is not a line break
  });

  it('makes lists of the paragraphs that are numbered: bulleted and numbered, nested, and the list of a style', async () => {
    const body =
      p('a', num(1)) + p('b', num(1)) + p('b1', num(1, 1)) + p('c', num(1)) +
      p('between') +
      p('one', num(2)) + p('two', num(2)) + p('two-a', num(2, 1)) +
      p('styled', '<w:pStyle w:val="ListBullet"/>');
    const out = await fromDocx(docx({ styles: STYLES, numbering: NUMBERING, body }));
    expect(out.html).toBe(
      '<ul><li>a</li><li>b<ul><li>b1</li></ul></li><li>c</li></ul><p>between</p>' +
        '<ol><li>one</li><li>two<ol><li>two-a</li></ol></li></ol><ul><li>styled</li></ul>',
    );
  });

  it('starts a new list when the kind changes at the same level, and closes the lists for a table', async () => {
    const out = await fromDocx(docx({ numbering: NUMBERING, body: p('a', num(1)) + p('1', num(2)) + '<w:tbl><w:tblGrid><w:gridCol w:w="100"/></w:tblGrid><w:tr><w:tc>' + p('cell') + '</w:tc></w:tr></w:tbl>' + p('b', num(1)) }));
    expect(out.html).toBe('<ul><li>a</li></ul><ol><li>1</li></ol><table><colgroup><col style="width: 100%"></colgroup><tbody><tr><td>cell</td></tr></tbody></table><ul><li>b</li></ul>');
  });

  it('reads the alignment, the indent and the direction of a paragraph', async () => {
    const body = p('c', '<w:jc w:val="center"/>') + p('r', '<w:jc w:val="right"/>') + p('j', '<w:jc w:val="both"/>') + p('i', '<w:ind w:left="720"/>') + p('rtl', '<w:bidi/>');
    const out = await fromDocx(docx({ body }));
    expect(out.html).toContain('<p style="text-align: center">c</p>');
    expect(out.html).toContain('<p style="text-align: right">r</p>');
    expect(out.html).toContain('<p style="text-align: justify">j</p>');
    expect(out.html).toContain('<p style="margin-inline-start: 24px">i</p>'.replace('24px', '48px'));
    expect(out.html).toContain('<p dir="rtl">rtl</p>');
  });

  it('reads links: outside the document, in a field, and not the ones to a place in the document', async () => {
    const body =
      `<w:p><w:hyperlink r:id="rId5">${run('site')}</w:hyperlink> <w:hyperlink w:anchor="top">${run('inside')}</w:hyperlink> ` +
      `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> HYPERLINK "https://field.example/" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run('field link')}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
    const out = await fromDocx(docx({ body, rels: '<Relationship Id="rId5" Type="x/hyperlink" Target="https://example.com/" TargetMode="External"/>' }));
    expect(out.html).toContain('<a href="https://example.com/">site</a>');
    expect(out.html).toContain('inside');
    expect(out.html).not.toContain('<a href="#');
    expect(out.html).toContain('<a href="https://field.example/">field link</a>');
    expect(out.html).not.toContain('HYPERLINK');
  });

  it('reads tables: header rows, merged cells in both directions, column widths, shading', async () => {
    const cell = (text: string, props = '') => `<w:tc>${props ? `<w:tcPr>${props}</w:tcPr>` : ''}${p(text)}</w:tc>`;
    const body =
      '<w:tbl><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="1000"/><w:gridCol w:w="1000"/></w:tblGrid>' +
      `<w:tr><w:trPr><w:tblHeader/></w:trPr>${cell('H1')}${cell('H2')}${cell('H3')}</w:tr>` +
      `<w:tr>${cell('wide', '<w:gridSpan w:val="2"/>')}${cell('x', '<w:shd w:fill="FFCC00"/><w:vAlign w:val="center"/>')}</w:tr>` +
      `<w:tr>${cell('tall', '<w:vMerge w:val="restart"/>')}${cell('y')}${cell('z')}</w:tr>` +
      `<w:tr>${cell('', '<w:vMerge/>')}${cell('y2')}${cell('z2')}</w:tr></w:tbl>`;
    const out = await fromDocx(docx({ body }));
    expect(out.html).toContain('<col style="width: 60%"><col style="width: 20%"><col style="width: 20%">');
    expect(out.html).toContain('<tr><th>H1</th><th>H2</th><th>H3</th></tr>');
    expect(out.html).toContain('<td colspan="2">wide</td>');
    expect(out.html).toContain('<td style="background-color: #ffcc00; vertical-align: middle">x</td>');
    expect(out.html).toContain('<td rowspan="2">tall</td><td>y</td><td>z</td></tr><tr><td>y2</td><td>z2</td></tr>');
  });

  it('puts the blocks of a cell with more than a paragraph in it, a list or a table in it', async () => {
    const body = `<w:tbl><w:tblGrid><w:gridCol w:w="100"/></w:tblGrid><w:tr><w:tc>${p('one')}${p('two')}</w:tc></w:tr><w:tr><w:tc>${p('li', num(1))}</w:tc></w:tr></w:tbl>`;
    const out = await fromDocx(docx({ numbering: NUMBERING, body }));
    expect(out.html).toContain('<td><p>one</p><p>two</p></td>');
    expect(out.html).toContain('<td><ul><li>li</li></ul></td>');
  });

  it('reads pictures, with their size and description, and leaves out what a browser does not show', async () => {
    const drawing = (id: string, descr: string) =>
      `<w:r><w:drawing><wp:inline><wp:extent cx="952500" cy="476250"/><wp:docPr id="1" name="Picture" descr="${descr}"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="${id}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    const body = `<w:p>${drawing('rId1', 'A pixel')}${drawing('rId2', 'metafile')}${drawing('rId9', 'missing')}</w:p>`;
    const out = await fromDocx(
      docx({
        body,
        rels: '<Relationship Id="rId1" Type="x/image" Target="media/image1.png"/><Relationship Id="rId2" Type="x/image" Target="media/image2.emf"/>',
        media: { 'word/media/image1.png': PNG, 'word/media/image2.emf': new Uint8Array([1, 2, 3]) },
      }),
    );
    expect(out.html).toMatch(/^<p><img src="data:image\/png;base64,[A-Za-z0-9+/=]+" alt="A pixel" width="100"><\/p>$/);
    expect(out.warnings.join(' ')).toMatch(/2 pictures could not be imported/);
    const without = await fromDocx(docx({ body, rels: '<Relationship Id="rId1" Type="x/image" Target="media/image1.png"/>', media: { 'word/media/image1.png': PNG } }), { images: false });
    expect(without.html).not.toContain('<img');
  });

  it('leaves out a picture that is larger than allowed', async () => {
    const body = `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="9525" cy="9525"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId1"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
    const out = await fromDocx(docx({ body, rels: '<Relationship Id="rId1" Type="x/image" Target="media/i.png"/>', media: { 'word/media/i.png': PNG } }), { maxImageSize: 10 });
    expect(out.html).not.toContain('<img');
    expect(out.warnings).toHaveLength(1);
  });

  it('takes the text of a text box as a box after the paragraph, once, and not the fallback of it', async () => {
    const box = `<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wps:wsp><wps:txbx><w:txbxContent>${p('in the box')}</w:txbxContent></wps:txbx></wps:wsp></w:drawing></mc:Choice><mc:Fallback><w:pict><w:txbxContent>${p('in the box')}</w:txbxContent></w:pict></mc:Fallback></mc:AlternateContent></w:r>`;
    const out = await fromDocx(docx({ body: `<w:p>${run('before')}${box}</w:p>${p('after')}` }));
    expect(out.html).toBe('<p>before</p><aside><p>in the box</p></aside><p>after</p>');
  });

  it('reads the page and the title', async () => {
    const out = await fromDocx(
      docx({ body: p('x'), sect: '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1134"/></w:sectPr>', core: '<dc:title>My document</dc:title>' }),
    );
    expect(out.page).toEqual({ width: '210mm', height: '297mm', margin: '20mm' });
    expect(out.title).toBe('My document');
    expect((await fromDocx(docx({ body: p('x') }))).page).toBeUndefined();
  });

  it('is the same for a ZIP file that is deflated', async () => {
    const entries = build({ styles: STYLES, body: p('Heading', '<w:pStyle w:val="Heading1"/>') + p('Text '.repeat(500)) });
    const out = await fromDocx(deflated(entries));
    expect(out.html).toMatch(/^<h1>Heading<\/h1><p>Text Text/);
  });
});

describe('the comments and the tracked changes of a document', () => {
  const COMMENTS =
    '<w:comment w:id="0" w:author="Ann Smith" w:date="2026-10-21T13:40:00Z" w14:paraId="AAA"><w:p w14:paraId="AAA"><w:r><w:t>Why March?</w:t></w:r></w:p></w:comment>' +
    '<w:comment w:id="1" w:author="Bo Li" w:date="2026-10-21T15:10:00Z"><w:p w14:paraId="BBB"><w:r><w:t>Budget.</w:t></w:r></w:p></w:comment>' +
    '<w:comment w:id="2" w:author="Cy" w:date="2026-10-22T08:00:00Z"><w:p w14:paraId="CCC"><w:r><w:t>Unused</w:t></w:r></w:p></w:comment>';
  const EXTENDED = '<w15:commentEx w15:paraId="AAA" w15:done="1"/><w15:commentEx w15:paraId="BBB" w15:paraIdParent="AAA"/><w15:commentEx w15:paraId="CCC"/>';
  const BODY = `<w:p>${run('The launch is ')}<w:commentRangeStart w:id="0"/><w:commentRangeStart w:id="1"/>${run('in March')}<w:commentRangeEnd w:id="0"/><w:commentRangeEnd w:id="1"/>${run(' or so.')}</w:p>`;

  it('turns the comments into threads, with the replies, the author, the date and whether it was settled, on the text they are about', async () => {
    const out = await fromDocx(docx({ body: BODY, comments: COMMENTS, extended: EXTENDED }));
    expect(out.html).toBe('<p>The launch is <span data-comment="w-c0">in March</span> or so.</p>');
    expect(out.comments).toHaveLength(1); // the reply is in the thread, and the comment on no text is not
    const [thread] = out.comments;
    expect(thread.id).toBe('w-c0');
    expect(thread.resolved).toBe(true);
    expect(thread.messages.map((m) => [m.author.name, m.text, m.created])).toEqual([
      ['Ann Smith', 'Why March?', '2026-10-21T13:40:00.000Z'],
      ['Bo Li', 'Budget.', '2026-10-21T15:10:00.000Z'],
    ]);
    expect(thread.messages[0].author.id).toMatch(/^a-ann-smith$/);
  });

  it('makes a comment over more paragraphs a mark in each', async () => {
    const body = `<w:commentRangeStart w:id="0"/>${p('one')}${p('two')}<w:commentRangeEnd w:id="0"/>${p('three')}`;
    const out = await fromDocx(docx({ body, comments: COMMENTS }));
    expect(out.html).toBe('<p><span data-comment="w-c0">one</span></p><p><span data-comment="w-c0">two</span></p><p>three</p>');
  });

  it('leaves the comments out when the options say so', async () => {
    const out = await fromDocx(docx({ body: BODY, comments: COMMENTS, extended: EXTENDED }), { comments: false });
    expect(out.html).toBe('<p>The launch is in March or so.</p>');
    expect(out.comments).toEqual([]);
  });

  const CHANGES = `<w:p>${run('Keep ')}<w:del w:id="1" w:author="Ann" w:date="2026-10-21T10:00:00Z"><w:r><w:delText xml:space="preserve">old </w:delText></w:r></w:del><w:ins w:id="2" w:author="Ann" w:date="2026-10-21T10:00:00Z">${run('new ')}</w:ins>${run('text')}</w:p>`;

  it('gives the text as it reads when the changes are accepted, unless they are asked for', async () => {
    expect((await fromDocx(docx({ body: CHANGES }))).html).toBe('<p>Keep new text</p>');
  });

  it('keeps the tracked changes as suggestions, with the author and the date', async () => {
    const out = await fromDocx(docx({ body: CHANGES }), { changes: 'mark' });
    expect(out.html).toMatch(
      /^<p>Keep <span data-suggestion="w-s1" data-kind="delete" data-author="a-ann" data-name="Ann" data-date="2026-10-21T10:00:00.000Z">old <\/span><span data-suggestion="w-s2" data-kind="insert" data-author="a-ann" data-name="Ann" data-date="2026-10-21T10:00:00.000Z">new <\/span>text<\/p>$/,
    );
  });
});

describe('what cannot be read', () => {
  it('says so for a file that is not a Word document', async () => {
    await expect(fromDocx(utf8('plain text'))).rejects.toThrow(/not a Word document/);
    await expect(fromDocx(zip([{ name: 'a.txt', data: utf8('x') }]))).rejects.toThrow(/word\/document\.xml is missing/);
    await expect(fromDocx(zip([{ name: 'word/document.xml', data: utf8('<w:document') }]))).rejects.toThrow(/not a Word document that can be read/);
  });

  it('does not read XML that has a definition of its own, which is how entities are made to blow up', async () => {
    const evil = '<?xml version="1.0"?><!DOCTYPE d [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>&b;</w:t></w:r></w:p></w:body></w:document>';
    await expect(fromDocx(zip([{ name: 'word/document.xml', data: utf8(evil) }]))).rejects.toThrow(/definition of its own/);
  });

  it('is empty for a document without text', async () => {
    const out = await fromDocx(docx({ body: '' }));
    expect(out.html).toBe('');
    expect(out.comments).toEqual([]);
    expect(out.warnings).toEqual([]);
  });

  it('warns about footnotes, and keeps going', async () => {
    const out = await fromDocx(docx({ body: `<w:p>${run('text')}<w:r><w:footnoteReference w:id="2"/></w:r></w:p>` }));
    expect(out.html).toBe('<p>text</p>');
    expect(out.warnings.join(' ')).toMatch(/footnotes/);
  });
});
