/**
 * Cleaning up pasted HTML (Word, Google Docs, web pages) before it is sanitized and inserted.
 *
 * What survives: bold, italic, underline, strikethrough, super/subscript, text colour, highlight, alignment,
 * headings, lists (including Word's fake lists), links, tables, images. What is dropped: fonts, sizes, spacing,
 * classes and everything else, so pasted text takes on the editor's own look.
 *
 * Images are not inserted directly. Word points to temporary files on the computer (unreadable for a web page),
 * but also puts the pictures in its RTF clipboard data; Google Docs links to its own servers. Each image becomes
 * a marker in the HTML and a `PendingImage` that the editor imports through the configured upload adapter.
 */
import { SAFE_COLOR } from './colors';

/** `upload`: copy pasted images through the upload adapter (default). `link`: keep links to the source. `remove`: drop them. */
export type PasteImagePolicy = 'upload' | 'link' | 'remove';

export interface PendingImage {
  /** Text placed in the HTML where the image belongs. */
  marker: string;
  kind: 'remote' | 'local';
  /** Remote: the image URL. Local: the original reference (a file: URL from Word). */
  src: string;
  alt: string;
  /** Local images: the picture found in the RTF clipboard data. */
  blob?: Blob;
  /** The size the picture has in the document, as a percentage of the text width (when it is not full width). */
  width?: number;
}

export interface PreparedPaste {
  html: string;
  images: PendingImage[];
  /** Images that could not be brought along (no data on the clipboard, uploads disabled, policy `remove`). */
  dropped: number;
}

const MARK_OPEN = '';
const MARK_CLOSE = '';
/** Matches the markers `preparePaste` leaves in the HTML. Group 1 is the index in `images`. */
export const MARKER = /aurebesh-img-(\d+)/g;

const NAMED_COLORS: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', blue: '#0000ff', green: '#008000', yellow: '#ffff00', lime: '#00ff00',
  aqua: '#00ffff', cyan: '#00ffff', fuchsia: '#ff00ff', magenta: '#ff00ff', navy: '#000080', teal: '#008080', purple: '#800080',
  maroon: '#800000', olive: '#808000', gray: '#808080', grey: '#808080', silver: '#c0c0c0', orange: '#ffa500',
  darkred: '#8b0000', darkblue: '#00008b', darkgreen: '#006400', darkgray: '#a9a9a9', lightgray: '#d3d3d3', pink: '#ffc0cb', brown: '#a52a2a',
};

const BLOCK = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'LI', 'BLOCKQUOTE', 'TD', 'TH']);
const VOID = new Set(['IMG', 'BR', 'HR']);

// ---- small helpers --------------------------------------------------------------------------------------

function parseStyle(style: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of (style ?? '').split(';')) {
    const i = decl.indexOf(':');
    if (i > 0) out[decl.slice(0, i).trim().toLowerCase()] = decl.slice(i + 1).trim();
  }
  return out;
}

