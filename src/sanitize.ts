import { SAFE_COLOR } from './colors';
import { SAFE_FAMILY } from './fonts';
import { COMMENT_ID } from './comments';
import { SUGGESTION_ID } from './suggestions';
import { MENTION_ID } from './mentions';
import { IFRAME_ATTRS, isEmbedSrc, isSafeImageSrc, isSafeVideoSrc } from './media-urls';

const ALLOWED_TAGS = new Set([
  'p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
  'h1', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li', 'a', 'code', 'pre', 'hr',
  'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'colgroup', 'col',
  'img', 'video', 'sup', 'sub', 'aside',
]);
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template']);
const ALLOWED_ATTRS: Record<string, string[]> = {
  a: ['href', 'title', 'target', 'rel', 'data-button'],
  div: ['data-layout', 'data-callout'],
  ul: ['data-task'],
  pre: ['data-language'],
  li: ['data-checked'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
  span: ['data-mention', 'data-comment', 'data-suggestion', 'data-kind', 'data-author', 'data-name', 'data-date'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  video: ['src', 'width'],
};
const DIR_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'blockquote', 'pre', 'ul', 'ol', 'li', 'table', 'td', 'th', 'div', 'aside']);
const SAFE_URL =/^(https?:|mailto:|tel:|#|\/)/i;

/** Strips everything outside a small allow-list (scripts, event handlers, javascript: urls...). */
/** What a plugin adds to the allow-list (see plugin.ts). The rest of the rules stay as they are. */
export interface SanitizeExtension {
  /** Attributes that are kept on a tag, besides the ones that are always kept. */
  attributes?: Record<string, string[]>;
  /** Runs on every element that is kept, after its attributes were cleaned: remove what is not safe. */
  clean?(el: Element): void;
}

/** The rules, on the content of an element that is part of a document that does nothing (not the page): the elements in it are cleaned in place. */
function sanitizeBody(body: Element, extensions: SanitizeExtension[]): void {
  // the empty paragraphs the editor keeps beside a callout, to be able to type there, are not content
  body.querySelectorAll('p[data-guard]').forEach((p) => p.innerHTML === '<br>' && p.remove());
  body.querySelectorAll('li > input[type="checkbox" i]').forEach((box) => {
    const li = box.parentElement!;
    if (li.parentElement?.tagName === 'UL') {
      li.parentElement.setAttribute('data-task', '');
      if (box.hasAttribute('checked')) li.setAttribute('data-checked', 'true');
    }
    box.remove();
  });
  clean(body, extensions);
  // the break a browser keeps at the end of a line that ends in a break, to show the caret there, says nothing
  body.querySelectorAll('br').forEach((br) => {
    if (!br.nextSibling && br.previousSibling?.nodeName === 'BR' && !br.closest('pre')) br.remove();
  });
}

export function sanitize(html: string, extensions: SanitizeExtension[] = []): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  sanitizeBody(doc.body, extensions);
  return doc.body.innerHTML;
}

/**
 * A sanitized copy of what is in an element, as an element: the same rules as `sanitize`, without writing the content as text and
 * reading it again. The copy is made in a document that does nothing (no pictures are loaded, no script runs), so what is in the
 * element, clean or not, does no harm while it is cleaned. The element itself is not changed.
 */
export function sanitizeNodes(source: Node, extensions: SanitizeExtension[] = []): HTMLElement {
  const doc = (source.ownerDocument ?? (source as Document)).implementation.createHTMLDocument('');
  for (const child of Array.from(source.childNodes)) doc.body.appendChild(doc.importNode(child, true));
  sanitizeBody(doc.body, extensions);
  return doc.body;
}

const SUGGESTION_ATTRS = ['data-suggestion', 'data-kind', 'data-author', 'data-name', 'data-date'];
const plain = (value: string | null, max: number): boolean => value !== null && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);

function cleanSuggestion(el: Element): void {
  const id = el.getAttribute('data-suggestion');
  const kind = el.getAttribute('data-kind');
  if (id === null || !SUGGESTION_ID.test(id) || (kind !== 'insert' && kind !== 'delete')) {
    for (const name of SUGGESTION_ATTRS) el.removeAttribute(name);
    return;
  }
  el.removeAttribute('style');
  if (!plain(el.getAttribute('data-author'), 128)) el.removeAttribute('data-author');
  if (!plain(el.getAttribute('data-name'), 128)) el.removeAttribute('data-name');
  const date = el.getAttribute('data-date');
  if (date === null || Number.isNaN(Date.parse(date)) || date.length > 40) el.removeAttribute('data-date');
}

