/**
 * Reading a Word document (.docx) into HTML, without a library: a .docx is a ZIP of XML, which `unzipAll` opens and the browser's own
 * XML parser reads. What comes over: headings, paragraphs (alignment, indent, direction), the formatting of the text (bold, italic,
 * underline, strikethrough, super- and subscript, colour, highlight, size, font), lists (nested, bulleted and numbered), links, tables
 * (merged cells, header rows, column widths, shading), pictures, the size of the page, and optionally the comments and the tracked
 * changes. What does not: styles as such (what they look like comes over, their names do not), headers and footers, footnotes, fields
 * other than links, charts, drawings, and the exact layout. The result is HTML for the sanitizer of the editor, which has the last word.
 */
import { unzipAll } from './zip';
import type { UnzipLimits } from './zip';
import type { CommentThread } from './comments';

export interface DocxImportOptions {
  /** Take over the comments of the document (as threads of comments, with their replies). Default: true. */
  comments?: boolean;
  /** Tracked changes: `'accept'` gives the text as it reads when they are all accepted (default); `'mark'` keeps them as suggestions. */
  changes?: 'accept' | 'mark';
  /** Take over the pictures. Default: true. */
  images?: boolean;
  /** The most bytes of a picture that is taken over. Default: 8 MB. */
  maxImageSize?: number;
  /** What a file may unpack to (see `unzipAll`). */
  limits?: UnzipLimits;
}

