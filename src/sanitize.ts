import { SAFE_COLOR } from './colors';
import { SAFE_FAMILY } from './fonts';
import { IFRAME_ATTRS, isEmbedSrc, isSafeImageSrc, isSafeVideoSrc } from './media-urls';

const ALLOWED_TAGS = new Set([
  'p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
  'h1', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li', 'a', 'code', 'pre', 'hr',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'img', 'video',
]);
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template']);
const ALLOWED_ATTRS: Record<string, string[]> = {
  a: ['href', 'title', 'target', 'rel'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  video: ['src', 'width'],
};
const SAFE_URL = /^(https?:|mailto:|tel:|#|\/)/i;

/** Strips everything outside a small allow-list (scripts, event handlers, javascript: urls...). */
export function sanitize(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  clean(doc.body);
  return doc.body.innerHTML;
}

const STYLE_RULES: Record<string, RegExp> = {
  'font-family': SAFE_FAMILY,
  color: SAFE_COLOR,
  'background-color': SAFE_COLOR,
};

/** Keeps only font-family, color and background-color with safe values; every other style is dropped. */
function safeStyle(style: string | null): string | null {
  const kept: string[] = [];
  for (const decl of (style ?? '').split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const value = decl.slice(i + 1).trim();
    if (STYLE_RULES[prop]?.test(value)) kept.push(`${prop}: ${value}`);
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
    const allowed = ALLOWED_ATTRS[tag] ?? [];
    const style = tag === 'span' ? safeStyle(el.getAttribute('style')) : null;
    for (const attr of Array.from(el.attributes)) {
      if (!allowed.includes(attr.name)) el.removeAttribute(attr.name);
    }
    if (style) el.setAttribute('style', style);
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
    clean(el);
  }
}
