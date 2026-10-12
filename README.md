# Aurebesh

A lightweight, dependency-free WYSIWYG editor for the web. Rich text, tables, code blocks with syntax highlighting, images and video, with pluggable uploads and built-in HTML sanitizing.

A vanilla TypeScript core plus an `<aurebesh-editor>` web component, with thin wrappers for React and Vue, so it works in React, Vue, Angular or plain HTML.

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

Use the web component. Register the schema, and bind it to forms with a small value accessor:

```ts
import 'aurebesh/element';
import { Directive, ElementRef, forwardRef, HostListener } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import type { AurebeshElement } from 'aurebesh/element';

@Directive({
  selector: 'aurebesh-editor[formControlName],aurebesh-editor[formControl],aurebesh-editor[ngModel]',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => AurebeshValueAccessor), multi: true }],
})
export class AurebeshValueAccessor implements ControlValueAccessor {
  private onChange: (html: string) => void = () => {};
  private onTouched: () => void = () => {};
  constructor(private host: ElementRef<AurebeshElement>) {}
  @HostListener('change', ['$event']) changed(e: Event) { this.onChange((e as CustomEvent<string>).detail); }
  @HostListener('focusout') blurred() { this.onTouched(); }
  writeValue(html: string | null) { this.host.nativeElement.value = html ?? ''; }
  registerOnChange(fn: (html: string) => void) { this.onChange = fn; }
  registerOnTouched(fn: () => void) { this.onTouched = fn; }
  setDisabledState(disabled: boolean) { this.host.nativeElement.toggleAttribute('readonly', disabled); }
}
```

```html
<aurebesh-editor [formControl]="body"></aurebesh-editor>   <!-- component: schemas: [CUSTOM_ELEMENTS_SCHEMA], imports: [AurebeshValueAccessor] -->
```

