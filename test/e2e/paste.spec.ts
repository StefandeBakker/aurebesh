import { test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { content, expect, html, open, PNG } from './helpers';
import { GOOGLE_DOCS_HTML, NEWSLETTER_HTML, WORD_HTML, newsletterRtf, pngBytes, wordRtf } from '../fixtures/paste';

const GOOGLE_IMAGES = 'https://lh7-rt.googleusercontent.com/**';

/** Serves the picture the way an image host that allows other sites to read it (CORS) does. */
const servePicture = (route: Route) =>
  route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: PNG });

async function paste(page: Page, data: { html: string; rtf?: string; text?: string }): Promise<void> {
  await content(page).click();
  await page.evaluate((d) => {
    const dt = new DataTransfer();
    dt.setData('text/html', d.html);
    if (d.rtf) dt.setData('text/rtf', d.rtf);
    dt.setData('text/plain', d.text ?? 'pasted text');
    document.querySelector('.aurebesh-content')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, data);
}

const value = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.value);
const srcs = (page: Page): Promise<string[]> => page.evaluate(() => Array.from(document.querySelectorAll('.aurebesh-content img'), (i) => (i as HTMLImageElement).getAttribute('src')!));

test.describe('pasting from Google Docs', () => {
  test('keeps the formatting and copies every image through the upload adapter', async ({ page }) => {
    await page.route(GOOGLE_IMAGES, servePicture);
    await open(page);
    await paste(page, { html: GOOGLE_DOCS_HTML });

    await expect.poll(async () => (await srcs(page)).length).toBe(2);
    await expect(page.locator('.aurebesh-pending')).toHaveCount(0);

    const out = await value(page);
    expect(out).toContain('<h1>Report</h1>');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<em>italic</em>');
    expect(out).toContain('<u>under</u>');
    expect(out).toContain('color: #ff0000');
    expect(out).toContain('<a href="https://example.com/page">link</a>');
    expect(out).toContain('<ul><li>first<ul><li>nested</li></ul></li><li>second</li></ul>');
    expect(out).not.toMatch(/font-family|font-size|docs-internal|googleusercontent/);

    // both images were copied (default adapter: embedded), none left as a link to Google
    for (const src of await srcs(page)) expect(src).toMatch(/^data:image\/png;base64,/);
  });

  test('shows a placeholder while an image is being imported, and it never ends up in the HTML', async ({ page }) => {
    await page.route(GOOGLE_IMAGES, servePicture);
    await open(page);
    await page.evaluate(() => {
      (window as any).release = null;
      (window as any).ed.options = {
        media: {
          adapter: (file: File) =>
            new Promise<string>((resolve) => {
              const prev = (window as any).release;
              (window as any).release = () => {
                prev?.();
                resolve(`https://cdn.example.com/${file.name}`);
              };
            }),
        },
      };
    });
    await paste(page, { html: GOOGLE_DOCS_HTML });

    const pending = page.locator('.aurebesh-pending');
    await expect(pending).toHaveCount(2);
    await expect(pending.first()).toHaveAttribute('data-label', 'Importing image…');
    expect(await value(page)).not.toContain('aurebesh-pending');
    await expect(page.locator('.aurebesh-status')).toContainText('Importing 2 image(s)');

    await page.evaluate(() => (window as any).release());
    await expect(pending).toHaveCount(0);
    expect(await srcs(page)).toEqual(['https://cdn.example.com/pasted-image.png', 'https://cdn.example.com/pasted-image.png']);
    await expect(page.locator('.aurebesh-status')).toBeHidden();
  });

  test('hands the images to a custom adapter, as image files', async ({ page }) => {
    await page.route(GOOGLE_IMAGES, servePicture);
    await open(page);
    await page.evaluate(() => {
      (window as any).uploaded = [];
      (window as any).ed.options = {
        media: {
          adapter: async (file: File, ctx: { kind: string }) => {
            (window as any).uploaded.push([file.type, ctx.kind, file.size > 0]);
            return `https://cdn.example.com/${(window as any).uploaded.length}.png`;
          },
        },
      };
    });
    await paste(page, { html: GOOGLE_DOCS_HTML });
    await expect.poll(async () => (await srcs(page)).length).toBe(2);
    expect(await srcs(page)).toEqual(['https://cdn.example.com/1.png', 'https://cdn.example.com/2.png']);
    expect(await page.evaluate(() => (window as any).uploaded)).toEqual([
      ['image/png', 'image', true],
      ['image/png', 'image', true],
    ]);
  });

  test('an image that can not be copied (the host refuses the download) stays a link, and you are told', async ({ page }) => {
    // A real host blocking other sites via CORS makes fetch() throw; a refusal makes it return an error status.
    // The editor handles both the same way (Playwright's route.fulfill does not enforce CORS, so use a status).
    await page.route(GOOGLE_IMAGES, (route) => route.fulfill({ status: 403, contentType: 'image/png', body: PNG }));
    await open(page);
    await paste(page, { html: GOOGLE_DOCS_HTML });
    await expect(page.locator('.aurebesh-status.error')).toContainText('linked to their source');
    expect(await srcs(page)).toEqual([
      'https://lh7-rt.googleusercontent.com/docsz/AD_4nXa1?key=abc123',
      'https://lh7-rt.googleusercontent.com/docsz/AD_4nXb2?key=def456',
    ]);
    await expect(page.locator('.aurebesh-pending')).toHaveCount(0);
  });

  test('with pasteImages: "link" the images stay links and nothing is downloaded', async ({ page }) => {
    let requests = 0;
    await page.route(GOOGLE_IMAGES, (route) => {
      requests++;
      return servePicture(route);
    });
    await open(page);
    await page.evaluate(() => {
      (window as any).ed.options = { media: { pasteImages: 'link' } };
    });
    await paste(page, { html: GOOGLE_DOCS_HTML });
    await expect.poll(async () => (await srcs(page)).length).toBe(2);
    expect((await srcs(page))[0]).toMatch(/^https:\/\/lh7-rt/);
    await page.waitForTimeout(200);
    // only the <img> elements themselves load the pictures: no extra fetch to copy them
    expect(await page.locator('.aurebesh-status.error').count()).toBe(0);
    expect(requests).toBeLessThanOrEqual(2);
  });

  test('with pasteImages: "remove" the images are left out', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      (window as any).ed.options = { media: { pasteImages: 'remove' } };
    });
    await paste(page, { html: GOOGLE_DOCS_HTML });
    await expect(page.locator('.aurebesh-content')).toContainText('Report');
    expect(await srcs(page)).toEqual([]);
  });
});