function unwrap(el: Element): void {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

const hasBlockChild = (el: Element): boolean =>
  Array.from(el.children).some((c) => BLOCK.has(c.tagName) || /^(?:UL|OL|TABLE|PRE|HR)$/.test(c.tagName));

function wrapChildren(el: Element, tags: string[]): void {
  const doc = el.ownerDocument;
  const fragment = doc.createDocumentFragment();
  while (el.firstChild) fragment.appendChild(el.firstChild);
  let inner: Node = fragment;
  for (const tag of tags.reverse()) {
    const wrapper = doc.createElement(tag);
    wrapper.appendChild(inner);
    inner = wrapper;
  }
  el.appendChild(inner);
}

export function normalizeColor(value: string | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (['windowtext', 'inherit', 'initial', 'transparent', 'auto', 'currentcolor', 'none', ''].includes(v)) return null;
  if (NAMED_COLORS[v]) return NAMED_COLORS[v];
  return SAFE_COLOR.test(v) ? v : null;
}

const TEXT_TRANSFORM = /^(?:uppercase|lowercase|capitalize)$/;

/** True when an element around this one sets a (non-black) text colour that this element would inherit. */
function ancestorHasColour(el: Element): boolean {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const c = normalizeColor(parseStyle(p.getAttribute('style'))['color']);
    if (c && !isBlack(c)) return true;
  }
  return false;
}
const isBlack = (c: string) => /^(?:#0{3}|#0{6}|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))$/i.test(c);
const isWhite = (c: string) => /^(?:#f{3}|#f{6}|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))$/i.test(c);
const isBold = (w: string | undefined) => !!w && (/^(?:bold|bolder)$/i.test(w) || (/^\d+$/.test(w) && +w >= 600));
const isNormalWeight = (w: string | undefined) => !!w && (/^(?:normal|lighter)$/i.test(w) || (/^\d+$/.test(w) && +w < 600));

// ---- the cleaning steps ---------------------------------------------------------------------------------

/** Comments include Word's conditional comments (`<![if !mso]>`) and the <!--StartFragment--> markers. */
function removeComments(root: HTMLElement): void {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const comments: Node[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) comments.push(n);
  comments.forEach((c) => c.parentNode?.removeChild(c));
}

function removeJunk(root: HTMLElement): void {
  root.querySelectorAll('style,script,meta,link,title,xml,noscript,template,iframe,object,embed').forEach((el) => el.remove());
  root.querySelectorAll('br.Apple-interchange-newline').forEach((el) => el.remove());
  // Page and section breaks (and the span Word wraps around them) carry no content for a flowing document.
  root.querySelectorAll('br[clear],br[style*="mso-break-type"],br[style*="page-break"]').forEach((br) => {
    const parent = br.parentElement;
    br.remove();
    if (parent?.tagName === 'SPAN' && !parent.textContent!.trim() && !parent.children.length) parent.remove();
  });
  // Elements with a namespace prefix (<o:p>, <v:shape>, <w:sdt>) only add noise: keep their content.
  Array.from(root.querySelectorAll('*'))
    .filter((el) => el.tagName.includes(':'))
    .forEach(unwrap);
  // <font color=...> from older Word and pages becomes a coloured span.
  root.querySelectorAll('font').forEach((font) => {
    const color = normalizeColor(font.getAttribute('color') ?? undefined);
    if (color && !isBlack(color)) {
      const span = root.ownerDocument.createElement('span');
      span.setAttribute('style', `color: ${color}`);
      while (font.firstChild) span.appendChild(font.firstChild);
      font.replaceWith(span);
    } else {
      unwrap(font);
    }
  });
}

/** Word marks list paragraphs with `mso-list`, a bullet or number in a span, and a level. Turn them into real lists. */
function convertWordLists(root: HTMLElement): void {
  const doc = root.ownerDocument;
  const isItem = (el: Element | undefined): el is HTMLElement =>
    !!el && el.tagName === 'P' && (/mso-list:\s*(?!none|ignore)/i.test(el.getAttribute('style') ?? '') || /^MsoListParagraph/i.test(el.className));

  const parents = new Set<Element>();
  root.querySelectorAll('p').forEach((p) => isItem(p) && p.parentElement && parents.add(p.parentElement));

  parents.forEach((parent) => {
    const children = Array.from(parent.children);
    for (let i = 0; i < children.length; i++) {
      if (!isItem(children[i])) continue;
      // A run of consecutive list paragraphs becomes one (nested) list.
      const run: HTMLElement[] = [];
      while (isItem(children[i])) run.push(children[i++] as HTMLElement);
      i--;

      const out = doc.createElement('div'); // collects the finished lists
      const stack: { level: number; list: HTMLElement }[] = [];
      let listId = '';
      for (const p of run) {
        const style = p.getAttribute('style') ?? '';
        const level = Math.max(1, +(/level(\d+)/i.exec(style)?.[1] ?? 1));
        // Every Word list has its own id (l0, l1...): a different id is a new list, even right after another one.
        const id = /mso-list:\s*(l\d+)/i.exec(style)?.[1] ?? listId;
        if (id !== listId) {
          stack.length = 0;
          listId = id;
        }
        const marker = p.querySelector<HTMLElement>('[style*="mso-list:Ignore" i],[style*="mso-list: Ignore" i]');
        const markerText = (marker?.textContent ?? '').replace(/[\s ]/g, '');
        const ordered = /^\(?(?:\d+|[a-z]{1,3})[.)]$/i.test(markerText);
        marker?.remove();

        while (stack.length && stack[stack.length - 1].level > level) stack.pop();
        if (!stack.length || stack[stack.length - 1].level < level) {
          const list = doc.createElement(ordered ? 'ol' : 'ul');
          // A deeper level goes inside the item above it.
          (stack[stack.length - 1]?.list.lastElementChild ?? out).appendChild(list);
          stack.push({ level, list });
        }
        const li = doc.createElement('li');
        while (p.firstChild) li.appendChild(p.firstChild);
        stack[stack.length - 1].list.appendChild(li);
      }
      while (out.firstChild) run[0].parentNode!.insertBefore(out.firstChild, run[0]);
      run.forEach((p) => p.remove());
    }
  });
}

function normalizeHeadings(root: HTMLElement): void {
  const doc = root.ownerDocument;
  const rename = (el: Element, tag: string) => {
    const h = doc.createElement(tag);
    while (el.firstChild) h.appendChild(el.firstChild);
    const align = el.getAttribute('style');
    if (align) h.setAttribute('style', align);
    el.replaceWith(h);
  };
  root.querySelectorAll('h4,h5,h6').forEach((h) => rename(h, 'h3'));
  root.querySelectorAll('p').forEach((p) => {
    const m = /^(?:Mso)?(?:Heading\s?([1-3])|(Title)|(Subtitle))$/i.exec(p.className.trim());
    if (m) rename(p, m[2] ? 'h1' : m[3] ? 'h2' : `h${m[1]}`);
  });
}

/**
 * Word (and most pages) define colours, capitals and so on in the style sheet (`h1 { color: #93A299 }`,
 * `p.StorySubtitle { ... }`) rather than on the element. Only simple selectors are handled: `tag`, `.class` and
 * `tag.class`, the kind Word writes for its styles.
 */
interface SheetRule {
  tag?: string;
  cls?: string;
  decl: Record<string, string>;
  order: number;
}
const SHEET_PROPS = new Set([
  'color', 'background-color', 'background', 'text-transform', 'font-weight', 'font-style',
  'text-decoration', 'text-decoration-line', 'vertical-align', 'text-align',
]);

/**
 * The css of the <style> elements of a pasted page, without its comments: those in css, and the `<!--` and `-->` that old pages put around
 * it (`--!>` ends an html comment too). The marks go until none is left, so that taking one out cannot make a new one.
 */
function styleText(doc: Document): string {
  let css = Array.from(doc.querySelectorAll('style'))
    .map((s) => s.textContent ?? '')
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  for (let before = ''; before !== css; ) {
    before = css;
    css = css.replace(/<!--|--!?>/g, '');
  }
  return css;
}

function readStyleSheet(doc: Document): SheetRule[] {
  const css = styleText(doc);
  const rules: SheetRule[] = [];
  for (const m of css.matchAll(/([^{}@]+)\{([^}]*)\}/g)) {
    const decl = Object.fromEntries(Object.entries(parseStyle(m[2])).filter(([k]) => SHEET_PROPS.has(k)));
    if (!Object.keys(decl).length) continue;
    for (const selector of m[1].split(',')) {
      const parts = /^([a-z][a-z0-9]*)?(?:\.([\w-]+))?$/i.exec(selector.trim());
      if (parts && (parts[1] || parts[2])) rules.push({ tag: parts[1]?.toLowerCase(), cls: parts[2], decl, order: rules.length });
    }
  }
  return rules;
}

/** Writes the matching style-sheet declarations into each element's own style, which still wins where it says something. */
function applyStyleSheet(root: HTMLElement, rules: SheetRule[]): void {
  if (!rules.length) return;
  const specificity = (r: SheetRule) => (r.tag ? 1 : 0) + (r.cls ? 10 : 0);
  root.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const classes = (el.getAttribute('class') ?? '').split(/\s+/);
    const tag = el.tagName.toLowerCase();
    const matched = rules.filter((r) => (!r.tag || r.tag === tag) && (!r.cls || classes.includes(r.cls)));
    if (!matched.length) return;
    matched.sort((a, b) => specificity(a) - specificity(b) || a.order - b.order);
    const merged = { ...Object.assign({}, ...matched.map((r) => r.decl)), ...parseStyle(el.getAttribute('style')) };
    el.setAttribute('style', Object.entries(merged).map(([k, v]) => `${k}: ${v}`).join('; '));
  });
}

