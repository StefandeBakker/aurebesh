import { SAFE_COLOR } from './colors';
import { SAFE_FAMILY } from './fonts';
import { IFRAME_ATTRS, isEmbedSrc, isSafeImageSrc, isSafeVideoSrc } from './media-urls';

const ALLOWED_TAGS = new Set([
  'p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
  'h1', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li', 'a', 'code', 'pre', 'hr',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'colgroup', 'col',
  'img', 'video', 'sup', 'sub', 'aside',
]);
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template']);
const ALLOWED_ATTRS: Record<string, string[]> = {
  a: ['href', 'title', 'target', 'rel'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  video: ['src', 'width'],
};
const DIR_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'blockquote', 'pre', 'ul', 'ol', 'li', 'table', 'td', 'th', 'div', 'aside']);
const SAFE_URL =/^(https?:|mailto:|tel:|#|\/)/i;

/** Strips everything outside a small allow-list (scripts, event handlers, javascript: urls...). */
export function sanitize(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  clean(doc.body);
  return doc.body.innerHTML;
}

type StyleRules = Record<string, RegExp>;

const TEXT_TRANSFORM = /^(?:uppercase|lowercase|capitalize)$/;
const SPAN_STYLES: StyleRules = {
  'font-family': SAFE_FAMILY,
  color: SAFE_COLOR,
  'background-color': SAFE_COLOR,
  'font-size': /^(?:x-small|small|medium|large|x-large|xx-large|xxx-large)$/,
  'text-transform': TEXT_TRANSFORM,
};
/** Padding of a filled box: one to four lengths in pt, px or em. */
const PADDING = /^\d{1,3}(?:\.\d{1,2})?(?:pt|px|em)(?:\s+\d{1,3}(?:\.\d{1,2})?(?:pt|px|em)){0,3}$/;
/** The look of a filled box (a Word text box): background, text colour, padding. */
const BOX_STYLES: StyleRules = { 'background-color': SAFE_COLOR, color: SAFE_COLOR, padding: PADDING };
const BLOCK_STYLES: StyleRules = { 'text-align': /^(?:left|center|right|justify)$/ };
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
const STYLES_BY_TAG: Record<string, StyleRules> = {
  /** Column widths, in percent: what dragging a column border sets. */
  col: { width: /^\d{1,3}(?:\.\d{1,2})?%$/ },
  aside: ASIDE_STYLES,
  span: SPAN_STYLES,
  img: IMG_STYLES,
  ...Object.fromEntries(['p', 'h1', 'h2', 'h3', 'li', 'blockquote', 'td', 'th'].map((t) => [t, BLOCK_STYLES])),
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

function clean(parent: Node): void {
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
        clean(el);
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
      }
      continue;
    }
    const allowed = DIR_TAGS.has(tag) ? [...(ALLOWED_ATTRS[tag] ?? []), 'dir'] : ALLOWED_ATTRS[tag] ?? [];
    const style = safeStyle(el.getAttribute('style'), STYLES_BY_TAG[tag]);
    for (const attr of Array.from(el.attributes)) {
      if (!allowed.includes(attr.name)) el.removeAttribute(attr.name);
    }
    if (style) el.setAttribute('style', style);
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
    clean(el);
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