type StyleRules = Record<string, RegExp>;

const TEXT_TRANSFORM = /^(?:uppercase|lowercase|capitalize)$/;
const SPAN_STYLES: StyleRules = {
  'font-family': SAFE_FAMILY,
  color: SAFE_COLOR,
  'background-color': SAFE_COLOR,
  // the sizes of the toolbar are in points; the names are the steps of older content, and pixels come from other editors
  'font-size': /^(?:x-small|small|medium|large|x-large|xx-large|xxx-large|(?:[6-9]|[1-9]\d|[12]\d\d)(?:\.\d{1,2})?(?:pt|px))$/,
  'text-transform': TEXT_TRANSFORM,
  // the weights between regular and bold; bold itself is <strong>
  'font-weight': /^(?:300|400|500|600)$/,
};
/** Padding of a filled box: one to four lengths in pt, px or em. */
const PADDING = /^\d{1,3}(?:\.\d{1,2})?(?:pt|px|em)(?:\s+\d{1,3}(?:\.\d{1,2})?(?:pt|px|em)){0,3}$/;
/** The look of a filled box (a Word text box): background, text colour, padding. */
const BOX_STYLES: StyleRules = { 'background-color': SAFE_COLOR, color: SAFE_COLOR, padding: PADDING };
const BLOCK_STYLES: StyleRules = {
  'text-align': /^(?:left|center|right|justify)$/,
  /** Indent: steps of 24px, up to eight (see indent.ts). */
  'margin-inline-start': /^(?:24|48|72|96|120|144|168|192)px$/,
};
/**
 * The look of a table cell: how its text sits (horizontal and vertical), a background and a border (one width, style and colour for
 * all four sides). A browser writes the border with the colour as rgb(), which SAFE_COLOR allows too.
 */
const CELL_STYLES: StyleRules = {
  'text-align': /^(?:left|center|right|justify)$/,
  'vertical-align': /^(?:top|middle|bottom)$/,
  'background-color': SAFE_COLOR,
  border: new RegExp(`^(?:none|[0-8]px (?:solid|dashed|dotted|double) ${SAFE_COLOR.source.slice(1, -1)})$`, 'i'),
};
/**
 * Layout (the building blocks): a row is a <div data-layout="row"> that is a grid, its columns <div data-layout="col"> hold the content.
 * Only a grid of up to six columns in fr or percent, a gap, and the alignment of what is in it.
 */
const FRACTION = '\\d{1,3}(?:\\.\\d{1,2})?(?:fr|%)';
const ROW_LAYOUT_STYLES: StyleRules = {
  display: /^grid$/,
  'grid-template-columns': new RegExp(`^${FRACTION}(?: ${FRACTION}){0,5}$`),
  gap: /^\d{1,2}px$/,
  'align-items': /^(?:start|center|end|stretch)$/,
};
const COL_LAYOUT_STYLES: StyleRules = { ...BOX_STYLES, 'min-width': /^0(?:px)?$/ };
/** A link that is a button: what makes it look like one. */
const BUTTON_STYLES: StyleRules = {
  display: /^inline-block$/,
  padding: PADDING,
  'background-color': SAFE_COLOR,
  color: SAFE_COLOR,
  'border-radius': /^\d{1,2}px$/,
  'text-decoration': /^none$/,
  'font-weight': /^(?:400|500|600|700|bold|normal)$/,
};
/** A row can be made taller by dragging its lower border: its height in pixels. */
const ROW_STYLES: StyleRules = { height: /^(?:[2-9]\d|[1-9]\d{2}|1\d{3})(?:\.\d)?px$/ };
const IMG_STYLES: StyleRules = {
  width: /^\d{1,3}%$/,
  display: /^block$/,
  'margin-left': /^(?:auto|0|0px)$/,
  'margin-right': /^(?:auto|0|0px)$/,
};
/** A <div> may also be a newspaper-style column block: 2-4 columns with an optional gap. */
const COLUMN_STYLES: StyleRules = {
  ...BLOCK_STYLES,
  ...BOX_STYLES,
  'column-count': /^[2-4]$/,
  'column-gap': /^\d{1,3}(?:\.\d{1,2})?(?:px|pt|em|rem)$/,
};
/** An <aside> is a sidebar or pull quote beside the text: it may float left or right with a width. */
const ASIDE_STYLES: StyleRules = {
  ...BOX_STYLES,
  float: /^(?:left|right)$/,
  width: /^\d{1,3}%$/,
  // a pull quote between columns: spans all of them, centred
  'column-span': /^all$/,
  'margin-left': /^auto$/,
  'margin-right': /^auto$/,
};
/** An underline and a strikethrough can have another kind of line and a colour. */
const LINE_STYLES: StyleRules = { 'text-decoration-style': /^(?:double|dashed|dotted|wavy)$/, 'text-decoration-color': SAFE_COLOR };
const STYLES_BY_TAG: Record<string, StyleRules> = {
  u: LINE_STYLES,
  s: LINE_STYLES,
  strike: LINE_STYLES,
  del: LINE_STYLES,
  /** Column widths, in percent: what dragging a column border sets. */
  col: { width: /^\d{1,3}(?:\.\d{1,2})?%$/ },
  aside: ASIDE_STYLES,
  span: SPAN_STYLES,
  img: IMG_STYLES,
  ...Object.fromEntries(['p', 'h1', 'h2', 'h3', 'li', 'blockquote', 'caption'].map((t) => [t, BLOCK_STYLES])),
  td: CELL_STYLES,
  th: CELL_STYLES,
  tr: ROW_STYLES,
  div: COLUMN_STYLES,
};

