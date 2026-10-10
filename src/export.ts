/** Output formats besides HTML: Markdown and plain text. Both need a DOM (browser, or jsdom on the server). */
import { plainText } from './stats';
import { modelOf } from './table';

export type OutputFormat = 'html' | 'markdown' | 'text';

function toElement(input: string | Element): Element {
  if (typeof input !== 'string') return input;
  const root = new DOMParser().parseFromString(`<body>${input}</body>`, 'text/html').body;
  return root;
}

/** Plain text of HTML or an element: a line break between blocks, a tab between table cells. */
export function toText(input: string | Element): string {
  return plainText(toElement(input));
}

/** Escapes what Markdown would read as formatting. Kept light on purpose: a plain `.` or `-` stays readable. */
function escapeText(text: string): string {
  return text
    .replace(/ /g, ' ')
    .replace(/([\\`*_[\]<>|])/g, '\\$1')
    .replace(/^(\s*)([#+-])(?=\s)/gm, '$1\\$2')
    .replace(/^(\s*\d+)([.)])(?=\s)/gm, '$1\\$2');
}

function fence(code: string): string {
  const longest = Math.max(2, ...(code.match(/`+/g) ?? []).map((m) => m.length));
  const ticks = '`'.repeat(longest + 1);
  return `${ticks}\n${code.replace(/\n$/, '')}\n${ticks}`;
}

function inlineCode(code: string): string {
  const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((m) => m.length));
  const ticks = '`'.repeat(longest + 1);
  const pad = code.startsWith('`') || code.endsWith('`') ? ' ' : '';
  return `${ticks}${pad}${code}${pad}${ticks}`;
}

/** Wraps inline content in a marker, keeping the spaces outside it (`** bold **` isn't bold in Markdown). */
function wrap(content: string, open: string, close = open): string {
  if (!content.trim()) return content;
  const lead = content.match(/^\s*/)![0];
  const trail = content.match(/\s*$/)![0];
  return `${lead}${open}${content.trim()}${close}${trail}`;
}

function inline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeText((node.nodeValue ?? '').replace(/\s+/g, ' '));
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const kids = () => Array.from(el.childNodes).map(inline).join('');
  switch (tag) {
    case 'br':
      return '  \n';
    case 'strong':
    case 'b':
      return wrap(kids(), '**');
    case 'em':
    case 'i':
      return wrap(kids(), '*');
    case 'del':
    case 's':
    case 'strike':
      return wrap(kids(), '~~');
    case 'code':
      return inlineCode(el.textContent ?? '');
    case 'u':
    case 'sup':
    case 'sub':
      return wrap(kids(), `<${tag}>`, `</${tag}>`); // Markdown has no syntax for these; HTML is allowed in it
    case 'a': {
      const href = el.getAttribute('href') ?? '';
      const text = kids();
      return href ? `[${text}](${href.replace(/[()\s]/g, (c) => encodeURIComponent(c))})` : text;
    }
    case 'img':
      return `![${escapeText(el.getAttribute('alt') ?? '')}](${el.getAttribute('src') ?? ''})`;
    case 'video': {
      const src = el.getAttribute('src');
      return src ? `[${src}](${src})` : '';
    }
    default:
      return kids();
  }
}

const BLOCKS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'aside', 'pre', 'table', 'hr']);

/** Inline content of an element that may also hold block children (a list item, a quote). */
function blocks(parent: Element, indent = ''): string[] {
  const out: string[] = [];
  let run = '';
  const flush = () => {
    if (run.trim()) out.push(run.trim());
    run = '';
  };
  parent.childNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE && BLOCKS.has((node as Element).tagName.toLowerCase())) {
      flush();
      const md = block(node as Element, indent);
      if (md) out.push(md);
    } else {
      run += inline(node);
    }
  });
  flush();
  return out;
}

function list(el: Element, ordered: boolean, indent: string): string {
  let n = parseInt(el.getAttribute('start') ?? '1', 10) || 1;
  return Array.from(el.children)
    .filter((li) => li.tagName === 'LI')
    .map((li) => {
      const marker = ordered ? `${n++}. ` : '- ';
      const pad = ' '.repeat(marker.length);
      const parts: string[] = [];
      let text = '';
      li.childNodes.forEach((node) => {
        const tag = node.nodeType === Node.ELEMENT_NODE ? (node as Element).tagName.toLowerCase() : '';
        if (tag === 'ul' || tag === 'ol') {
          if (text.trim()) parts.push(text.trim());
          text = '';
          parts.push(list(node as Element, tag === 'ol', ''));
        } else if (BLOCKS.has(tag)) {
          if (text.trim()) parts.push(text.trim());
          text = '';
          parts.push(block(node as Element));
        } else {
          text += inline(node);
        }
      });
      if (text.trim()) parts.push(text.trim());
      const [first = '', ...rest] = parts.join('\n').split('\n');
      return indent + marker + first + rest.map((line) => (line ? `\n${indent}${pad}${line}` : '\n')).join('');
    })
    .join('\n');
}

function cell(el: Element): string {
  return Array.from(el.childNodes).map(inline).join('').replace(/\s*\n\s*/g, ' ').trim(); // `|` is already escaped as text
}

function table(el: Element): string {
  // Markdown tables cannot merge cells: the text stays in the first position a merged cell covers, the rest is empty.
  const model = modelOf(el as HTMLTableElement);
  const seen = new Set<Element>();
  const rows = model.m.map((row) =>
    row.map((c) => {
      if (!c || seen.has(c)) return '';
      seen.add(c);
      return cell(c);
    }),
  );
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? '');
  const line = (r: string[]) => `| ${pad(r).join(' | ')} |`;
  // GFM tables always have a header row: without a real one the first row takes that place.
  return [line(rows[0]), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n');
}

function block(el: Element, indent = ''): string {
  const tag = el.tagName.toLowerCase();
  const heading = /^h([1-6])$/.exec(tag);
  if (heading) return `${'#'.repeat(Number(heading[1]))} ${Array.from(el.childNodes).map(inline).join('').trim()}`;
  switch (tag) {
    case 'hr':
      return '---';
    case 'pre':
      return fence(el.textContent ?? '');
    case 'ul':
    case 'ol':
      return list(el, tag === 'ol', indent);
    case 'blockquote':
    case 'aside':
      return blocks(el)
        .join('\n\n')
        .split('\n')
        .map((l) => (l ? `> ${l}` : '>'))
        .join('\n');
    case 'table':
      return table(el);
    case 'p':
    case 'li':
      return Array.from(el.childNodes).map(inline).join('').trim();
    default:
      return blocks(el, indent).join('\n\n'); // div and other wrappers (such as a columns block): just their content
  }
}

/**
 * Markdown (GitHub flavour) of HTML or an element. Formatting Markdown has no syntax for (underline, sub/superscript) stays as
 * inline HTML; colours, fonts, sizes, alignment and columns are dropped, because Markdown can't express them.
 */
export function toMarkdown(input: string | Element): string {
  const root = toElement(input);
  return blocks(root).join('\n\n').replace(/[ \t]+\n/g, (m) => (m.startsWith('  ') ? '  \n' : '\n')).replace(/\n{3,}/g, '\n\n').trim();
}
