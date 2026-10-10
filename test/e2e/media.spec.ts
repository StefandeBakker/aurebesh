import { test } from '@playwright/test';
import { button, content, expect, html, open, PNG } from './helpers';

const DATA_PNG = `data:image/png;base64,${PNG.toString('base64')}`;
const picker = (title: string) => `.aurebesh-table-picker:has(button[title="${title}"])`;

test.describe('images', () => {
  test('add by link with alt text', async ({ page }) => {
    await open(page);
    await content(page).click();
    await button(page, 'Image').click();
    await page.locator(`${picker('Image')} input[type="url"]`).fill(DATA_PNG);
    await page.locator(`${picker('Image')} input[type="text"]`).fill('red square');
    await page.locator(picker('Image')).getByRole('button', { name: 'Insert' }).click();
    const out = await html(page);
    expect(out).toContain('<img');
    expect(out).toContain('alt="red square"');
  });

  test('upload through the file picker (default base64 adapter) and the placeholder disappears', async ({ page }) => {
    await open(page);
    await content(page).click();
    await page.locator(`${picker('Image')} input[type="file"]`).setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG });
    await expect(content(page).locator('img')).toHaveCount(1);
    expect(await html(page)).toContain('src="data:image/png;base64,');
    await expect(content(page)).not.toHaveClass(/is-empty/);
  });

  test('a custom adapter decides where the file goes', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      (window as any).ed.options = { media: { adapter: async (file: File) => `https://cdn.example.com/${file.name}` } };
    });
    await page.locator('.aurebesh-content').waitFor();
    await content(page).click();
    await page.locator(`${picker('Image')} input[type="file"]`).setInputFiles({ name: 'pic.png', mimeType: 'image/png', buffer: PNG });
    await expect(content(page).locator('img')).toHaveAttribute('src', 'https://cdn.example.com/pic.png');
  });

  test('image tools: width, alignment, alt text, remove', async ({ page }) => {
    await open(page);
    await content(page).click();
    await page.locator(`${picker('Image')} input[type="file"]`).setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG });
    const img = content(page).locator('img');
    await img.click();
    const tools = page.locator('.aurebesh-image-tools');
    await expect(tools).toBeVisible();

    await tools.getByRole('button', { name: '50%' }).click();
    await expect(img).toHaveAttribute('style', /width:\s*50%/);
    await tools.getByRole('button', { name: 'Align center' }).click();
    await expect(img).toHaveAttribute('style', /margin-left:\s*auto/);

    await tools.locator('input.aurebesh-alt').fill('a red dot');
    await tools.locator('input.aurebesh-alt').press('Enter');
    await expect(img).toHaveAttribute('alt', 'a red dot');
    await expect(tools).toBeVisible();

    // The styles must survive the sanitizer (reload).
    await page.evaluate(() => {
      const ed = (window as any).ed;
      ed.instance.setHTML(ed.value);
    });
    await expect(content(page).locator('img')).toHaveAttribute('style', /width:\s*50%/);

    await content(page).locator('img').click();
    await tools.getByRole('button', { name: 'Remove image' }).click();
    await expect(content(page).locator('img')).toHaveCount(0);
  });

  test('unsupported file type is refused with a message', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      (window as any).ed.addEventListener('error', (e: CustomEvent) => ((window as any).lastError = e.detail.message));
    });
    await page.evaluate(() => (window as any).ed.instance.uploadFiles([new File(['x'], 'x.svg', { type: 'image/svg+xml' })]));
    await expect(page.locator('.aurebesh-status.error')).toContainText('Unsupported file type');
    expect(await page.evaluate(() => (window as any).lastError)).toContain('Unsupported');
  });
});

test.describe('video', () => {
  test('a YouTube link becomes a privacy-friendly embed with a paragraph below', async ({ page }) => {
    await open(page);
    await content(page).click();
    await button(page, 'Video').click();
    await page.locator(`${picker('Video')} input[type="url"]`).fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.locator(picker('Video')).getByRole('button', { name: 'Insert' }).click();
    await expect(content(page).locator('iframe')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(await page.evaluate(() => document.querySelector('.aurebesh-content')!.lastElementChild!.tagName)).toBe('P');
  });

  test('a link that is not a video is refused', async ({ page }) => {
    await open(page);
    await content(page).click();
    await button(page, 'Video').click();
    await page.locator(`${picker('Video')} input[type="url"]`).fill('https://example.com/page');
    await page.locator(picker('Video')).getByRole('button', { name: 'Insert' }).click();
    await expect(page.locator('.aurebesh-status.error')).toContainText('Unsupported video link');
    await expect(content(page).locator('iframe, video')).toHaveCount(0);
  });

  test('a video file upload becomes a <video> with controls', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      (window as any).ed.options = { media: { adapter: async () => 'https://cdn.example.com/clip' } };
    });
    await content(page).click();
    await page
      .locator(`${picker('Video')} input[type="file"]`)
      .setInputFiles({ name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from([0, 0, 0, 24]) });
    const video = content(page).locator('video');
    await expect(video).toHaveAttribute('src', 'https://cdn.example.com/clip');
    await expect(video).toHaveAttribute('controls', '');
  });

  test('clicking an embed and pressing Backspace removes it', async ({ page }) => {
    await open(page);
    await content(page).click();
    await page.evaluate(() => (window as any).ed.instance.insertVideo('https://youtu.be/dQw4w9WgXcQ'));
    await expect(content(page).locator('iframe')).toHaveCount(1);
    await content(page).locator('iframe').click({ force: true });
    await page.keyboard.press('Backspace');
    await expect(content(page).locator('iframe')).toHaveCount(0);
  });
});
