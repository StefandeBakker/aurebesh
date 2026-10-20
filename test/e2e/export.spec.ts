import { test } from '@playwright/test';
import type { Download, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expect, open } from './helpers';
import { unzip } from '../../src/zip';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const start = async (page: Page, html = '<p>Hello <strong>world</strong></p>', options: Record<string, unknown> = {}) => {
  await open(page, html);
  await page.evaluate((o) => ((window as any).ed.options = { toolbar: ['bold', 'export'], ...o }), options);
  await page.locator('.aurebesh-cmd-export').waitFor();
};
const choose = async (page: Page, format: string): Promise<Download> => {
  await page.locator('.aurebesh-cmd-export').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator(`.aurebesh-export-item[data-format="${format}"]`).click()]);
  return download;
};
const read = async (download: Download) => readFileSync((await download.path())!);
const parts = async (download: Download) => {
  const files = unzip(new Uint8Array(await read(download)));
  const text = (name: string) => new TextDecoder().decode(files.find((f) => f.name === name)!.data);
  return { files, text };
};

test.describe('the export menu', () => {
  test('lists the formats, and has a name for the button', async ({ page }) => {
    await start(page);
    await expect(page.locator('.aurebesh-cmd-export')).toHaveAccessibleName('Export');
    await page.locator('.aurebesh-cmd-export').click();
    const items = await page.locator('.aurebesh-export-item').evaluateAll((els) => els.map((e) => [(e as HTMLElement).dataset.format, e.textContent]));
    expect(items).toEqual([['pdf', 'PDF (print)'], ['docx', 'Word (.docx)'], ['html', 'HTML file'], ['markdown', 'Markdown file'], ['text', 'Text file']]);
    await page.keyboard.press('Escape');
  });

  test('Word: saves a .docx that has the text and its formatting', async ({ page }) => {
    await start(page);
    const download = await choose(page, 'docx');
    expect(download.suggestedFilename()).toBe('document.docx');
    const { text, files } = await parts(download);
    expect(files[0].name).toBe('[Content_Types].xml');
    const xml = text('word/document.xml');
    expect(xml).toContain('<w:t xml:space="preserve">Hello </w:t>');
    expect(xml).toMatch(/<w:b\/><w:bCs\/>.*world/);
    expect(text('docProps/core.xml')).toContain('<dc:title>document</dc:title>');
  });

  test('HTML, Markdown and text: save the content in that format', async ({ page }) => {
    await start(page);
    const html = await choose(page, 'html');
    expect(html.suggestedFilename()).toBe('document.html');
    const source = (await read(html)).toString('utf8');
    expect(source).toContain('<!doctype html>');
    expect(source).toContain('Hello');
    expect(source).toMatch(/<title>document<\/title>/);
    const md = await choose(page, 'markdown');
    expect(md.suggestedFilename()).toBe('document.md');
    expect((await read(md)).toString('utf8')).toBe('Hello **world**');
    const txt = await choose(page, 'text');
    expect(txt.suggestedFilename()).toBe('document.txt');
    expect((await read(txt)).toString('utf8')).toBe('Hello world');
  });

  test('PDF: opens the print dialog for the content, with the name as the title of the document', async ({ page }) => {
    await page.addInitScript(() => {
      window.print = () => {
        (window.top as any).__printed = { title: document.title, text: document.body.textContent };
      };
    });
    await start(page, '<p>On paper</p>', { exportName: 'Quarterly report' });
    await page.locator('.aurebesh-cmd-export').click();
    await page.locator('.aurebesh-export-item[data-format="pdf"]').click();
    await page.waitForFunction(() => (window as any).__printed);
    const printed = await page.evaluate(() => (window as any).__printed);
    expect(printed.title).toBe('Quarterly report');
    expect(printed.text).toContain('On paper');
  });

  test('uses the name of the option, and cleans it so that a file system takes it', async ({ page }) => {
    await start(page, '<p>x</p>', { exportName: 'Plan: 2026/Q1 <draft>?' });
    const download = await choose(page, 'docx');
    expect(download.suggestedFilename()).toBe('Plan 2026 Q1 draft.docx');
  });
});