/** Turns presentational styles into the semantic tags the editor uses, and keeps only colour, highlight and alignment. */
function convertStyles(root: HTMLElement): void {
  const doc = root.ownerDocument;
  const all = Array.from(root.querySelectorAll<HTMLElement>('*')).reverse(); // children before parents
  for (const el of all) {
    if (!el.parentNode) continue;
    const tag = el.tagName.toLowerCase();
    const s = parseStyle(el.getAttribute('style'));
    const inLink = !!el.closest('a');

    // Google Docs wraps everything in <b style="font-weight:normal">: not bold at all.
    if ((tag === 'b' || tag === 'strong') && isNormalWeight(s['font-weight'])) {
      unwrap(el);
      continue;
    }
    if ((tag === 'i' || tag === 'em') && /^normal$/i.test(s['font-style'] ?? '')) {
      unwrap(el);
      continue;
    }

    const wraps: string[] = [];
    if (!VOID.has(el.tagName)) {
      if (isBold(s['font-weight']) && !/^(?:b|strong|h[1-6])$/.test(tag)) wraps.push('strong');
      if (/italic|oblique/i.test(s['font-style'] ?? '') && !/^(?:i|em)$/.test(tag)) wraps.push('em');
      const deco = `${s['text-decoration'] ?? ''} ${s['text-decoration-line'] ?? ''}`;
      if (/underline/i.test(deco) && !inLink && !/^(?:u|a)$/.test(tag)) wraps.push('u');
      if (/line-through/i.test(deco) && !/^(?:s|strike|del)$/.test(tag)) wraps.push('s');
      if (/^super/i.test(s['vertical-align'] ?? '') && tag !== 'sup') wraps.push('sup');
      else if (/^sub$/i.test(s['vertical-align'] ?? '') && tag !== 'sub') wraps.push('sub');
      if (wraps.length) wrapChildren(el, wraps);
    }

    const keep: string[] = [];
    let colour: string | null = null;
    let background: string | null = null;
    if (!inLink) {
      const c = normalizeColor(s['color']);
      // Black is the default and is left out, unless something around it has a colour that black has to override
      // (Word: a heading styled green with black text in it). White text only makes sense on a fill (a Word text box
      // with a dark background); anywhere else it would vanish.
      if (c && (!isBlack(c) || ancestorHasColour(el)) && (!isWhite(c) || el.closest('[data-aurebesh-fill]'))) colour = c;
    }
    const transform = TEXT_TRANSFORM.test(s['text-transform'] ?? '') ? s['text-transform'] : null;
    // Only text highlighting (on a span) is kept: shading of a cell, paragraph or table is not a text highlight.
    const bgSource = s['background-color'] ?? s['mso-highlight'] ?? s['background']?.split(/\s+/).find((t) => normalizeColor(t));
    const bg = normalizeColor(bgSource);
    if (bg && !isWhite(bg) && !inLink && tag === 'span') background = bg;

    const textAlign = (s['text-align'] ?? el.getAttribute('align') ?? '').toLowerCase();
    if (BLOCK.has(el.tagName) && /^(?:center|right|justify)$/.test(textAlign)) keep.push(`text-align: ${textAlign}`);

    el.removeAttribute('style');
    const text = [colour && `color: ${colour}`, background && `background-color: ${background}`, transform && `text-transform: ${transform}`].filter(Boolean).join('; ');
    if (text) {
      // The sanitizer only lets <span> carry colours and capitals, so put them on a span around the content.
      if (tag === 'span' && !keep.length) {
        el.setAttribute('style', text);
      } else if (!VOID.has(el.tagName) && !hasBlockChild(el)) {
        // (a span can't wrap paragraphs, so a colour on an element that contains blocks is dropped)
        const span = doc.createElement('span');
        span.setAttribute('style', text);
        while (el.firstChild) span.appendChild(el.firstChild);
        el.appendChild(span);
      }
    }
    if (keep.length) el.setAttribute('style', keep.join('; '));
  }
}

/** Google wraps links in a redirect (google.com/url?q=...): link straight to the target. */
function normalizeLinks(root: HTMLElement): void {
  root.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href');
    if (!href) {
      unwrap(a);
      return;
    }
    try {
      const url = new URL(href, 'https://placeholder.invalid');
      if (/(^|\.)google\.[a-z.]+$/.test(url.hostname) && url.pathname === '/url' && url.searchParams.get('q')) {
        a.setAttribute('href', url.searchParams.get('q')!);
      }
    } catch {
      /* leave it */
    }
  });
}

function tidy(root: HTMLElement): void {
  // Google Docs and Word mark every paragraph left-to-right. That is the default, and keeping it would stop a
  // pasted Hebrew or Arabic paragraph from finding its own direction; right-to-left is meaningful and stays.
  root.querySelectorAll('[dir]').forEach((el) => {
    if (el.getAttribute('dir')?.toLowerCase() === 'ltr') el.removeAttribute('dir');
  });
  // Leftovers of section breaks directly in the document or in a Word section: stray breaks and empty spans.
  const containers = [root, ...Array.from(root.querySelectorAll('div')).filter(isSection)];
  containers.forEach((c) =>
    Array.from(c.children).forEach((el) => {
      if (el.tagName === 'BR' || (el.tagName === 'SPAN' && !el.textContent!.trim() && !el.querySelector('img'))) el.remove();
    }),
  );
  // <li><p>text</p></li> (Google Docs) is just <li>text</li>.
  root.querySelectorAll('li').forEach((li) => {
    const kids = Array.from(li.children);
    if (kids.length === 1 && kids[0].tagName === 'P') unwrap(kids[0]);
  });
  // Empty paragraphs (Word's spacing, "&nbsp;" only) stay as one blank line.
  root.querySelectorAll('p').forEach((p) => {
    if (!p.textContent!.replace(/[\s ]/g, '') && !p.querySelector('img,br,table,hr')) p.innerHTML = '<br>';
  });
}

