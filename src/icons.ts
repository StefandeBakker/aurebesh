/**
 * The icons of the toolbar: small line drawings on a 24 by 24 grid, drawn here as inline SVG so that the editor needs no icon font and
 * no image files. They take the colour of the text (`currentColor`), so they follow the theme and the pressed state of a button.
 */

type Attrs = Record<string, string | number>;
type Shape = [tag: 'path' | 'rect' | 'circle', attrs: Attrs];

/** Mirrors a drawing left to right (for the right-to-left counterpart of an icon). */
const mirror = (shapes: Shape[]): Shape[] => shapes.map(([tag, attrs]) => [tag, { ...attrs, transform: 'matrix(-1 0 0 1 24 0)' }]);

const dot = (cy: number): Shape => ['circle', { cx: 4.5, cy, r: 1.3, fill: 'currentColor', stroke: 'none' }];

const LTR: Shape[] = [
  ['path', { d: 'M13 3.5v9M17 3.5v9M13 3.5H9.5a3.5 3.5 0 0 0 0 7H13' }],
  ['path', { d: 'M4 18.5h15M15.5 15l3.5 3.5-3.5 3.5' }],
];

export const ICONS: Record<string, Shape[]> = {
  undo: [['path', { d: 'M9 14 4 9l5-5' }], ['path', { d: 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11' }]],
  redo: [['path', { d: 'M15 14l5-5-5-5' }], ['path', { d: 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13' }]],
  // a letter with an eraser: removes the formatting of the text
  clear: [
    ['path', { d: 'M3 18 7.5 6 12 18M4.8 14h5.4' }],
    ['path', { d: 'M22.8 11.9 18.6 7.7 12.2 14.1l4.2 4.2z' }],
    ['path', { d: 'M16.5 9.8l4.2 4.2' }],
  ],
  ul: [dot(6), dot(12), dot(18), ['path', { d: 'M9.5 6H21M9.5 12H21M9.5 18H21' }]],
  // the numbers are drawn as lines, so that the icon is only shapes
  ol: [['path', { d: 'M3.4 4.9 5 3.5v4.4', 'stroke-width': 1.25 }], ['path', { d: 'M3.3 11.2a1.7 1.7 0 0 1 3.3.4c0 1-1.3 1.7-3.3 2.9h3.5', 'stroke-width': 1.25 }], ['path', { d: 'M3.3 16.4h3.1l-1.7 2a1.7 1.7 0 1 1-1.5 2.4', 'stroke-width': 1.25 }], ['path', { d: 'M9.5 5.5H21M9.5 12H21M9.5 18.5H21' }]],
  alignLeft: [['path', { d: 'M4 6h16M4 10h10M4 14h16M4 18h10' }]],
  alignCenter: [['path', { d: 'M4 6h16M7 10h10M4 14h16M7 18h10' }]],
  alignRight: [['path', { d: 'M4 6h16M10 10h10M4 14h16M10 18h10' }]],
  alignJustify: [['path', { d: 'M4 6h16M4 10h16M4 14h16M4 18h16' }]],
  // quotation marks: two filled dots with a tail, like a printed “
  quote: [
    ['circle', { cx: 7.5, cy: 9, r: 2.7, fill: 'currentColor' }],
    ['path', { d: 'M5 10.5c-.2 3.4 1.2 5.4 3.6 6.4' }],
    ['circle', { cx: 16.5, cy: 9, r: 2.7, fill: 'currentColor' }],
    ['path', { d: 'M14 10.5c-.2 3.4 1.2 5.4 3.6 6.4' }],
  ],
  code: [['path', { d: 'M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12' }]],
  codeblock: [['rect', { x: 3, y: 4, width: 18, height: 16, rx: 2.5 }], ['path', { d: 'M9.5 9.5 7 12l2.5 2.5M14.5 9.5 17 12l-2.5 2.5' }]],
  link: [['path', { d: 'M10 7H7a5 5 0 0 0 0 10h3M14 7h3a5 5 0 0 1 0 10h-3M8.5 12h7' }]],
  image: [['rect', { x: 3, y: 4, width: 18, height: 16, rx: 2.5 }], ['circle', { cx: 9, cy: 9.5, r: 1.7 }], ['path', { d: 'M21 16l-5.5-5.5L7 19' }]],
  video: [['rect', { x: 2.5, y: 5, width: 19, height: 14, rx: 2.5 }], ['path', { d: 'M10.5 9.2v5.6l4.8-2.8z', fill: 'currentColor' }]],
  table: [['rect', { x: 3, y: 4, width: 18, height: 16, rx: 2.5 }], ['path', { d: 'M3 10h18M3 15h18M10 10v10' }]],
  // a line between two blocks of text
  hr: [['rect', { x: 5, y: 3.5, width: 14, height: 4.5, rx: 1.2 }], ['path', { d: 'M2.5 12h19', 'stroke-width': 2.6 }], ['rect', { x: 5, y: 16, width: 14, height: 4.5, rx: 1.2 }]],
  ltr: LTR,
  rtl: mirror(LTR),
  fullWidth: [['path', { d: 'M3 5v14M21 5v14M7.5 12h9M10.5 8.5 7 12l3.5 3.5M13.5 8.5 17 12l-3.5 3.5' }]],
  trash: [['path', { d: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5' }]],
  landscape: [['rect', { x: 3, y: 6.5, width: 18, height: 11, rx: 2 }], ['path', { d: 'M7 10.5h6M7 13.5h10' }]],
};

const SVG = 'http://www.w3.org/2000/svg';

/** The icon as an SVG element, or null when there is none by that name. It is hidden from assistive technology: the button has a label. */
export function iconElement(doc: Document, name: string | undefined): SVGSVGElement | null {
  const shapes = name ? ICONS[name] : undefined;
  if (!shapes) return null;
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'aurebesh-icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const [tag, attrs] of shapes) {
    const el = doc.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    svg.appendChild(el);
  }
  return svg;
}