export interface DocxImport {
  html: string;
  /** The title in the properties of the document, if there is one. */
  title?: string;
  /** The page of the document, in millimetres. */
  page?: { width: string; height: string; margin: string };
  /** The threads of comments, when the options ask for them. They are for the ids in `data-comment` in the HTML. */
  comments: CommentThread[];
  /** What was left out, in words for a person. */
  warnings: string[];
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const W15 = 'http://schemas.microsoft.com/office/word/2012/wordml';
const V = 'urn:schemas-microsoft-com:vml';

const decoder = new TextDecoder('utf-8');

// ---- XML ------------------------------------------------------------------------------------------------

function parseXml(bytes: Uint8Array | undefined): Element | null {
  if (!bytes) return null;
  const text = decoder.decode(bytes).replace(/^﻿/, '');
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('This document has a definition of its own in it, which is not read');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return null;
  return doc.documentElement;
}

const isEl = (n: Node | null | undefined, ns: string, name?: string): boolean => !!n && n.nodeType === 1 && (n as Element).namespaceURI === ns && (name === undefined || (n as Element).localName === name);

const kids = (el: Element): Element[] => Array.from(el.children);
const child = (el: Element | null | undefined, name: string, ns = W): Element | null => (el ? kids(el).find((c) => isEl(c, ns, name)) ?? null : null);
const childrenOf = (el: Element | null | undefined, name: string, ns = W): Element[] => (el ? kids(el).filter((c) => isEl(c, ns, name)) : []);

/** An attribute, with or without its prefix (`w:val`). */
function attr(el: Element | null | undefined, name: string, ns = W): string | null {
  if (!el) return null;
  return el.getAttributeNS(ns, name) ?? el.getAttribute(`w:${name}`) ?? el.getAttribute(name);
}

/** A switch of the formatting: there, and not turned off. */
function on(el: Element | null | undefined): boolean {
  if (!el) return false;
  const v = attr(el, 'val');
  return v === null || !/^(?:0|false|off|none)$/i.test(v);
}

// ---- escaping -------------------------------------------------------------------------------------------

const escapeText = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string): string => escapeText(s).replace(/"/g, '&quot;');

/** Text for HTML: spaces that would be left out stay (a no-break space after the first). */
const spaced = (s: string): string => escapeText(s).replace(/ {2,}/g, (m) => ' ' + ' '.repeat(m.length - 1));

// ---- the styles -----------------------------------------------------------------------------------------

interface Style {
  id: string;
  name: string;
  basedOn: string | null;
  pPr: Element | null;
  rPr: Element | null;
}

interface Context {
  styles: Map<string, Style>;
  numbering: Numbering;
  rels: Map<string, { target: string; external: boolean }>;
  files: Map<string, Uint8Array>;
  options: Required<Pick<DocxImportOptions, 'comments' | 'changes' | 'images' | 'maxImageSize'>>;
  baseSize: number | null;
  baseFont: string | null;
  warnings: Set<string>;
  /** Comments that are in the text, the replies not counted: the id of the thread, by the id in the document. */
  threadOf: Map<string, string>;
  usedThreads: Set<string>;
  active: string[];
  fields: { instr: string; phase: 'instr' | 'result'; href: string | null }[];
  changeCount: number;
  imageBytes: number;
  skippedImages: number;
  boxes: string[];
}

function readStyles(root: Element | null): { styles: Map<string, Style>; baseSize: number | null; baseFont: string | null } {
  const styles = new Map<string, Style>();
  if (!root) return { styles, baseSize: null, baseFont: null };
  for (const s of childrenOf(root, 'style')) {
    const id = attr(s, 'styleId');
    if (!id) continue;
    styles.set(id, { id, name: (attr(child(s, 'name'), 'val') ?? id).toLowerCase(), basedOn: attr(child(s, 'basedOn'), 'val'), pPr: child(s, 'pPr'), rPr: child(s, 'rPr') });
  }
  // what text is when nothing says otherwise: the size and the font of the document, which is not worth writing on every piece of text
  const defaults = child(child(root, 'docDefaults'), 'rPrDefault');
  const normal = Array.from(styles.values()).find((s) => s.name === 'normal');
  const size = (rPr: Element | null) => {
    const v = attr(child(rPr, 'sz'), 'val');
    return v && /^\d+$/.test(v) ? Number(v) : null;
  };
  const font = (rPr: Element | null) => {
    const f = child(rPr, 'rFonts');
    return attr(f, 'ascii') ?? attr(f, 'hAnsi');
  };
  const dr = child(defaults, 'rPr');
  return { styles, baseSize: size(normal?.rPr ?? null) ?? size(dr), baseFont: font(normal?.rPr ?? null) ?? font(dr) };
}

/** A style and the ones it is based on, the style itself first. */
function chain(ctx: Context, id: string | null): Style[] {
  const out: Style[] = [];
  for (let s = id ? ctx.styles.get(id) : undefined; s && out.length < 20 && !out.includes(s); s = s.basedOn ? ctx.styles.get(s.basedOn) : undefined) out.push(s);
  return out;
}

// ---- the numbering --------------------------------------------------------------------------------------

interface Numbering {
  /** `ordered` or `bullet`, per number and level. */
  kind(numId: string, level: number): 'ol' | 'ul';
}

function readNumbering(root: Element | null): Numbering {
  const abstracts = new Map<string, Map<number, string>>();
  const nums = new Map<string, { abstract: string; levels: Map<number, string> }>();
  if (root) {
    for (const a of childrenOf(root, 'abstractNum')) {
      const levels = new Map<number, string>();
      for (const l of childrenOf(a, 'lvl')) levels.set(Number(attr(l, 'ilvl') ?? 0), attr(child(l, 'numFmt'), 'val') ?? 'decimal');
      abstracts.set(attr(a, 'abstractNumId') ?? '', levels);
    }
    for (const n of childrenOf(root, 'num')) {
      const levels = new Map<number, string>();
      for (const o of childrenOf(n, 'lvlOverride')) {
        const fmt = attr(child(child(o, 'lvl'), 'numFmt'), 'val');
        if (fmt) levels.set(Number(attr(o, 'ilvl') ?? 0), fmt);
      }
      nums.set(attr(n, 'numId') ?? '', { abstract: attr(child(n, 'abstractNumId'), 'val') ?? '', levels });
    }
  }
  return {
    kind(numId, level) {
      const n = nums.get(numId);
      const fmt = n?.levels.get(level) ?? abstracts.get(n?.abstract ?? '')?.get(level) ?? 'bullet';
      return fmt === 'bullet' || fmt === 'none' ? 'ul' : 'ol';
    },
  };
}

// ---- the text -------------------------------------------------------------------------------------------

/** A tag around a piece of the text. The key says which pieces are in the same one. */
interface Wrapper {
  key: string;
  open: string;
  close: string;
}

interface Format {
  key: string;
  open: string;
  close: string;
}

const HIGHLIGHT: Record<string, string> = {
  yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000', darkBlue: '#000080', darkCyan: '#008080',
  darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000', darkYellow: '#808000', darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000', white: '#ffffff',
};

const HEX = /^[0-9a-f]{6}$/i;

/** The formatting of a piece of text: what the run says, then its character style, then the style of the paragraph. */
function formatOf(ctx: Context, rPr: Element | null, paragraph: Style[], heading: boolean): Format {
  // the look of a link (blue and underlined) is the link itself: the editor has its own
  const rStyle = chain(ctx, attr(child(rPr, 'rStyle'), 'val')).filter((s) => !/^(?:hyperlink|followed ?hyperlink)$/.test(s.name));
  const sources: { rPr: Element | null; direct: boolean }[] = [{ rPr, direct: true }, ...rStyle.map((s) => ({ rPr: s.rPr, direct: false })), ...paragraph.map((s) => ({ rPr: s.rPr, direct: false }))];
  const find = (name: string, directOnly = false): Element | null => {
    for (const s of sources) {
      if (directOnly && !s.direct) continue;
      const e = child(s.rPr, name);
      if (e) return e;
    }
    return null;
  };
  const styleOnly = (name: string): Element | null => (heading ? find(name, true) : find(name));
  const bold = find('b');
  const italic = find('i');
  const strike = find('strike') ?? find('dstrike');
  const underline = find('u');
  const vertical = attr(find('vertAlign'), 'val');
  const css: string[] = [];

  const size = attr(styleOnly('sz'), 'val');
  if (size && /^\d+$/.test(size) && Number(size) !== ctx.baseSize && Number(size) >= 12 && Number(size) <= 400) css.push(`font-size: ${Number(size) / 2}pt`);
  const color = attr(styleOnly('color'), 'val');
  // the colour of the text itself is not written: black, and the near-black that a heading style has, are what the editor has already
  const dark = color && HEX.test(color) ? [0, 2, 4].every((i) => parseInt(color.slice(i, i + 2), 16) <= 0x33) : false;
  if (color && HEX.test(color) && !dark) css.push(`color: #${color.toLowerCase()}`);
  const highlight = attr(find('highlight'), 'val');
  const shade = attr(find('shd'), 'fill');
  if (highlight && HIGHLIGHT[highlight]) css.push(`background-color: ${HIGHLIGHT[highlight]}`);
  else if (shade && HEX.test(shade)) css.push(`background-color: #${shade.toLowerCase()}`);
  const fonts = styleOnly('rFonts');
  const family = attr(fonts, 'ascii') ?? attr(fonts, 'hAnsi');
  if (family && family.toLowerCase() !== (ctx.baseFont ?? '').toLowerCase() && /^[\w\s\-.]+$/.test(family)) css.push(`font-family: '${family}'`);
  if (on(find('caps'))) css.push('text-transform: uppercase');

  let open = '';
  let close = '';
  const wrap = (tag: string) => {
    open += `<${tag}>`;
    close = `</${tag}>` + close;
  };
  if (bold && on(bold) && !heading) wrap('strong');
  if (italic && on(italic)) wrap('em');
  if (underline && on(underline)) wrap('u');
  if (strike && on(strike)) wrap('s');
  if (vertical === 'superscript') wrap('sup');
  else if (vertical === 'subscript') wrap('sub');
  if (css.length) {
    open += `<span style="${escapeAttr(css.join('; '))}">`;
    close = '</span>' + close;
  }
  return { key: open, open, close };
}

/** Writes the pieces of the text of a paragraph: pieces of the same formatting are one, and the tags around groups of pieces open and close as needed. */
class Writer {
  private out = '';
  private stack: Wrapper[] = [];
  private pending: { ctx: Wrapper[]; format: Format; text: string } | null = null;
  empty = true;

  private flush(): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    this.enter(p.ctx);
    this.out += p.format.open + p.text + p.format.close;
  }

  private enter(ctx: Wrapper[]): void {
    let common = 0;
    while (common < this.stack.length && common < ctx.length && this.stack[common].key === ctx[common].key) common++;
    while (this.stack.length > common) this.out += this.stack.pop()!.close;
    for (let i = common; i < ctx.length; i++) {
      this.out += ctx[i].open;
      this.stack.push(ctx[i]);
    }
  }

  text(ctx: Wrapper[], format: Format, text: string): void {
    if (!text) return;
    this.empty = false;
    const key = ctx.map((w) => w.key).join('|');
    if (this.pending && this.pending.format.key === format.key && this.pending.ctx.map((w) => w.key).join('|') === key) {
      this.pending.text += text;
      return;
    }
    this.flush();
    this.pending = { ctx, format, text };
  }

  raw(ctx: Wrapper[], html: string): void {
    this.flush();
    this.enter(ctx);
    this.out += html;
    this.empty = false;
  }

  finish(): string {
    this.flush();
    this.enter([]);
    return this.out;
  }
}

