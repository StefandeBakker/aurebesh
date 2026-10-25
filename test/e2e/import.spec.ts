import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { deflateRawSync } from 'node:zlib';
import { content, expect, open, undo } from './helpers';

const html = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.instance.getHTML());
const input = (page: Page) => page.locator('.aurebesh-import-input');

// ---- a Word document, deflated as a word processor writes it ------------------------------------------

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"';

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipDeflated(files: Record<string, string>): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, 'utf8');
    const packed = deflateRawSync(data);
    const n = Buffer.from(name);
    const local = Buffer.alloc(30 + n.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(n.length, 26);
    n.copy(local, 30);
    const dir = Buffer.alloc(46 + n.length);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(crc32(data), 16);
    dir.writeUInt32LE(packed.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(n.length, 28);
    dir.writeUInt32LE(offset, 42);
    n.copy(dir, 46);
    parts.push(local, packed);
    central.push(dir);
    offset += local.length + packed.length;
  }
  const size = central.reduce((a, c) => a + c.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}

const run = (text: string, props = '') => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const para = (inner: string, props = '') => `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${inner}</w:p>`;

const STYLES = `<w:styles ${NS}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`;

/** A Word document with a heading, formatted text, a list, a table, a comment and a tracked change. */
function wordFile(): Buffer {
  const body =
    para(run('Quarterly report'), '<w:pStyle w:val="Heading1"/>') +
    para(`${run('Plain, ')}${run('bold', '<w:b/>')}${run(', ')}${run('red', '<w:color w:val="FF0000"/>')}${run(' and ')}<w:commentRangeStart w:id="0"/>${run('commented')}<w:commentRangeEnd w:id="0"/>${run('.')}`) +
    para(`${run('Cost is ')}<w:del w:id="1" w:author="Ann" w:date="2026-10-21T10:00:00Z"><w:r><w:delText>high</w:delText></w:r></w:del><w:ins w:id="2" w:author="Ann" w:date="2026-10-21T10:00:00Z">${run('low')}</w:ins>${run('.')}`) +
    para(run('first'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>') +
    para(run('second'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>') +
    `<w:tbl><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc>${para(run('Q1'))}</w:tc><w:tc>${para(run('Q2'))}</w:tc></w:tr><w:tr><w:tc>${para(run('10'))}</w:tc><w:tc>${para(run('20'))}</w:tc></w:tr></w:tbl>` +
    para('');
  return zipDeflated({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?><w:document ${NS}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:left="1134"/></w:sectPr></w:body></w:document>`,
    'word/styles.xml': `<?xml version="1.0"?>${STYLES}`,
    'word/numbering.xml': `<?xml version="1.0"?><w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`,
    'word/comments.xml': `<?xml version="1.0"?><w:comments ${NS}><w:comment w:id="0" w:author="Bo Li" w:date="2026-10-21T15:10:00Z"><w:p w14:paraId="AAA"><w:r><w:t>Check this number</w:t></w:r></w:p></w:comment></w:comments>`,
  });
}

const start = async (page: Page, options: Record<string, unknown> = {}) => {
  await open(page);
  await page.evaluate((o) => {
    const w = window as any;
    w.imported = [];
    w.errors = [];
    w.ed.addEventListener('imported', (e: CustomEvent) => w.imported.push(e.detail));
    w.ed.addEventListener('error', (e: CustomEvent) => w.errors.push(e.detail.message));
    w.ed.options = { toolbar: ['bold', 'import', 'export'], ...o };
  }, options);
  await content(page).waitFor();
  await page.evaluate(() => (window as any).ed.instance.setHTML('<p>what was here</p>'));
};

const pick = (page: Page, name: string, body: Buffer | string, mimeType = 'application/octet-stream') => input(page).setInputFiles({ name, mimeType, buffer: Buffer.from(body) });

test.describe('opening a file', () => {
  test('the toolbar has a button that opens the file picker, for the formats that can be read', async ({ page }) => {
    await start(page);
    const button = page.locator('.aurebesh-toolbar .aurebesh-cmd-import');
    await expect(button).toBeVisible();
    const chooser = page.waitForEvent('filechooser');
    await button.click();
    await chooser;
    expect(await input(page).getAttribute('accept')).toBe('.docx,.html,.htm,.md,.markdown,.txt,.text');
  });

  test('a Word document (deflated, as Word writes it) replaces the text: headings, formatting, lists and a table', async ({ page }) => {
    await start(page);
    await pick(page, 'report.docx', wordFile());
    await expect(content(page).locator('h1')).toHaveText('Quarterly report');
    const out = await html(page);
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<span style="color: #ff0000">red</span>');
    expect(out).toContain('<ol><li>first</li><li>second</li></ol>');
    expect(out).toMatch(/<table>.*<td>Q1<\/td><td>Q2<\/td>.*<td>10<\/td><td>20<\/td>/);
    expect(out).not.toContain('what was here');
    expect(out).toContain('Cost is low.'); // the changes of the document, accepted: nobody asked for them
    expect(out).not.toContain('commented</span>'); // and no comments when the editor does not have them
    const events = await page.evaluate(() => (window as any).imported);
    expect(events).toEqual([{ name: 'report.docx', format: 'docx', warnings: [] }]);
    await expect(page.locator('.aurebesh-status')).toContainText('Opened report.docx');
  });

  test('one step of undo brings back what was in the editor', async ({ page }) => {
    await start(page);
    await pick(page, 'report.docx', wordFile());
    await expect(content(page).locator('h1')).toBeVisible();
    await content(page).click();
    await undo(page);
    expect(await html(page)).toBe('<p>what was here</p>');
  });

  test('the comments and the tracked changes of the document come over when the editor has the options for them', async ({ page }) => {
    await start(page, { comments: { author: { id: 'me', name: 'Me' } }, suggestions: { author: { id: 'me', name: 'Me' } } });
    await pick(page, 'report.docx', wordFile());
    await expect(content(page).locator('h1')).toBeVisible();
    const threads = await page.evaluate(() => (window as any).ed.instance.getComments());
    expect(threads).toHaveLength(1);
    expect(threads[0].messages[0]).toMatchObject({ text: 'Check this number', author: { name: 'Bo Li' } });
    await expect(content(page).locator('span[data-comment]')).toHaveText('commented');
    const suggestions = await page.evaluate(() => (window as any).ed.instance.getSuggestions());
    expect(suggestions).toHaveLength(2);
    expect(suggestions.map((s: any) => [s.kind, s.author.name])).toEqual([
      ['delete', 'Ann'],
      ['insert', 'Ann'],
    ]);
    // accepting the changes of Word is the same as in the editor
    await page.evaluate(() => (window as any).ed.instance.acceptAllSuggestions());
    expect(await html(page)).toContain('Cost is low.');
  });

  test('the page of the document is the page of the editor when the editor has one', async ({ page }) => {
    await start(page, { page: 'letter' });
    await pick(page, 'report.docx', wordFile());
    await expect(content(page).locator('h1')).toBeVisible();
    const width = await page.evaluate(() => getComputedStyle(document.querySelector('.aurebesh-content')!).width);
    expect(Math.round(parseFloat(width))).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.querySelector('.aurebesh')!.getAttribute('data-page'))).not.toBeNull();
  });

  test('the name of the file is the name of what is exported', async ({ page }) => {
    await start(page);
    await pick(page, 'My report.docx', wordFile());
    await expect(content(page).locator('h1')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.locator('.aurebesh-toolbar .aurebesh-cmd-export').click();
    await page.getByRole('menuitem', { name: /Word/ }).click();
    expect((await download).suggestedFilename()).toBe('My report.docx');
  });

  test('HTML, Markdown and text files', async ({ page }) => {
    await start(page);
    await pick(page, 'page.html', '<h2>From html</h2><p onclick="x()">safe</p><script>alert(1)</script>', 'text/html');
    await expect.poll(() => html(page)).toBe('<h2>From html</h2><p>safe</p>');
    await pick(page, 'notes.md', '# From markdown\n\nSome **bold** text', 'text/markdown');
    await expect.poll(() => html(page)).toBe('<h1>From markdown</h1><p>Some <strong>bold</strong> text</p>');
    await pick(page, 'plain.txt', 'first line\nsecond line\n\nnew <paragraph>', 'text/plain');
    await expect.poll(() => html(page)).toBe('<p>first line<br>second line</p><p>new &lt;paragraph&gt;</p>');
    const formats = await page.evaluate(() => (window as any).imported.map((i: any) => i.format));
    expect(formats).toEqual(['html', 'markdown', 'text']);
  });

  test('a file that cannot be opened says why, and nothing changes', async ({ page }) => {
    await start(page);
    await pick(page, 'scan.pdf', '%PDF-1.4');
    await expect(page.locator('.aurebesh-status')).toContainText('scan.pdf cannot be opened here');
    await pick(page, 'old.doc', 'x');
    await expect(page.locator('.aurebesh-status')).toContainText('old Word file');
    await pick(page, 'broken.docx', 'this is not a zip file');
    await expect(page.locator('.aurebesh-status')).toContainText('not a Word document');
    expect(await html(page)).toBe('<p>what was here</p>');
    const errors = await page.evaluate(() => (window as any).errors);
    expect(errors).toHaveLength(3);
  });

  test('importFile works from code, and a plugin can read a format of its own, such as PDF', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const w = window as any;
      const reader = {
        name: 'reader',
        setup: () => ({ import: { pdf: async (_file: Blob, name: string) => ({ html: '<p>read from ' + name + '</p>', warnings: ['Images are not imported'] }) }, destroy() {} }),
      };
      w.ed.options = { plugins: [reader], toolbar: ['import'] };
    });
    await content(page).waitFor();
    const result = await page.evaluate(async () => (window as any).ed.instance.importFile(new Blob(['%PDF'], { type: 'application/pdf' }), { name: 'scan.pdf' }));
    expect(result).toEqual({ name: 'scan.pdf', format: 'pdf', warnings: ['Images are not imported'] });
    expect(await html(page)).toBe('<p>read from scan.pdf</p>');
    expect(await input(page).evaluate((el) => (el as HTMLInputElement).accept)).toBe('');
    await page.locator('.aurebesh-toolbar .aurebesh-cmd-import').click({ trial: true });
    const chooser = page.waitForEvent('filechooser');
    await page.locator('.aurebesh-toolbar .aurebesh-cmd-import').click();
    await chooser;
    expect(await input(page).getAttribute('accept')).toContain('.pdf');
    await expect(page.locator('.aurebesh-status')).toContainText('Images are not imported');
  });

  test('a read-only editor does not open files', async ({ page }) => {
    await start(page);
    await page.evaluate(() => (window as any).ed.instance.setReadOnly(true));
    const error = await page.evaluate(() =>
      (window as any).ed.instance.importFile(new Blob(['x'], { type: 'text/plain' }), { name: 'a.txt' }).then(
        () => null,
        (e: Error) => e.message,
      ),
    );
    expect(error).toMatch(/read-only/);
    expect(await html(page)).toBe('<p>what was here</p>');
  });
});
