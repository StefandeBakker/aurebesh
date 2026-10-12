import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { expect, PNG } from './helpers';

const content = (page: Page) => page.locator('.aurebesh-content');
const tab = (page: Page, name: string) => page.getByRole('tab', { name });
const paper = (page: Page) => page.locator('.aurebesh-ticket-paper').nth(1); // the first is the preview of this part

const PARTS = [
  { name: 'header', code: '[*center*]{[*Shop.Name*]}\n[*left*][*If Order.Type,"1"*]eat in[*Endif*][*If Order.Type,"2"*]take away[*Endif*]\n' },
  { name: 'lines', code: '[*Item.Name,"%-8s"*][*Item.Price,"%6s"*]\n', repeat: 'items' },
  { name: 'pay', code: '[*Pay.Kind,"%-8s"*][*Pay.Amount,"%6s"*][*if Pay.Amount,"-?"*] refund[*endif*]\n', repeat: 'payments' },
  { name: 'footer', code: 'Total [*Order.Total,"%6s"*]\n[*cutbon*]' },
];

const DATA = {
  values: { 'Shop.Name': 'Cafe Test', 'Order.Type': '1', 'Order.Total': '9.00' },
  lists: {
    items: [
      { 'Item.Name': 'Coffee', 'Item.Price': '2.50' },
      { 'Item.Name': 'Cake', 'Item.Price': '4.00' },
    ],
    payments: [{ 'Pay.Kind': 'CASH', 'Pay.Amount': '10.00' }],
  },
};

/** Opens the page and gives the editor the lines of a ticket: it is the editor of one part, the rest come from `parts`. */
async function openWhole(page: Page, part = 'lines', extra: Record<string, unknown> = {}): Promise<void> {
  await page.goto('/test/e2e/ticket.html');
  await content(page).waitFor();
  await page.evaluate(
    ([p, parts, data, more]) => {
      const ed = (window as any).ed;
      ed.options = { ticket: { keywords: (window as any).KEYWORDS, part: p, parts, data, template: (parts as any[]).find((x) => x.name === p).code, ...(more as object) } };
    },
    [part, PARTS, DATA, extra] as const,
  );
  await content(page).waitFor();
}

const template = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.template);
const lines = (page: Page) => paper(page).locator('.aurebesh-ticket-pl').allInnerTexts();

test.describe('the whole ticket', () => {
  test('without parts or data there is no Ticket or Test data tab', async ({ page }) => {
    await page.goto('/test/e2e/ticket.html');
    await content(page).waitFor();
    await expect(tab(page, 'Ticket')).toHaveCount(0);
    await expect(tab(page, 'Test data')).toHaveCount(0);
  });

  test('the Ticket tab puts the parts one after the other, a repeating part once for every row', async ({ page }) => {
    await openWhole(page);
    await tab(page, 'Ticket').click();
    const out = (await lines(page)).map((l) => l.trim());
    expect(out).toEqual(['{Cafe Test}', 'eat in', 'Coffee    2.50', 'Cake      4.00', 'CASH     10.00', 'Total   9.00']);
    await expect(paper(page).locator('.aurebesh-ticket-slip')).toHaveCount(1); // the cut at the end ends the piece of paper
  });

  test('this editor\'s own part is its live code, not the one it was given', async ({ page }) => {
    await openWhole(page);
    await tab(page, 'Ticket').click();
    await page.evaluate(() => ((window as any).ed.template = '[*Item.Name,"%-8s"*] only the name\n'));
    const out = (await lines(page)).map((l) => l.trim());
    expect(out).toContain('Coffee   only the name');
    expect(out).toContain('Cake     only the name');
    expect(out.join('|')).not.toContain('2.50');
  });

  test('the other parts can be given new code', async ({ page }) => {
    await openWhole(page);
    await tab(page, 'Ticket').click();
    await page.evaluate(() => (window as any).ed.instance.setTicketPart('footer', 'THE END\n'));
    const out = (await lines(page)).map((l) => l.trim());
    expect(out).toContain('THE END');
    expect(out.join('|')).not.toContain('Total');
  });

  test('conditions come from the data: change the order type and the other branch prints', async ({ page }) => {
    await openWhole(page);
    await tab(page, 'Test data').click();
    await page.locator('.aurebesh-ticket-data label', { hasText: 'Order.Type' }).locator('input').fill('2');
    await tab(page, 'Ticket').click();
    await expect.poll(async () => (await lines(page)).map((l) => l.trim())).toContain('take away');
    expect((await lines(page)).map((l) => l.trim())).not.toContain('eat in');
  });

  test('a condition that is not a plain comparison, in another part, has a switch in the data tab', async ({ page }) => {
    await openWhole(page);
    await tab(page, 'Ticket').click();
    expect((await lines(page)).join('|')).not.toContain('refund');
    await tab(page, 'Test data').click();
    await page.locator('.aurebesh-ticket-data label', { hasText: 'Pay.Amount -?' }).locator('input').check();
    await tab(page, 'Ticket').click();
    await expect.poll(async () => (await lines(page)).join('|')).toContain('refund');
  });
});

