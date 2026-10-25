import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expect } from './helpers';

const open = async (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // a sandboxed frame that runs no script is the point of the preview: the browser says so for the tools that look into it, which is not a problem of the page
  page.on('console', (m) => m.type() === 'error' && !/Blocked script execution in 'about:srcdoc'/.test(m.text()) && errors.push(m.text()));
  await page.goto('/demo/parts.html');
  await expect(page.locator('#loaders button')).toHaveCount(7);
  return errors;
};
const rows = (page: Page) => page.locator('#loaded tr');
const kb = (text: string | null) => parseFloat((text ?? '').replace(/[^\d.]/g, ''));

test.describe('the page about the parts of the package', () => {
  test('is plain HTML at first: nothing of the package is loaded until a button is used', async ({ page }) => {
    const errors = await open(page);
    await expect(page.locator('#loaded')).toContainText('Nothing is loaded yet');
    await expect(page.locator('#total-files')).toHaveText('0');
    expect(await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => /\/dist\//.test(e.name)).length)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('a part costs much less than the whole, and shared code is fetched once', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('button', { name: 'aurebesh/docx' }).click();
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('toDocx');
    await expect(rows(page).first()).toContainText('fromDocx');
    const docx = kb(await page.locator('#total-raw').textContent());
    expect(docx).toBeGreaterThan(20);
    expect(docx).toBeLessThan(150);

    await page.getByRole('button', { name: 'aurebesh/mentions' }).click();
    await expect(rows(page)).toHaveCount(2);
    expect(kb(await page.locator('#total-raw').textContent())).toBeLessThan(docx + 40);

    await page.getByRole('button', { name: 'aurebesh', exact: true }).click();
    await expect(rows(page)).toHaveCount(3);
    await expect(rows(page).nth(2)).toContainText('the editor');
    expect(kb(await page.locator('#total-raw').textContent())).toBeGreaterThan(300);
    // the buttons say what is loaded
    await expect(page.getByRole('button', { name: 'aurebesh/docx' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'aurebesh/find' })).toHaveAttribute('aria-pressed', 'false');
    expect(errors).toEqual([]);
  });

  test('writes a Word document from HTML, and reads it back, without the editor', async ({ page }) => {
    const errors = await open(page);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download as .docx' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('from-html.docx');
    const path = await file.path();
    await expect(page.locator('#docx-status')).toContainText('Written: from-html.docx');
    await page.locator('#docx-read').setInputFiles({ name: 'from-html.docx', mimeType: 'application/octet-stream', buffer: readFileSync(path) });
    await expect(page.locator('#docx-status')).toContainText('from-html.docx: read.');
    const source = page.locator('#docx-source');
    await expect(source).toContainText('<h1>A report</h1>');
    await expect(source).toContainText('<strong>bold</strong>');
    await expect(source).toContainText('<a href="https://example.com/">link</a>');
    await expect(source).toContainText('<td>1</td>');
    await expect(source).not.toContainText('<p> </p>'); // the line breaks of the textarea are not paragraphs
    // the preview is a frame that runs no script
    await expect(page.locator('#docx-preview')).toHaveAttribute('sandbox', '');
    await expect(page.frameLocator('#docx-preview').locator('h1')).toHaveText('A report');
    expect(errors).toEqual([]);
  });

  test('a file that is not a Word document says so', async ({ page }) => {
    await open(page);
    await page.locator('#docx-read').setInputFiles({ name: 'x.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('not a zip file') });
    await expect(page.locator('#docx-status')).toContainText('not a Word document');
    await expect(page.locator('#docx-preview')).toHaveCount(0);
  });

  test('lists, accepts and rejects tracked changes, and gives the final text', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.locator('#sug-list tr')).toHaveCount(3);
    await expect(page.locator('#sug-list')).toContainText('replace');
    await expect(page.locator('#sug-final')).toContainText('planned for April, and Ann and Bo will write the announcement.');
    await page.getByRole('button', { name: 'Accept all' }).click();
    await expect(page.locator('#sug-list')).toContainText('None left.');
    await expect(page.locator('#sug-sample')).toHaveText('The launch is planned for April, and Ann and Bo will write the long announcement.'.replace('long ', ''));
    await page.getByRole('button', { name: 'Reset' }).click();
    await page.getByRole('button', { name: 'Reject all' }).click();
    await expect(page.locator('#sug-sample')).toHaveText('The launch is planned for March, and will write the long announcement.');
    expect(errors).toEqual([]);
  });

  test('reads the mentions and the comments of a saved text', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('button', { name: 'Read it' }).click();
    const out = page.locator('#men-out');
    await expect(out).toBeVisible();
    const json = JSON.parse((await out.textContent())!);
    expect(json.mentionsIn).toEqual([
      { id: 'bo', name: 'Bo Jansen' },
      { id: 'chen', name: 'Chen Wei' },
    ]);
    expect(json.commentIdsIn).toEqual(['c1', 'c2']);
    expect(errors).toEqual([]);
  });

  test('loads the texts of a language when it is chosen, and only that one', async ({ page }) => {
    const errors = await open(page);
    await page.locator('#lang').selectOption('nl');
    await expect(page.locator('#lang-out')).toContainText('Vet');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('aurebesh/locales/nl');
    await page.locator('#lang').selectOption('de');
    await expect(page.locator('#lang-out')).toContainText('Fett');
    await expect(rows(page)).toHaveCount(2);
    expect(await page.evaluate(() => performance.getEntriesByType('resource').some((e) => /locales\/fr/.test(e.name)))).toBe(false);
    expect(errors).toEqual([]);
  });

  test('links to the editor demo, and the editor demo to this page, whichever way the demo was opened', async ({ page }) => {
    await open(page);
    await page.getByRole('link', { name: 'The editor' }).click();
    await expect(page.locator('aurebesh-editor')).toBeVisible();
    for (const url of ['/demo/', '/demo', '/demo/index.html']) {
      await page.goto(url);
      await page.getByRole('link', { name: 'Use only what you need' }).click();
      await expect(page.getByRole('heading', { name: 'Use only what you need', level: 1 })).toBeVisible();
    }
  });
});