This directive is an example, not part of the package (an Angular library needs Angular's own build tooling).

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
font size clear / bold italic underline strike highlight color | ul ol / alignLeft alignCenter alignRight | h1 h2 quote / code codeblock | link image video / table hr | columns
```

That is five blocks: the font (typeface, size and clear formatting on top, character styles, highlight and colour below), the paragraph (lists, then alignment), the styles (headings and quote on top, then the two kinds of code, inline and block), what you can insert (link, picture and video, then table and line) and the layout (columns). Leave out every `/` and each block is a single row that wraps like before; a toolbar without any `|` is one block.

**Icons.** Buttons whose symbol was not obvious (undo and redo, clear formatting, lists, alignment, quote, the two kinds of code, link, picture, video, table, line, text direction) show a line drawing; the letters of bold, italic, underline and strikethrough and the headings stay as they are. The two colour buttons are a letter A (text colour) and a marker pen (highlight), each with a bar underneath that shows the colour chosen last (black and yellow to begin with, and again after "Automatic" or "No highlight") and a small arrow for the palette that opens. The drawings are inline SVG in the colour of the text, so they follow your theme and the pressed state, and the editor needs no icon font or image files. A button keeps its name for screen readers and as its tooltip (the `labels` option translates it).

**Undo and redo** are in a small strip of their own above the toolbar: the `quickbar` option (default `['undo', 'redo']`) lists what is in it, and `quickbar: []` removes it. With a `toolbar` of your own the strip is empty, so they are not there twice; put `undo` and `redo` in `toolbar` or give `quickbar` yourself. On the element: `toolbar="font,size,/,bold,italic,|,link"` and `quickbar="undo,redo"`.

Items that are not in the default have a place in the same blocks, so a toolbar with everything reads like this:

```
font size clear / bold italic underline strike sub sup highlight color | ul ol / alignLeft alignCenter alignRight alignJustify ltr rtl | h1 h2 h3 quote / code codeblock | link image video / table hr | columns page orientation
```

**A ribbon.** Give a block a name with `#Name` and the toolbar gets the larger look of a ribbon: the name above the buttons, bigger buttons, a tinted pressed state. `>` sends the blocks after it to the far end of the toolbar. `indent` and `outdent` move a paragraph, heading or quote in steps of 24px (a list item goes one level deeper or back), and `fullscreen` makes the editor fill the window (Escape returns). Hovering a button shows a tooltip with its name and shortcut.

```
#History undo redo | #Text bold italic underline | #Structure h1 h2 quote | #Align alignLeft alignCenter alignRight indent outdent | #Lists ul ol | #Insert link image video table hr | #Code code codeblock > #View fullscreen
```

The colours of this look are variables too: `--aurebesh-icon`, `--aurebesh-label` (the names), `--aurebesh-hover`, `--aurebesh-active-bg`, `--aurebesh-active-color`, `--aurebesh-tip-bg` and `--aurebesh-tip-color`.

**Layout panel.** The `layout` item is a button that opens a panel beside the text (and closes it again): the number of columns as tiles (1 to 4, the tile of the column block at the caret is selected), the page width (the same choice as the `page` item), the maximum width of the text, the space around it and the line spacing. The last three are only about how the text is shown: they are variables on the editor (`--aurebesh-text-width`, `--aurebesh-pad-x`, `--aurebesh-pad-y`, `--aurebesh-line`) and are not part of the HTML. Set them from code with `layout: { textWidth: 800, padding: 48, lineHeight: 1.7 }` (option) or `editor.setLayout({ padding: 24 })`, read them with `getLayout()`, and listen to the `layout` event (the element fires a `layout` event with the settings as `detail`). `null` is the default of the editor. On a page format the width and the space belong to the sheet, so those two fields are off.

Theme via CSS variables: `--aurebesh-border`, `--aurebesh-bg`, `--aurebesh-color`, `--aurebesh-accent`, `--aurebesh-toolbar-bg`, `--aurebesh-code-bg`, `--aurebesh-min-height`, `--aurebesh-max-height` (a fixed maximum height of the text area: the text then scrolls inside the editor while the toolbar stays in view; without it the editor grows with the text and the toolbar scrolls along with the page), and `--aurebesh-hl-keyword|string|comment|number|function|type|tag` for code colours.

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
- **Column widths**: drag the border between two columns (the pointer changes). Widths are stored as percentages in a `<colgroup>` (`<col style="width: 40%">`), so the table keeps its proportions when the editor is resized; a column never gets narrower than 5%. Dragging is a direct DOM edit, so Ctrl+Z does not undo it, and it needs a mouse or pen (not touch yet). Adding or deleting a column keeps the other widths in proportion.
- The sanitizer keeps `colspan`/`rowspan` (plain numbers) and `<col>` widths in percent; a `<colgroup>` without usable widths (Word writes one) is removed. Markdown cannot merge cells: the text goes in the first position a merged cell covers, the rest stays empty.

## Output formats: HTML, Markdown, text

```js
editor.getHTML();                // clean, sanitized HTML (the default, and what `change` emits)
editor.getMarkdown();            // GitHub-flavoured Markdown
editor.getText();                // plain text
editor.getValue('markdown');     // any of 'html' | 'markdown' | 'text'
import { toMarkdown, toText } from 'aurebesh'; // the same for any HTML string (needs a DOM)
```

- Web component: `el.markdown`, `el.text`, and `format="markdown"` (or `"text"`) makes a surrounding `<form>` submit that format instead of HTML. `el.value` always stays HTML, because that is what you set the content with.
- Markdown covers headings, bold, italic, strikethrough, inline code, code blocks, links, images, quotes, lists (nested too) and tables (GFM; the first row becomes the header row). Underline and sub/superscript stay as inline HTML. Colours, fonts, sizes, alignment and columns are dropped, since Markdown cannot express them. A video becomes a link; sidebars become quotes.
- Output only for now: there is no `setMarkdown()`.

## Right-to-left languages (Arabic, Hebrew, …)

- **Automatic**: every paragraph, heading, list item and table cell takes its direction from its first strong letter, so Arabic and Hebrew are right-to-left (and aligned right) without doing anything, and a document that mixes languages works. Code blocks always stay left-to-right.
- **Explicit**: the `rtl` and `ltr` toolbar items (not in the default toolbar; add them to `toolbar`) set `dir` on the selected blocks; clicking the active one goes back to automatic. For a list the direction is set on the whole list, so the bullets move too. This is a direct DOM edit, so the browser's undo does not cover it.
- **The editor itself**: it follows the page, so `<html dir="rtl">` mirrors the toolbar, quote bar and popovers. Set `dir: 'rtl'` (option) or `dir="rtl"` (attribute) to do it for one editor.
- Pasting keeps `dir="rtl"` from Word and Docs; the `dir="ltr"` they put on every paragraph is dropped, so a pasted Hebrew paragraph still finds its own direction.
- The sanitizer keeps `dir` (only `ltr`/`rtl`) on blocks. Counting words and characters works for these scripts; Markdown and text output keep the letters, but Markdown has no way to express direction, so that is dropped.

## Texts and languages

Every tooltip and popover text can be changed. Dutch is included:

```ts
import { Aurebesh, LABELS_NL } from 'aurebesh';

new Aurebesh(el, { labels: LABELS_NL });
new Aurebesh(el, { labels: { bold: 'Fett', 'ui.insert': 'Einfügen' } }); // override just some
```

Keys without a prefix are toolbar button names; `ui.*` are texts in popovers and the status line (see `DEFAULT_LABELS` for the full list).
Error messages for bad links or files stay English.

## Keyboard

`Mod` is Ctrl on Windows/Linux and Cmd on macOS. Browsers already give Mod+B, I, U, Z and Y.

| Shortcut | Action |
| --- | --- |
| `Mod+K` | Link (opens the link box, prefilled when the caret is in a link) |
| `Mod+E` | Inline code (again to remove) |
| `Mod+Shift+X` | Strikethrough |
| `Mod+Shift+7` / `Mod+Shift+8` | Numbered / bullet list |
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
npm run build     # tsup -> dist (minified, ESM + CJS + types)
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