const slug = (s: string): string => 'a-' + (s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'unknown');

function isoDate(v: string | null): string {
  const t = v ? Date.parse(v) : NaN;
  return new Date(Number.isNaN(t) ? Date.now() : t).toISOString();
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };

function resolveTarget(target: string): string {
  const t = target.replace(/^\/+/, '');
  return target.startsWith('/') ? t : 'word/' + t.replace(/^\.\//, '');
}

/** The picture that a relationship points to, as an `<img>`; '' when it cannot be one. */
function picture(ctx: Context, id: string | null, width: number | null, alt: string): string {
  if (!ctx.options.images || !id) return '';
  const rel = ctx.rels.get(id);
  if (!rel) {
    ctx.skippedImages++;
    return '';
  }
  if (rel.external) return '';
  const path = resolveTarget(rel.target);
  const bytes = ctx.files.get(path);
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const mime = MIME[ext];
  if (!bytes || !mime || mime === 'image/bmp') {
    ctx.skippedImages++;
    return '';
  }
  if (bytes.length > ctx.options.maxImageSize) {
    ctx.skippedImages++;
    return '';
  }
  ctx.imageBytes += bytes.length;
  const size = width && width > 0 ? ` width="${Math.min(2000, Math.round(width))}"` : '';
  return `<img src="data:${mime};base64,${bytesToBase64(bytes)}"${alt ? ` alt="${escapeAttr(alt.slice(0, 300))}"` : ''}${size}>`;
}

/** A picture in a run: a drawing (`w:drawing`) or the older kind (`w:pict`). */
function imageIn(ctx: Context, run: Element): string {
  let html = '';
  const walk = (el: Element) => {
    for (const c of kids(el)) {
      if (isEl(c, A, 'blip')) {
        const holder = c.closest ? (c.closest('inline,anchor') as Element | null) : null;
        const extent = holder ? child(holder, 'extent', WP) : null;
        const cx = Number(extent?.getAttribute('cx') ?? 0);
        const docPr = holder ? child(holder, 'docPr', WP) : null;
        html += picture(ctx, c.getAttributeNS(R, 'embed') ?? c.getAttribute('r:embed'), cx ? cx / 9525 : null, docPr?.getAttribute('descr') ?? '');
      } else if (isEl(c, V, 'imagedata')) {
        html += picture(ctx, c.getAttributeNS(R, 'id') ?? c.getAttribute('r:id'), null, c.getAttribute('o:title') ?? '');
      } else if (isEl(c, W, 'txbxContent')) {
        // a text box: its text goes after the paragraph, in a box
        const body = renderBlocks(ctx, c);
        if (body) ctx.boxes.push(`<aside>${body}</aside>`);
      } else if (isEl(c, MC, 'AlternateContent')) {
        const choice = kids(c).find((k) => isEl(k, MC, 'Choice')) ?? kids(c).find((k) => isEl(k, MC, 'Fallback'));
        if (choice) walk(choice);
      } else if (isEl(c, W, 'pict') || isEl(c, W, 'drawing') || el.localName === 'drawing' || el.localName === 'pict' || c.children.length) {
        walk(c);
      }
    }
  };
  walk(run);
  return html;
}

/** The pieces of the text in one element: runs, links, changes, comments. */
function inline(ctx: Context, el: Element, wrappers: Wrapper[], writer: Writer, paragraph: Style[], heading: boolean): void {
  for (const c of kids(el)) {
    if (c.namespaceURI === W) {
      switch (c.localName) {
        case 'r':
          run(ctx, c, wrappers, writer, paragraph, heading);
          break;
        case 'hyperlink': {
          const id = c.getAttributeNS(R, 'id') ?? c.getAttribute('r:id');
          const rel = id ? ctx.rels.get(id) : undefined;
          const anchor = attr(c, 'anchor');
          const href = rel?.external ? rel.target : null;
          // a link inside the document goes nowhere in the editor: it is only text
          inline(ctx, c, href && !anchor ? [...wrappers, { key: `a:${href}`, open: `<a href="${escapeAttr(href)}">`, close: '</a>' }] : wrappers, writer, paragraph, heading);
          break;
        }
        case 'ins':
        case 'moveTo':
          inline(ctx, c, ctx.options.changes === 'mark' ? [...wrappers, change(ctx, c, 'insert')] : wrappers, writer, paragraph, heading);
          break;
        case 'del':
        case 'moveFrom':
          if (ctx.options.changes === 'mark') inline(ctx, c, [...wrappers, change(ctx, c, 'delete')], writer, paragraph, heading);
          break;
        case 'commentRangeStart': {
          const id = attr(c, 'id');
          if (id !== null) ctx.active.push(id);
          break;
        }
        case 'commentRangeEnd': {
          const at = ctx.active.lastIndexOf(attr(c, 'id') ?? '');
          if (at >= 0) ctx.active.splice(at, 1);
          break;
        }
        case 'fldSimple': {
          const instr = attr(c, 'instr') ?? '';
          const href = /^\s*HYPERLINK\s+"([^"]+)"/i.exec(instr)?.[1];
          inline(ctx, c, href ? [...wrappers, { key: `a:${href}`, open: `<a href="${escapeAttr(href)}">`, close: '</a>' }] : wrappers, writer, paragraph, heading);
          break;
        }
        case 'sdt':
          inline(ctx, child(c, 'sdtContent') ?? c, wrappers, writer, paragraph, heading);
          break;
        case 'smartTag':
        case 'customXml':
          inline(ctx, c, wrappers, writer, paragraph, heading);
          break;
        default:
          break;
      }
    } else if (isEl(c, MC, 'AlternateContent')) {
      const choice = kids(c).find((k) => isEl(k, MC, 'Choice')) ?? kids(c).find((k) => isEl(k, MC, 'Fallback'));
      if (choice) inline(ctx, choice, wrappers, writer, paragraph, heading);
    }
  }
}

