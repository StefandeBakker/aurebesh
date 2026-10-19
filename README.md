# Aurebesh

A lightweight, dependency-free WYSIWYG editor for the web. Rich text, tables, code blocks with syntax highlighting, images and video, with pluggable uploads and built-in HTML sanitizing.

A vanilla TypeScript core plus an `<aurebesh-editor>` web component, with thin wrappers for React, Vue and Angular, so it works in those or in plain HTML.

```bash
npm install aurebesh
```

**Features:** bold/italic/underline/strike, inline code, super/subscript, headings, quotes, lists, text alignment, font and text size, text and highlight colour, links (with a small editor), images (upload, paste, drag and drop, width/alignment/alt tools), YouTube/Vimeo/mp4 video, tables (size picker, header row, row/column tools, merge and split cells, drag column borders, Tab navigation, undo), code blocks with syntax highlighting, horizontal line, undo/redo, translatable UI, form integration.

## Vanilla

```ts
import { Aurebesh } from 'aurebesh';

const editor = new Aurebesh(document.querySelector('#editor')!, {
  value: '<p>Hello</p>',
  placeholder: 'Type something...',
});
editor.on('change', (html) => console.log(html));
editor.getHTML();   // clean, sanitized HTML ('' when the editor is empty): this is what to store
editor.getText();   // plain text
editor.destroy();
```

`getHTML()` (and the `change` event and the `value` of the web component) return sanitized, tidied HTML: only what the allow-list
permits, no leftovers from the browser's editing commands (empty styles, wrapper spans, placeholder `<br>`), nested lists in a
consistent shape, and an empty string for an empty editor.

## React

```tsx
import { AurebeshEditor } from 'aurebesh/react';

const options = { media: { adapter: myUploadAdapter } }; // keep it stable: define it outside the component

function Post() {
  const [html, setHtml] = useState('<p>Hello</p>');
  return <AurebeshEditor value={html} onChange={setHtml} options={options} name="body" />;
}
```

Props: `value` / `defaultValue`, `onChange`, `onError`, `options`, `placeholder`, `readOnly`, `required`, `name`, `toolbar`, `id`, `className`, `style`.
A `ref` gives you the `<aurebesh-editor>` element (`ref.current.instance` is the editor).
An options object with the same content is ignored; a new inline function (such as an upload adapter written inside the component) rebuilds the editor, so hoist it or `useMemo` it.

## Vue 3

```vue
<script setup>
import { ref } from 'vue';
import { AurebeshEditor } from 'aurebesh/vue';
const html = ref('<p>Hello</p>');
const options = { media: { adapter: myUploadAdapter } };
</script>

<template>
  <AurebeshEditor v-model="html" :options="options" name="body" />
</template>
```

Props: `v-model`, `options`, `placeholder`, `readOnly`, `required`, `name`, `toolbar`. Events: `update:modelValue`, `change`, `error`.

## Angular

A standalone component with forms support, like the React and Vue wrappers. Angular 17 or newer; `@angular/core`, `@angular/common` and `@angular/forms` are peer dependencies.

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AurebeshEditor } from 'aurebesh/angular';

@Component({
  selector: 'app-note',
  imports: [AurebeshEditor, ReactiveFormsModule],
  template: `<aurebesh-angular [formControl]="body" placeholder="Start typing..." />`,
})
export class NoteComponent {
  body = new FormControl('<p>Hello</p>');
}
```

That is all: no schema, no directive to write, no `import 'aurebesh/element'`. It works with `formControl`, `formControlName` and `ngModel` (`disable()` makes the editor read-only, and the control is marked as touched when the focus leaves it). Without forms use `[(value)]`:

```html
<aurebesh-angular [(value)]="html" [options]="options" [counter]="true" [maxLength]="5000" (count)="words = $event.words" />
```

| Input | |
|---|---|
| `value` | the HTML (with `valueChange`: `[(value)]`) |
| `options` | everything that cannot be an attribute: `media`, `fonts`, `colors`, `labels`, `plugins`... Define it once; a new object with the same content is ignored |
| `placeholder`, `maxLength`, `counter`, `readOnly`, `required`, `name`, `format` | as the attributes of the element |
| `page`, `pageOrientation`, `pageMargin` | the page format (see [Page format](#page-format)) |
| `toolbar`, `quickbar` | arrays of toolbar items; a change builds the editor again and keeps the text |

Outputs: `valueChange` (the HTML), `ready` (the editor), `count` (words and characters), `pageChange`, `layoutChange` and `error`. The component has `editor` (the `Aurebesh` instance, once it exists) and `editorElement` for what the inputs do not cover, for example `@ViewChild(AurebeshEditor) editor`.

The editor is built in the browser only. With server-side rendering the component renders an empty element, so nothing runs on the server, and the editor appears when the page is hydrated. The package contains the Angular code in the format that the Angular CLI links when your application is built (partial compilation), so it works with AOT.

## Web component (any framework)

```ts
import 'aurebesh/element'; // registers <aurebesh-editor>
```

```html
<aurebesh-editor name="body" placeholder="Type..." required><p>Initial</p></aurebesh-editor>
```

- Emits `change` (`event.detail` is the HTML) and `error` events; has a `value` property.
- Anything that can't be an attribute (functions, lists) goes in the `options` property:
  `el.options = { media: { adapter: endpointAdapter({ url: '/api/upload' }) } };`
- Works inside a `<form>`: with a `name` its HTML is submitted, `required` is validated, `form.reset()` restores the initial content.

## Options

| Option | Description |
| --- | --- |
| `value` | Initial HTML (sanitized) |
| `placeholder` | Placeholder text |
| `readOnly` | Disable editing |
| `toolbar` | Items, e.g. `['bold','italic','|','link']`; `[]` hides it |
| `fonts` | Font list for the font picker (default: 15 system font stacks, nothing to download) |
| `colors` | Swatches for text/highlight colour (default: 40) |
| `maxLength` | Maximum number of characters, see "Counter and limit" |
| `counter` | Show "12 words · 80 / 500 characters" under the text |
| `markdownShortcuts` | Typing `# `, `- `, … at the start of a line formats it (default `true`) |
| `labels` | Override the editor's own texts, see below |
| `media` | Image and video settings, see below |

The toolbar is made of **blocks**. In the `toolbar` option `|` starts a new block and `/` starts a second row inside a block. A block always stays in one piece: when the toolbar is narrow, whole blocks go to the next line instead of a block being cut in two. The default:

```
font size clear clearStyle / bold italic underline underlineStyle strike strikeStyle highlight color | ul ol task / alignLeft alignCenter alignRight | h1 h2 quote / code codeblock | link image video / table hr | columns
```

That is five blocks: the font (typeface, size and clear formatting on top, character styles, highlight and colour below), the paragraph (lists, then alignment), the styles (headings and quote on top, then the two kinds of code, inline and block), what you can insert (link, picture and video, then table and line) and the layout (columns). Leave out every `/` and each block is a single row that wraps like before (a block with a name, `#Name`, that has more than three buttons goes to the next line after every three); a toolbar without any `|` is one block.