// ---- Word's drawing shapes: text boxes and pictures -------------------------------------------------------

/**
 * Word floats text boxes (sidebars, pull quotes, banners) and pictures on the page: each is a VML shape anchored to
 * a paragraph, with its position given in percent of the page (`mso-left-percent`, `mso-top-percent`...). In the HTML the
 * box's text sits INSIDE the anchor paragraph, so a heading ends up containing the sidebar's text. A flowing editor
 * can't reproduce absolute positions, so each text box is taken out of its paragraph and put back as its own block:
 *   - a full-width box (banner, summary) becomes a plain block,
 *   - a narrow box becomes an `<aside style="float: left|right; width: N%">`, on the side its position says,
 * and it is placed where the author put it as far as the page position tells: boxes near the top of the page go
 * before their anchor paragraph, boxes further down into the middle of the next run of body text (the pull quote).
 */
/** The text area of the page in points (page size minus margins); Letter with 1 inch margins when the style sheet doesn't say. */
interface PageSize {
  width: number;
  height: number;
}

function pageTextSize(doc: Document): PageSize {
  const css = Array.from(doc.querySelectorAll('style')).map((s) => s.textContent ?? '').join('\n');
  const body = /@page\s+[\w-]+\s*\{([^}]*)\}/i.exec(css)?.[1] ?? '';
  const size = /size\s*:\s*([\d.]+)pt\s+([\d.]+)pt/i.exec(body);
  const margin = /margin\s*:\s*([^;]+)/i.exec(body)?.[1]?.trim().split(/\s+/).map((v) => parseFloat(v));
  if (!size || !margin || margin.some(Number.isNaN)) return { width: 468, height: 648 };
  const [top, right = top, bottom = top, left = right] = margin;
  return { width: Math.max(100, parseFloat(size[1]) - left - right), height: Math.max(100, parseFloat(size[2]) - top - bottom) };
}

interface Geometry {
  widthPct: number;
  /** Height as a percentage of the text area of the page (0 when unknown). */
  heightPct: number;
  leftPct: number;
  /** Distance from the top of the page, in percent; null when the box is placed relative to its paragraph. */
  topPct: number | null;
  wrap: string;
}

function shapeGeometry(shape: Element, page: PageSize): Geometry {
  const textWidth = page.width;
  const s = parseStyle(shape.getAttribute('style'));
  const pts = (v: string | undefined) => {
    const m = /^(-?[\d.]+)\s*(pt|px|in|cm|mm)?$/i.exec((v ?? '').trim());
    if (!m) return NaN;
    const n = parseFloat(m[1]);
    return { px: n * 0.75, in: n * 72, cm: n * 28.35, mm: n * 2.835 }[(m[2] ?? 'pt').toLowerCase() as 'px'] ?? n;
  };
  const percent = (key: string) => (s[key] !== undefined && parseFloat(s[key]) ? parseFloat(s[key]) / 10 : NaN);

  let widthPct = percent('mso-width-percent');
  if (Number.isNaN(widthPct)) widthPct = (pts(s['width']) / textWidth) * 100;
  if (Number.isNaN(widthPct)) widthPct = 100;
  widthPct = Math.min(100, Math.max(5, widthPct));

  let heightPct = percent('mso-height-percent');
  if (Number.isNaN(heightPct)) heightPct = (pts(s['height']) / page.height) * 100;
  if (Number.isNaN(heightPct)) heightPct = 0;

  let leftPct = percent('mso-left-percent');
  if (Number.isNaN(leftPct)) {
    const horizontal = s['mso-position-horizontal'];
    if (horizontal === 'right') leftPct = 100 - widthPct;
    else if (horizontal === 'center') leftPct = (100 - widthPct) / 2;
    else leftPct = Number.isNaN(pts(s['margin-left'])) ? 0 : (pts(s['margin-left']) / textWidth) * 100;
  }

  let topPct: number | null = percent('mso-top-percent');
  if (Number.isNaN(topPct)) {
    const vertical = s['mso-position-vertical'];
    topPct = vertical === 'top' ? 0 : vertical === 'center' ? 50 : vertical === 'bottom' ? 100 : null;
  }
  const wrap = shape.getElementsByTagName('w:wrap')[0]?.getAttribute('type') ?? '';
  return { widthPct, heightPct, leftPct, topPct, wrap };
}

const isSection = (el: Element | null) => !!el && el.tagName === 'DIV' && /^WordSection\d+$/i.test(el.className);

/** The block, directly in the document or in a Word section, that holds the shape. */
function anchorBlock(shape: Element, root: HTMLElement): Element {
  let node: Element = shape;
  while (node.parentElement && node.parentElement !== root && !isSection(node.parentElement)) node = node.parentElement;
  return node;
}

/** The next run of body text after `host`: a block with at least three paragraphs, such as a column section. */
function nextBodyRun(root: HTMLElement, host: Element): Element | null {
  for (const div of Array.from(root.querySelectorAll('div'))) {
    if (div.contains(host) || !(host.compareDocumentPosition(div) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    if (Array.from(div.children).filter((c) => c.tagName === 'P').length >= 3) return div;
  }
  return null;
}

/** A text box taken out of its paragraph, waiting to be put back once the document has been cleaned up. */
interface FloatingBox {
  callout: HTMLElement;
  geo: Geometry;
  banner: boolean;
  /** Style declarations for the box itself: its fill and padding (empty for a box without a visible fill). */
  fill: string[];
}

const toPt = (value: string): number => {
  const m = /^(-?[\d.]+)\s*(pt|px|in|cm|mm)?$/i.exec(value.trim());
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  return ({ pt: n, px: n * 0.75, in: n * 72, cm: n * 28.35, mm: n * 2.835 } as Record<string, number>)[(m[2] ?? 'pt').toLowerCase()];
};

/** `#e1deba` + opacity 0.7 -> `rgba(225, 222, 186, 0.7)`. */
function withOpacity(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 100) / 100})`;
}

/**
 * The fill of a Word text box: `fillcolor` (written like `#e1deba [1302]`, the bracket is a theme index) with its
 * opacity from `<v:fill opacity="46003f"/>` (16.16 fixed point), and the text margin `inset` as padding.
 * A white or absent fill is not a visible box on a white page and gives nothing.
 */