test.describe('pasting from Word', () => {
  test('keeps the formatting and brings the pictures from the RTF, in order', async ({ page }) => {
    await open(page);
    await paste(page, { html: WORD_HTML, rtf: wordRtf(['png', 'png']) });

    await expect.poll(async () => (await srcs(page)).length).toBe(2);
    await expect(page.locator('.aurebesh-pending')).toHaveCount(0);
    for (const src of await srcs(page)) expect(src).toMatch(/^data:image\/png;base64,/);

    const out = await value(page);
    expect(out).toContain('<b>Vet</b> en <i>cursief</i>');
    expect(out).toContain('color: #ff0000');
    expect(out).toContain('background-color: #ffff00');
    expect(out).toContain('<ul><li>Eerste<ul><li>Genest</li></ul></li><li>Tweede</li></ul>');
    expect(out).toContain('<ol><li>Nummer een</li><li>Nummer twee</li></ol>');
    expect(out).not.toMatch(/file:|Mso|mso-|<o:p/);
  });

  test('without RTF data the pictures are left out and you are told', async ({ page }) => {
    await open(page);
    await paste(page, { html: WORD_HTML });
    await expect(page.locator('.aurebesh-status.error')).toContainText('2 image(s) in the pasted content could not be brought along');
    expect(await srcs(page)).toEqual([]);
    expect(await value(page)).toContain('<ul><li>Eerste');
  });

  test('a picture Word can only give as a metafile is dropped without shifting the others', async ({ page }) => {
    await open(page);
    await paste(page, { html: WORD_HTML, rtf: wordRtf(['emf', 'png']) });
    await expect(page.locator('.aurebesh-status.error')).toContainText('1 image(s)');
    await expect.poll(async () => (await srcs(page)).length).toBe(1);
  });

  test('uploads go to the configured adapter, and an adapter that fails removes the picture and reports it', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      (window as any).ed.options = {
        media: {
          adapter: async () => {
            throw new Error('storage is down');
          },
        },
      };
    });
    await paste(page, { html: WORD_HTML, rtf: wordRtf(['png', 'png']) });
    await expect(page.locator('.aurebesh-status.error')).toContainText('2 pasted image(s) could not be imported');
    expect(await srcs(page)).toEqual([]);
    await expect(page.locator('.aurebesh-pending')).toHaveCount(0);
  });
});