**Icons.** Buttons whose symbol was not obvious (undo and redo, clear formatting, lists, alignment, quote, the two kinds of code, link, picture, video, table, line, text direction) show a line drawing; the letters of bold, italic, underline and strikethrough and the headings stay as they are. The two colour buttons are a letter A (text colour) and a marker pen (highlight), each with a bar underneath that shows the colour chosen last (black and yellow to begin with, and again after "Automatic" or "No highlight") and a small arrow for the palette that opens. The drawings are inline SVG in the colour of the text, so they follow your theme and the pressed state, and the editor needs no icon font or image files. A button keeps its name for screen readers and as its tooltip (the `labels` option translates it).

**Undo and redo** are in a small strip of their own above the toolbar: the `quickbar` option (default `['undo', 'redo']`) lists what is in it, and `quickbar: []` removes it. With a `toolbar` of your own the strip is empty, so they are not there twice; put `undo` and `redo` in `toolbar` or give `quickbar` yourself. On the element: `toolbar="font,size,/,bold,italic,|,link"` and `quickbar="undo,redo"`.

Items that are not in the default have a place in the same blocks, so a toolbar with everything reads like this:

```
font size clear clearStyle / bold italic underline underlineStyle strike strikeStyle sub sup highlight color | ul ol task / alignLeft alignCenter alignRight alignJustify ltr rtl | h1 h2 h3 quote / code codeblock | link image video / table hr | columns page orientation
```

**A ribbon.** Give a block a name with `#Name` and the toolbar gets the larger look of a ribbon: the name above the buttons, bigger buttons, a tinted pressed state. `>` sends the blocks after it to the far end of the toolbar. `indent` and `outdent` move a paragraph, heading or quote in steps of 24px (a list item goes one level deeper or back), and `fullscreen` makes the editor fill the window (Escape returns). Hovering a button shows a tooltip with its name and shortcut.

```
#History undo redo | #Text bold italic underline | #Structure h1 h2 quote | #Align alignLeft alignCenter alignRight indent outdent | #Lists ul ol | #Insert link image video table hr | #Code code codeblock > #View fullscreen
```

The colours of this look are variables too: `--aurebesh-icon`, `--aurebesh-label` (the names), `--aurebesh-hover`, `--aurebesh-active-bg`, `--aurebesh-active-color`, `--aurebesh-tip-bg` and `--aurebesh-tip-color`.

**Layout panel.** The `layout` item is a button that opens a panel beside the text (and closes it again): the page width (the same choice as the `page` item), the maximum width of the text, the space around it and the line spacing. The last three are only about how the text is shown: they are variables on the editor (`--aurebesh-text-width`, `--aurebesh-pad-x`, `--aurebesh-pad-y`, `--aurebesh-line`) and are not part of the HTML. Set them from code with `layout: { textWidth: 800, padding: 48, lineHeight: 1.7 }` (option) or `editor.setLayout({ padding: 24 })`, read them with `getLayout()`, and listen to the `layout` event (the element fires a `layout` event with the settings as `detail`). `null` is the default of the editor. On a page format the width and the space belong to the sheet, so those two fields are off.

Theme via CSS variables: `--aurebesh-border`, `--aurebesh-bg`, `--aurebesh-color`, `--aurebesh-accent`, `--aurebesh-toolbar-bg`, `--aurebesh-code-bg`, `--aurebesh-min-height`, `--aurebesh-max-height` (a fixed maximum height of the text area: the text then scrolls inside the editor while the toolbar stays in view; without it the editor grows with the text and the toolbar scrolls along with the page), and `--aurebesh-hl-keyword|string|comment|number|function|type|tag` for code colours.

## Sidebar and plugins

The **sidebar** is a panel beside the text with room for one or more panels, shown as tabs. The toolbar item `sidebar` is one button that shows and hides it (it opens with the panel that was open last), and has **all** the panels: `layout` (the page width, the text width, the space around the text and the line spacing), `blocks` (see below) and the panels of plugins. So `toolbar: [..., 'sidebar', 'fullscreen']` is all it takes, and the layout and the blocks are a part of the sidebar, not buttons of their own. A panel can still have a button of its own (`layout`, `blocks` or the id of a plugin panel), also next to `sidebar`: it opens that panel. `editor.openPanel(id)`, `closePanel()` and `getOpenPanel()` do the same from code, and the `panel` event tells which one is open. With one panel the header shows its title, with several it shows tabs (arrow keys move between them). Escape closes the sidebar and the focus goes back to the toolbar item.

A **plugin** adds a mode or a set of tools without the editor knowing about it. It is a plain object in the `plugins` option, made with `definePlugin` for type checking:

```ts
import { Aurebesh, definePlugin } from 'aurebesh';

const notes = definePlugin({
  name: 'notes',
  css: '.my-note{color:#b45309}',
  labels: { notes: 'Notes', 'ui.notes.empty': 'No notes yet' },
  commands: { stamp: { name: 'stamp', label: '✓', title: 'Stamp', run: () => document.execCommand('insertText', false, '✓') } },
  panels: [{ id: 'notes', title: 'Notes', label: 'N', build: () => Object.assign(document.createElement('div'), { textContent: 'No notes yet' }) }],
  setup(context) {
    return {
      toolbar: ['#Notes', 'stamp', 'notes', '|', 'bold', 'italic'], // when the user gives no toolbar
      api: { count: () => 0 }, // editor.plugin('notes').count()
    };
  },
});

new Aurebesh(el, { plugins: [notes] });
```

- **Toolbar items** go through the same blocks as every other item (`|`, `/`, `#Name`, `>`), with the same tooltips and keyboard handling. `commands` gives them a label, a title and what they do; `icons` adds line drawings (shapes on a 24 by 24 grid); `buildItem(item)` builds an item itself (return `undefined` for one that is not yours). A panel in `panels` gets a toolbar item with its `id` that opens it. `toolbarExtend: [{ after: 'bold', items: ['|', 'myTool'] }]` adds items to the toolbar *also when the user gave their own* (`after` or `before` an item; at the end when it is not there; a name that is in the toolbar already is not added twice).
- **Texts and styles:** `labels` are the English texts of the plugin, below the `labels` the user gives (a plugin can ship a translation to spread into them); `css` is added to the page once.
- **Hooks** of the instance that `setup` returns: `attach` (the editor exists: `context.content` and `context.stage` can be used), `keydown`, `paste` and `drop` (return `true` when you dealt with it, and the editor leaves it alone), `dragover` (return `true` for a drag you want: a browser only sends `drop` to a target that accepts it, and the editor accepts files only), `input`, `readOnlyChanged`, `destroy`. `output` adds formats to `getValue(name)` and to the `format` of the element, `load` is the other side (`editor.setValue(value, name)` reads that format and returns HTML), and `markdownShortcuts` sets their default.
- **Dragging fields from a panel into the text:** make the items in your panel `draggable`, set the data in `dragstart`, accept it in `dragover` and put it in the text in `drop` with `context.insert(html, { x: e.clientX, y: e.clientY })`. `insert` places the caret at that point, sanitizes what you give it (so list the attributes of your chip in `sanitize`), is one step for undo, and leaves the caret behind a non-editable chip (`contenteditable="false"`), so one Backspace removes it.
- **Events:** `context.emit(name, detail)` reaches `editor.on(name)`; names listed in `events` also become DOM events of the `<aurebesh-editor>` element.
- **The sanitizer** keeps only what a plugin allows, and only in that editor: `sanitize: { attributes: { span: ['data-x'] }, clean(el) { /* remove what is not safe */ } }`.
- **The context** has `editor`, `doc`, `root`, `content`, `stage`, `t()` (texts), `changed()` (report a change you made), `fail()`, `listen()` (a listener that is removed on destroy), `focus()`, `insert()`, `restoreSelection()`, `closeOnOutside()`, `isEditable()` and `openPanel()` / `closePanel()`.

