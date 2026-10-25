/**
 * HTML for people to read: `formatHtml` puts each block on a line of its own and indents what is inside a block, and `compactHtml` takes
 * that away again. The editor shows the first in its HTML view and uses the second for what is typed there, so what the editor gives
 * (`getHTML()`) is the same as before: without the line breaks and the indent between blocks.
 *
 * Only the white space between blocks is touched: the text in a paragraph, a heading, a cell or a list item is as it is, and what is in a
 * code block (`<pre>`) is never changed.
 */
const BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li', 'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'colgroup', 'col', 'pre', 'hr', 'div', 'aside']);

/** Only the white space that HTML collapses: a no-break space is text. */
const LEADING = /^[ \t\n\r\f]+/;
const TRAILING = /[ \t\n\r\f]+$/;

const isElement = (n: Node | null): n is Element => !!n && n.nodeType === Node.ELEMENT_NODE;
const isBlock = (n: Node | null): boolean => isElement(n) && BLOCKS.has(n.tagName.toLowerCase());

const parse = (html: string): HTMLElement => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;

function inlineHtml(node: Node): string {
  if (isElement(node)) return node.outerHTML;
  if (node.nodeType !== Node.TEXT_NODE) return '';
  const box = node.ownerDocument!.createElement('span');
  box.appendChild(node.cloneNode());
  return box.innerHTML; // escaped as the browser does it
}

function lines(parent: Node, depth: number, out: string[]): void {
  const pad = '  '.repeat(depth);
  let run = '';
  const flush = () => {
    const text = run.replace(LEADING, '').replace(TRAILING, '');
    if (text) out.push(pad + text);
    run = '';
  };
  for (const node of Array.from(parent.childNodes)) {
    if (!isBlock(node)) {
      run += inlineHtml(node);
      continue;
    }
    flush();
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === 'pre' || tag === 'hr' || tag === 'col' || !Array.from(el.childNodes).some(isBlock)) {
      out.push(pad + el.outerHTML);
      continue;
    }
    // a block with blocks in it: its tags on lines of their own, and what is in it one step further in
    const shell = el.cloneNode(false) as Element;
    const close = `</${tag}>`;
    out.push(pad + shell.outerHTML.slice(0, shell.outerHTML.length - close.length));
    lines(el, depth + 1, out);
    out.push(pad + close);
  }
  flush();
}

/** The HTML with each block on a line, and the blocks in a block indented. */
export function formatHtml(html: string): string {
  if (!html) return '';
  const out: string[] = [];
  lines(parse(html), 0, out);
  return out.join('\n');
}

function strip(parent: Element): void {
  for (const child of Array.from(parent.children)) if (child.tagName.toLowerCase() !== 'pre') strip(child);
  if (!Array.from(parent.childNodes).some(isBlock)) return;
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const text = node as Text;
    let value = text.data;
    if (!text.previousSibling || isBlock(text.previousSibling)) value = value.replace(LEADING, '');
    if (!text.nextSibling || isBlock(text.nextSibling)) value = value.replace(TRAILING, '');
    if (value) text.data = value;
    else text.remove();
  }
}

/** The HTML without the line breaks and the indent that `formatHtml` puts between blocks (and that anyone typing HTML puts there). */
export function compactHtml(html: string): string {
  if (!html) return '';
  const body = parse(html);
  strip(body);
  return body.innerHTML;
}
