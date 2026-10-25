/**
 * The content as a Word document (.docx), written without a library: a .docx is a ZIP of XML (see zip.ts), and what the editor has maps
 * onto it closely. Kept: headings, paragraphs and their alignment, bold, italic, underline (and its kind and colour), strikethrough,
 * sub and superscript, text colour, highlight, size and font, inline code, links, bullet, numbered and task lists (nested), quotes,
 * code blocks, rules, callouts, tables (merged cells, widths, borders, shading), rows of columns, and pictures. The page format becomes
 * the page of the document. What Word has no equivalent for (the language of a code block, columns of text) is left out.
 */
import { DEFAULT_CALLOUTS } from './callouts';
import { modelOf } from './table';
import { utf8, zip } from './zip';

/** The page of the document, in millimetres. */
export interface DocxPage {
  width: number;
  height: number;
  margin: number;
}

export interface DocxOptions {
  title?: string;
  author?: string;
  /** The paper and the margin. Default: A4 with a margin of 25.4 mm. */
  page?: Partial<DocxPage> | null;
  /** The font of the text (its first family name), and its size in points. Default: Calibri 11. */
  font?: string;
  fontSize?: number;
  /** What to do with a picture that is not in the HTML itself (an address): false leaves it as a link; a function gives its bytes. Default: fetch it. */
  images?: boolean | ((src: string) => Promise<Uint8Array | null>);
}

// ---- small things ---------------------------------------------------------------------------------------

/** Text for XML: what an XML document may not have is left out, and what it has to escape is. */
// eslint-disable-next-line no-control-regex
const esc = (s: string): string => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NAMED: Record<string, string> = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', orange: 'FFA500', purple: '800080', gray: '808080', grey: '808080', silver: 'C0C0C0', maroon: '800000', navy: '000080', teal: '008080', lime: '00FF00', aqua: '00FFFF', fuchsia: 'FF00FF', olive: '808000' };

