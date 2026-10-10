# Aurebesh

A lightweight, dependency-free WYSIWYG editor for the web. Rich text, tables, code blocks with syntax highlighting, images and video, with pluggable uploads and built-in HTML sanitizing.

A vanilla TypeScript core plus an `<aurebesh-editor>` web component, with thin wrappers for React and Vue, so it works in React, Vue, Angular or plain HTML.

```bash
npm install aurebesh
```

**Features:** bold/italic/underline/strike, inline code, super/subscript, headings, quotes, lists, text alignment, font and text size, text and highlight colour, links (with a small editor), images (upload, paste, drag and drop, width/alignment/alt tools), YouTube/Vimeo/mp4 video, tables (size picker, header row, row/column tools, Tab navigation, undo), code blocks with syntax highlighting, horizontal line, undo/redo, translatable UI, form integration.

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
| `markdownShortcuts` | Typing `# `, `- `, … at the start of a line formats it (default `true`) |
| `labels` | Override the editor's own texts, see below |
| `media` | Image and video settings, see below |

Toolbar items (default order): `font size | bold italic underline strike code | color highlight | h1 h2 quote codeblock | ul ol alignLeft alignCenter alignRight | link image video table hr | clear undo redo`.
Also available: `sup sub alignJustify`.

Theme via CSS variables: `--aurebesh-border`, `--aurebesh-bg`, `--aurebesh-color`, `--aurebesh-accent`, `--aurebesh-toolbar-bg`, `--aurebesh-code-bg`, `--aurebesh-min-height`, and `--aurebesh-hl-keyword|string|comment|number|function|type|tag` for code colours.

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
| `Tab` / `Shift+Tab` in a list | Indent / outdent the item (nested lists) |
| `Tab` / `Shift+Tab` in a table | Next / previous cell (Tab in the last cell adds a row) |
| `Tab` in a code block | Insert two spaces |
| `Enter` on an empty last line of a code block | Leave the block (`Shift+Enter` always adds a line) |

**Markdown shortcuts** at the start of a line (switch off with `markdownShortcuts: false`):
`# ` `## ` `### ` heading · `- ` `* ` `+ ` bullet list · `1. ` numbered list · `> ` quote · ` ``` ` + Enter code block · `---` + Enter horizontal line.

Enter, Tab and Space are left alone while an input method (Chinese, Japanese, Korean...) is composing text.

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
  },
});
```

Video links: YouTube (embedded through `youtube-nocookie.com`) and Vimeo (with do-not-track) become embeds, a direct `.mp4`/`.webm` link becomes a `<video>`.
Only these exact embed URLs survive the sanitizer; every other `<iframe>` is removed. SVG images are not accepted.
Listen for problems with `editor.on('error', (e) => ...)`.

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

MIT

## Development

```bash
npm run demo      # build + serve the demo at http://localhost:5199/demo/
npm run build     # tsup -> dist (minified, ESM + CJS + types)
npm test          # unit tests (Vitest)
npm run test:e2e  # real-browser tests (Playwright: Chromium, Firefox, WebKit)
```

The first time, install the test browsers with `npx playwright install chromium firefox webkit`.
