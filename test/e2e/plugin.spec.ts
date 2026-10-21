import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { content, expect, open, undo } from './helpers';

/** A small plugin, made in the page: two panels, an event, an output format and a toolbar of its own. */
const install = (page: Page) =>
  page.evaluate(() => {
    const pane = (text: string) => () => Object.assign(document.createElement('p'), { textContent: text });
    const w = window as any;
    w.pluginEvents = [];
    w.ed.addEventListener('toy', (e: CustomEvent) => w.pluginEvents.push(e.detail));
    w.ed.options = {
      plugins: [
        {
          name: 'toy',
          events: ['toy'],
          labels: { one: 'Panel one', two: 'Panel two' },
          panels: [
            { id: 'one', title: 'Panel one', label: '1', build: pane('first') },
            { id: 'two', title: 'Panel two', label: '2', build: pane('second') },
          ],
          setup(ctx: any) {
            return {
              toolbar: ['#Toy', 'one', 'two', '|', 'bold'],
              output: { toy: () => 'TOY:' + ctx.editor.getText() },
              api: { shout: () => ctx.emit('toy', { shouted: true }) },
            };
          },
        },
      ],
    };
  });

test.describe('plugins', () => {
  test('a plugin brings its own toolbar and panels; the buttons open the sidebar with tabs', async ({ page }) => {
    await open(page, '<p>hello</p>');
    await install(page);
    await expect(page.locator('.aurebesh-group-label')).toHaveText('Toy');
    await expect(page.locator('.aurebesh-panel')).toBeHidden();
    await page.locator('.aurebesh-cmd-one').click();
    await expect(page.locator('.aurebesh-panel')).toBeVisible();
    await expect(page.locator('.aurebesh-panel-pane:visible')).toHaveText('first');
    await expect(page.locator('[role="tab"]')).toHaveText(['Panel one', 'Panel two']);
    // the sidebar is beside the text, and the second button switches the panel
    const stage = (await page.locator('.aurebesh-stage').boundingBox())!;
    const side = (await page.locator('.aurebesh-panel').boundingBox())!;
    expect(side.x).toBeGreaterThanOrEqual(stage.x + stage.width - 1);
    await page.locator('.aurebesh-cmd-two').click();
    await expect(page.locator('.aurebesh-panel-pane:visible')).toHaveText('second');
    await expect(page.locator('.aurebesh-cmd-two')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.aurebesh-cmd-one')).toHaveAttribute('aria-expanded', 'false');
  });

  test('the tabs follow the arrow keys, and Escape closes the sidebar and returns to the button', async ({ page }) => {
    await open(page, '<p>hello</p>');
    await install(page);
    await page.locator('.aurebesh-cmd-one').click();
    await page.locator('[role="tab"]').first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.aurebesh-panel-pane:visible')).toHaveText('second');
    await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveText('Panel two');
    await expect(page.locator('[role="tab"][aria-selected="true"]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.aurebesh-panel')).toBeHidden();
    await expect(page.locator('.aurebesh-cmd-two')).toBeFocused();
  });

  test('the events of a plugin become events of the element, and its output format can be submitted', async ({ page }) => {
    await open(page, '<p>hello</p>');
    await install(page);
    await page.evaluate(() => (window as any).ed.instance.plugin('toy').shout());
    expect(await page.evaluate(() => (window as any).pluginEvents)).toEqual([{ shouted: true }]);
    await page.evaluate(() => (window as any).ed.setAttribute('format', 'toy'));
    expect(await page.evaluate(() => new FormData(document.getElementById('form') as HTMLFormElement).get('body'))).toBe('TOY:hello');
    await content(page).click();
  });

  /** A plugin like a ticket designer: a panel with fields to drag into the text, a chip that survives the sanitizer, a format both ways. */
  const installFields = (page: Page) =>
    page.evaluate(() => {
      (window as any).ed.options = {
        toolbar: ['bold', 'italic'],
        plugins: [
          {
            name: 'fields',
            labels: { fields: 'Fields' },
            sanitize: { attributes: { span: ['data-field', 'contenteditable'] } },
            panels: [
              {
                id: 'fields',
                title: 'Fields',
                label: 'F',
                build() {
                  const list = document.createElement('div');
                  for (const name of ['name', 'date']) {
                    const item = document.createElement('div');
                    item.className = 'field-' + name;
                    item.draggable = true;
                    item.textContent = name;
                    item.addEventListener('dragstart', (e) => e.dataTransfer!.setData('application/x-field', name));
                    list.appendChild(item);
                  }
                  return list;
                },
              },
            ],
            setup(ctx: any) {
              const chip = (name: string) => '<span data-field="' + name + '" contenteditable="false">{' + name + '}</span>';
              return {
                toolbarExtend: [{ after: 'bold', items: ['|', 'fields'] }],
                dragover: (e: DragEvent) => e.dataTransfer?.types.includes('application/x-field'),
                drop(e: DragEvent) {
                  const name = e.dataTransfer?.getData('application/x-field');
                  if (!name) return false;
                  e.preventDefault();
                  return ctx.insert(chip(name), { x: e.clientX, y: e.clientY }) || true;
                },
                output: { fields: () => ctx.editor.getHTML().replace(/<span data-field="(\w+)"[^>]*>[^<]*<\/span>/g, '[[$1]]') },
                load: { fields: (v: string) => v.replace(/\[\[(\w+)\]\]/g, (_m: string, n: string) => chip(n)) },
              };
            },
          },
        ],
      };
    });

  test('a plugin adds its button to the toolbar the user gave, and a field is dragged from the sidebar into the text', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright cannot drive HTML5 drag and drop in WebKit (it is covered in Chromium and Firefox)');
    await open(page, '<p>Dear , welcome</p>');
    await installFields(page);
    await expect(page.locator('.aurebesh-toolbar button')).toHaveCount(3); // bold, italic, fields
    await page.locator('.aurebesh-cmd-fields').click();
    await page.locator('.field-name').dragTo(content(page).locator('p'), { targetPosition: { x: 40, y: 8 } });
    await expect(content(page).locator('span[data-field="name"]')).toHaveCount(1);
    await expect(content(page).locator('span[data-field="name"]')).toHaveText('{name}');
  });

  test('a dropped field is one step for undo and redo', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright cannot drive HTML5 drag and drop in WebKit (it is covered in Chromium and Firefox)');
    await open(page, '<p>Dear , welcome</p>');
    await installFields(page);
    await page.locator('.aurebesh-cmd-fields').click();
    await page.locator('.field-date').dragTo(content(page).locator('p'), { targetPosition: { x: 40, y: 8 } });
    await expect(content(page).locator('span[data-field="date"]')).toHaveCount(1);
    await undo(page);
    await expect(content(page).locator('span[data-field="date"]')).toHaveCount(0);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+Z' : 'Control+Y');
    await expect(content(page).locator('span[data-field="date"]')).toHaveCount(1);
  });

  test('after a drop the caret is behind the field, and one Backspace removes the whole chip', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright cannot drive HTML5 drag and drop in WebKit (it is covered in Chromium and Firefox)');
    await open(page, '<p>Dear , welcome</p>');
    await installFields(page);
    await page.locator('.aurebesh-cmd-fields').click();
    await page.locator('.field-date').dragTo(content(page).locator('p'), { targetPosition: { x: 40, y: 8 } });
    await expect(content(page).locator('span[data-field="date"]')).toHaveCount(1);
    await page.keyboard.press('Backspace');
    await expect(content(page).locator('span[data-field="date"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.querySelector('.aurebesh-content')!.textContent)).not.toContain('{date');
  });

  test('a field in the text is exported and read back through the format of the plugin', async ({ page }) => {
    await open(page, '<p>x</p>');
    await installFields(page);
    await page.evaluate(() => (window as any).ed.instance.setValue('<p>Dear [[name]]</p>', 'fields'));
    await expect(content(page).locator('span[data-field="name"]')).toHaveCount(1);
    expect(await page.evaluate(() => (window as any).ed.instance.getValue('fields'))).toBe('<p>Dear [[name]]</p>');
  });
});