/** Keeps only the few style properties each tag may carry, with safe values; everything else is dropped. */
function safeStyle(style: string | null, rules: StyleRules | undefined): string | null {
  if (!rules) return null;
  const kept: string[] = [];
  for (const decl of (style ?? '').split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const value = decl.slice(i + 1).trim();
    if (prop === 'font-family' && /^(?:inherit|initial|unset)$/i.test(value)) continue; // browser noise, changes nothing
    if (rules[prop]?.test(value)) kept.push(`${prop}: ${value}`);
  }
  return kept.length ? kept.join('; ') : null;
}

function clean(parent: Node, ext: SanitizeExtension[]): void {
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) continue;
    if (node.nodeType !== Node.ELEMENT_NODE) {
      parent.removeChild(node);
      continue;
    }
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    // Inside a code block a line break is stored as a real newline, which is what code tooling expects.
    if (tag === 'br' && el.closest('pre')) {
      parent.replaceChild(el.ownerDocument.createTextNode('\n'), el);
      continue;
    }
    // Iframes only survive for the exact YouTube/Vimeo embed URLs, rebuilt with fixed safe attributes.
    if (tag === 'iframe') {
      const src = el.getAttribute('src') ?? '';
      if (isEmbedSrc(src)) {
        for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);
        el.textContent = '';
        el.setAttribute('src', src);
        for (const [name, value] of Object.entries(IFRAME_ATTRS)) el.setAttribute(name, value);
      } else {
        parent.removeChild(el);
      }
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      if (DROP_WITH_CONTENT.has(tag)) {
        parent.removeChild(el);
      } else {
        clean(el, ext);
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
      }
      continue;
    }
    const allowed = [...(ALLOWED_ATTRS[tag] ?? []), ...(DIR_TAGS.has(tag) ? ['dir'] : []), ...ext.flatMap((e) => e.attributes?.[tag] ?? [])];
    // a layout row or column, and a button, have styles that other divs and links do not
    const layout = tag === 'div' ? el.getAttribute('data-layout') : null;
    const rules = layout === 'row' ? ROW_LAYOUT_STYLES : layout === 'col' ? COL_LAYOUT_STYLES : tag === 'a' && el.hasAttribute('data-button') ? BUTTON_STYLES : STYLES_BY_TAG[tag];
    const style = safeStyle(el.getAttribute('style'), rules);
    for (const attr of Array.from(el.attributes)) {
      if (!allowed.includes(attr.name)) el.removeAttribute(attr.name);
    }
    if (style) el.setAttribute('style', style);
    if (tag === 'div' && layout !== null && layout !== 'row' && layout !== 'col') el.removeAttribute('data-layout');
    // a task list has no value, and only an item of one can be checked
    if (tag === 'ul' && el.hasAttribute('data-task')) el.setAttribute('data-task', '');
    if (tag === 'li' && el.hasAttribute('data-checked') && (el.getAttribute('data-checked') !== 'true' || !(parent instanceof Element && parent.matches('ul[data-task]')))) el.removeAttribute('data-checked');
    // a code block has a language that is a plain name
    if (tag === 'pre' && el.hasAttribute('data-language') && !/^[a-z][a-z0-9-]{0,19}$/.test(el.getAttribute('data-language')!)) el.removeAttribute('data-language');
    // a callout has a type that is a plain name (it is written in CSS and in Markdown)
    if (tag === 'div' && el.hasAttribute('data-callout') && !/^[a-z][a-z0-9-]{0,19}$/.test(el.getAttribute('data-callout')!)) el.removeAttribute('data-callout');
    // a mention names a person with a plain id (see mentions.ts)
    if (tag === 'span' && el.hasAttribute('data-mention')) {
      if (!MENTION_ID.test(el.getAttribute('data-mention')!)) el.removeAttribute('data-mention');
      else el.removeAttribute('style'); // what it looks like is the page's CSS, not the look of the text it was pasted from
    }
    // a comment is a piece of text with an id (see comments.ts); the thread is not in the HTML
    if (tag === 'span' && el.hasAttribute('data-comment')) {
      if (!COMMENT_ID.test(el.getAttribute('data-comment')!)) el.removeAttribute('data-comment');
      else el.removeAttribute('style');
    }
    // a suggestion (a tracked change) has an id, a kind, and who made it and when (see suggestions.ts)
    if (tag === 'span') cleanSuggestion(el);
    if (tag === 'a' && el.hasAttribute('data-button')) el.setAttribute('data-button', '');
    for (const e of ext) e.clean?.(el);
    // Text direction (Word and Docs paste `dir="RTL"`): on blocks only, and only a known value.
    if (DIR_TAGS.has(tag)) {
      const dir = el.getAttribute('dir')?.toLowerCase();
      if (dir === 'ltr' || dir === 'rtl') el.setAttribute('dir', dir);
      else el.removeAttribute('dir');
    }
    for (const name of ['colspan', 'rowspan', 'width', 'height']) {
      if (el.hasAttribute(name) && !/^\d{1,4}$/.test(el.getAttribute(name)!)) el.removeAttribute(name);
    }
    if (tag === 'img' && !isSafeImageSrc(el.getAttribute('src') ?? '')) {
      parent.removeChild(el);
      continue;
    }
    if (tag === 'video') {
      if (!isSafeVideoSrc(el.getAttribute('src') ?? '')) {
        parent.removeChild(el);
        continue;
      }
      el.setAttribute('controls', '');
      el.setAttribute('preload', 'metadata');
    }
    const href = el.getAttribute('href');
    if (href !== null && !SAFE_URL.test(href.trim())) el.removeAttribute('href');
    if (tag === 'a' && el.getAttribute('target') === '_blank') el.setAttribute('rel', 'noopener noreferrer');
    // A list directly inside a list (what browsers make of "indent") belongs inside the item before it.
    if ((tag === 'ul' || tag === 'ol') && /^(?:ul|ol)$/i.test(parent.nodeName)) {
      const prev = el.previousElementSibling;
      if (prev?.tagName === 'LI') {
        prev.appendChild(el);
      } else {
        const li = el.ownerDocument.createElement('li');
        parent.insertBefore(li, el);
        li.appendChild(el);
      }
    }
    clean(el, ext);
    // A <col> without a usable width says nothing (Word writes one per column), and a <colgroup> of those is noise.
    if ((tag === 'col' && !el.getAttribute('style')) || (tag === 'colgroup' && !el.children.length)) {
      el.remove();
      continue;
    }
    // A <span> that lost all its styles carries nothing: keep its content, drop the wrapper.
    if (tag === 'span' && !el.attributes.length) {
      while (el.firstChild) el.parentNode!.insertBefore(el.firstChild, el);
      el.remove();
    }
  }
  dropPlaceholderBreak(parent);
}

/**
 * Some browsers (WebKit) keep a trailing <br> as a placeholder after the last piece of content in a block.
 * It renders as nothing, so it doesn't belong in stored HTML. A lone <br> (an empty line) and a <br> that
 * follows another <br> (a visible blank line) stay.
 */
function dropPlaceholderBreak(parent: Node): void {
  const last = parent.lastChild;
  const before = last?.previousSibling;
  if (last?.nodeName === 'BR' && before && before.nodeName !== 'BR' && !(before.nodeType === Node.TEXT_NODE && !before.textContent)) {
    parent.removeChild(last);
  }
}