/** A tracked change as a mark of the suggestions (see suggestions.ts). */
function change(ctx: Context, el: Element, kind: 'insert' | 'delete'): Wrapper {
  const author = attr(el, 'author') ?? 'Unknown';
  const id = `w-s${++ctx.changeCount}`;
  const open = `<span data-suggestion="${id}" data-kind="${kind}" data-author="${escapeAttr(slug(author))}" data-name="${escapeAttr(author.slice(0, 128))}" data-date="${isoDate(attr(el, 'date'))}">`;
  return { key: `s:${id}`, open, close: '</span>' };
}

/** The tags of the comments that are open, outermost first. */
function commentWrappers(ctx: Context): Wrapper[] {
  if (!ctx.options.comments) return [];
  const out: Wrapper[] = [];
  for (const id of ctx.active) {
    const thread = ctx.threadOf.get(id);
    if (!thread) continue;
    ctx.usedThreads.add(thread);
    out.push({ key: `c:${thread}`, open: `<span data-comment="${thread}">`, close: '</span>' });
  }
  return out;
}

function run(ctx: Context, r: Element, wrappers: Wrapper[], writer: Writer, paragraph: Style[], heading: boolean): void {
  const format = formatOf(ctx, child(r, 'rPr'), paragraph, heading);
  let buffer = '';
  const links = () => ctx.fields.filter((f) => f.phase === 'result' && f.href).map((f) => ({ key: `a:${f.href}`, open: `<a href="${escapeAttr(f.href!)}">`, close: '</a>' }));
  const where = (): Wrapper[] => [...wrappers, ...links(), ...commentWrappers(ctx)];
  const flush = () => {
    if (buffer) writer.text(where(), format, spaced(buffer));
    buffer = '';
  };
  const hidden = () => ctx.fields.some((f) => f.phase === 'instr');
  const visit = (c: Element) => {
    if (c.namespaceURI === W) {
      switch (c.localName) {
        case 't':
        case 'delText':
          if (!hidden()) buffer += c.textContent ?? '';
          break;
        case 'tab':
        case 'ptab':
          if (!hidden()) buffer += '    ';
          break;
        case 'noBreakHyphen':
          if (!hidden()) buffer += '-';
          break;
        case 'br':
          if (!hidden() && attr(c, 'type') !== 'page' && attr(c, 'type') !== 'column') {
            flush();
            writer.raw(where(), '<br>');
          }
          break;
        case 'cr':
          if (!hidden()) {
            flush();
            writer.raw(where(), '<br>');
          }
          break;
        case 'instrText': {
          const top = ctx.fields[ctx.fields.length - 1];
          if (top) top.instr += c.textContent ?? '';
          break;
        }
        case 'fldChar': {
          const type = attr(c, 'fldCharType');
          flush();
          if (type === 'begin') ctx.fields.push({ instr: '', phase: 'instr', href: null });
          else if (type === 'separate') {
            const top = ctx.fields[ctx.fields.length - 1];
            if (top) {
              top.phase = 'result';
              top.href = /^\s*HYPERLINK\s+"([^"]+)"/i.exec(top.instr)?.[1] ?? null;
            }
          } else if (type === 'end') ctx.fields.pop();
          break;
        }
        case 'drawing':
        case 'pict': {
          if (hidden()) break;
          flush();
          const html = imageIn(ctx, c);
          if (html) writer.raw(where(), html);
          break;
        }
        case 'footnoteReference':
        case 'endnoteReference':
          ctx.warnings.add('The footnotes and endnotes are not imported.');
          break;
        case 'object':
          ctx.warnings.add('Embedded objects are not imported.');
          break;
        default:
          break;
      }
    } else if (isEl(c, MC, 'AlternateContent')) {
      const choice = kids(c).find((k) => isEl(k, MC, 'Choice')) ?? kids(c).find((k) => isEl(k, MC, 'Fallback'));
      if (choice) for (const k of kids(choice)) visit(k);
    }
  };
  for (const c of kids(r)) visit(c);
  flush();
}

