import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { content, expect, open } from './helpers';

const html = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.instance.getHTML());
const md = (page: Page): Promise<string> => page.evaluate(() => (window as any).ed.instance.getMarkdown());
const language = (page: Page) => page.locator('.aurebesh-codelang');

const start = async (page: Page, initial: string, extra: Record<string, unknown> = {}) => {
  await open(page, initial);
  await page.evaluate((o) => ((window as any).ed.options = { toolbar: ['codeblock', 'codeLanguage', 'bold'], ...o }), extra);
  await language(page).waitFor();
};
/** How many characters of the code that the highlighter has painted as the type of token (the CSS Custom Highlight API). */
const painted = (page: Page, type: string): Promise<number> =>
  page.evaluate((t) => {
    const h = (CSS as any).highlights?.get('aurebesh-' + t);
    if (!h) return 0;
    let n = 0;
    for (const range of h) n += range.toString().length;
    return n;
  }, type);

test.describe('the language of a code block', () => {
  test('is a box with Auto, Plain text and the languages, and a name for it', async ({ page }) => {
    await start(page, '<pre>x</pre>');
    const options = await language(page).locator('option').evaluateAll((os) => os.map((o) => [(o as HTMLOptionElement).value, o.textContent]));
    expect(options[0]).toEqual(['', 'Auto']);
    expect(options[1]).toEqual(['text', 'Plain text']);
    expect(options.map((o) => o[1])).toEqual(expect.arrayContaining(['JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'SQL', 'JSON', 'HTML', 'CSS', 'Bash', 'YAML']));
    await expect(language(page)).toHaveAccessibleName('Code language');
  });

  test('can only be used while the caret is in a code block, and shows the language of that block', async ({ page }) => {
    await start(page, '<p>text</p><pre data-language="python">print(1)</pre><pre>plain</pre>');
    await content(page).locator('p').click();
    await expect(language(page)).toBeDisabled();
    await content(page).locator('pre').first().click();
    await expect(language(page)).toBeEnabled();
    await expect(language(page)).toHaveValue('python');
    await content(page).locator('pre').nth(1).click();
    await expect(language(page)).toHaveValue('');
  });

  test('puts the language on the block with the caret, and leaves the text and the other blocks alone', async ({ page }) => {
    await start(page, '<pre>let a = 1;</pre><pre>let b = 2;</pre>');
    await content(page).locator('pre').first().click();
    await language(page).selectOption('javascript');
    expect(await html(page)).toBe('<pre data-language="javascript">let a = 1;</pre><pre>let b = 2;</pre>');
    await language(page).selectOption('python');
    expect(await html(page)).toBe('<pre data-language="python">let a = 1;</pre><pre>let b = 2;</pre>');
    await language(page).selectOption('');
    expect(await html(page)).toBe('<pre>let a = 1;</pre><pre>let b = 2;</pre>');
  });

  test('colours the code as that language, and plain text has no colours', async ({ page }) => {
    await start(page, '<pre data-language="python">def f(self):\n  return None # c</pre>');
    await expect.poll(() => painted(page, 'keyword')).toBeGreaterThan(0);
    const python = await painted(page, 'keyword');
    await content(page).locator('pre').click();
    await language(page).selectOption('text');
    await expect.poll(() => painted(page, 'keyword')).toBe(0);
    await language(page).selectOption('python');
    await expect.poll(() => painted(page, 'keyword')).toBe(python);
  });

  test('shows the language in the corner of the block, and not in the HTML text', async ({ page }) => {
    await start(page, '<pre data-language="sql">SELECT 1</pre>');
    const label = await content(page).locator('pre').evaluate((el) => getComputedStyle(el, '::before').content);
    expect(label).toBe('"sql"');
    expect(await content(page).locator('pre').innerText()).toBe('SELECT 1');
  });

  test('is typed with three backticks and the name, then Enter', async ({ page }) => {
    await open(page);
    await content(page).click();
    await page.keyboard.type('```py');
    await page.keyboard.press('Enter');
    await page.keyboard.type('x = 1');
    expect(await html(page)).toBe('<pre data-language="python">x = 1</pre>');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('after');
    await page.keyboard.press('Enter');
    await page.keyboard.type('```');
    await page.keyboard.press('Enter');
    await page.keyboard.type('plain');
    expect(await html(page)).toMatch(/<pre data-language="python">x = 1<\/pre><(p|div)>after<\/(p|div)><pre>plain<\/pre>/);
  });

  test('is in the Markdown after the fence, and comes back from it', async ({ page }) => {
    await start(page, '<pre data-language="typescript">const a: number = 1;</pre>');
    expect(await md(page)).toBe('```typescript\nconst a: number = 1;\n```');
    await page.evaluate(() => (window as any).ed.instance.setMarkdown('```ts\nlet b = 2;\n```'));
    expect(await html(page)).toBe('<pre data-language="typescript">let b = 2;</pre>');
  });

  test('shows a language that is not in the list, and keeps it', async ({ page }) => {
    await start(page, '<pre data-language="mermaid">graph TD;</pre>');
    await content(page).locator('pre').click();
    await expect(language(page)).toHaveValue('mermaid');
    expect(await html(page)).toBe('<pre data-language="mermaid">graph TD;</pre>');
  });

  test('cannot be changed when the editor is read-only', async ({ page }) => {
    await start(page, '<pre>x</pre>', { readOnly: true });
    await expect(language(page)).toBeDisabled();
  });
});

test.describe('the row of the language of a code block', () => {
  const row = (page: Page) => page.locator('.aurebesh-code-tools');

  test('shows while the caret is in a code block, with the language of that block, and hides outside it', async ({ page }) => {
    await open(page, '<p>text</p><pre data-language="python">print(1)</pre><pre>plain</pre>');
    await expect(row(page)).toBeHidden();
    await content(page).locator('pre').first().click();
    await expect(row(page)).toBeVisible();
    await expect(row(page).locator('.aurebesh-codelang')).toHaveValue('python');
    await content(page).locator('pre').nth(1).click();
    await expect(row(page).locator('.aurebesh-codelang')).toHaveValue('');
    await content(page).locator('p').click();
    await expect(row(page)).toBeHidden();
  });

  test('gives the block its language, from the row', async ({ page }) => {
    await open(page, '<pre>SELECT 1</pre>');
    await content(page).locator('pre').click();
    await row(page).locator('.aurebesh-codelang').selectOption('sql');
    expect(await html(page)).toBe('<pre data-language="sql">SELECT 1</pre>');
    await expect(row(page)).toBeVisible(); // it stays while the box has the focus
  });

  test('is not there twice when the toolbar has the box itself, nor without a code block item', async ({ page }) => {
    await start(page, '<pre>x</pre>');
    await expect(row(page)).toHaveCount(0);
    await page.evaluate(() => ((window as any).ed.options = { toolbar: ['bold'] }));
    await page.locator('.aurebesh-toolbar').first().waitFor();
    await expect(row(page)).toHaveCount(0);
  });
});