test.describe('pasting a Word newsletter with floating text boxes', () => {
  test('the sidebar floats at the right, the pull quote sits in the columns, the picture keeps its size, and the headings stay clean', async ({ page }) => {
    test.skip(!NEWSLETTER_HTML, 'needs test/fixtures/word-newsletter.html (a reduced real clipboard, not committed; make one with `npm run capture`)');
    await open(page);
    // A real (tiny) picture, so the browser can lay it out; the RTF says "jpeg" like Word's does, browsers sniff the real type.
    await paste(page, { html: NEWSLETTER_HTML!, rtf: newsletterRtf(pngBytes()) });
    await expect.poll(async () => (await srcs(page)).length).toBe(1);
    await expect(page.locator('.aurebesh-pending')).toHaveCount(0);

    const layout = await page.evaluate(() => {
      const c = document.querySelector('.aurebesh-content') as HTMLElement;
      const width = c.getBoundingClientRect().width;
      const asides = Array.from(c.querySelectorAll('aside'));
      const side = asides.find((a) => /sidebar title/i.test(a.textContent!))!;
      const quote = asides.find((a) => /quote is bold/i.test(a.textContent!))!;
      const img = c.querySelector('img') as HTMLImageElement;
      const columns = quote.closest('div[style*="column-count"]') as HTMLElement | null;
      const heading = Array.from(c.querySelectorAll('h1')).find((h) => h.textContent!.trim() === 'Story Title')!;
      return {
        sideFloat: getComputedStyle(side).cssFloat,
        sideFill: getComputedStyle(side).backgroundColor,
        // text wraps around the quote: some line of text sits beside it (to its right), at the same height
        wrapsBeside: (() => {
          const q = quote.getBoundingClientRect();
          const run = quote.parentElement!;
          return Array.from(run.querySelectorAll(':scope > p')).some((p) => {
            const range = document.createRange();
            range.selectNodeContents(p);
            return Array.from(range.getClientRects()).some((r) => r.left >= q.right - 2 && r.top < q.bottom && r.bottom > q.top && r.width > 20);
          });
        })(),
        columnCounts: Array.from(c.querySelectorAll('div[style*="column-count"]')).map((d) => getComputedStyle(d).columnCount),
        // the quote sits against the gutter: its right edge on the right edge of column 1, or its left edge on the left edge of column 2
        atGutter: (() => {
          const block = quote.parentElement as HTMLElement;
          const b = block.getBoundingClientRect();
          const q = quote.getBoundingClientRect();
          const gap = parseFloat(getComputedStyle(block).columnGap) || 0;
          const count = Number(getComputedStyle(block).columnCount);
          const colWidth = (b.width - gap * (count - 1)) / count;
          return Math.abs(q.right - (b.left + colWidth)) <= 3 || Math.abs(q.left - (b.left + colWidth + gap)) <= 3;
        })(),
        // the picture is centred and has no text of its own beside it
        imgCentred: (() => {
          const r = img.getBoundingClientRect();
          const area = c.getBoundingClientRect();
          return Math.abs((r.left + r.right) / 2 - (area.left + area.right) / 2) < area.width * 0.03 && img.parentElement!.textContent!.trim() === '';
        })(),
        bannerOrder: Array.from(c.querySelectorAll('h1,h2')).map((h) => h.textContent!.trim()).filter((t) => /newsletter title|company name/i.test(t)),
        companyFill: getComputedStyle(Array.from(c.querySelectorAll('div')).find((d) => /company name/i.test(d.textContent!) && !d.querySelector('div'))!).backgroundColor,
        storyTitle: (() => {
          const h = Array.from(c.querySelectorAll('h1')).find((x) => x.textContent!.trim() === 'Story Title')!;
          return { color: getComputedStyle(h.querySelector('span')!).color, transform: getComputedStyle(h.querySelector('span')!).textTransform };
        })(),
        sideShare: side.getBoundingClientRect().width / width,
        sideAtRight: side.getBoundingClientRect().left > width / 2,
        sideAboveHeading: side.getBoundingClientRect().top <= heading.getBoundingClientRect().top,
        quoteFloat: getComputedStyle(quote).cssFloat,
        quoteColumns: columns ? getComputedStyle(columns).columnCount : null,
        quoteIsInside: columns ? Array.from(columns.children).indexOf(quote) : -1,
        paragraphsInColumns: columns ? columns.children.length : 0,
        imgShare: img.getBoundingClientRect().width / width,
        imgSrc: img.src.slice(0, 23),
        headingsClean: Array.from(c.querySelectorAll('h1,h2,h3')).every((h) => !/sidebar|insert tab/i.test(h.textContent!)),
      };
    });
    expect(layout.sideFloat).toBe('right');
    expect(layout.sideFill).toBe('rgba(225, 222, 186, 0.7)'); // Word's beige at 70%
    expect(layout.companyFill).toBe('rgb(147, 162, 153)'); // the dark sage banner
    expect(layout.bannerOrder).toEqual(['[Newsletter Title]', '[Type the company name]']); // the title is above the company name
    expect(layout.storyTitle).toEqual({ color: 'rgb(147, 162, 153)', transform: 'uppercase' });
    expect(layout.sideShare).toBeGreaterThan(0.28);
    expect(layout.sideShare).toBeLessThan(0.38);
    expect(layout.sideAtRight).toBe(true);
    expect(layout.sideAboveHeading).toBe(true);
    expect(layout.quoteFloat).toMatch(/^(left|right)$/); // the pull quote is a box inside the columns...
    expect(layout.wrapsBeside).toBe(true); // ...with text wrapping around it, not text only above and below
    expect(layout.atGutter).toBe(true); // ...against the gutter between the two columns, where it hangs in Word
    expect(layout.imgCentred).toBe(true); // the picture is a centred band of its own
    expect(layout.quoteColumns).toBe('2'); // Word's 3 columns, one of which the sidebar sits in
    expect(layout.columnCounts).toEqual(['2', '3']); // the next page's section has all three
    expect(layout.quoteIsInside).toBeGreaterThan(0);
    expect(layout.quoteIsInside).toBeLessThan(layout.paragraphsInColumns - 1);
    expect(layout.imgShare).toBeGreaterThan(0.5);
    expect(layout.imgShare).toBeLessThan(0.7);
    expect(layout.imgSrc).toMatch(/^data:image\/jpeg;base64/);
    expect(layout.headingsClean).toBe(true);

    // what is stored survives being loaded again
    const stored = await value(page);
    expect(stored).toMatch(/<aside style="float: right; width: 33%; background-color: rgba\(225, 222, 186, 0\.7\); padding: [^"]+">/);
    await page.evaluate((v) => (window as any).ed.instance.setHTML(v), stored);
    expect(await value(page)).toBe(stored);
  });

  test('typing inside a sidebar and a column block keeps working', async ({ page }) => {
    await open(page, '<aside style="float: right; width: 33%"><p>side</p></aside><div style="column-count: 2"><p>one</p><aside><p>quote</p></aside><p>two</p></div>');
    await page.evaluate(() => {
      const aside = document.querySelector('.aurebesh-content aside') as HTMLElement;
      aside.focus?.();
      const p = aside.querySelector('p')!;
      const r = document.createRange();
      r.setStart(p.firstChild!, 4);
      r.collapse(true);
      const s = getSelection()!;
      (document.querySelector('.aurebesh-content') as HTMLElement).focus();
      s.removeAllRanges();
      s.addRange(r);
    });
    await page.keyboard.type(' bar');
    expect(await value(page)).toContain('<aside style="float: right; width: 33%"><p>side bar</p></aside>');
  });
});

test.describe('pasting other content', () => {
  test('web page markup is reduced to semantic formatting, text stays editable afterwards', async ({ page }) => {
    await open(page);
    await paste(page, {
      html: '<p style="font-family: Georgia; font-size: 20px; margin: 0"><span style="font-weight: bold">B</span> <span style="font-style: italic">I</span> x<span style="vertical-align: super">2</span></p>',
    });
    expect(await html(page)).toMatch(/<strong>B<\/strong> <em>I<\/em> x<sup>2<\/sup>/);
    await page.keyboard.type('!');
    await expect(content(page)).toContainText('B I x2!');
  });

  test('a paste with no images does not show any placeholder or message', async ({ page }) => {
    await open(page);
    await paste(page, { html: '<p>just <b>text</b></p>' });
    await expect(page.locator('.aurebesh-pending')).toHaveCount(0);
    await expect(page.locator('.aurebesh-status')).toBeHidden();
  });
});