// ---- the blocks -----------------------------------------------------------------------------------------

interface Para {
  html: string;
  /** What is in it, for a table cell that has only that. */
  inner: string;
  tag: string;
  attrs: string;
  align: string | null;
  list: { numId: string; level: number; kind: 'ol' | 'ul' } | null;
}

function paragraph(ctx: Context, p: Element): Para {
  const pPr = child(p, 'pPr');
  const styleId = attr(child(pPr, 'pStyle'), 'val');
  const styles = chain(ctx, styleId);
  const names = styles.map((s) => s.name);

  let level = 0;
  let tag = 'p';
  const named = names.find((n) => /^heading\s*\d$/.test(n) || n === 'title');
  if (named) {
    level = named === 'title' ? 1 : Number(named.replace(/\D/g, ''));
    tag = `h${Math.min(3, Math.max(1, level))}`;
  } else {
    const outline = attr(child(pPr, 'outlineLvl'), 'val') ?? attr(child(styles.map((s) => s.pPr).find((x) => child(x, 'outlineLvl')) ?? null, 'outlineLvl'), 'val');
    if (outline !== null && /^[0-8]$/.test(outline)) tag = `h${Math.min(3, Number(outline) + 1)}`;
  }
  if (tag === 'p' && names.some((n) => /^(?:quote|intense quote|block text)$/.test(n))) tag = 'blockquote';
  const heading = tag.startsWith('h');

  // the list this paragraph is in: its own numbering, or that of its style
  const numPr = child(pPr, 'numPr') ?? styles.map((s) => child(s.pPr, 'numPr')).find(Boolean) ?? null;
  const numId = attr(child(numPr, 'numId'), 'val');
  let list: Para['list'] = null;
  if (numPr && numId && numId !== '0' && !heading) {
    const ilvl = Number(attr(child(numPr, 'ilvl'), 'val') ?? styles.map((s) => attr(child(child(s.pPr, 'numPr'), 'ilvl'), 'val')).find((v) => v !== null) ?? 0);
    list = { numId, level: ilvl, kind: ctx.numbering.kind(numId, ilvl) };
  }

  const writer = new Writer();
  inline(ctx, p, [], writer, styles, heading);
  let inner = writer.finish();
  if (inner.startsWith(' ')) inner = ' ' + inner.slice(1);

  const style: string[] = [];
  const jc = attr(child(pPr, 'jc'), 'val') ?? attr(child(styles.map((s) => s.pPr).find((x) => child(x, 'jc')) ?? null, 'jc'), 'val');
  const align = jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : jc === 'both' || jc === 'distribute' ? 'justify' : null;
  if (align) style.push(`text-align: ${align}`);
  const ind = child(pPr, 'ind');
  const left = Number(attr(ind, 'left') ?? attr(ind, 'start') ?? 0);
  if (!list && left > 0 && tag !== 'blockquote') {
    const steps = Math.min(8, Math.max(0, Math.round(left / 15 / 24)));
    if (steps) style.push(`margin-inline-start: ${steps * 24}px`);
  }
  const rtl = on(child(pPr, 'bidi')) && child(pPr, 'bidi') !== null;
  const attrs = (style.length ? ` style="${style.join('; ')}"` : '') + (rtl ? ' dir="rtl"' : '');
  const content = inner || '<br>';
  const html = tag === 'blockquote' ? `<blockquote><p${attrs}>${content}</p></blockquote>` : `<${tag}${attrs}>${content}</${tag}>`;
  return { html, inner: content, tag, attrs, align, list };
}