test.describe('the test data', () => {
  test('the form has the values of the whole ticket, and a table for every list with a column per field', async ({ page }) => {
    await openWhole(page);
    await tab(page, 'Test data').click();
    const data = page.locator('.aurebesh-ticket-data');
    await expect(data.locator('label', { hasText: 'Shop.Name' }).locator('input')).toHaveValue('Cafe Test');
    await expect(data.locator('label', { hasText: 'Order.Total' }).locator('input')).toHaveValue('9.00');
    // fields that only the repeating parts use are columns, not values of the whole ticket
    await expect(data.locator('label', { hasText: 'Item.Name' })).toHaveCount(0);
    const items = data.locator('table').nth(0);
    await expect(items.locator('th')).toHaveText(['Item.Name', 'Item.Price', '']);
    await expect(items.locator('tbody tr')).toHaveCount(2);
    await expect(items.locator('tbody tr').nth(1).locator('input').first()).toHaveValue('Cake');
    await expect(data.locator('table').nth(1).locator('tbody tr')).toHaveCount(1);
  });

  test('changing a value changes the ticket, and tells the page', async ({ page }) => {
    await openWhole(page);
    await page.evaluate(() => {
      (window as any).seen = [];
      (window as any).ed.addEventListener('ticketdata', (e: CustomEvent) => (window as any).seen.push(e.detail));
    });
    await tab(page, 'Test data').click();
    const data = page.locator('.aurebesh-ticket-data');
    await data.locator('label', { hasText: 'Shop.Name' }).locator('input').fill('Bistro');
    await data.locator('table').nth(0).locator('tbody tr').nth(0).locator('input').nth(1).fill('3.75');
    // the changes are reported a moment after typing, so wait for the one that has both
    await expect.poll(() => page.evaluate(() => (window as any).seen.at(-1)?.lists?.items?.[0]?.['Item.Price'])).toBe('3.75');
    const last = await page.evaluate(() => (window as any).seen.at(-1));
    expect(last.values['Shop.Name']).toBe('Bistro');
    expect(last.lists.items[0]['Item.Price']).toBe('3.75');
    await tab(page, 'Ticket').click();
    const out = (await lines(page)).map((l) => l.trim());
    expect(out[0]).toBe('{Bistro}');
    expect(out).toContain('Coffee    3.75');
  });

  test('a row can be added and removed, and a new row starts empty', async ({ page }) => {
    await openWhole(page);
    await tab(page, 'Test data').click();
    const items = page.locator('.aurebesh-ticket-data table').nth(0);
    await page.locator('.aurebesh-ticket-data').getByRole('button', { name: 'Add a row' }).first().click();
    await expect(items.locator('tbody tr')).toHaveCount(3);
    await expect(items.locator('tbody tr').nth(2).locator('input').first()).toHaveValue('');
    await items.locator('tbody tr').nth(2).locator('input').first().fill('Tea');
    await tab(page, 'Ticket').click();
    await expect.poll(async () => (await lines(page)).map((l) => l.trim())).toContain('Tea');
    await tab(page, 'Test data').click();
    await items.locator('tbody tr').nth(0).getByRole('button', { name: 'Remove' }).click();
    await expect(items.locator('tbody tr')).toHaveCount(2);
    expect(await page.evaluate(() => (window as any).ed.instance.getTicketData().lists.items.map((r: any) => r['Item.Name']))).toEqual(['Cake', 'Tea']);
  });

  test('getTicketData and setTicketData work from code, and the form follows', async ({ page }) => {
    await openWhole(page);
    expect(await page.evaluate(() => (window as any).ed.instance.getTicketData())).toEqual(DATA);
    await page.evaluate(() =>
      (window as any).ed.instance.setTicketData({ values: { 'Shop.Name': 'New Shop', 'Order.Type': '1' }, lists: { items: [{ 'Item.Name': 'Only', 'Item.Price': '1.00' }], payments: [] } }),
    );
    await tab(page, 'Ticket').click();
    const out = (await lines(page)).map((l) => l.trim());
    expect(out.slice(0, 3)).toEqual(['{New Shop}', 'eat in', 'Only      1.00']);
    await tab(page, 'Test data').click();
    await expect(page.locator('.aurebesh-ticket-data label', { hasText: 'Shop.Name' }).locator('input')).toHaveValue('New Shop');
    await expect(page.locator('.aurebesh-ticket-data table').nth(0).locator('tbody tr')).toHaveCount(1);
  });

  test('the data is a copy: changing the object that was passed in does not change the editor', async ({ page }) => {
    await openWhole(page);
    expect(await page.evaluate(() => {
      const d = (window as any).ed.instance.getTicketData();
      d.values['Shop.Name'] = 'changed outside';
      return (window as any).ed.instance.getTicketData().values['Shop.Name'];
    })).toBe('Cafe Test');
  });

  test('the layout shows the values from the data: of the whole ticket, and the first row for a repeating part', async ({ page }) => {
    await openWhole(page);
    const chips = content(page).locator('[data-t="field"]');
    await expect(chips.nth(0)).toHaveText('Coffee  '); // %-8s of the first row
    await expect(chips.nth(1)).toHaveText('  2.50');
    await openWhole(page, 'header');
    await expect(content(page).locator('[data-t="field"]').first()).toHaveText('Cafe Test');
  });

  test('typing a value shows in the layout, and a name still shows when asked for', async ({ page }) => {
    await openWhole(page, 'footer');
    await tab(page, 'Test data').click();
    await page.locator('.aurebesh-ticket-data label', { hasText: 'Order.Total' }).locator('input').fill('123.45');
    await expect(content(page).locator('[data-t="field"]')).toHaveText('123.45');
    await page.getByLabel('Show field names').check();
    await expect(content(page).locator('[data-t="field"]')).toHaveText('Order…'); // cut to the 6 columns of its format
  });

  test('without parts the data is still there for this part alone', async ({ page }) => {
    await page.goto('/test/e2e/ticket.html');
    await content(page).waitFor();
    await page.evaluate(() => {
      (window as any).ed.options = { ticket: { template: 'Hi [*Customer.Name*], total [*Order.Total,"%6s"*]', data: { values: { 'Customer.Name': 'Sam', 'Order.Total': '7.00' } } } };
    });
    await tab(page, 'Ticket').click();
    expect((await lines(page)).map((l) => l.trim())).toEqual(['Hi Sam, total   7.00']);
  });

  test('read-only does not stop looking at or trying the data', async ({ page }) => {
    await openWhole(page);
    await page.evaluate(() => (window as any).ed.setAttribute('readonly', ''));
    await tab(page, 'Test data').click();
    await page.locator('.aurebesh-ticket-data label', { hasText: 'Shop.Name' }).locator('input').fill('Ro');
    await tab(page, 'Ticket').click();
    await expect.poll(async () => (await lines(page)).map((l) => l.trim())[0]).toBe('{Ro}');
  });
});