/** A CSS colour as six hex digits, or null (also for transparent and for what is not a colour that is known). */
export function cssColor(value: string | null | undefined): string | null {
  const v = (value ?? '').trim().toLowerCase();
  if (!v || v === 'transparent' || v === 'inherit' || v === 'initial' || v === 'currentcolor') return null;
  let m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(v);
  if (m) return m[1].toUpperCase();
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (m) return (m[1] + m[1] + m[2] + m[2] + m[3] + m[3]).toUpperCase();
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v);
  if (m) {
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return null; // fully transparent
    return [m[1], m[2], m[3]].map((n) => Math.min(255, parseInt(n, 10)).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  return NAMED[v] ?? null;
}

/** A colour mixed with white: `amount` of white (0 to 1). */
function tint(hex: string, amount: number): string {
  const n = parseInt(hex, 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount).toString(16).padStart(2, '0');
  return (mix((n >> 16) & 255) + mix((n >> 8) & 255) + mix(n & 255)).toUpperCase();
}

const px = (value: string | null | undefined): number | null => {
  const m = /^(-?[\d.]+)(px|pt|em|rem|cm|mm|in)?$/.exec((value ?? '').trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  switch (m[2]) {
    case 'pt': return (n * 4) / 3;
    case 'em':
    case 'rem': return n * 16;
    case 'cm': return (n * 96) / 2.54;
    case 'mm': return (n * 96) / 25.4;
    case 'in': return n * 96;
    default: return n;
  }
};

const twipsOfPx = (n: number): number => Math.round(n * 15);
const twipsOfMm = (n: number): number => Math.round((n * 1440) / 25.4);

// ---- pictures -------------------------------------------------------------------------------------------

export interface ImageInfo {
  type: 'png' | 'jpeg' | 'gif' | 'bmp';
  width: number;
  height: number;
}

/** The type and the size in pixels of a picture, from its first bytes; null for a kind that Word does not read. */
export function imageInfo(b: Uint8Array): ImageInfo | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { type: 'png', width: v.getUint32(16), height: v.getUint32(20) };
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { type: 'gif', width: v.getUint16(6, true), height: v.getUint16(8, true) };
  if (b.length > 26 && b[0] === 0x42 && b[1] === 0x4d) return { type: 'bmp', width: Math.abs(v.getInt32(18, true)), height: Math.abs(v.getInt32(22, true)) };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let at = 2;
    while (at + 9 < b.length) {
      if (b[at] !== 0xff) return null;
      const marker = b[at + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { type: 'jpeg', width: v.getUint16(at + 7), height: v.getUint16(at + 5) };
      at += 2 + v.getUint16(at + 2);
    }
  }
  return null;
}

/** The bytes of a data: address. */
function dataBytes(src: string): { bytes: Uint8Array; mime: string } | null {
  const m = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s.exec(src);
  if (!m) return null;
  try {
    if (/;base64/i.test(m[2])) {
      const bin = atob(decodeURIComponent(m[3]).replace(/\s/g, ''));
      return { bytes: Uint8Array.from(bin, (c) => c.charCodeAt(0)), mime: m[1] };
    }
    return { bytes: utf8(decodeURIComponent(m[3])), mime: m[1] };
  } catch {
    return null;
  }
}

/** A kind of picture that Word does not read (SVG, WebP...) as PNG, through the browser. Null where there is no browser. */
async function asPng(bytes: Uint8Array, mime: string): Promise<Uint8Array | null> {
  try {
    if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime || 'image/webp' }));
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('picture'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 300;
    canvas.height = img.naturalHeight || 150;
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

interface Picture {
  name: string;
  bytes: Uint8Array;
  info: ImageInfo;
}

// ---- the document ---------------------------------------------------------------------------------------

interface RunStyle {
  b?: boolean;
  i?: boolean;
  underline?: string; // a value of w:u
  underlineColor?: string;
  strike?: boolean;
  dstrike?: boolean;
  color?: string;
  shade?: string;
  size?: number; // half points
  font?: string;
  vert?: 'superscript' | 'subscript';
  link?: boolean;
  rtl?: boolean;
}

interface ParaProps {
  style?: string;
  keepNext?: boolean;
  numId?: number;
  ilvl?: number;
  borderLeft?: { color: string; size: number; space?: number };
  borderBottom?: { color: string; size: number };
  box?: string;
  shade?: string;
  bidi?: boolean;
  before?: number;
  after?: number;
  left?: number;
  hanging?: number;
  align?: string;
  rPr?: RunStyle;
}

interface Context {
  /** The width of the text on the page, in twips. */
  width: number;
  /** How the text is aligned and which way it goes, where the block says nothing of it (a table cell). */
  align?: string;
  rtl?: boolean;
  base: RunStyle;
  /** The pictures, by element. */
  pictures: Map<Element, Picture | null>;
}

class Package {
  rels: { id: string; type: string; target: string; external?: boolean }[] = [];
  pictures: Picture[] = [];
  /** The numbered lists: for each, the number it starts with. */
  numbered: { id: number; start: number }[] = [];
  private relId = 3; // 1 is the styles, 2 the numbering
  private shapeId = 1;
  private numId = 2; // 1 is the bullets

  link(url: string): string {
    const found = this.rels.find((r) => r.external && r.target === url);
    if (found) return found.id;
    const id = `rId${this.relId++}`;
    this.rels.push({ id, type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', target: url, external: true });
    return id;
  }

  picture(p: Picture): string {
    const id = `rId${this.relId++}`;
    this.rels.push({ id, type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', target: `media/${p.name}` });
    this.pictures.push(p);
    return id;
  }

  nextShape(): number {
    return this.shapeId++;
  }

  /** A new numbered list, which starts again at its start. */
  numbering(start: number): number {
    const id = ++this.numId;
    this.numbered.push({ id, start });
    return id;
  }
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function rPr(s: RunStyle): string {
  let out = '';
  if (s.link) out += '<w:rStyle w:val="Hyperlink"/>';
  if (s.font) out += `<w:rFonts w:ascii="${esc(s.font)}" w:hAnsi="${esc(s.font)}" w:cs="${esc(s.font)}"/>`;
  if (s.b) out += '<w:b/><w:bCs/>';
  if (s.i) out += '<w:i/><w:iCs/>';
  if (s.strike) out += '<w:strike/>';
  if (s.dstrike) out += '<w:dstrike/>';
  if (s.color) out += `<w:color w:val="${s.color}"/>`;
  if (s.size) out += `<w:sz w:val="${s.size}"/><w:szCs w:val="${s.size}"/>`;
  if (s.underline) out += `<w:u w:val="${s.underline}"${s.underlineColor ? ` w:color="${s.underlineColor}"` : ''}/>`;
  if (s.shade) out += `<w:shd w:val="clear" w:color="auto" w:fill="${s.shade}"/>`;
  if (s.vert) out += `<w:vertAlign w:val="${s.vert}"/>`;
  if (s.rtl) out += '<w:rtl/>';
  return out ? `<w:rPr>${out}</w:rPr>` : '';
}

function pPr(p: ParaProps): string {
  let out = '';
  if (p.style) out += `<w:pStyle w:val="${p.style}"/>`;
  if (p.keepNext) out += '<w:keepNext/>';
  if (p.numId) out += `<w:numPr><w:ilvl w:val="${p.ilvl ?? 0}"/><w:numId w:val="${p.numId}"/></w:numPr>`;
  if (p.borderLeft || p.borderBottom || p.box) {
    const box = p.box ? `w:val="single" w:sz="4" w:space="4" w:color="${p.box}"` : '';
    out += '<w:pBdr>';
    if (p.box) out += `<w:top ${box}/>`;
    if (p.borderLeft) out += `<w:left w:val="single" w:sz="${p.borderLeft.size}" w:space="${p.borderLeft.space ?? 8}" w:color="${p.borderLeft.color}"/>`;
    else if (p.box) out += `<w:left ${box}/>`;
    if (p.borderBottom) out += `<w:bottom w:val="single" w:sz="${p.borderBottom.size}" w:space="1" w:color="${p.borderBottom.color}"/>`;
    else if (p.box) out += `<w:bottom ${box}/>`;
    if (p.box) out += `<w:right ${box}/>`;
    out += '</w:pBdr>';
  }
  if (p.shade) out += `<w:shd w:val="clear" w:color="auto" w:fill="${p.shade}"/>`;
  if (p.bidi) out += '<w:bidi/>';
  if (p.before !== undefined || p.after !== undefined) out += `<w:spacing${p.before !== undefined ? ` w:before="${p.before}"` : ''}${p.after !== undefined ? ` w:after="${p.after}"` : ''}/>`;
  if (p.left !== undefined || p.hanging !== undefined) out += `<w:ind${p.left !== undefined ? ` w:left="${p.left}"` : ''}${p.hanging !== undefined ? ` w:hanging="${p.hanging}"` : ''}/>`;
  if (p.align) out += `<w:jc w:val="${p.align}"/>`;
  if (p.rPr) out += rPr(p.rPr);
  return out ? `<w:pPr>${out}</w:pPr>` : '';
}

const para = (runs: string, props: ParaProps = {}): string => `<w:p>${pPr(props)}${runs}</w:p>`;

function run(text: string, style: RunStyle): string {
  if (!text) return '';
  const parts = text.split(/(\t|\n)/);
  const inner = parts
    .map((part) => (part === '\t' ? '<w:tab/>' : part === '\n' ? '<w:br/>' : part ? `<w:t xml:space="preserve">${esc(part)}</w:t>` : ''))
    .join('');
  return inner ? `<w:r>${rPr(style)}${inner}</w:r>` : '';
}

/** The alignment of a block as w:jc: left and right are the other way round in a paragraph that goes from the right. */
function alignOf(el: Element, ctx: Context, rtl: boolean): string | undefined {
  const css = ((el as HTMLElement).style?.textAlign || ctx.align || '').toLowerCase();
  const map: Record<string, string> = { left: rtl ? 'right' : 'left', right: rtl ? 'left' : 'right', center: 'center', justify: 'both', start: 'left', end: 'right' };
  return map[css];
}

const isRtl = (el: Element, ctx: Context): boolean => {
  const dir = (el.getAttribute('dir') ?? '').toLowerCase();
  return dir === 'rtl' ? true : dir === 'ltr' ? false : !!ctx.rtl;
};

const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'table', 'hr', 'div', 'aside', 'figure', 'section', 'article', 'caption']);

// ---- inline ---------------------------------------------------------------------------------------------

/** The style of a run that a span and the like give. */
function styled(el: HTMLElement, base: RunStyle): RunStyle {
  const s = { ...base };
  const css = el.style;
  if (!css) return s;
  const color = cssColor(css.color);
  if (color) s.color = color;
  const bg = cssColor(css.backgroundColor);
  if (bg) s.shade = bg;
  const size = px(css.fontSize);
  if (size && /pt|px/.test(css.fontSize)) s.size = Math.max(2, Math.round(size * 0.75 * 2));
  const family = css.fontFamily?.split(',')[0]?.replace(/["']/g, '').trim();
  if (family) s.font = /^monospace$/i.test(family) ? 'Courier New' : /^serif$/i.test(family) ? 'Times New Roman' : /^sans-serif$/i.test(family) ? 'Arial' : /^(?:inherit|system-ui|ui-.*)$/i.test(family) ? s.font : family;
  const weight = css.fontWeight;
  if (weight && (/^(?:bold|bolder)$/.test(weight) || parseInt(weight, 10) >= 600)) s.b = true;
  if (/italic|oblique/.test(css.fontStyle)) s.i = true;
  const deco = `${css.textDecorationLine} ${css.textDecoration}`;
  if (deco.includes('underline')) s.underline = s.underline ?? 'single';
  if (deco.includes('line-through')) s.strike = true;
  if (/^super/i.test(css.verticalAlign)) s.vert = 'superscript';
  else if (/^sub$/i.test(css.verticalAlign)) s.vert = 'subscript';
  return s;
}

const UNDERLINES: Record<string, string> = { double: 'double', dashed: 'dash', dotted: 'dotted', wavy: 'wave' };

function lineStyle(el: HTMLElement, s: RunStyle, kind: 'u' | 's'): void {
  const how = el.style?.textDecorationStyle;
  if (kind === 'u') {
    s.underline = (how && UNDERLINES[how]) || 'single';
    const color = cssColor(el.style?.textDecorationColor);
    if (color) s.underlineColor = color;
  } else if (how === 'double') s.dstrike = true;
  else s.strike = true;
}

/** The runs of the inline content of an element. */
function inline(node: Node, style: RunStyle, ctx: Context, pkg: Package): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.nodeValue ?? '').replace(/[ \t\r\n\f]+/g, ' ');
    return run(text, style);
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const kids = (s: RunStyle) => Array.from(el.childNodes).map((n) => inline(n, s, ctx, pkg)).join('');
  switch (tag) {
    case 'br':
      return '<w:r><w:br/></w:r>';
    case 'strong':
    case 'b':
      return kids(styled(el, { ...style, b: true }));
    case 'em':
    case 'i':
      return kids(styled(el, { ...style, i: true }));
    case 'u': {
      const s = styled(el, style);
      lineStyle(el, s, 'u');
      return kids(s);
    }
    case 's':
    case 'strike':
    case 'del': {
      const s = styled(el, style);
      lineStyle(el, s, 's');
      return kids(s);
    }
    case 'sup':
      return kids({ ...style, vert: 'superscript' });
    case 'sub':
      return kids({ ...style, vert: 'subscript' });
    case 'mark':
      return kids({ ...style, shade: 'FFFF00' });
    case 'code':
      return kids({ ...style, font: 'Courier New', shade: style.shade ?? 'F3F4F6', size: style.size ? Math.round(style.size * 0.9) : undefined });
    case 'a': {
      const href = (el.getAttribute('href') ?? '').trim();
      if (!/^(?:https?:|mailto:|tel:)/i.test(href)) return kids(styled(el, style));
      const id = pkg.link(href);
      return `<w:hyperlink r:id="${id}" w:history="1">${kids({ ...styled(el, style), link: true })}</w:hyperlink>`;
    }
    case 'img':
      return picture(el as HTMLImageElement, ctx, pkg);
    case 'video':
    case 'iframe': {
      const src = el.getAttribute('src') ?? '';
      if (!/^https?:/i.test(src)) return '';
      return `<w:hyperlink r:id="${pkg.link(src)}" w:history="1">${run(src, { ...style, link: true })}</w:hyperlink>`;
    }
    default:
      return kids(styled(el, style));
  }
}

/** A picture as a drawing in the text, or (without the picture) its description. */
function picture(el: HTMLImageElement, ctx: Context, pkg: Package): string {
  const pic = ctx.pictures.get(el);
  const alt = el.getAttribute('alt') ?? '';
  if (!pic) return alt ? run(`[${alt}]`, ctx.base) : '';
  const natural = { w: pic.info.width, h: pic.info.height };
  const percent = /^([\d.]+)%$/.exec(el.style?.width ?? '');
  const attrWidth = parseFloat(el.getAttribute('width') ?? '');
  const max = ctx.width * 635; // EMU
  let cx = percent ? (ctx.width * parseFloat(percent[1]) * 635) / 100 : (Number.isFinite(attrWidth) && attrWidth > 0 ? attrWidth : natural.w) * 9525;
  cx = Math.max(9525, Math.min(cx, max));
  const cy = Math.max(9525, Math.round((cx * natural.h) / Math.max(1, natural.w)));
  const id = pkg.picture(pic);
  const shape = pkg.nextShape();
  const name = `Picture ${shape}`;
  const description = esc(alt);
  return (
    '<w:r><w:drawing>' +
    `<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${Math.round(cx)}" cy="${cy}"/>` +
    `<wp:docPr id="${shape}" name="${name}" descr="${description}"/>` +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
    `<pic:nvPicPr><pic:cNvPr id="${shape}" name="${name}" descr="${description}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(cx)}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
  );
}

// ---- blocks ---------------------------------------------------------------------------------------------

const hasBlocks = (el: Element): boolean => Array.from(el.children).some((c) => BLOCK_TAGS.has(c.tagName.toLowerCase()) || c.matches('div,[data-layout]'));

/** The paragraph(s) of an element that has inline content and maybe blocks among it. */
function mixed(el: Element, props: ParaProps, ctx: Context, pkg: Package, extra = (_: ParaProps) => _): string {
  const out: string[] = [];
  let runs = '';
  const flush = () => {
    if (runs.trim() || runs.includes('<w:drawing>') || runs.includes('<w:br/>')) out.push(para(runs, extra(props)));
    runs = '';
  };
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE && (BLOCK_TAGS.has((node as Element).tagName.toLowerCase()) || (node as Element).matches('[data-layout],[data-callout]'))) {
      flush();
      out.push(block(node as Element, ctx, pkg, { ...props, ...{} }));
    } else runs += inline(node, ctx.base, ctx, pkg);
  }
  flush();
  return out.join('');
}

function paragraphOf(el: Element, ctx: Context, pkg: Package, props: ParaProps = {}): string {
  const rtl = isRtl(el, ctx);
  const merged: ParaProps = { ...props, bidi: rtl || props.bidi, align: props.align ?? alignOf(el, ctx, rtl) };
  const indent = px((el as HTMLElement).style?.marginInlineStart || (el as HTMLElement).style?.marginLeft || (el as HTMLElement).style?.paddingLeft);
  if (indent && merged.left === undefined) merged.left = twipsOfPx(indent);
  const runs = Array.from(el.childNodes).map((n) => inline(n, ctx.base, ctx, pkg)).join('');
  // a picture alone in a paragraph is aligned as the picture says
  const only = el.children.length === 1 && el.children[0].tagName === 'IMG' && !el.textContent?.trim() ? (el.children[0] as HTMLElement) : null;
  if (only && !merged.align) {
    const left = only.style.marginLeft;
    const right = only.style.marginRight;
    if (left === 'auto' && right === 'auto') merged.align = 'center';
    else if (left === 'auto') merged.align = 'right';
  }
  return para(runs, merged);
}

function heading(el: Element, ctx: Context, pkg: Package): string {
  const level = Math.min(3, parseInt(el.tagName.slice(1), 10) || 1);
  return paragraphOf(el, ctx, pkg, { style: `Heading${level}`, keepNext: true });
}

/** A list: the numbering is Word's own, so that the numbers go on and restart as they should. */
function list(el: Element, ctx: Context, pkg: Package, level = 0, task = false): string {
  const ordered = el.tagName === 'OL';
  const isTask = el.hasAttribute('data-task');
  const numId = ordered ? pkg.numbering(Math.max(1, parseInt(el.getAttribute('start') ?? '1', 10) || 1)) : 1;
  const out: string[] = [];
  void task;
  const items = Array.from(el.children).filter((c) => c.tagName === 'LI' || c.tagName === 'UL' || c.tagName === 'OL');
  for (const child of items) {
    if (child.tagName !== 'LI') {
      // a list straight in a list: a level deeper
      out.push(list(child, ctx, pkg, level + 1));
      continue;
    }
    out.push(item(child, ctx, pkg, { level, ordered, numId, isTask, parentTask: isTask }));
  }
  return out.join('');
}

function item(li: Element, ctx: Context, pkg: Package, o: { level: number; ordered: boolean; numId: number; isTask: boolean; parentTask: boolean }): string {
  const out: string[] = [];
  const left = 720 * (o.level + 1);
  const rtl = isRtl(li, ctx);
  const first = (): ParaProps =>
    o.isTask ? { left, hanging: 360, bidi: rtl, align: alignOf(li, ctx, rtl) } : { numId: o.numId, ilvl: Math.min(8, o.level), bidi: rtl, align: alignOf(li, ctx, rtl) };
  let runs = '';
  let started = false;
  const mark = o.isTask ? run(li.getAttribute('data-checked') === 'true' ? '☒ ' : '☐ ', ctx.base) : '';
  const flush = () => {
    if (!runs.trim() && !runs.includes('<w:drawing>') && started) {
      runs = '';
      return;
    }
    if (!runs && started) return;
    const props = started ? { left, bidi: rtl } : first();
    out.push(para((started ? '' : mark) + runs, props));
    started = true;
    runs = '';
  };
  for (const node of Array.from(li.childNodes)) {
    const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : null;
    if (el && (el.tagName === 'UL' || el.tagName === 'OL')) {
      flush();
      if (!started) {
        out.push(para(mark, first()));
        started = true;
      }
      out.push(list(el, ctx, pkg, o.level + 1));
    } else if (el && BLOCK_TAGS.has(el.tagName.toLowerCase())) {
      flush();
      if (!started) {
        out.push(para(mark, first()));
        started = true;
      }
      out.push(block(el, ctx, pkg, { left }));
    } else runs += inline(node, ctx.base, ctx, pkg);
  }
  if (runs || !started) {
    const props = started ? { left, bidi: rtl } : first();
    out.push(para((started ? '' : mark) + runs, props));
  }
  return out.join('');
}

const QUOTE_COLOR = 'BFBFBF';

function quote(el: Element, ctx: Context, pkg: Package): string {
  const props: ParaProps = { borderLeft: { color: QUOTE_COLOR, size: 18 }, left: 360, rPr: undefined };
  const inner: Context = { ...ctx, base: { ...ctx.base, color: ctx.base.color ?? '555555' } };
  if (!hasBlocks(el)) return paragraphOf(el, inner, pkg, props);
  return mixed(el, props, inner, pkg);
}

function callout(el: Element, ctx: Context, pkg: Package): string {
  const type = (el.getAttribute('data-callout') ?? 'note').toLowerCase();
  const color = (DEFAULT_CALLOUTS.find((c) => c.id === type)?.color ?? '#667085').replace('#', '').toUpperCase();
  const props: ParaProps = { borderLeft: { color, size: 24, space: 6 }, shade: tint(color, 0.92), left: 120, after: 0 };
  const label = para(run(type.charAt(0).toUpperCase() + type.slice(1), { ...ctx.base, b: true, color }), props);
  const body = hasBlocks(el) ? mixed(el, props, ctx, pkg) : paragraphOf(el, ctx, pkg, props);
  return label + body + para('', { after: 120, rPr: undefined });
}

function code(el: Element): string {
  const lines = (el.textContent ?? '').replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
  const style: RunStyle = { font: 'Courier New', size: 19 };
  const runs = lines.map((line, i) => (i ? '<w:r><w:br/></w:r>' : '') + run(line.replace(/ /g, ' ') || '', style)).join('');
  return para(runs, { shade: 'F3F4F6', box: 'E5E7EB', after: 160, left: 0, bidi: false });
}

function rule(): string {
  return para('', { borderBottom: { color: '9AA3B2', size: 6 }, after: 120 });
}

// ---- tables ---------------------------------------------------------------------------------------------

const BORDER = 'D0D5DD';

function cellBorders(td: HTMLElement): string {
  const css = td.style;
  const width = px(css.borderWidth || css.borderTopWidth);
  const color = cssColor(css.borderColor || css.borderTopColor);
  const none = width === 0 || /^none$/.test(css.borderStyle) || (!!css.border && /^0(?:px)?\b/.test(css.border));
  if (!none && width === null && !color) return '';
  const sides = ['top', 'left', 'bottom', 'right'];
  if (none) return `<w:tcBorders>${sides.map((s) => `<w:${s} w:val="nil"/>`).join('')}</w:tcBorders>`;
  const size = Math.max(2, Math.min(96, Math.round((width ?? 1) * 6)));
  return `<w:tcBorders>${sides.map((s) => `<w:${s} w:val="single" w:sz="${size}" w:space="0" w:color="${color ?? BORDER}"/>`).join('')}</w:tcBorders>`;
}

const VALIGN: Record<string, string> = { top: 'top', middle: 'center', bottom: 'bottom' };

function table(el: HTMLTableElement, ctx: Context, pkg: Package): string {
  const model = modelOf(el);
  if (!model.rows.length || !model.cols) return '';
  // the widths of the columns: what the <col> elements say, or the same for all
  const cols = Array.from(el.querySelectorAll(':scope > colgroup > col')) as HTMLElement[];
  const raw = Array.from({ length: model.cols }, (_, i) => {
    const w = parseFloat(cols[i]?.style?.width ?? '');
    return Number.isFinite(w) && w > 0 ? w : 0;
  });
  const known = raw.filter(Boolean);
  const fallback = known.length ? 100 / model.cols : 1;
  const parts = raw.map((w) => w || fallback);
  const total = parts.reduce((a, b) => a + b, 0);
  const grid = parts.map((w) => Math.max(200, Math.round((w / total) * ctx.width)));
  const out: string[] = [];
  const caption = el.querySelector(':scope > caption');
  if (caption) out.push(paragraphOf(caption, { ...ctx, base: { ...ctx.base, i: true } }, pkg, { align: 'center', keepNext: true, after: 60 }));
  const rtl = isRtl(el, ctx);
  let xml =
    '<w:tbl><w:tblPr>' +
    `<w:tblW w:w="${grid.reduce((a, b) => a + b, 0)}" w:type="dxa"/>${rtl ? '' : ''}` +
    `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="${BORDER}"/>`).join('')}</w:tblBorders>` +
    '<w:tblLayout w:type="fixed"/>' +
    '<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar>' +
    '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>' +
    '</w:tblPr>' +
    `<w:tblGrid>${grid.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  model.m.forEach((row, r) => {
    const header = model.rows[r].cells[0]?.tagName === 'TH' && Array.from(model.rows[r].cells).every((c) => c.tagName === 'TH');
    xml += `<w:tr>${header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}`;
    let c = 0;
    while (c < model.cols) {
      const cell = row[c] as HTMLTableCellElement | null;
      if (!cell) {
        xml += `<w:tc><w:tcPr><w:tcW w:w="${grid[c]}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`;
        c++;
        continue;
      }
      let span = 1;
      while (c + span < model.cols && row[c + span] === cell) span++;
      const above = r > 0 && model.m[r - 1][c] === cell;
      const rowspan = Math.max(1, parseInt(cell.getAttribute('rowspan') ?? '1', 10) || 1);
      const width = grid.slice(c, c + span).reduce((a, b) => a + b, 0);
      let tcPr = `<w:tcW w:w="${width}" w:type="dxa"/>`;
      if (span > 1) tcPr += `<w:gridSpan w:val="${span}"/>`;
      if (above) tcPr += '<w:vMerge/>';
      else if (rowspan > 1) tcPr += '<w:vMerge w:val="restart"/>';
      tcPr += cellBorders(cell);
      const bg = cssColor(cell.style.backgroundColor);
      if (bg) tcPr += `<w:shd w:val="clear" w:color="auto" w:fill="${bg}"/>`;
      else if (cell.tagName === 'TH') tcPr += '<w:shd w:val="clear" w:color="auto" w:fill="F8F9FB"/>';
      const valign = VALIGN[cell.style.verticalAlign];
      if (valign) tcPr += `<w:vAlign w:val="${valign}"/>`;
      let body = '';
      if (!above) {
        const inner: Context = {
          ...ctx,
          width: Math.max(600, width - 200),
          align: cell.style.textAlign || (cell.tagName === 'TH' ? 'left' : ctx.align),
          base: cell.tagName === 'TH' ? { ...ctx.base, b: true } : ctx.base,
        };
        body = blocks(cell, inner, pkg);
      }
      xml += `<w:tc><w:tcPr>${tcPr}</w:tcPr>${body.endsWith('</w:p>') || body.endsWith('<w:p/>') ? body : body + '<w:p/>'}</w:tc>`;
      c += span;
    }
    xml += '</w:tr>';
  });
  xml += '</w:tbl>';
  out.push(xml);
  return out.join('');
}

/** A row of columns (a layout) as a table without borders. */
function layoutRow(el: Element, ctx: Context, pkg: Package): string {
  const columns = Array.from(el.children).filter((c) => c.matches('[data-layout="col"]'));
  if (!columns.length) return blocks(el, ctx, pkg);
  const template = ((el as HTMLElement).style.gridTemplateColumns || '').trim().split(/\s+/);
  const weights = columns.map((_, i) => {
    const m = /^([\d.]+)(fr|%)$/.exec(template[i] ?? '');
    return m ? parseFloat(m[1]) : 1;
  });
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const widths = weights.map((w) => Math.max(400, Math.round((w / sum) * ctx.width)));
  let xml =
    '<w:tbl><w:tblPr>' +
    `<w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/>` +
    `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="nil"/>`).join('')}</w:tblBorders>` +
    '<w:tblLayout w:type="fixed"/>' +
    '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tblCellMar>' +
    '<w:tblLook w:val="0000"/>' +
    `</w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid><w:tr>`;
  columns.forEach((col, i) => {
    const body = blocks(col, { ...ctx, width: Math.max(400, widths[i] - 320) }, pkg);
    xml += `<w:tc><w:tcPr><w:tcW w:w="${widths[i]}" w:type="dxa"/></w:tcPr>${body.endsWith('</w:p>') || body.endsWith('<w:p/>') ? body : body + '<w:p/>'}</w:tc>`;
  });
  return xml + '</w:tr></w:tbl>';
}

// ---- walking the blocks ---------------------------------------------------------------------------------

/** The XML of one block element. */
function block(el: Element, ctx: Context, pkg: Package, props: ParaProps = {}): string {
  const tag = el.tagName.toLowerCase();
  if (el.matches('[data-callout]')) return callout(el, ctx, pkg);
  if (el.matches('[data-layout="row"]')) return layoutRow(el, ctx, pkg);
  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return heading(el, ctx, pkg);
    case 'ul':
    case 'ol':
      return list(el, ctx, pkg);
    case 'blockquote':
      return quote(el, ctx, pkg);
    case 'pre':
      return code(el);
    case 'hr':
      return rule();
    case 'table':
      return table(el as HTMLTableElement, ctx, pkg);
    case 'aside':
      return hasBlocks(el) ? mixed(el, { box: BORDER, shade: 'F8F9FB' }, ctx, pkg) : paragraphOf(el, ctx, pkg, { box: BORDER, shade: 'F8F9FB' });
    case 'p':
    case 'li':
    case 'caption':
      return hasBlocks(el) ? mixed(el, props, ctx, pkg) : paragraphOf(el, ctx, pkg, props);
    default:
      // a div or another wrapper: its content (a div with text in it directly is a paragraph)
      return hasBlocks(el) ? mixed(el, props, ctx, pkg) : el.textContent?.trim() || el.querySelector('img,br') ? paragraphOf(el, ctx, pkg, props) : '';
  }
}

/** The blocks that are the content of an element (the text area, a table cell, a column). */
function blocks(parent: Element, ctx: Context, pkg: Package): string {
  const out: string[] = [];
  let runs = '';
  let lastTable = false;
  const flush = () => {
    if (runs.trim() || runs.includes('<w:drawing>')) {
      out.push(para(runs, { align: alignOf(parent, ctx, isRtl(parent, ctx)) }));
      lastTable = false;
    }
    runs = '';
  };
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE && (BLOCK_TAGS.has((node as Element).tagName.toLowerCase()) || (node as Element).matches('[data-layout],[data-callout]'))) {
      flush();
      const el = node as Element;
      const isTable = el.tagName === 'TABLE' || el.matches('[data-layout="row"]');
      // two tables with nothing between them are one table in Word
      if (isTable && lastTable) out.push('<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>');
      const xml = block(el, ctx, pkg);
      if (xml) out.push(xml);
      lastTable = isTable && !!xml;
    } else {
      runs += inline(node, ctx.base, ctx, pkg);
    }
  }
  flush();
  return out.join('');
}

// ---- the package ----------------------------------------------------------------------------------------

function stylesXml(font: string, size: number): string {
  const f = esc(font);
  const heading = (n: number, sz: number, before: number) =>
    `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${before}" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr>` +
    `<w:rPr><w:b/><w:bCs/><w:color w:val="111827"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}>` +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:eastAsia="${f}" w:cs="${f}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>` +
    '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>' +
    heading(1, 40, 360) +
    heading(2, 32, 280) +
    heading(3, 28, 240) +
    '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>' +
    '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
    '</w:styles>'
  );
}