function boxFill(shape: Element, textbox: Element): string[] {
  const filled = (shape.getAttribute('filled') ?? '').toLowerCase();
  if (filled === 'f' || filled === 'false') return [];
  const colour = normalizeColor((shape.getAttribute('fillcolor') ?? '').trim().split(/\s+/)[0]);
  if (!colour || isWhite(colour) || !/^#/.test(colour)) return [];

  const opacity = shape.getElementsByTagName('v:fill')[0]?.getAttribute('opacity') ?? '';
  const fixed = /^(\d+)f$/.exec(opacity);
  const alpha = fixed ? Number(fixed[1]) / 65536 : /%$/.test(opacity) ? parseFloat(opacity) / 100 : parseFloat(opacity);
  const css = Number.isFinite(alpha) && alpha > 0 && alpha < 0.99 ? withOpacity(colour, alpha) : colour;

  const inset = (textbox.getAttribute('inset') ?? '').split(',').map((v) => toPt(v));
  const [left, top, right, bottom] = [7.2, 3.6, 7.2, 3.6].map((fallback, i) => (Number.isFinite(inset[i]) ? inset[i] : fallback));
  const round = (n: number) => Math.round(n * 10) / 10;
  return [`background-color: ${css}`, `padding: ${round(top)}pt ${round(right)}pt ${round(bottom)}pt ${round(left)}pt`];
}

/** Phase 1: take the text box out and leave a marker where it was anchored. Returns the box, or null when it is empty. */
function takeTextBox(shape: Element, textbox: Element, root: HTMLElement, page: PageSize): FloatingBox | null {
  const doc = root.ownerDocument;
  const geo = shapeGeometry(shape, page);

  // Word wraps the text in a one-cell table (for browsers that don't know VML) and a div: take the content out.
  let box: Element = textbox;
  for (let kids = Array.from(box.children); kids.length === 1 && /^(?:TABLE|TBODY|TR|TD|DIV)$/.test(kids[0].tagName); kids = Array.from(box.children)) box = kids[0];

  const banner = geo.widthPct >= 80 || geo.wrap === 'topAndBottom';
  const callout = doc.createElement(banner ? 'div' : 'aside');
  while (box.firstChild) callout.appendChild(box.firstChild);
  if (!callout.textContent!.trim() && !callout.querySelector('img,table')) {
    shape.remove();
    return null;
  }
  const fill = boxFill(shape, textbox);
  // Text colours inside a filled box (white on a dark fill) must be kept; the marker tells the style conversion so.
  if (fill.length) callout.setAttribute('data-aurebesh-fill', '');
  return { callout, geo, banner, fill };
}

/**
 * Phase 2: put each text box back as its own block, now that the paragraphs around it are plain again.
 * The marker that phase 1 left shows which paragraph the box was anchored to.
 */
/** A floating box that was placed, kept so the columns around it can be fitted to it afterwards. */
interface FloatNote {
  callout: HTMLElement;
  side: string;
  widthPct: number;
  heightPct: number;
  fill: string[];
  /** True for a pull quote placed inside the next run of body text (it floats inside the columns). */
  inColumns: boolean;
}

function placeTextBoxes(root: HTMLElement, boxes: FloatingBox[]): FloatNote[] {
  const notes: FloatNote[] = [];
  const isEarly = (b: FloatingBox) => b.geo.topPct === null || b.geo.topPct < 30;
  // Boxes that go before their paragraph are inserted top-most first (so the highest ends up first, as on the page),
  // boxes that go after it bottom-most first (each insertion lands right behind the paragraph).
  const order = boxes
    .map((box, n) => ({ box, n }))
    .sort((a, b) => {
      const ea = isEarly(a.box);
      const eb = isEarly(b.box);
      if (ea !== eb) return ea ? -1 : 1;
      const ta = a.box.geo.topPct ?? 0;
      const tb = b.box.geo.topPct ?? 0;
      return ea ? ta - tb : tb - ta;
    });

  for (const { box, n } of order) {
    const { callout, geo, banner, fill } = box;
    const marker = root.querySelector(`[data-aurebesh-anchor="${n}"]`);
    // The side a narrow box floats on follows from where its centre is on the page. The style itself is set later,
    // from this attribute: the generic style clean-up would remove it.
    const centre = geo.leftPct + geo.widthPct / 2;
    const side = centre < 40 ? 'left' : centre > 60 ? 'right' : '';
    const width = `${Math.round(geo.widthPct)}%`;
    const style = (declarations: string[]) => {
      const all = [...declarations, ...fill];
      if (all.length) callout.setAttribute('data-aurebesh-style', all.join('; '));
    };
    const floating = () => style(!banner && side ? [`float: ${side}`, `width: ${width}`] : []);

    if (!marker) {
      floating();
      root.appendChild(callout);
      continue;
    }
    const host = anchorBlock(marker, root);
    if (host === marker) {
      floating();
      marker.replaceWith(callout);
      continue;
    }
    marker.remove();

    if (isEarly(box)) {
      floating();
      if (!banner && side) notes.push({ callout, side, widthPct: geo.widthPct, heightPct: geo.heightPct, fill, inColumns: false });
      host.before(callout);
    } else if (banner) {
      style([]);
      host.after(callout);
    } else {
      const run = nextBodyRun(root, host);
      const paragraphs = run ? Array.from(run.children).filter((c) => c.tagName === 'P') : [];
      if (run && paragraphs.length) {
        // A pull quote 45% down the page goes about in the middle of the text that follows, as a box with text around
        // it. Its width depends on how wide a column ends up being, so the style is set in fitColumns().
        notes.push({ callout, side: side || 'left', widthPct: geo.widthPct, heightPct: geo.heightPct, fill, inColumns: true });
        const fraction = Math.min(0.8, Math.max(0.2, ((geo.topPct ?? 50) - 15) / 70));
        paragraphs[Math.max(1, Math.min(paragraphs.length - 1, Math.round(paragraphs.length * fraction)))].before(callout);
      } else {
        floating();
        host.after(callout);
      }
    }
  }
  return notes;
}

/**
 * Fits the columns to the boxes that float beside them, the way Word's text flows:
 * - A section's columns run over the whole width of the page, and text doesn't flow through a column that a box with
 *   wrapping text covers. A 3-column section with a 33% wide, page-high sidebar therefore shows 2 columns of text
 *   (the sidebar sits where the third would be), not 3 squeezed into the space that is left.
 * - A pull quote inside the columns is a box floating inside them, as wide as the column allows while leaving room for text beside it.
 * Runs on the column markers (`data-aurebesh-columns`) before they are turned into styles.
 */
function fitColumns(root: HTMLElement, notes: FloatNote[]): void {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('[data-aurebesh-columns]'));
  const covered = new Map<Element, number>(); // column block -> width in percent of the box beside it

  for (const n of notes.filter((x) => !x.inColumns && x.heightPct >= 50)) {
    // the first column block after the box in the document: the section the box sits beside
    const block = blocks.find((b) => !b.contains(n.callout) && n.callout.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (!block || covered.has(block)) continue;
    const [columns, space] = block.getAttribute('data-aurebesh-columns')!.split(';');
    const free = Math.floor((100 - n.widthPct) / (100 / Number(columns)) + 0.05);
    if (free >= 1 && free < Number(columns)) {
      block.setAttribute('data-aurebesh-columns', `${free};${space}`);
      covered.set(block, n.widthPct);
    }
  }

  for (const n of notes.filter((x) => x.inColumns)) {
    const run = n.callout.parentElement;
    const columns = Number(run?.getAttribute('data-aurebesh-columns')?.split(';')[0] ?? 1);
    const columnWidth = (100 - (run ? covered.get(run) ?? 0 : 0)) / Math.max(1, columns);
    // as wide as in Word, but never so wide that no text fits beside it
    const width = Math.min(60, Math.max(35, Math.round((n.widthPct / columnWidth) * 100)));
    n.callout.setAttribute('data-aurebesh-style', [`float: ${n.side}`, `width: ${width}%`, ...n.fill].join('; '));
  }
}

/** Sets the style of text boxes and the width of floating pictures, after the generic style clean-up removed styles. */
function styleAsides(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-aurebesh-style]').forEach((el) => {
    el.setAttribute('style', el.getAttribute('data-aurebesh-style')!);
    el.removeAttribute('data-aurebesh-style');
    el.removeAttribute('data-aurebesh-fill');
  });
  root.querySelectorAll<HTMLElement>('img[data-aurebesh-width]').forEach((img) => {
    img.setAttribute('style', `width: ${img.getAttribute('data-aurebesh-width')}%`);
    img.removeAttribute('data-aurebesh-width');
  });
}