/** The paragraphs and tables in an element, as HTML: lists are made of the paragraphs that are in one. */
function renderBlocks(ctx: Context, parent: Element): string {
  let html = '';
  const stack: { tag: 'ol' | 'ul'; level: number; numId: string }[] = [];
  let liOpen = false;
  const closeTo = (depth: number) => {
    while (stack.length > depth) {
      if (liOpen) html += '</li>';
      html += `</${stack.pop()!.tag}>`;
      liOpen = stack.length > 0;
    }
  };
  const block = (c: Element) => {
    if (c.namespaceURI !== W) return;
    switch (c.localName) {
      case 'p': {
        const para = paragraph(ctx, c);
        if (para.list) {
          const { numId, level, kind } = para.list;
          while (stack.length && stack[stack.length - 1].level > level) closeTo(stack.length - 1);
          const top = stack[stack.length - 1];
          if (top && top.level === level && (top.numId !== numId || top.tag !== kind)) closeTo(stack.length - 1);
          const now = stack[stack.length - 1];
          if (now && now.level === level) {
            if (liOpen) html += '</li>';
          } else {
            html += `<${kind}>`;
            stack.push({ tag: kind, level, numId });
          }
          html += `<li${para.attrs}>${para.inner}`;
          liOpen = true;
        } else {
          closeTo(0);
          html += para.html;
        }
        for (const box of ctx.boxes.splice(0)) {
          closeTo(0);
          html += box;
        }
        break;
      }
      case 'tbl':
        closeTo(0);
        html += table(ctx, c);
        break;
      case 'sdt': {
        const content = child(c, 'sdtContent');
        if (content) for (const k of kids(content)) block(k);
        break;
      }
      case 'commentRangeStart': {
        const id = attr(c, 'id');
        if (id !== null) ctx.active.push(id);
        break;
      }
      case 'commentRangeEnd': {
        const at = ctx.active.lastIndexOf(attr(c, 'id') ?? '');
        if (at >= 0) ctx.active.splice(at, 1);
        break;
      }
      default:
        break;
    }
  };
  for (const c of kids(parent)) {
    if (isEl(c, MC, 'AlternateContent')) {
      const choice = kids(c).find((k) => isEl(k, MC, 'Choice'));
      if (choice) for (const k of kids(choice)) block(k);
    } else block(c);
  }
  closeTo(0);
  return html;
}

// ---- tables ---------------------------------------------------------------------------------------------

interface Cell {
  col: number;
  span: number;
  merge: 'restart' | 'continue' | null;
  html: string;
  header: boolean;
  style: string;
  rows: number;
}

