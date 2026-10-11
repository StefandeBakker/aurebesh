import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { content, expect, open } from './helpers';

const MM = 96 / 25.4;
const mm = (n: number) => n * MM;

const box = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector('.aurebesh-content') as HTMLElement;
    const r = c.getBoundingClientRect();
    const s = getComputedStyle(c);
    return { width: r.width, height: r.height, padLeft: parseFloat(s.paddingLeft), bg: s.backgroundImage, shadow: s.boxShadow, root: document.querySelector('.aurebesh')!.getBoundingClientRect().width };
  });

const setAttr = (page: Page, name: string, value: string | null) =>
  page.evaluate(([n, v]) => ((window as any).ed as HTMLElement)[v === null ? 'removeAttribute' : 'setAttribute'](n as string, v as string), [name, value] as const);

test.describe('page format', () => {
  test('without a format the editor is responsive: no sheet, as wide as its container', async ({ page }) => {
    await open(page);
    const b = await box(page);
    expect(await page.locator('.aurebesh').getAttribute('data-page')).toBeNull();
    expect(b.width).toBeGreaterThan(b.root - 4);
    expect(b.shadow).toBe('none');
  });

  test('page="a4" shows a sheet of 210 x 297 mm with its margin, on a desk', async ({ page }) => {
    await open(page);
    await setAttr(page, 'page', 'a4');
    const b = await box(page);
    expect(Math.abs(b.width - mm(210))).toBeLessThan(1);
    expect(Math.abs(b.height - mm(297))).toBeLessThan(1);
    expect(Math.abs(b.padLeft - mm(20))).toBeLessThan(1);
    expect(b.shadow).not.toBe('none');
    await expect(page.locator('.aurebesh')).toHaveAttribute('data-page', 'a4');
    await expect(page.locator('.aurebesh')).toHaveAttribute('data-paged', '');
  });

  test('a ticket format has a width but no height, and no page breaks', async ({ page }) => {
    await open(page);
    await setAttr(page, 'page', 'ticket-80');
    const b = await box(page);
    expect(Math.abs(b.width - mm(80))).toBeLessThan(1);
    expect(b.height).toBeLessThan(mm(80));
    expect(b.bg).toBe('none');
    await expect(page.locator('.aurebesh')).not.toHaveAttribute('data-paged', '');
  });

  test('a width in px or mm works, landscape swaps the sides, and "responsive" takes the sheet away again', async ({ page }) => {
    await open(page);
    await setAttr(page, 'page', '500px');
    expect(Math.abs((await box(page)).width - 500)).toBeLessThan(1);
    await setAttr(page, 'page', 'a4');
    await setAttr(page, 'page-orientation', 'landscape');
    const b = await box(page);
    expect(Math.abs(b.width - mm(297))).toBeLessThan(1);
    expect(Math.abs(b.height - mm(210))).toBeLessThan(1);
    await setAttr(page, 'page-margin', '5mm');
    expect(Math.abs((await box(page)).padLeft - mm(5))).toBeLessThan(1);
    await setAttr(page, 'page', 'responsive');
    expect(await page.locator('.aurebesh').getAttribute('data-page')).toBeNull();
    expect((await box(page)).shadow).toBe('none');
  });

  test('a page break is marked at the bottom of every page, and the content makes more pages as it grows', async ({ page }) => {
    await open(page);
    await setAttr(page, 'page', 'a5');
    expect((await box(page)).bg).toContain('repeating-linear-gradient');
    expect(await page.evaluate(() => (window as any).ed.instance.getPageCount())).toBe(1);
    await page.evaluate(() => (window as any).ed.instance.setHTML(Array.from({ length: 60 }, (_, i) => `<p>Line number ${i}</p>`).join('')));
    const b = await box(page);
    const pages = await page.evaluate(() => (window as any).ed.instance.getPageCount());
    expect(pages).toBeGreaterThan(1);
    expect(pages).toBe(Math.ceil(b.height / mm(210) - 0.001));
  });

  test('setPage works from code, tells listeners, and an invalid format throws and changes nothing', async ({ page }) => {
    await open(page);
    const result = await page.evaluate(() => {
      const el = (window as any).ed;
      const seen: any[] = [];
      el.addEventListener('page', (e: CustomEvent) => seen.push(e.detail && e.detail.name));
      el.instance.setPage('a6');
      el.instance.setPage({ width: '90mm', margin: '3mm' });
      let error = '';
      try {
        el.instance.setPage('nonsense');
      } catch (e) {
        error = (e as Error).message;
      }
      const after = el.instance.getPage();
      el.instance.setPage(null);
      return { seen, error, after, final: el.instance.getPage() };
    });
    expect(result.seen).toEqual(['a6', 'custom', null]);
    expect(result.error).toMatch(/invalid page/);
    expect(result.after).toMatchObject({ name: 'custom', width: '90mm' });
    expect(result.final).toBeNull();
  });

  test('an invalid page attribute reports an error event and the editor stays usable', async ({ page }) => {
    await open(page);
    const error = await page.evaluate(() => {
      const el = (window as any).ed as HTMLElement;
      return new Promise<string>((resolve) => {
        el.addEventListener('error', (e) => resolve(((e as unknown) as CustomEvent<Error>).detail.message), { once: true });
        el.setAttribute('page', 'huge');
      });
    });
    expect(error).toMatch(/invalid page|Aurebesh/);
    await content(page).click();
    await page.keyboard.type('still works');
    expect(await content(page).innerText()).toContain('still works');
  });

  test('the page select in the toolbar changes the format and follows it', async ({ page }) => {
    await open(page);
    await page.evaluate(() => ((window as any).ed.options = { toolbar: ['page', 'bold'] }));
    const select = page.locator('select.aurebesh-pagesel');
    await expect(select).toHaveValue('responsive');
    await select.selectOption('a4');
    await expect(page.locator('.aurebesh')).toHaveAttribute('data-page', 'a4');
    expect(Math.abs((await box(page)).width - mm(210))).toBeLessThan(1);
    await page.evaluate(() => (window as any).ed.instance.setPage('ticket-58'));
    await expect(select).toHaveValue('ticket-58');
    await page.evaluate(() => (window as any).ed.instance.setPage('123px'));
    await expect(select).toHaveValue('custom');
    await select.selectOption('responsive');
    expect(await page.locator('.aurebesh').getAttribute('data-page')).toBeNull();
  });

  test('the orientation button turns the sheet between portrait and landscape, and is only on for paper with a height', async ({ page }) => {
    await open(page);
    await page.evaluate(() => ((window as any).ed.options = { toolbar: ['page', 'orientation'] }));
    const turn = page.locator('button.aurebesh-orientation');
    await expect(turn).toBeDisabled(); // responsive: nothing to turn
    await page.evaluate(() => (window as any).ed.instance.setPage('ticket-80'));
    await expect(turn).toBeDisabled(); // a roll has no height
    await page.evaluate(() => (window as any).ed.instance.setPage('a4'));
    await expect(turn).toBeEnabled();
    await expect(turn).toHaveAttribute('aria-pressed', 'false');

    await turn.click();
    await expect(turn).toHaveAttribute('aria-pressed', 'true');
    let b = await box(page);
    expect(Math.abs(b.width - mm(297))).toBeLessThan(1);
    expect(Math.abs(b.height - mm(210))).toBeLessThan(1);
    await expect(page.locator('.aurebesh')).toHaveAttribute('data-page', 'a4'); // still A4, just turned

    await turn.click();
    await expect(turn).toHaveAttribute('aria-pressed', 'false');
    b = await box(page);
    expect(Math.abs(b.width - mm(210))).toBeLessThan(1);
  });

  test('choosing another paper keeps the sheet turned, and the margin follows that paper', async ({ page }) => {
    await open(page);
    await page.evaluate(() => ((window as any).ed.options = { toolbar: ['page', 'orientation'] }));
    await page.locator('select.aurebesh-pagesel').selectOption('a4');
    await page.locator('button.aurebesh-orientation').click();
    await page.locator('select.aurebesh-pagesel').selectOption('a5');
    const b = await box(page);
    expect(Math.abs(b.width - mm(210))).toBeLessThan(1); // A5 landscape: 210 x 148
    expect(Math.abs(b.height - mm(148))).toBeLessThan(1);
    expect(Math.abs(b.padLeft - mm(15))).toBeLessThan(1);
    await expect(page.locator('button.aurebesh-orientation')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('select.aurebesh-pagesel').selectOption('ticket-80');
    await expect(page.locator('button.aurebesh-orientation')).toBeDisabled();
  });

  test('setPageOrientation works from code, turns a width-and-height page too, and tells listeners', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const el = (window as any).ed;
      const ed = el.instance;
      const seen: boolean[] = [];
      el.addEventListener('page', (e: CustomEvent) => seen.push(e.detail.landscape));
      ed.setPageOrientation('landscape'); // no page yet: nothing happens
      ed.setPage({ width: '100mm', height: '150mm', margin: '5mm' });
      ed.setPageOrientation('landscape');
      const turned = ed.getPage();
      ed.setPageOrientation('portrait');
      const back = ed.getPage();
      ed.setPage('ticket-58');
      ed.setPageOrientation('landscape');
      return { seen, turned, back, ticket: ed.getPage() };
    });
    expect(r.turned).toMatchObject({ width: '150mm', height: '100mm', margin: '5mm', landscape: true });
    expect(r.back).toMatchObject({ width: '100mm', height: '150mm', landscape: false });
    expect(r.ticket).toMatchObject({ width: '58mm', height: null, landscape: false });
    expect(r.seen.slice(0, 3)).toEqual([false, true, false]);
  });

  test('the format is not part of the saved HTML, and changing it leaves the content alone', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).ed.instance.setHTML('<p>hello</p>'));
    const before = await page.evaluate(() => (window as any).ed.value);
    await setAttr(page, 'page', 'a4');
    expect(await page.evaluate(() => (window as any).ed.value)).toBe(before);
  });

  test('the sheet keeps its content editable and the tools working', async ({ page }) => {
    await open(page);
    await setAttr(page, 'page', 'a4');
    await content(page).click();
    await page.keyboard.type('abc');
    await page.keyboard.press('Control+A');
    await page.locator('.aurebesh-toolbar button[title="Bold"]').click();
    expect(await page.evaluate(() => (window as any).ed.value)).toMatch(/<(b|strong)>abc<\/(b|strong)>/);
  });

  test('print() prints the content in a hidden frame with the page format, and removes it afterwards', async ({ page }) => {
    await page.addInitScript(() => {
      window.print = () => {
        (window.top as any).__printed = { href: location.href, text: document.body.textContent, rule: document.head.textContent!.match(/@page\{[^}]*\}/g) };
      };
    });
    await open(page);
    await page.evaluate(() => (window as any).ed.instance.setHTML('<p>Print me</p>'));
    await setAttr(page, 'page', 'a5');
    await page.evaluate(() => void (window as any).ed.instance.print());
    await page.waitForFunction(() => (window as any).__printed);
    const printed = await page.evaluate(() => (window as any).__printed);
    expect(printed.text).toContain('Print me');
    expect(printed.rule.join('')).toContain('size:148mm 210mm;margin:15mm');
    expect(await page.locator('iframe[aria-hidden="true"]').count()).toBe(1); // waits for afterprint to remove it
  });
});