function extractShapes(root: HTMLElement, page: PageSize): FloatingBox[] {
  const doc = root.ownerDocument;
  const boxes: FloatingBox[] = [];
  const bands = new Map<Element, Element>(); // anchor paragraph -> the last picture paragraph put after it
  const shapes = Array.from(root.getElementsByTagName('*')).filter((e) => /^v:(?:shape|rect|roundrect|oval)$/i.test(e.tagName));
  for (const shape of shapes.filter((s) => !shapes.some((o) => o !== s && o.contains(s)))) {
    if (!shape.isConnected) continue;
    const textbox = shape.getElementsByTagName('v:textbox')[0];
    const imagedata = shape.getElementsByTagName('v:imagedata')[0];
    if (textbox) {
      const box = takeTextBox(shape, textbox, root, page);
      if (box) {
        const marker = doc.createElement('span');
        marker.setAttribute('data-aurebesh-anchor', String(boxes.length));
        shape.replaceWith(marker);
        boxes.push(box);
      }
    } else if (imagedata?.getAttribute('src')) {
      // A picture: becomes an <img> where it is anchored, tagged with the shape number so its data can be found in the RTF.
      const img = doc.createElement('img');
      img.setAttribute('src', imagedata.getAttribute('src')!);
      img.setAttribute('alt', imagedata.getAttribute('o:title') ?? '');
      const spid = /(\d+)$/.exec(shape.getAttribute('o:spid') ?? '')?.[1];
      if (spid) img.setAttribute('data-aurebesh-shape', spid);
      // keep the size the picture has in the document, as a share of the text width
      const geo = shapeGeometry(shape, page);
      if (geo.widthPct < 100) img.setAttribute('data-aurebesh-width', String(Math.round(geo.widthPct)));

      // Word floats the picture over the text with the text wrapping tightly around it. A flowing document can't wrap
      // text around something that hangs between columns, so the picture becomes its own paragraph, aligned the way Word
      // places it, right after the paragraph it is anchored to (instead of sitting inside that paragraph's text).
      const centre = geo.leftPct + geo.widthPct / 2;
      const align = centre < 40 ? 'left' : centre > 60 ? 'right' : 'center';
      const band = doc.createElement('p');
      if (align !== 'left') band.setAttribute('style', `text-align: ${align}`);
      band.appendChild(img);
      const host = anchorBlock(shape, root);
      if (host === shape) {
        shape.replaceWith(band);
      } else {
        shape.remove();
        (bands.get(host) ?? host).after(band); // several pictures on one paragraph keep their order
        bands.set(host, band);
      }
    } else {
      shape.remove(); // lines, frames and other decoration
    }
  }
  return boxes;
}

// ---- columns --------------------------------------------------------------------------------------------

interface Columns {
  count: number;
  gap?: string;
}