function numberingXml(pkg: Package): string {
  const levels = (bullet: boolean) =>
    Array.from({ length: 9 }, (_, i) => {
      const fmt = bullet ? 'bullet' : ['decimal', 'lowerLetter', 'lowerRoman'][i % 3];
      const text = bullet ? ['•', '◦', '▪'][i % 3] : `%${i + 1}.`;
      return (
        `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/>` +
        `<w:pPr><w:ind w:left="${720 * (i + 1)}" w:hanging="360"/></w:pPr></w:lvl>`
      );
    }).join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W}>` +
    `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${levels(true)}</w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="hybridMultilevel"/>${levels(false)}</w:abstractNum>` +
    '<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>' +
    pkg.numbered
      .map((n) => `<w:num w:numId="${n.id}"><w:abstractNumId w:val="2"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="${n.start}"/></w:lvlOverride></w:num>`)
      .join('') +
    '</w:numbering>'
  );
}

const MIME: Record<ImageInfo['type'], string> = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp' };

/** Loads the pictures that the document has: those in the HTML itself, and (unless told not to) the others by their address. */
async function loadPictures(root: Element, images: DocxOptions['images']): Promise<Map<Element, Picture | null>> {
  const out = new Map<Element, Picture | null>();
  let count = 0;
  for (const img of Array.from(root.querySelectorAll('img'))) {
    const src = img.getAttribute('src') ?? '';
    let bytes: Uint8Array | null = null;
    let mime = '';
    try {
      const data = dataBytes(src);
      if (data) {
        bytes = data.bytes;
        mime = data.mime;
      } else if (typeof images === 'function') bytes = await images(src);
      else if (images !== false && /^https?:|^\//i.test(src) && typeof fetch === 'function') {
        const res = await fetch(src, { credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (res.ok) {
          bytes = new Uint8Array(await res.arrayBuffer());
          mime = res.headers.get('content-type') ?? '';
        }
      }
      let info = bytes ? imageInfo(bytes) : null;
      if (bytes && !info) {
        bytes = await asPng(bytes, mime);
        info = bytes ? imageInfo(bytes) : null;
      }
      out.set(img, bytes && info ? { name: `image${++count}.${info.type === 'jpeg' ? 'jpg' : info.type}`, bytes, info } : null);
    } catch {
      out.set(img, null);
    }
  }
  return out;
}

/** The bytes of a Word document for some HTML (or an element). */
export async function toDocxBytes(input: string | Element, options: DocxOptions = {}): Promise<Uint8Array> {
  const root = typeof input === 'string' ? new DOMParser().parseFromString(input, 'text/html').body : input;
  const page: DocxPage = { width: 210, height: 297, margin: 25.4, ...(options.page ?? {}) };
  const margin = twipsOfMm(page.margin);
  const width = Math.max(1440, twipsOfMm(page.width) - 2 * margin);
  const font = options.font ?? 'Calibri';
  const size = Math.round((options.fontSize ?? 11) * 2);
  const pictures = await loadPictures(root, options.images);
  const pkg = new Package();
  const ctx: Context = { width, base: {}, pictures };
  let body = blocks(root, ctx, pkg);
  if (!body || body.endsWith('</w:tbl>')) body += '<w:p/>'; // the text ends in a paragraph, as a document must
  const landscape = page.width > page.height;
  const section =
    `<w:sectPr><w:pgSz w:w="${twipsOfMm(page.width)}" w:h="${twipsOfMm(page.height)}"${landscape ? ' w:orient="landscape"' : ''}/>` +
    `<w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;
  const document =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W} ${R} ` +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<w:body>${body}${section}</w:body></w:document>`;

  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
    pkg.rels.map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${esc(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`).join('') +
    '</Relationships>';

  const types = new Set<string>();
  for (const p of pkg.pictures) types.add(p.info.type === 'jpeg' ? 'jpg' : p.info.type);
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    Array.from(types).map((t) => `<Default Extension="${t}" ContentType="${MIME[t === 'jpg' ? 'jpeg' : (t as ImageInfo['type'])]}"/>`).join('') +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '</Types>';

  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '</Relationships>';

  const core =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${esc(options.title ?? 'Document')}</dc:title><dc:creator>${esc(options.author ?? 'Aurebesh')}</dc:creator>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`;

  return zip([
    { name: '[Content_Types].xml', data: utf8(contentTypes) },
    { name: '_rels/.rels', data: utf8(rootRels) },
    { name: 'word/document.xml', data: utf8(document) },
    { name: 'word/_rels/document.xml.rels', data: utf8(rels) },
    { name: 'word/styles.xml', data: utf8(stylesXml(font, size)) },
    { name: 'word/numbering.xml', data: utf8(numberingXml(pkg)) },
    { name: 'docProps/core.xml', data: utf8(core) },
    ...pkg.pictures.map((p) => ({ name: `word/media/${p.name}`, data: p.bytes })),
  ]);
}

/** A Word document (.docx) for some HTML (or an element). */
export async function toDocx(input: string | Element, options: DocxOptions = {}): Promise<Blob> {
  const bytes = await toDocxBytes(input, options);
  return new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