test.describe('print document as PDF (Chromium)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'PDF output is a Chromium feature');

  const pdfInfo = async (page: Page, html: string) => {
    const tab = await page.context().newPage();
    await tab.setContent(html);
    const pdf = await tab.pdf({ preferCSSPageSize: true, printBackground: true });
    await tab.close();
    const text = pdf.toString('latin1');
    const m = /MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(text)!;
    return { widthMm: (+m[1] / 72) * 25.4, heightMm: (+m[2] / 72) * 25.4, pages: (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length };
  };

  test('an A4 document becomes A4 pages, and a long one more than one', async ({ page }) => {
    await open(page);
    await setAttr(page, 'page', 'a4');
    await page.evaluate(() => (window as any).ed.instance.setHTML(Array.from({ length: 120 }, (_, i) => `<p>Line number ${i}</p>`).join('')));
    const html = await page.evaluate(() => (window as any).ed.instance.getPrintHTML());
    expect(html).toContain('@page{size:210mm 297mm;margin:20mm}');
    const info = await pdfInfo(page, html);
    expect(Math.abs(info.widthMm - 210)).toBeLessThan(1);
    expect(Math.abs(info.heightMm - 297)).toBeLessThan(1);
    expect(info.pages).toBeGreaterThan(1);
  });

  test('an 80 mm ticket becomes one page of 80 mm wide and as long as the text', async ({ page }) => {
    await open(page);
    await setAttr(page, 'page', 'ticket-80');
    await page.evaluate(() => (window as any).ed.instance.setHTML('<h1>Receipt</h1><p>Coffee 2.50</p><p>Cake 4.00</p><hr><p>Total 6.50</p>'));
    const html = await page.evaluate(() => (window as any).ed.instance.getPrintHTML());
    const info = await pdfInfo(page, html);
    expect(Math.abs(info.widthMm - 80)).toBeLessThan(1);
    expect(info.heightMm).toBeLessThan(150);
    expect(info.heightMm).toBeGreaterThan(20);
    expect(info.pages).toBe(1);
  });
});