On the element: `el.options = { plugins: [notes] }`. React and Vue pass them in `options` too.

## Building blocks: rows, columns and content

The *Blocks* tab of the sidebar (the `sidebar` item, or the `blocks` item for a button of its own) has blocks to build a layout from, in the order *rows, columns, content*:

- **Layout**: a row of 1 column, 2 columns, 3 columns, 30 / 70, 70 / 30 or 25 / 50 / 25.
- **Content**: heading, text, image, button (a link that looks like one) and divider.

**Drag** a block onto the text: a line shows where it will go (before or after the block under the pointer, or in a column), and it can go in a column, also a row in a column. **Click** a block to add it after the block that has the caret instead (or in the place of an empty line), which is how to do it with the keyboard and on a touch screen, where dragging between the panel and the text does not work. A heading or a paragraph is added with its text selected, so that typing replaces it; an image asks for a file (and goes through the upload adapter); a button is a link, so its address is changed with the link tools. Adding a block is one step for undo.

While the caret is in a row, a row of tools shows its **distribution** (the presets, or the one the HTML has), the **gap** between the columns, and **Delete row layout**. A new distribution with fewer columns moves the content of the columns that go to the last one that stays; with more, the new columns are empty. The editor keeps the layout whole: every column has something to type in, there is a paragraph beside a row at the start and the end of the text, and Backspace at the very start of a column (or Delete at the very end) does nothing instead of joining the column with what is beside it.

```js
new Aurebesh(el, { toolbar: [...DEFAULT_TOOLBAR, 'sidebar'] });
editor.addBlock('row2');          // from code: after the block that has the caret
editor.addBlock('heading');
```

A row is plain HTML, a grid of columns, and nothing of the editor is in it:

```html
<div data-layout="row" style="display: grid; grid-template-columns: 3fr 7fr; gap: 16px">
  <div data-layout="col" style="min-width: 0"><h2>Heading</h2></div>
  <div data-layout="col" style="min-width: 0"><p>Text</p>
    <p><a href="https://example.com" data-button="" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: #ffffff; border-radius: 6px; text-decoration: none">Button</a></p></div>
</div>
```

The sanitizer allows this and no more: a `div` with `data-layout` `row` or `col`; on a row `display: grid`, `grid-template-columns` of up to six columns in `fr` or `%`, `gap` in px and `align-items`; on a column padding, a background and `min-width: 0`; on a link that has `data-button` the few styles of a button. Anything else is removed, so a grid cannot be used for more than a layout. CSS grid is not supported by e-mail clients: for HTML e-mail use a table instead (see Tables). In Markdown and text the columns are the content one after the other. The editor shows the columns with a dashed outline; the HTML you get has none of it, so give `[data-layout="row"]` and the columns the look and the responsive behaviour you want in your own CSS (for example one column on a narrow screen, with `grid-template-columns` set to `1fr` in a media query with `!important`).

Reordering blocks by dragging them inside the text, and a panel with the properties of the block that is selected, are not there yet.

## Task lists

The `task` item (in the default toolbar, next to the lists) turns the line with the caret into a list with a box before every item; in a bullet list or a numbered list it turns that list into one, and in a task list it makes it an ordinary list again. Also from the slash menu (`/task`) and with `Mod+Shift+9`.

- **Check** an item with a click on its box (the caret stays where it was), or with `Mod+Enter` when the caret is in it. A read-only editor cannot be checked.
- **Enter** makes a new item that is not checked, also after a checked one; Enter on an empty item leaves the list.
- **Nested**: `Tab` makes the item part of a list inside the item before it, which is a task list too, and `Shift+Tab` takes it back. The checked state goes along.
- **Paste**: the checkboxes of a task list pasted from GitHub and the like become task items.

The HTML has no input in it, only two attributes:

```html
<ul data-task="">
  <li data-checked="true">Write the docs</li>
  <li>Release<ul data-task=""><li>Tag</li></ul></li>
</ul>
```

The box is drawn with CSS, which the editor has. On a page that only shows the HTML, put `taskListCss()` in a `<style>` (it is exported), and colour it with `--aurebesh-task-color`, `--aurebesh-task-border` and `--aurebesh-task-radius`. The sanitizer allows `data-task` on a `ul` and `data-checked="true"` on an item of one, and nothing else. In Markdown it is `- [ ] todo` and `- [x] done`, in and out, nested as well; in a list where only some items have a box, all of them get one. In text it is the content. Two limits: checking an item is a direct DOM edit, so the browser's undo does not cover it (typing and splitting are), and the state is not read out by a screen reader, because the box is not an element: use `Mod+Enter` and write the state in the text when it matters.

## Clearing one kind of formatting