test.describe('the logo', () => {
  const logo = `data:image/png;base64,${PNG.toString('base64')}`;
  const withLogo = { dots: 100, commands: [{ name: 'logo1', kind: 'logo', label: 'Logo', image: logo }, { name: 'cutbon', kind: 'cut' }, { name: 'euro', kind: 'text', display: '€' }] };

  test('is a picture in the preview, as wide as it prints on the paper', async ({ page }) => {
    await page.goto('/test/e2e/ticket.html');
    await content(page).waitFor();
    await page.evaluate((o) => ((window as any).ed.options = { ticket: { ...o, template: '[*center*][*logo1*]\nShop' } }), withLogo);
    const img = page.locator('.aurebesh-ticket-paper img.aurebesh-ticket-logo');
    await expect(img).toHaveCount(1);
    // the picture is 10 dots wide on paper of 100 dots: a tenth of the width
    await expect.poll(async () => img.evaluate((i) => i.style.width)).toBe('10%');
    const [w, paperW] = await page.evaluate(() => {
      const i = document.querySelector('.aurebesh-ticket-paper img')!.getBoundingClientRect();
      const p = document.querySelector('.aurebesh-ticket-slip')!; // the piece of paper
      const cs = getComputedStyle(p);
      return [i.width, p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)];
    });
    expect(Math.abs(w / paperW - 0.1)).toBeLessThan(0.01);
  });

  test('in the whole ticket too, and a logo without a picture stays a label', async ({ page }) => {
    await page.goto('/test/e2e/ticket.html');
    await content(page).waitFor();
    await page.evaluate((o) => {
      (window as any).ed.options = {
        ticket: { ...o, commands: [...o.commands, { name: 'logo2', kind: 'logo', label: 'Other logo' }], template: '[*logo1*][*logo2*]', parts: [{ name: 'a', code: '[*logo1*]\n' }], part: 'b', data: {} },
      };
    }, withLogo);
    await tab(page, 'Ticket').click();
    await expect(paper(page).locator('img')).toHaveCount(2); // the part "a" and the live code of "b" (its logo1)
    await tab(page, 'Preview').click();
    await expect(page.locator('.aurebesh-ticket-paper').first()).toContainText('Other logo');
  });

  test('a picture address that is not safe is refused, and the editor says so', async ({ page }) => {
    await page.goto('/test/e2e/ticket.html');
    await content(page).waitFor();
    const message = await page.evaluate(async () => {
      const url = '/dist/index.js'; // a variable, so that TypeScript does not look for the file
      const { Aurebesh } = await import(url);
      try {
        new Aurebesh(document.createElement('div'), { ticket: { commands: [{ name: 'logo1', kind: 'logo', image: 'javascript:alert(1)' }] } });
        return '';
      } catch (e) {
        return (e as Error).message;
      }
    });
    expect(message).toMatch(/safe address/);
  });
});