/** A CSS length the sanitizer accepts (px, pt, em), converted from cm/mm/in where needed. */
function toGap(value: string | undefined): string | undefined {
  const m = /^([\d.]+)\s*(pt|px|em|rem|cm|mm|in)$/i.exec((value ?? '').trim());
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const px = unit === 'cm' ? n * 37.8 : unit === 'mm' ? n * 3.78 : unit === 'in' ? n * 96 : null;
  return px === null ? `${n}${unit}` : `${Math.round(px * 10) / 10}px`;
}

/**
 * Word does not put column settings on the paragraphs: a section is a `<div class=WordSection1>`, and its columns are in
 * the style sheet, as `@page WordSection1 { mso-columns: 2 even 35.4pt }` plus `div.WordSection1 { page: WordSection1 }`.
 * Plain CSS (`.cols { column-count: 2 }`) is read as well. Returns the column settings per class name.
 */
function readColumnRules(doc: Document): Map<string, Columns> {
  const css = styleText(doc);

  const pages = new Map<string, Columns>();
  for (const m of css.matchAll(/@page\s+([\w-]+)\s*\{([^}]*)\}/gi)) {
    const cols = /mso-columns\s*:\s*(\d+)(?:\s+\w+)?(?:\s+([\d.]+\s*[a-z]+))?/i.exec(m[2]);
    if (cols && +cols[1] >= 2) pages.set(m[1], { count: +cols[1], gap: toGap(cols[2]) });
  }

  const byClass = new Map<string, Columns>();
  const classPage = new Map<string, string>();
  for (const m of css.matchAll(/([^{}@]+)\{([^}]*)\}/g)) {
    const page = /\bpage\s*:\s*([\w-]+)/i.exec(m[2])?.[1];
    const count = /(?:^|[;\s])column-count\s*:\s*(\d+)/i.exec(m[2])?.[1];
    const gap = toGap(/column-gap\s*:\s*([^;]+)/i.exec(m[2])?.[1]);
    for (const cls of m[1].matchAll(/\.([\w-]+)/g)) {
      if (page) classPage.set(cls[1], page);
      if (count && +count >= 2) byClass.set(cls[1], { count: +count, gap });
    }
  }
  const result = new Map<string, Columns>();
  const names = new Set([...byClass.keys(), ...classPage.keys(), ...pages.keys()]);
  names.forEach((name) => {
    const cols = byClass.get(name) ?? pages.get(classPage.get(name) ?? name);
    if (cols) result.set(name, cols);
  });
  return result;
}

const COLUMN_HOSTS = new Set(['DIV', 'SECTION', 'ARTICLE', 'MAIN']);

/** Marks the elements that hold columns, from the style sheet (Word sections) or their own style attribute. Runs before styles are stripped. */
function markColumns(root: HTMLElement, rules: Map<string, Columns>): void {
  root.querySelectorAll<HTMLElement>('div,section,article,main').forEach((el) => {
    let cols: Columns | undefined;
    for (const cls of el.className.split(/\s+/)) cols = cols ?? rules.get(cls);
    const s = parseStyle(el.getAttribute('style'));
    const count = s['column-count'] ?? s['-webkit-column-count'] ?? s['-moz-column-count'] ?? /^\s*(\d+)(?:\s|$)/.exec(s['columns'] ?? '')?.[1];
    if (count && +count >= 2) cols = { count: +count, gap: toGap(s['column-gap']) };
    if (cols && COLUMN_HOSTS.has(el.tagName)) el.setAttribute('data-aurebesh-columns', `${Math.min(4, cols.count)};${cols.gap ?? ''}`);
  });
}

/** Turns the marked elements into the editor's column block: a div with `column-count` (2-4) and optionally `column-gap`. */
function convertColumns(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-aurebesh-columns]').forEach((el) => {
    const [count, gap] = el.getAttribute('data-aurebesh-columns')!.split(';');
    el.removeAttribute('data-aurebesh-columns');
    // Word keeps empty sections (a column setting with nothing in it): a column block around nothing is just noise.
    if (!el.textContent!.trim() && !el.querySelector('img,table,hr,video,iframe')) {
      el.remove();
      return;
    }
    let block: HTMLElement = el;
    if (el.tagName !== 'DIV') {
      block = root.ownerDocument.createElement('div');
      while (el.firstChild) block.appendChild(el.firstChild);
      el.replaceWith(block);
    }
    block.setAttribute('style', `column-count: ${count}${gap ? `; column-gap: ${gap}` : ''}`);
  });
}

// ---- images ---------------------------------------------------------------------------------------------

function collectImages(root: HTMLElement, rtf: string, policy: PasteImagePolicy, canUpload: boolean): { images: PendingImage[]; dropped: number } {
  const doc = root.ownerDocument;
  const rtfPictures = rtf ? extractRtfImages(rtf) : [];
  const shapePictures = rtf ? extractRtfShapePictures(rtf) : new Map<number, Blob>();
  let rtfIndex = 0;
  const images: PendingImage[] = [];
  let dropped = 0;

  const replaceWithMarker = (img: Element, item: Omit<PendingImage, 'marker'>) => {
    const marker = `${MARK_OPEN}aurebesh-img-${images.length}${MARK_CLOSE}`;
    images.push({ ...item, marker });
    img.replaceWith(doc.createTextNode(marker));
  };

  root.querySelectorAll('img').forEach((img) => {
    const src = (img.getAttribute('src') ?? '').trim();
    const alt = img.getAttribute('alt') ?? '';
    const widthPct = /^(\d{1,3})%$/.exec(img.style.width)?.[1]; // set from the shape's size by styleAsides()
    if (/^data:image\//i.test(src)) return; // already inline, the sanitizer checks it
    if (/^https?:\/\//i.test(src)) {
      if (policy === 'remove') {
        img.remove();
        dropped++;
      } else if (policy === 'upload' && canUpload) {
        replaceWithMarker(img, { kind: 'remote', src, alt });
      } // 'link', or nowhere to upload to: keep the link as it is
      return;
    }
    if (/^(?:file|webkit-fake-url|cid|blob):/i.test(src) || /^[a-z]:[\\/]/i.test(src)) {
      // A picture on the author's computer. A drawing shape is matched by its number; an inline picture by order
      // (Word's RTF lists them in the same order as the HTML).
      const shape = img.getAttribute('data-aurebesh-shape');
      const blob = shape ? shapePictures.get(Number(shape)) : rtfPictures[rtfIndex++];
      if (blob && policy !== 'remove' && canUpload) replaceWithMarker(img, { kind: 'local', src, alt, blob, width: widthPct ? Number(widthPct) : undefined });
      else {
        img.remove();
        dropped++;
      }
    }
  });
  return { images, dropped };
}

/** The group `{...}` that starts at `start` (a `{`), up to and including its closing brace; -1 if unbalanced. */
function groupEnd(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') i++; // an escaped character, including \{ and \}
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i;
  }
  return -1;
}