test.describe('the content in the Word document', () => {
  test('has the blocks of the editor: headings, a list, a table, a callout, a picture', async ({ page }) => {
    await start(
      page,
      `<h1>Title</h1><ul><li>one</li><li>two</li></ul><table><tbody><tr><th>H</th><td>cell</td></tr></tbody></table><div data-callout="tip"><p>a tip</p></div><p><img src="${PNG}" alt="dot"></p>`,
    );
    const { text, files } = await parts(await choose(page, 'docx'));
    const xml = text('word/document.xml');
    expect(xml).toContain('<w:pStyle w:val="Heading1"/>');
    expect(xml).toContain('<w:numId w:val="1"/>');
    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('Tip');
    expect(xml).toContain('<wp:docPr');
    expect(files.some((f) => f.name === 'word/media/image1.png')).toBe(true);
  });

  test('has the page of the editor as its page', async ({ page }) => {
    await start(page, '<p>x</p>', { page: 'a5' });
    const { text } = await parts(await choose(page, 'docx'));
    expect(text('word/document.xml')).toMatch(/<w:pgSz w:w="8391" w:h="11906"\/>/);
  });

  test('can be made from code, also by an editor that is read-only and with a name for the format that does not exist', async ({ page }) => {
    await start(page, '<p>text</p>', { readOnly: true });
    const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => (window as any).ed.instance.exec('export', 'docx'))]);
    expect(download.suggestedFilename()).toBe('document.docx');
    const errors = await page.evaluate(async () => {
      const seen: string[] = [];
      (window as any).ed.instance.on('error', (e: Error) => seen.push(e.message));
      await (window as any).ed.instance.export('rtf');
      return seen;
    });
    expect(errors[0]).toContain('no export format "rtf"');
  });

  test('can be a Blob, for a page that wants to send it somewhere', async ({ page }) => {
    await start(page, '<p>send me</p>');
    const info = await page.evaluate(async () => {
      const blob: Blob = await (window as any).ed.instance.toDocx({ title: 'Mail' });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return { type: blob.type, size: blob.size, magic: String.fromCharCode(bytes[0], bytes[1]) };
    });
    expect(info.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(info.magic).toBe('PK');
    expect(info.size).toBeGreaterThan(1000);
  });
});

test.describe('formats of a plugin', () => {
  test('are in the menu too, and are saved with their name as the extension', async ({ page }) => {
    await open(page, '<p>plain</p>');
    await page.evaluate(() => {
      (window as any).ed.options = { toolbar: ['bold', 'export'], plugins: [{ name: 'csv', setup: () => ({ output: { csv: () => 'a,b\n1,2' } }) }] };
    });
    await page.locator('.aurebesh-cmd-export').waitFor();
    await page.locator('.aurebesh-cmd-export').click();
    await expect(page.locator('.aurebesh-export-item[data-format="csv"]')).toHaveText('csv');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.aurebesh-export-item[data-format="csv"]').click()]);
    expect(download.suggestedFilename()).toBe('document.csv');
    expect((await read(download)).toString('utf8')).toBe('a,b\n1,2');
  });
});

test.describe('export of a plugin', () => {
  test('gives a file of any kind (a Blob, also late), and can make a format that the editor has itself', async ({ page }) => {
    await open(page, '<p>plain</p>');
    await page.evaluate(() => {
      (window as any).ed.options = {
        toolbar: ['bold', 'export'],
        plugins: [{ name: 'files', setup: () => ({ export: { odt: async () => new Blob([new Uint8Array([80, 75, 3, 4])], { type: 'application/vnd.oasis.opendocument.text' }), pdf: () => 'my own pdf' } }) }],
      };
    });
    await page.locator('.aurebesh-cmd-export').waitFor();
    await page.locator('.aurebesh-cmd-export').click();
    const items = await page.locator('.aurebesh-export-item').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.format));
    expect(items).toEqual(['pdf', 'docx', 'html', 'markdown', 'text', 'odt']);
    const [odt] = await Promise.all([page.waitForEvent('download'), page.locator('.aurebesh-export-item[data-format="odt"]').click()]);
    expect(odt.suggestedFilename()).toBe('document.odt');
    expect(Array.from(await read(odt))).toEqual([80, 75, 3, 4]);
    await page.locator('.aurebesh-cmd-export').click();
    const [pdf] = await Promise.all([page.waitForEvent('download'), page.locator('.aurebesh-export-item[data-format="pdf"]').click()]);
    expect(pdf.suggestedFilename()).toBe('document.pdf');
    expect((await read(pdf)).toString('utf8')).toBe('my own pdf');
  });
});