The `clear` item takes away all formatting of the selected text. The `clearStyle` item (a button with a list, an eraser) takes away only one kind and leaves the rest: **bold**, **italic**, **underline**, **strikethrough**, **text colour** or **highlight** (and *Clear formatting* for everything). A kind that the selected text does not have is greyed out. It works on the selected text; where only part of it has the formatting, all of it ends up without. `Mod+\` clears all formatting from the keyboard; bold, italic, underline and strikethrough already have their own shortcuts, which toggle them. It uses the commands of the browser, so every step is in the undo history (taking away something that only part of the text has is two steps).

## Underline and strikethrough: the kind of line and its colour

The `underline` and `strike` items (`Mod+U`, `Mod+Shift+X`) draw a single line, as before. Two items next to them, `underlineStyle` and `strikeStyle` (a button with a list), give the line another look:

- **Underline**: *solid*, *dashed*, *dotted*, *double* or *wavy*, and a **colour** for the line that differs from the colour of the text.
- **Strikethrough**: a *single* or a *double* line, and a colour.

The colour is from the palette of the editor, or *Automatic* for the colour of the text. It acts on the selected text, which gets the line first when it has none, and with the caret in an underlined or struck-through piece of text it acts on all of it. The current kind is marked in the list.

The text stays in `<u>` or `<s>` and the look is two properties on it, so the text still has its line where the styles are not read (a mail client, Markdown):

```html
<u style="text-decoration-style: wavy; text-decoration-color: #dc2626">check this</u>
<s style="text-decoration-style: double">gone</s>
```

The sanitizer allows `text-decoration-style` (`double`, `dashed`, `dotted` or `wavy`) and `text-decoration-color` (a hex or `rgb()` colour) on `u`, `s`, `strike` and `del`, and nothing else. In Markdown the line is `<u>text</u>` and `~~text~~`: the kind of line and the colour are not kept. The look is a direct DOM edit, so the browser's undo does not take it back (the line itself it does). A line above the text (overline) and the thickness of a line are not there.

## Callouts

A callout is a block that stands out: a note, a tip, a warning. Add the `callout` item to the toolbar for a button with the types (it puts the blocks of the selection in one, changes the type of the one the caret is in, and takes it away with *No callout*), or type `/` at the start of a line for the slash menu, which also has the headings, the lists, the quote, the code block and the divider. Type to narrow it, arrow keys and Enter to pick, Escape to close; it is a listbox, and the text area names the active option with `aria-activedescendant`.

The types are the ones GitHub knows: `note`, `tip`, `important`, `warning` and `caution`, each with an icon and a colour. Enter on an empty last line leaves the callout, and Backspace at its start takes it away (the text stays). Wrapping and unwrapping are one step for undo.

```js
new Aurebesh(el, {
  toolbar: [...DEFAULT_TOOLBAR, 'callout'],   // the slash menu is on when there is a callout item; slash: false turns it off
  callouts: [{ id: 'deal', label: 'Deal', color: '#ff0066' }, { id: 'note' }],  // your own types; default: the five above
});
```

A callout is plain HTML, and the colour is a CSS variable, so it can be changed in CSS as well as in the options:

```html
<div data-callout="warning"><p>Check the <strong>settings</strong> first.</p></div>
```

```css
:root { --aurebesh-callout-warning: #b45309; --aurebesh-callout-radius: 12px; }
```

The editor styles callouts itself. On a page where you only show the HTML, use `calloutCss()` (with `DEFAULT_CALLOUTS` or your own types) to get the same CSS as a string and put it in a `<style>`. A `CalloutDef` is `{ id, label?, color?, icon? }`: the `id` is a name of up to 20 letters, digits and hyphens, the `color` a hex or `rgb()` value, the `icon` one of `note`, `tip`, `important`, `warning` or `caution` (default `note`).

The sanitizer allows `data-callout` on a `div` when the value is such a name, and nothing else of it (no classes, no styles). The type is only visual: the colour and the icon are not read out, so write the word in the text ("Warning: …") when it matters. In Markdown a callout is an alert, `> [!WARNING]` followed by the quote, and an alert is read back as a callout; in text it is its content. The empty paragraph that the editor keeps beside a callout at the start or the end of the text, to be able to type there, is not in the HTML you get.

## Counter, limit and ready

```js
const editor = new Aurebesh(el, { counter: true, maxLength: 500 });
editor.on('ready', (ed) => {});        // once, when the editor is built (also for a listener added later)
editor.on('count', ({ characters, charactersNoSpaces, words }) => {});
await editor.whenReady();
editor.getStats();                     // { characters, charactersNoSpaces, words }
editor.getText();                      // plain text: line break between blocks, tab between table cells
editor.setMaxLength(300); editor.setCounter(false); editor.isOverLimit();
```

- Characters are counted as people count them (an emoji or a letter with accents is one; line breaks are free). Words use the browser's word segmentation, so Chinese and Japanese work too.
- With `maxLength`, typing, dropping and pasting stop at the limit (a paste that doesn't fit is inserted as plain text, cut off) and a message shows. Deleting always works. Text set with `setHTML()` or the `value` is never cut off; it is marked in red and, in a `<form>`, the field is invalid (`validity.tooLong`).
- Web component: attributes `maxlength="500"` and `counter`, events `ready` (detail: the instance) and `count` (detail: the stats). React: props `maxLength`, `counter`, `onReady`, `onCount`. Vue: props `max-length`, `counter` and events `@ready`, `@count`.
- Text input through an input method (IME) cannot be cancelled while composing; the limit is then enforced by the validity check.
- Texts are `ui.words.*`, `ui.characters.*` and `ui.limitReached` in `labels`.

## Page format

By default the editor is responsive: as wide as its container. A page format makes it show a sheet of a fixed size on a grey desk, so you see the document the way it will be printed or shown.

```js
new Aurebesh(el, { page: 'a4' });
editor.setPage('ticket-80');                        // or in code later; setPage(null) goes back to responsive
editor.setPage({ format: 'a4', orientation: 'landscape', margin: '15mm' });
editor.setPage('600px');                            // a width: 600, '600px', '80mm', '21cm', '8.5in', '300pt'
```

```html
<aurebesh-editor page="a4"></aurebesh-editor>
<aurebesh-editor page="a4" page-orientation="landscape" page-margin="15mm"></aurebesh-editor>
<aurebesh-editor page="80mm"></aurebesh-editor>
```

- **Presets**: `a3`, `a4`, `a5`, `a6`, `letter`, `legal` (paper, with a height) and `ticket-80`, `ticket-58` (thermal rolls: 80 / 58 mm wide, as long as the content), plus `responsive`. Each has a margin of its own (20 mm for A4, 4 mm for an 80 mm ticket); `margin` overrides it with one to four lengths, like CSS padding. A width you give yourself has no height. Anything that is not a plain number or a length in px, mm, cm, in or pt is refused.
- **Page breaks**: for paper with a height, a line marks the end of every page, and `editor.getPageCount()` tells how many pages the content takes. It is an approximation: text is not moved to keep a line or a table together, so a line can straddle the mark. Continuous paper (tickets) and responsive have no page breaks.
- **Not in the HTML**: the format is a setting of the editor, not part of `getHTML()`; your app stores it next to the document. The `page` event (`editor.on('page', ...)`, or a `page` CustomEvent on the element; React `onPageChange`, Vue `@page-change`) tells you when it changes, also when a user picks one in the toolbar.
- **Toolbar**: add the `page` item (not in the default toolbar) for a select with all presets, and `orientation` for a button that turns the sheet between portrait and landscape: `toolbar: ['page', 'orientation', '|', 'bold', ...]`. The button is only on for paper with a height; picking another paper keeps the sheet turned the way it is. In code: `editor.setPageOrientation('landscape')`.
- **Print and PDF**: `editor.print()` opens the print dialog with the right paper size and margins (choose "Save as PDF" there). `editor.getPrintHTML()` gives a standalone HTML document with that `@page` size, for a server that makes PDFs: `page.pdf({ preferCSSPageSize: true })` in Puppeteer or Playwright gives A4 pages for an A4 format. A ticket gets one page of its width and the length of the text: browsers cannot say "as long as needed" in `@page`, so that length is measured. Code colours are not printed, and `print()` needs a page whose content security policy allows an inline `srcdoc` frame.
- The sheet is as wide as the paper (an A4 sheet is 794 px). In a container that is narrower the sheet shrinks to fit, and then the page breaks are no longer where the paper would break.

## Tables: merging cells and column widths

- **Merge**: select across cells by dragging and press *Merge cells* in the table tools row; the text of the cells is kept, one after the other. The selection is read as a rectangle, and a merged cell that sticks out of it is taken in. **Split** turns a merged cell back into single cells (the text stays in the first). Both buttons are only on when they can do something. Merging and splitting are part of the undo history.
- **Rows and columns** keep working in tables with merged cells: a row or column added inside a merged cell makes it bigger, one added beside it gets matching cells, and deleting shrinks a merged cell instead of breaking the table.
- **Handles** appear on the table that has the caret (or the pointer), made with pointer events so that they work with a mouse, a finger and a pen, and bigger on a touch screen: on every border between two cells a handle to drag the **column** wider or the **row** taller (a row is never lower than 24px; its height is stored as `<tr style="height: 80px">`), and a **grip** at every row and every column. Drag a grip to **move** the row or the column (a line shows where it goes; one step for undo; a column keeps its width), or tap it to **select** the whole row or column, which is also how to select cells on a touch screen. A row or column cannot move past a cell that is merged over several rows or columns; the editor says so. The *Move row up/down* and *Move column left/right* buttons in the table tools do the same from the keyboard (they are off where the move is not possible).
- **Selected cells** are shown with a frame, so it is clear what *Merge* and the cell properties work on. The handles and frames are in a layer over the text, not part of it, and not in the HTML.
- **Column widths**: drag the border between two columns (the pointer changes). Widths are stored as percentages in a `<colgroup>` (`<col style="width: 40%">`), so the table keeps its proportions when the editor is resized; a column never gets narrower than 5%. Dragging is a direct DOM edit, so Ctrl+Z does not undo it, and it needs a mouse or pen (not touch yet). Adding or deleting a column keeps the other widths in proportion.
- **Cell properties** work on the cells that are selected (drag over them, or the one under the caret) in the same row of table tools: a **background**, a **border** (width: none, thin, medium or thick; and a colour), the **horizontal** alignment (left, centre, right) and the **vertical** one (top, middle, bottom). A button that is on shows it, and clicking it again takes it away. Every change is one step for undo, and the cells stay selected so the next change goes to the same ones. They are written as `style` on the `<td>`/`<th>` (`background-color`, `border`, `text-align`, `vertical-align`) and only those, with colours as hex or `rgb()`.
- **Keyboard**: Tab and Shift+Tab walk the cells (Tab in the last cell adds a row; Shift+Tab in the first goes to what is before the table). Up and Down move to the cell above or below *on the screen*, from the top or bottom line of a cell, with the caret staying about where it was from side to side; in a table with merged cells the browsers go by the order of the HTML instead, which ends up beside the cell. Past the edge of the table they go on to the block after or before it. Left and Right at the edge of a cell go to the next cell as before.
- **Copy and paste rows and columns**: *Copy row* / *Copy column* copy the rows or columns the selection reaches; *Paste row below* / *Paste column right* put them in the table around the caret, also in another table of the page (a copied row of three cells in a table of two columns loses the third; a shorter one is filled up). Each paste is one step for undo. A merged cell is pasted as one plain cell, and where a merged cell reaches into the new row or column it grows, as when adding one. What was copied is also put on the clipboard as a table and as tab-separated text, for a spreadsheet or another document (where the browser allows it).
- **Caption**: the *Table caption* button adds a `<caption>` above the table with the caret in it, and takes it away again (also from inside the caption). Enter or Tab in the caption goes on to the first cell, so it stays one line.
- The sanitizer keeps `colspan`/`rowspan` (plain numbers) and `<col>` widths in percent; a `<colgroup>` without usable widths (Word writes one) is removed. Markdown cannot merge cells: the text goes in the first position a merged cell covers, the rest stays empty.

## HTML, Markdown and text: in and out

```js
editor.getHTML();                 // clean, sanitized HTML (the default, and what `change` emits)
editor.getMarkdown();             // GitHub-flavoured Markdown
editor.getText();                 // plain text
editor.getValue('markdown');      // any of 'html' | 'markdown' | 'text'

editor.setHTML('<p>Hello</p>');
editor.setMarkdown('# Hello\n\n- **bold** item');   // Markdown in
editor.setValue('# Hello', 'markdown');              // the same, by format: 'html' | 'markdown' | 'text'
import { toMarkdown, fromMarkdown, toText } from 'aurebesh'; // the same for any string (needs a DOM)
```

- **Markdown in** is read as GitHub-flavoured Markdown and goes through the sanitizer like any HTML, so Markdown that contains HTML (`<script>`, `onerror=`, `javascript:` links) cannot bring anything unsafe in. Like `setHTML` it does not send `change`. `fromMarkdown(md)` gives the sanitized HTML for a string without an editor.
- `setValue(text, 'text')` makes a paragraph of each block of lines and a line break of each other line; nothing in it is read as markup.
- Web component: `el.markdown` (read and write), `el.text`, and `format="markdown"` (or `"text"`) makes a surrounding `<form>` submit that format.

**Markdown-first.** With `valueFormat: 'markdown'` the editor works in Markdown: `value` is Markdown, `getValue()` and `setValue()` use it by default, and `change` sends Markdown. `getHTML()` still gives HTML. On the element it is the `value-format="markdown"` attribute; then `el.value` is Markdown, the text inside the element is the initial Markdown, and a form submits Markdown. The wrappers need nothing special: React, Vue and Angular take `options={{ valueFormat: 'markdown' }}` and then `value` / `v-model` / `[(value)]` are Markdown.

```html
<aurebesh-editor value-format="markdown"># My notes

- one
- two</aurebesh-editor>
```

**Writing in Markdown or HTML: the views.** The `modes` option puts a small switch in the footer, on the right (the word and character counts stay on the left): **Editor**, **HTML** and **Markdown**. The HTML and Markdown views show the content as text that you can edit; what you type replaces the content of the editor (after a short pause, when the field loses the focus and when you switch back), and it is sanitized like any HTML. The toolbar is out of use while a source view shows, since it works on the text of the editor.

```js
new Aurebesh(el, { modes: true });                      // Editor | HTML | Markdown
new Aurebesh(el, { modes: ['markdown'] });              // Editor | Markdown
new Aurebesh(el, { modes: true, mode: 'markdown' });    // start in the Markdown view
editor.getMode(); editor.setMode('html');               // from code
editor.on('mode', (mode) => {});                        // 'editor' | 'html' | 'markdown'
```

On the element: `<aurebesh-editor modes>` (all three), `modes="markdown"` or `modes="html,markdown"`, `mode="markdown"`, and a `mode` event. Together with `value-format="markdown"` this gives an editor for Markdown content that can be written visually or as text. Switching to the Markdown view of a text with things Markdown cannot hold (colours, columns...) shows a note, because going back may change it. The texts are in the `ui.mode.*` labels.

### What a Markdown round trip keeps and loses

Markdown to HTML to Markdown gives the same Markdown for what the editor writes itself (the tests check this). Written by hand, Markdown is normalised: `*a*` and `_a_` both come back as `*a*`, a setext heading (`Title` over `=====`) as `# Title`, `*` and `+` bullets as `-`, and a soft line break in a paragraph as a space. A line break made with `Shift+Enter` is two spaces and a new line (`one  ⏎two`), or a backslash at the end of the line; in a heading and in a table cell, which have only one line, it is `<br>`, which is read back as a break too.

| | Read from Markdown | Written to Markdown |
|---|---|---|
| Headings | `#` to `######` and underlined; `####` and deeper become `h3` (the editor has three levels) | `#` to `###` |
| Text | **strong**, *emphasis*, `~~strike~~`, `` `code` ``, backslash escapes, entities, hard breaks (two spaces or `\`) | the same |
| Links and images | inline, reference (`[a][r]` with `[r]: url`), `<automatic>`, bare `https://` and `www.` links, titles | inline, with the title |
| Lists | bullet and numbered, nested, tight and loose, lazy continuation | the same; the start number of a numbered list is not kept |
| Blocks | quotes (nested), fenced and indented code, horizontal lines, tables with their alignment (`:---`, `:---:`, `---:`) | the same |
| HTML | read and then sanitized: what the editor knows stays (`<u>`, `<sub>`, `<sup>`, `<br>`, tables...), the rest is removed | `<u>`, `<sub>` and `<sup>` stay inline HTML |
| **Lost** | the language after a code fence (` ```js `), task list boxes (`- [ ]` stays text), footnotes, `h4` to `h6` as such, raw HTML the sanitizer does not allow | colours, fonts and sizes, text alignment, indent, columns and page, merged table cells (the text stays in the first cell), cell backgrounds, borders and vertical alignment, and table captions (the horizontal alignment of a column is kept, from its header cell); a video becomes a link |

Markdown cannot express what the editor can, so an editor with colours or columns is better stored as HTML; Markdown is for content that is Markdown by nature (documentation, notes, READMEs).

## Right-to-left languages (Arabic, Hebrew, …)

- **Automatic**: every paragraph, heading, list item and table cell takes its direction from its first strong letter, so Arabic and Hebrew are right-to-left (and aligned right) without doing anything, and a document that mixes languages works. Code blocks always stay left-to-right.
- **Explicit**: the `rtl` and `ltr` toolbar items (not in the default toolbar; add them to `toolbar`) set `dir` on the selected blocks; clicking the active one goes back to automatic. For a list the direction is set on the whole list, so the bullets move too. This is a direct DOM edit, so the browser's undo does not cover it.
- **The editor itself**: it follows the page, so `<html dir="rtl">` mirrors the toolbar, quote bar and popovers. Set `dir: 'rtl'` (option) or `dir="rtl"` (attribute) to do it for one editor.
- Pasting keeps `dir="rtl"` from Word and Docs; the `dir="ltr"` they put on every paragraph is dropped, so a pasted Hebrew paragraph still finds its own direction.
- The sanitizer keeps `dir` (only `ltr`/`rtl`) on blocks. Counting words and characters works for these scripts; Markdown and text output keep the letters, but Markdown has no way to express direction, so that is dropped.

## Texts and languages

The texts of the editor (tooltips, popovers, the footer, messages) come in these languages: **English** (`en`, the default and the reference), **Nederlands** (`nl`), **Deutsch** (`de`), **Français** (`fr`) and **Español** (`es`).

**Which language it uses**, in this order:

1. the `language` option (or the `language` attribute, or the `language` prop of the React, Vue and Angular wrappers): `'nl'`, `'de-AT'`... A tag is matched on its first part; a language that is not built in gives English.
2. the `lang` of the element or of the page (the nearest `lang`, `<html lang="nl">` for example). The page says what its language is, so the editor follows it.
3. the languages of the browser, in the order the user has them (`navigator.languages`); the first one that is built in.
4. English.

```ts
new Aurebesh(el);                              // follows the page or the browser
new Aurebesh(el, { language: 'de' });          // pinned
new Aurebesh(el, { labels: { bold: 'Extra fett' } });   // override just some texts, in any language
import { LABELS_NL, LANGUAGES, resolveLanguage } from 'aurebesh';
new Aurebesh(el, { labels: LABELS_NL });       // a whole language, as before
```

```html
<aurebesh-editor language="fr"></aurebesh-editor>   <!-- or lang="fr", or nothing: the browser -->
<AurebeshEditor language="nl" />                       <!-- React; Vue: :language="..."; Angular: language="..." -->
```

On the element, changing `language` builds the editor again and keeps the text. `editor.getLanguage()` tells what was chosen. Single labels (`labels`) always win over the language; keys without a prefix are toolbar button names, `ui.*` and the other keys with a dot are texts in popovers and the status line. Error messages for bad links or files stay English.

### Adding a language

Translations are one small file each, and a pull request with one is welcome.

1. Copy `src/locales/en.ts` to `src/locales/<code>.ts` (the code is the ISO 639-1 one: `it`, `pt`, `pl`...) and rename the constant to `LABELS_<CODE>`.
2. Translate the **values** only. Leave the keys as they are, keep the `{name}`, `{count}` and `{max}` placeholders, and keep every key: if a text can stay the same (`'page.a4': 'A4'`) leave it in. `ui.words.one`/`other` and `ui.characters.one`/`other` are the singular and the plural; the editor uses the singular for exactly one.
3. In `src/labels.ts` import it, export it, and add it to `LANGUAGES` (`xx: LABELS_XX`); add it to the export list in `src/index.ts`.
4. In `test/i18n.test.ts` add it to the list in `describe.each` (`['it', LABELS_IT]`) and to the list of languages in the first test.
5. `npm test`: the test checks that your file has a text for every key of the English reference, no key that English does not have, no empty text, and the same placeholders. It also fails when a new button or text is added to the editor without an English text, so the reference stays complete.
6. Add the language to the list above.

To add a language to your own application without changing the package, pass its texts as `labels` (a complete set of keys, as in `LABELS_EN`), or register it for every editor: `LANGUAGES.it = LABELS_IT` before an editor is made, after which `language: 'it'` and the browser detection find it.

## Keyboard

`Mod` is Ctrl on Windows/Linux and Cmd on macOS. Browsers already give Mod+B, I, U, Z and Y.

| Shortcut | Action |
| --- | --- |
| `Mod+K` | Link (opens the link box, prefilled when the caret is in a link) |
| `Mod+E` | Inline code (again to remove) |
| `Mod+Shift+X` | Strikethrough |
| `Mod+\` | Clear all formatting |
| `Mod+Shift+7` / `Mod+Shift+8` / `Mod+Shift+9` | Numbered / bullet / task list |
| `Mod+Enter` | Check or uncheck the task with the caret |
| `Shift+Enter` | A line break inside the block (`<br>`), where `Enter` starts a new one; the same in every browser, in a list item, a heading, a quote, a callout and a table cell (in a code block it is a new line) |
| `Mod+Alt+1` / `2` / `3` | Heading 1 / 2 / 3 |
| `Mod+Alt+C` | Code block |
| `Ctrl/Cmd+click` on a link | Open the link in a new tab (a plain click only puts the caret in it) |
| `Tab` / `Shift+Tab` in a list | Indent / outdent the item (nested lists) |
| `Tab` / `Shift+Tab` in a table | Next / previous cell (Tab in the last cell adds a row) |
| `Tab` in a code block | Insert two spaces |
| `Enter` on an empty last line of a code block | Leave the block (`Shift+Enter` always adds a line) |

**Markdown shortcuts** at the start of a line (switch off with `markdownShortcuts: false`):
`# ` `## ` `### ` heading · `- ` `* ` `+ ` bullet list · `1. ` numbered list · `> ` quote · ` ``` ` + Enter code block · `---` + Enter horizontal line.

Enter, Tab and Space are left alone while an input method (Chinese, Japanese, Korean...) is composing text.

## Links

While the caret is in a link, a small popover hangs on the link (above it; beside it when the link is on the first line, below it when there is no room at the sides) and shows its address with **Open link** (new tab), **Edit** (opens the link box with the address filled in) and **Remove link**. The link box (Link button, **Edit** or the shortcut) opens in the same place, on the link or at the caret, instead of under the toolbar.
Ctrl/Cmd+click opens a link directly, and in a read-only editor a plain click does. Links open with `noopener,noreferrer`, so the new page can't reach back into yours,
and only `http(s):`, `mailto:`, `tel:` and site paths are opened (never `javascript:`; `#anchors` aren't opened either). The texts can be changed with the `labels` option
(`ui.openLink`, `ui.editLink`, `ui.removeLink`).

## Accessibility

The editing area is a labelled `textbox` and the toolbar a labelled `toolbar` (one tab stop; Left/Right/Home/End move between
its buttons, Escape returns to the text). Pickers announce themselves (`aria-haspopup`, `aria-expanded`), open with Enter/Space,
can be navigated with the arrow keys (colour swatches, table size), and close with Escape, which returns the focus to their button.
Errors are announced as alerts. Touch screens get larger buttons and swatches.

## Images and video

Images and videos can be added by link, by file picker, by pasting a screenshot or by dragging a file in.
Click an image to resize it (25–100%), align it, edit its alt text or remove it.
**Where uploaded files go is up to you**: pick an adapter.

```ts
import { Aurebesh, base64Adapter, endpointAdapter, presignedAdapter } from 'aurebesh';

new Aurebesh(el, {
  media: {
    // 1. default: embedded in the HTML as base64 (max 2 MB)
    adapter: base64Adapter({ maxSize: 5 * 1024 * 1024 }),

    // 2. your own API: multipart POST, expects { url } back
    // adapter: endpointAdapter({ url: '/api/upload', headers: () => ({ Authorization: `Bearer ${token}` }) }),

    // 3. straight to a bucket (S3, R2, GCS...): your backend signs the URL
    // adapter: presignedAdapter({ getUploadUrl: async (file) => (await fetch(`/sign?name=${file.name}`)).json() }),

    // 4. anything else: a function that returns the URL
    // adapter: async (file, { kind }) => await myStorage.put(file),

    // links only: adapter: null     |     uploads only: allowUrl: false
    allowUrl: true,

    // images in pasted Word / Google Docs / web content: 'upload' (default) | 'link' | 'remove'
    pasteImages: 'upload',
  },
});
```

Video links: YouTube (embedded through `youtube-nocookie.com`) and Vimeo (with do-not-track) become embeds, a direct `.mp4`/`.webm` link becomes a `<video>`.
Only these exact embed URLs survive the sanitizer; every other `<iframe>` is removed. SVG images are not accepted.
Listen for problems with `editor.on('error', (e) => ...)`.

## Pasting from Word and Google Docs

Pasted content is cleaned before it is inserted, so it takes on the editor's own look instead of dragging along fonts and spacing.

**Kept:** bold, italic, underline, strikethrough, super/subscript, text colour, highlight, alignment, headings, lists (including Word's
"fake" lists made of indented paragraphs, with nesting and bullets vs numbers), links (Google's `google.com/url?q=` redirect is removed),
tables and images. **Dropped:** fonts, font sizes, line spacing, classes, comments, tracked changes and everything else.
Cell and paragraph shading is not carried over; only highlighting of text. The same cleaning applies to content pasted from ordinary web pages.

**Columns:** a Word section with newspaper columns arrives as a column block (see [Columns](#columns)). Word keeps the number of columns in the document's
style sheet (`@page WordSection1 { mso-columns: 2 even 35.4pt }`) rather than on the paragraphs, so it only comes along when that style sheet is
on the clipboard, which depends on what you copied: selecting the whole section (including its section break) is the most reliable.
`column-count` / `columns` in CSS or style attributes (web pages) is read as well.

**Text boxes (sidebars, pull quotes, banners):** Word floats these on the page, anchored to a paragraph, with a position in percent of the page, and in the
clipboard HTML their text sits *inside* the anchor paragraph. They are taken out of that paragraph (so a heading doesn't contain the sidebar's text) and put back as their own block:
- a **full-width** box (banner, summary) becomes a plain block;
- a **narrow** box becomes `<aside style="float: left|right; width: N%">`, on the side its position says (a sidebar at the right edge floats right);
- boxes near the **top** of the page go before the paragraph they were anchored to, **in the order of their height on the page** (a title above a company name, a sidebar under both);
  boxes further down (a pull quote 45% down the page) go **into the middle of the next run of body text**, as a box floating inside the columns with the text wrapping around it.
  In Word such a quote hangs over the gutter between two columns; text columns can't flow around something that straddles them, so after pasting the editor measures which column
  the box landed in and floats it against the gutter (right in a left column, left in a right one).
- **Floating pictures** become their own paragraph right after the paragraph they hang on (not inside its text), aligned the way Word places them (a picture over the middle is centred),
  at their size as a share of the text width. Text can't wrap tightly around them, so they are bands with text above and below.
- **Columns beside a floating box:** a Word section's columns run over the whole width of the page, and text doesn't flow through a column that a box with wrapping text covers.
  A 3-column section with a page-high sidebar a third wide therefore shows **2 columns** of text (the sidebar sits where the third would be), and the editor does the same
  (a section further down, with nothing beside it, keeps its 3). A short box, or a full-width one, leaves the columns alone.

Boxes keep their **fill** (colour and opacity, e.g. a beige sidebar at 70%) and text margin, and white text stays on a filled box (a dark banner), while elsewhere it is dropped because it would vanish.
Colours and capitals that Word keeps in its **style sheet** rather than on the text (a Heading 1 in green capitals, a Title in dark brown) are applied too.
This follows the position Word records, but a flowing document can't reproduce an absolute page position exactly: the placement is a good approximation, not a copy of the page.
Shown outside the editor, give `aside` some spacing, e.g. `aside[style*="float: right"] { margin-left: 1em } aside[style*="float: left"] { margin-right: 1em }`.
Pictures that Word floats keep their size as a share of the text width. Fonts, font sizes, borders and lines are not carried over.

**Images: all of them come along**, not just one, in their original place, and they go through the same storage setting as uploads
(`media.adapter`: base64, your API, a bucket...). While an image is being copied, a grey "Importing image…" box stands in its place, and it never
shows up in `getHTML()`. Up to three images are copied at a time.

| Source | How the images arrive | If it fails |
| --- | --- | --- |
| **Google Docs** | The HTML links to Google's image servers; each picture is downloaded (without cookies or referrer) and passed to your adapter. | The image stays a link to Google and you get a message. |
| **Word** | The HTML only points to temporary files on the author's PC (unreadable for a web page), but Word also puts the pictures in its RTF clipboard data. They are read from there and matched, in order, with the images in the HTML. | The picture is left out and you get a message. |
| **A web page** | Like Google Docs. | Like Google Docs. |
| **Already inline** (`data:`) | Left as they are. | |

`media.pasteImages` changes this: `'upload'` (default), `'link'` (keep links to the source for web images; nothing is downloaded) or `'remove'`.
Without an upload adapter (`adapter: null`) web images stay links and Word pictures are left out, as they can't be linked.

**Limits to know about**
- Word pictures need the browser to expose Word's RTF data (`text/rtf`) to the page. Where it doesn't, they are left out with a message.
- Charts, shapes and drawings that Word only has as a metafile (EMF/WMF) can't be shown by a browser and are left out.
- A web image can only be copied if its server allows downloads from other sites; otherwise it stays a link.
- The tests use clipboard samples that follow the structure Word and Google Docs are known to produce, but they are reconstructions, not recordings: try real documents with your own setup.

**Something doesn't come across?** Look at what the program actually put on the clipboard. The easiest way: run `npm run capture`, open http://localhost:5198 and paste into the box.
Everything is saved as `captures/capture-<time>.json` (HTML, RTF, text and the list of types; the folder is git-ignored). Or paste this in the browser console, then paste your content into the page:

```js
document.addEventListener('paste', (e) => {
  console.log('HTML:', e.clipboardData.getData('text/html'));
  console.log('RTF:', e.clipboardData.getData('text/rtf').slice(0, 2000));
  console.log('types:', [...e.clipboardData.types]);
}, { once: true, capture: true });
```

Formatting that isn't in the HTML (for example Word's column settings when you only copied a few paragraphs) can't be recovered.

## Columns

Newspaper-style columns for one or more blocks: select the paragraphs, pick 2–4 columns in the toolbar (`columns`). The text flows from one column to the next.
With only a caret, the block around it is used. Choose "One column" to remove it. The result is a `<div style="column-count: 2; column-gap: 2em">` around the blocks,
so it renders in columns wherever you show the HTML (your own sanitizer on the server must allow `column-count` and `column-gap` on a `div`; `sanitize()` does).
Column blocks can't be nested. Making or removing columns is not a step in the browser's undo history (the editor changes the document directly).

## Network access

The editor sends nothing by itself: no telemetry, no analytics, no requests to load fonts or scripts. A tool such as Socket reports `fetch` in the package; these are the only three places, and each one is started by something you set up or by the person typing:

| What | When |
| --- | --- |
| `endpointAdapter` | The browser uploads a picture or video to the URL **you** give it, when someone inserts a file (or a pasted picture is copied to your storage). |
| `presignedAdapter` | The browser sends the file with a `PUT` to the upload URL that **your** `getUploadUrl` returns. |
| Pasted pictures | With `pasteImages: 'upload'` (the default): a picture that is pasted as a link (from Word, Google Docs or a web page) is downloaded, without cookies and without a referrer, to hand it to the media adapter. Without an adapter of your own that is the built-in one, which embeds the picture as base64. If the host does not allow it, the picture stays a link. With `pasteImages: 'link'` or `'remove'` nothing is downloaded. |

What else loads comes from the content: an `<img>` or `<video>` shows its source when it is in the text, and a YouTube (`youtube-nocookie.com`) or Vimeo (`dnt=1`) video is an `<iframe>` that loads when it is inserted. Nothing else is fetched, and `new Aurebesh(el)` on its own makes no request.

## Security: sanitize on the server too

Aurebesh sanitizes HTML in the browser (everything you set, paste or drop goes through an allow-list: no scripts,
event handlers or `javascript:` links; `<iframe>` only for YouTube/Vimeo embeds; images and video only from http(s),
site-relative or base64 sources). **That protects the editing session, not your database.** Anyone can skip the browser
and send arbitrary HTML to your API, and `getHTML()` returns the live editor content as is.

So: **never trust the HTML you receive.** Sanitize it again on the server before you store or render it.
`sanitize()` is exported for that; it needs a DOM, so on Node give it jsdom's globals:

```ts
import { JSDOM } from 'jsdom';
import { sanitize } from 'aurebesh';

const { window } = new JSDOM('');
globalThis.DOMParser = window.DOMParser;
globalThis.Node = window.Node;

const safeHtml = sanitize(untrustedHtml);
```

You can also use another server-side sanitizer (DOMPurify with jsdom, `sanitize-html`) with a similar allow-list.
Render the stored HTML only after sanitizing, and keep a Content-Security-Policy as a second line of defence.

## Browser support and SSR

Modern evergreen browsers; the tests run in Chromium and WebKit (Safari's engine). Formatting uses `document.execCommand`
(still supported everywhere). Code-block colours need the CSS Custom Highlight API (Chrome/Edge 105+, Safari 17.2+,
Firefox 140+); without it code blocks simply show no colours.
Importing the package on the server (Next.js, Nuxt, Angular Universal) is safe and the React/Vue wrappers render on the server;
the editor itself only runs in the browser. `sanitize()` needs a DOM (`DOMParser`), so on a server use it with jsdom or similar.

## License

[MIT](LICENSE): free to use, also commercially.

## Support

Aurebesh is made and maintained by one person in their spare time. If it saves you time or you use it in a project that earns money, you can support it through [GitHub Sponsors](https://github.com/sponsors/StefandeBakker). It is never required.

## Development

```bash
npm run demo      # build + serve the demo at http://localhost:5199/demo/
npm run build     # tsup -> dist (minified, ESM + CJS + types), then the Angular entry with ng-packagr -> dist/angular
npm test          # unit tests (Vitest)
npm run test:e2e  # real-browser tests (Playwright: Chromium, Firefox, WebKit)
```

The first time, install the test browsers with `npx playwright install chromium firefox webkit`.

One test group (a real Word newsletter, with sidebar, pull quote, columns and a picture) needs `test/fixtures/word-newsletter.html`, a reduced real clipboard that is not
committed; those tests are skipped when it isn't there. Capture one with `npm run capture` if you want to run them.

### Releasing

Publish a GitHub release with a tag matching `package.json` (for example, `v1.0.1`).
The `publish.yml` workflow uses npm trusted publishing to stage the package, not publish it directly.
Configure the package's npm trusted publisher with owner `StefandeBakker`, repository `aurebesh`,
workflow filename `publish.yml`, and no environment. New trusted publishers allow staging by default;
direct `npm publish` requires a separate permission.

After the workflow succeeds, review and approve the package in npm's **Staged Packages** tab with 2FA,
or run `npm stage approve <stage-id>` in an authenticated maintainer session (npm 11.15.0 or newer).
Only approval makes the version public. Prerelease versions retain the `beta` tag; stable versions use `latest`.