function removeGroups(text: string, opener: string): string {
  let out = text;
  for (let i = out.indexOf(opener); i >= 0; i = out.indexOf(opener, i)) {
    const end = groupEnd(out, i);
    if (end < 0) break;
    out = out.slice(0, i) + out.slice(end + 1);
  }
  return out;
}

/**
 * The pictures in Word's RTF clipboard data, in document order. PNG and JPEG are used; other kinds (metafiles) give
 * `undefined` so the order still matches the images in the HTML. Word also adds a fallback copy of each picture in a
 * `\nonshppict` group, which is skipped.
 */
export function extractRtfImages(rtf: string): Array<Blob | undefined> {
  // \nonshppict and \shprslt hold fallback copies (often metafiles) of pictures that are already there.
  const text = removeGroups(removeGroups(rtf, '{\\nonshppict'), '{\\shprslt');
  const pictures: Array<Blob | undefined> = [];
  for (let i = text.indexOf('{\\pict'); i >= 0; i = text.indexOf('{\\pict', i)) {
    const end = groupEnd(text, i);
    if (end < 0) break;
    // A picture that is only the fill of a shape (shape property fillBlip) is not a picture in the document.
    const usedAsFill = /\{\\sn\s+fillBlip\}\s*\{\\sv\s*$/.test(text.slice(Math.max(0, i - 120), i));
    const picture = pictureFromGroup(text.slice(i, end + 1));
    i = end + 1;
    if (!usedAsFill) pictures.push(picture);
  }
  return pictures;
}

/** The PNG/JPEG data of one `{\pict ...}` group, or undefined for other formats. */
function pictureFromGroup(group: string): Blob | undefined {
  const type = /\\pngblip/.test(group) ? 'image/png' : /\\jpegblip/.test(group) ? 'image/jpeg' : null;
  if (!type) return undefined;
  // Strip nested groups (picture properties) and control words; what is left is the picture as hexadecimal.
  let inner = group.slice(1, -1);
  for (let g = inner.indexOf('{'); g >= 0; g = inner.indexOf('{')) {
    const e = groupEnd(inner, g);
    // Replace the group by a space: it ended the control word before it (\bliptag123{...}), and without
    // that the first digits of the picture data would read as part of that control word's number.
    inner = e < 0 ? inner.slice(0, g) : `${inner.slice(0, g)} ${inner.slice(e + 1)}`;
  }
  const hex = inner.replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[^0-9a-f]/gi, '');
  const bytes = new Uint8Array(Math.floor(hex.length / 2));
  for (let b = 0; b < bytes.length; b++) bytes[b] = parseInt(hex.substr(b * 2, 2), 16);
  return bytes.length ? new Blob([bytes], { type }) : undefined;
}

/**
 * Pictures of drawing shapes, by shape number. Word's HTML names a shape `o:spid="_x0000_s2052"` and its RTF says
 * `\shplid2052 ... {\sp{\sn pib}{\sv {\pict ...}}}`, so the two can be matched exactly instead of by order.
 */
export function extractRtfShapePictures(rtf: string): Map<number, Blob> {
  const found = new Map<number, Blob>();
  const ids = [...rtf.matchAll(/\\shplid(\d+)/g)];
  ids.forEach((m, k) => {
    const from = m.index!;
    const to = ids[k + 1]?.index ?? rtf.length;
    const pib = rtf.slice(from, to).search(/\{\\sn\s+pib\}\s*\{\\sv\s*\{\\pict/);
    if (pib < 0) return;
    const start = rtf.indexOf('{\\pict', from + pib);
    const end = groupEnd(rtf, start);
    const blob = end > 0 ? pictureFromGroup(rtf.slice(start, end + 1)) : undefined;
    if (blob) found.set(Number(m[1]), blob);
  });
  return found;
}

// ---- entry point ----------------------------------------------------------------------------------------

/**
 * Cleans pasted HTML. `rtf` is the clipboard's `text/rtf` (Word); `canUpload` says whether an upload adapter exists.
 * The returned HTML still has to go through `sanitize()`.
 */
export function preparePaste(html: string, rtf: string, policy: PasteImagePolicy, canUpload: boolean): PreparedPaste {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.body;
  const columns = readColumnRules(doc); // from the style sheet, which removeJunk() is about to drop
  const sheet = readStyleSheet(doc);
  const page = pageTextSize(doc);
  removeComments(root);
  const floating = extractShapes(root, page); // before the junk removal flattens the VML elements
  removeJunk(root);
  const notes = placeTextBoxes(root, floating); // after it: the paragraphs around the anchors are plain again
  markColumns(root, columns);
  fitColumns(root, notes); // columns that a floating box covers, and the width of a pull quote inside them
  convertWordLists(root);
  // Colours and capitals that Word keeps in its styles (p.MsoTitle, h1...) come first, while elements still have their
  // original class: a Title paragraph that is renamed to <h1> would otherwise get the style of every <h1>.
  applyStyleSheet(root, sheet);
  normalizeHeadings(root);
  convertStyles(root);
  styleAsides(root);
  convertColumns(root);
  normalizeLinks(root);
  tidy(root);
  const { images, dropped } = collectImages(root, rtf, policy, canUpload);
  return { html: root.innerHTML, images, dropped };
}
