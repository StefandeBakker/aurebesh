/**
 * Page formats: the width (and for paper the height) of the writing area, so the editor shows the document the way it
 * will be printed or shown. Everything here is plain data and strings; the editor does the rest.
 */

export type PagePreset = 'responsive' | 'a3' | 'a4' | 'a5' | 'a6' | 'letter' | 'legal' | 'ticket-80' | 'ticket-58';

export interface PageSpec {
  /** A preset to start from; the other fields override it. */
  format?: PagePreset;
  /** A number is pixels; a string is a CSS length in px, mm, cm, in or pt. */
  width?: number | string;
  /** Paper height. Without one the page is as long as the content (a ticket roll, a web page). */
  height?: number | string;
  /** Space between the edge and the text: one to four lengths, like CSS `padding`. */
  margin?: number | string;
  /** Swaps width and height (only for formats that have a height). */
  orientation?: 'portrait' | 'landscape';
}

/** A preset name, a width (a number is px, a string like `'80mm'`), or the full form. */
export type PageFormat = PagePreset | number | string | PageSpec;

export interface ResolvedPage {
  /** The preset name, or 'custom'. */
  name: string;
  /** CSS lengths. */
  width: string;
  height: string | null;
  margin: string;
  landscape: boolean;
}

interface Preset {
  width: string;
  height: string | null;
  margin: string;
}

export const PAGE_PRESETS: Record<Exclude<PagePreset, 'responsive'>, Preset> = {
  a3: { width: '297mm', height: '420mm', margin: '20mm' },
  a4: { width: '210mm', height: '297mm', margin: '20mm' },
  a5: { width: '148mm', height: '210mm', margin: '15mm' },
  a6: { width: '105mm', height: '148mm', margin: '10mm' },
  letter: { width: '215.9mm', height: '279.4mm', margin: '20mm' },
  legal: { width: '215.9mm', height: '355.6mm', margin: '20mm' },
  // thermal paper: the paper is 80 / 58 mm wide, the printable part a few mm less
  'ticket-80': { width: '80mm', height: null, margin: '4mm' },
  'ticket-58': { width: '58mm', height: null, margin: '3mm' },
};

export const PAGE_NAMES = ['responsive', ...Object.keys(PAGE_PRESETS)] as PagePreset[];

const LENGTH = '\\d{1,4}(?:\\.\\d{1,3})?(?:px|mm|cm|in|pt)';
const LENGTH_RE = new RegExp(`^${LENGTH}$`);
const MARGIN_RE = new RegExp(`^${LENGTH}(?: ${LENGTH}){0,3}$`);

const length = (value: number | string, what: string): string => {
  const s = typeof value === 'number' ? (Number.isFinite(value) && value > 0 && value <= 10000 ? `${value}px` : '') : value.trim().toLowerCase();
  if (!LENGTH_RE.test(s) || parseFloat(s) <= 0) throw new Error(`Aurebesh: invalid page ${what} "${value}" (use a number of pixels, or a length in px, mm, cm, in or pt)`);
  return s;
};

const margin = (value: number | string): string => {
  const s = typeof value === 'number' ? `${value}px` : value.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!MARGIN_RE.test(s)) throw new Error(`Aurebesh: invalid page margin "${value}" (one to four lengths in px, mm, cm, in or pt)`);
  return s;
};

const isPreset = (s: string): s is PagePreset => (PAGE_NAMES as string[]).includes(s);

/** The full form of what the user passed (a preset name, a width or the object), or null for nothing. */
export function toSpec(input: PageFormat | null | undefined): PageSpec | null {
  if (input === undefined || input === null || input === '') return null;
  if (typeof input === 'object') return input;
  if (typeof input === 'string' && isPreset(input.trim().toLowerCase())) return { format: input.trim().toLowerCase() as PagePreset };
  return { width: input };
}

/** Turns what the user passed into a page, or null for "responsive" (no fixed page). Throws on something invalid. */
export function resolvePage(input: PageFormat | null | undefined): ResolvedPage | null {
  const spec = toSpec(input);
  if (!spec) return null;

  if (spec.format === 'responsive' && spec.width === undefined) return null;
  const preset = spec.format && spec.format !== 'responsive' ? PAGE_PRESETS[spec.format] : undefined;
  if (spec.format && !preset && spec.format !== 'responsive') throw new Error(`Aurebesh: unknown page format "${spec.format}"`);
  if (!preset && spec.width === undefined) throw new Error('Aurebesh: a page needs a format or a width');

  let width = spec.width !== undefined ? length(spec.width, 'width') : preset!.width;
  let height = spec.height !== undefined ? length(spec.height, 'height') : preset?.height ?? null;
  const landscape = spec.orientation === 'landscape' && !!height;
  if (landscape) [width, height] = [height!, width];
  return {
    name: spec.format && spec.format !== 'responsive' && spec.width === undefined && spec.height === undefined ? spec.format : 'custom',
    width,
    height,
    margin: spec.margin !== undefined ? margin(spec.margin) : preset?.margin ?? '12px',
    landscape,
  };
}

/** The size of a CSS length in pixels (96 per inch, as in CSS). */
export function toPx(len: string): number {
  const n = parseFloat(len);
  if (/mm$/.test(len)) return (n * 96) / 25.4;
  if (/cm$/.test(len)) return (n * 96) / 2.54;
  if (/in$/.test(len)) return n * 96;
  if (/pt$/.test(len)) return (n * 96) / 72;
  return n;
}

/** The number of pages a document of this height takes: a page without a height is one page. */
export function countPages(page: ResolvedPage | null, contentHeightPx: number): number {
  if (!page?.height) return 1;
  return Math.max(1, Math.ceil(contentHeightPx / toPx(page.height) - 0.001));
}

const mm = (px: number) => Math.ceil((px * 25.4) / 96) + 1;

/**
 * A standalone HTML document of the content with the page format applied (`@page` size and margins), for printing or for
 * turning into a PDF. `css` is the editor's own stylesheet so the content looks the same; `font` carries the editor's text
 * style over. A page without a height gets one from `heightPx` (the browser cannot do "as long as the content" itself).
 */
export function printDocument(page: ResolvedPage | null, html: string, css: string, font: string, heightPx?: number, title = 'Document'): string {
  let pageRule: string;
  let contentPadding = '0';
  if (!page) {
    pageRule = '@page{margin:15mm}';
  } else if (page.height) {
    pageRule = `@page{size:${page.width} ${page.height};margin:${page.margin}}`;
  } else {
    // continuous paper: one page as long as the text; the margin is padding, since the page itself has none
    pageRule = `@page{size:${page.width} ${heightPx ? `${mm(heightPx)}mm` : '297mm'};margin:0}`;
    contentPadding = page.margin;
  }
  const width = page && !page.height ? `${page.width}` : 'auto';
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/[<>&"]/g, '')}</title><style>` +
    css +
    pageRule +
    `html,body{margin:0;background:#fff;color:#111;${font}}` +
    '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    `.aurebesh-content{box-sizing:border-box;width:${width};min-height:0;padding:${contentPadding};overflow:visible}` +
    '</style></head><body><div class="aurebesh-content">' +
    html +
    '</div></body></html>'
  );
}
