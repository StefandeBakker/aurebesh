# Aurebesh

A lightweight, dependency-free WYSIWYG editor for the web. Rich text, tables, code blocks with syntax highlighting, images and video, with pluggable uploads and built-in HTML sanitizing.

A vanilla TypeScript core plus an `<aurebesh-editor>` web component, so it works in React, Vue, Angular or plain HTML.

```bash
npm install @stefan.de.bakker/aurebesh
```

## Vanilla

```ts
import { Aurebesh } from '@stefan.de.bakker/aurebesh';

const editor = new Aurebesh(document.querySelector('#editor')!, {
  value: '<p>Hello</p>',
  placeholder: 'Type something...',
});
editor.on('change', (html) => console.log(html));
editor.getHTML();
editor.destroy();
```

## Web component (any framework)

```ts
import '@stefan.de.bakker/aurebesh/element'; // registers <aurebesh-editor>
```

```html
<aurebesh-editor placeholder="Type..."><p>Initial</p></aurebesh-editor>
```

It emits a `change` event (`event.detail` is the HTML) and an `error` event, and has a `value` property.
Anything that can't be an attribute (functions, lists) goes in the `options` property:

```ts
el.options = { media: { adapter: endpointAdapter({ url: '/api/upload' }) } };
```

- **React**: `<aurebesh-editor ref={r} />` and `r.current.addEventListener('change', ...)`.
- **Vue**: `<aurebesh-editor :value.prop="html" @change="html = $event.detail" />` (set `compilerOptions.isCustomElement` for `aurebesh-` tags).
- **Angular**: add `CUSTOM_ELEMENTS_SCHEMA` and use `(change)="html = $event.detail"` and `[value]="html"`.

## Options

| Option | Description |
| --- | --- |
| `value` | Initial HTML (sanitized) |
| `placeholder` | Placeholder text |
| `readOnly` | Disable editing |
| `toolbar` | Items, e.g. `['bold','italic','|','link']`; `[]` hides it |
| `fonts` | Font list for the font picker (default: 15 system font stacks, nothing to download) |
| `colors` | Swatches for text/highlight colour (default: 40) |
| `media` | Image and video settings, see below |

Toolbar items: `font bold italic underline strike color highlight h1 h2 quote codeblock ul ol link image video table clear undo redo`.

Theme via CSS variables: `--aurebesh-border`, `--aurebesh-bg`, `--aurebesh-color`, `--aurebesh-accent`, `--aurebesh-toolbar-bg`, `--aurebesh-code-bg`, `--aurebesh-min-height`, and `--aurebesh-hl-keyword|string|comment|number|function|type|tag` for code colours.

## Images and video

Images and videos can be added by link, by file picker, by pasting a screenshot or by dragging a file in.
**Where uploaded files go is up to you**: pick an adapter.

```ts
import { Aurebesh, base64Adapter, endpointAdapter, presignedAdapter } from '@stefan.de.bakker/aurebesh';

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

## Browser support and SSR

Modern evergreen browsers. Formatting uses `document.execCommand` (still supported everywhere). Code-block colours need the
CSS Custom Highlight API (Chrome/Edge 105+, Safari 17.2+, Firefox 140+); without it code blocks simply show no colours.
Importing the package on the server (Next.js, Nuxt, Angular Universal) is safe; the editor itself only runs in the browser,
so create it in `onMounted`/`useEffect`/`ngAfterViewInit`. `sanitize()` needs a DOM (`DOMParser`), so on a server
use it with jsdom or similar.

## License

MIT

## Development

```bash
npm run demo    # build + serve the demo at http://localhost:5199/demo/
npm run build   # tsup -> dist
npm test
```