function table(ctx: Context, tbl: Element): string {
  const grid = childrenOf(child(tbl, 'tblGrid'), 'gridCol').map((g) => Number(attr(g, 'w') ?? 0));
  const rows: Cell[][] = [];
  for (const tr of childrenOf(tbl, 'tr')) {
    const header = on(child(child(tr, 'trPr'), 'tblHeader')) && child(child(tr, 'trPr'), 'tblHeader') !== null;
    const cells: Cell[] = [];
    let col = 0;
    for (const tc of childrenOf(tr, 'tc')) {
      const tcPr = child(tc, 'tcPr');
      const span = Math.max(1, Number(attr(child(tcPr, 'gridSpan'), 'val') ?? 1) || 1);
      const vm = child(tcPr, 'vMerge');
      const merge = vm ? (attr(vm, 'val') === 'restart' ? 'restart' : 'continue') : null;
      const style: string[] = [];
      const fill = attr(child(tcPr, 'shd'), 'fill');
      if (fill && HEX.test(fill)) style.push(`background-color: #${fill.toLowerCase()}`);
      const valign = attr(child(tcPr, 'vAlign'), 'val');
      if (valign === 'center') style.push('vertical-align: middle');
      else if (valign === 'bottom') style.push('vertical-align: bottom');
      // a cell with one paragraph is its text; with more it has blocks (paragraphs, lists, tables)
      const paras = kids(tc).filter((k) => isEl(k, W, 'p'));
      const onlyOne = paras.length === 1 && kids(tc).filter((k) => isEl(k, W) && k.localName !== 'tcPr').length === 1;
      let html = '';
      if (onlyOne) {
        const para = paragraph(ctx, paras[0]);
        if (!para.list && para.tag === 'p') {
          html = para.inner === '<br>' ? '' : para.inner;
          if (para.align) style.push(`text-align: ${para.align}`);
        } else html = renderBlocks(ctx, tc);
      } else html = renderBlocks(ctx, tc);
      cells.push({ col, span, merge, html, header, style: style.join('; '), rows: 1 });
      col += span;
    }
    rows.push(cells);
  }
  // merged downwards: the first cell takes the rows of the cells under it that continue it
  rows.forEach((cells, r) => {
    for (const cell of cells) {
      if (cell.merge !== 'restart') continue;
      for (let n = r + 1; n < rows.length; n++) {
        const below = rows[n].find((x) => x.col === cell.col && x.merge === 'continue');
        if (!below) break;
        below.html = '\u0000';
        cell.rows++;
      }
    }
  });
  const total = grid.reduce((a, b) => a + b, 0);
  const cols = total > 0 && grid.length ? `<colgroup>${grid.map((g) => `<col style="width: ${Math.round((g / total) * 1000) / 10}%">`).join('')}</colgroup>` : '';
  const body = rows
    .map((cells) => {
      const tds = cells
        .filter((c) => c.html !== '\u0000')
        .map((c) => {
          const tag = c.header ? 'th' : 'td';
          // the cells of a header are bold already
          if (c.header && (c.html.match(/<strong>/g) ?? []).length === 1) c.html = c.html.replace(/^<strong>([\s\S]*)<\/strong>$/, '$1');
          const a = (c.span > 1 ? ` colspan="${c.span}"` : '') + (c.rows > 1 ? ` rowspan="${c.rows}"` : '') + (c.style ? ` style="${escapeAttr(c.style)}"` : '');
          return `<${tag}${a}>${c.html || '<br>'}</${tag}>`;
        })
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');
  return rows.length ? `<table>${cols}<tbody>${body}</tbody></table>` : '';
}

// ---- the comments ---------------------------------------------------------------------------------------

function readComments(ctx: Context, files: Map<string, Uint8Array>): { threads: CommentThread[]; threadOf: Map<string, string> } {
  const threadOf = new Map<string, string>();
  const root = parseXml(files.get('word/comments.xml'));
  if (!root || !ctx.options.comments) return { threads: [], threadOf };
  const extended = parseXml(files.get('word/commentsExtended.xml'));
  const parentOfPara = new Map<string, string>();
  const done = new Set<string>();
  for (const e of kids(extended ?? root).filter((k) => isEl(k, W15, 'commentEx'))) {
    const para = e.getAttributeNS(W15, 'paraId') ?? e.getAttribute('w15:paraId') ?? '';
    const parent = e.getAttributeNS(W15, 'paraIdParent') ?? e.getAttribute('w15:paraIdParent');
    if (parent) parentOfPara.set(para, parent);
    if ((e.getAttributeNS(W15, 'done') ?? e.getAttribute('w15:done')) === '1') done.add(para);
  }
  interface Item {
    id: string;
    para: string;
    author: string;
    date: string;
    text: string;
  }
  const items: Item[] = [];
  for (const c of childrenOf(root, 'comment')) {
    const paragraphs = childrenOf(c, 'p');
    const last = paragraphs[paragraphs.length - 1];
    const text = paragraphs
      .map((p) => Array.from(p.getElementsByTagNameNS(W, 't')).map((t) => t.textContent ?? '').join(''))
      .join('\n')
      .trim();
    items.push({
      id: attr(c, 'id') ?? '',
      para: last?.getAttributeNS(W14, 'paraId') ?? last?.getAttribute('w14:paraId') ?? '',
      author: attr(c, 'author') ?? 'Unknown',
      date: isoDate(attr(c, 'date')),
      text: text.slice(0, 5000),
    });
  }
  const byPara = new Map(items.map((i) => [i.para, i]));
  const threads = new Map<string, CommentThread>();
  const message = (i: Item) => ({ id: `w-m${i.id}`, author: { id: slug(i.author), name: i.author.slice(0, 128) }, text: i.text || '…', created: i.date });
  for (const i of items) {
    const parentPara = parentOfPara.get(i.para);
    const parent = parentPara ? byPara.get(parentPara) : undefined;
    if (parent) continue;
    threads.set(i.id, { id: `w-c${i.id}`, messages: [message(i)], ...(done.has(i.para) ? { resolved: true } : {}) });
    threadOf.set(i.id, `w-c${i.id}`);
  }
  for (const i of items) {
    let parent = parentOfPara.has(i.para) ? byPara.get(parentOfPara.get(i.para)!) : undefined;
    for (let n = 0; parent && parentOfPara.has(parent.para) && n < 20; n++) parent = byPara.get(parentOfPara.get(parent.para)!);
    if (parent && threads.has(parent.id)) threads.get(parent.id)!.messages.push(message(i));
  }
  return { threads: Array.from(threads.values()), threadOf };
}

// ---- the file -------------------------------------------------------------------------------------------

function readRels(bytes: Uint8Array | undefined): Map<string, { target: string; external: boolean }> {
  const out = new Map<string, { target: string; external: boolean }>();
  const root = parseXml(bytes);
  if (!root) return out;
  for (const rel of Array.from(root.children)) {
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    if (id && target) out.set(id, { target, external: rel.getAttribute('TargetMode') === 'External' });
  }
  return out;
}

const mm = (twips: number): string => `${Math.round((twips / 56.6929) * 10) / 10}mm`;

/** A Word document as HTML (and what goes with it: the comments, the page, the title). */
export async function fromDocx(input: Blob | ArrayBuffer | Uint8Array, options: DocxImportOptions = {}): Promise<DocxImport> {
  const bytes = ArrayBuffer.isView(input)
    ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
    : new Uint8Array(Object.prototype.toString.call(input) === '[object ArrayBuffer]' ? (input as ArrayBuffer) : await (input as Blob).arrayBuffer());
  let files: Map<string, Uint8Array>;
  try {
    files = await unzipAll(bytes, options.limits);
  } catch (err) {
    throw new Error(`This is not a Word document that can be read (${(err as Error).message})`);
  }
  const documentXml = files.get('word/document.xml');
  if (!documentXml) throw new Error('This is not a Word document: word/document.xml is missing');
  const root = parseXml(documentXml);
  const body = child(root, 'body');
  if (!root || !body) throw new Error('This is not a Word document that can be read');

  const { styles, baseSize, baseFont } = readStyles(parseXml(files.get('word/styles.xml')));
  const ctx: Context = {
    styles,
    numbering: readNumbering(parseXml(files.get('word/numbering.xml'))),
    rels: readRels(files.get('word/_rels/document.xml.rels')),
    files,
    options: { comments: options.comments ?? true, changes: options.changes ?? 'accept', images: options.images ?? true, maxImageSize: options.maxImageSize ?? 8 * 1024 * 1024 },
    baseSize,
    baseFont,
    warnings: new Set(),
    threadOf: new Map(),
    usedThreads: new Set(),
    active: [],
    fields: [],
    changeCount: 0,
    imageBytes: 0,
    skippedImages: 0,
    boxes: [],
  };
  const read = readComments(ctx, files);
  ctx.threadOf = read.threadOf;

  // Word wants a paragraph after a table, and often ends with empty ones: they are not text
  const html = renderBlocks(ctx, body).replace(/(?:<p><br><\/p>)+$/, '');
  const comments = read.threads.filter((t) => ctx.usedThreads.has(t.id));
  if (ctx.skippedImages) ctx.warnings.add(`${ctx.skippedImages} picture${ctx.skippedImages > 1 ? 's' : ''} could not be imported (a format that a browser does not show, or too large).`);

  const sect = child(body, 'sectPr');
  const size = child(sect, 'pgSz');
  const margin = child(sect, 'pgMar');
  const width = Number(attr(size, 'w') ?? 0);
  const height = Number(attr(size, 'h') ?? 0);
  const page = width > 0 && height > 0 ? { width: mm(width), height: mm(height), margin: mm(Number(attr(margin, 'left') ?? 1134)) } : undefined;

  const core = parseXml(files.get('docProps/core.xml'));
  const title = core ? Array.from(core.children).find((k) => k.localName === 'title')?.textContent?.trim() || undefined : undefined;

  return { html, title, page, comments, warnings: Array.from(ctx.warnings) };
}
