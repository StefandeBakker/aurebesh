/**
 * The icons of the toolbar: small line drawings on a 24 by 24 grid, drawn here as inline SVG so that the editor needs no icon font and
 * no image files. They take the colour of the text (`currentColor`), so they follow the theme and the pressed state of a button.
 */

type Attrs = Record<string, string | number>;
export type Shape = [tag: 'path' | 'rect' | 'circle', attrs: Attrs];

/** Mirrors a drawing left to right (for the right-to-left counterpart of an icon). */
const mirror = (shapes: Shape[]): Shape[] => shapes.map(([tag, attrs]) => [tag, { ...attrs, transform: 'matrix(-1 0 0 1 24 0)' }]);

const dot = (cy: number): Shape => ['circle', { cx: 4.5, cy, r: 1.3, fill: 'currentColor', stroke: 'none' }];

const LTR: Shape[] = [
  ['path', { d: 'M13 3.5v9M17 3.5v9M13 3.5H9.5a3.5 3.5 0 0 0 0 7H13' }],
  ['path', { d: 'M4 18.5h15M15.5 15l3.5 3.5-3.5 3.5' }],
];

export const ICONS: Record<string, Shape[]> = {
  // the bar under the letter and the pen shows the colour that was chosen last (see .aurebesh-icon-swatch in the styles)
  textColor: [['path', { d: 'M5 16 12 2.5 19 16M7.4 11.5h9.2' }], ['rect', { x: 3.5, y: 19.3, width: 17, height: 3, rx: 0.8, class: 'aurebesh-icon-swatch' }]],
  highlight: [
    ['path', { d: 'M14.3 2.8l6 6-8.4 8.4-6-6z' }],
    ['path', { d: 'M5.9 11.2 3.6 16.4l1.7 1.5 5.3-2.3M9.4 7.7l6 6' }],
    ['rect', { x: 3.5, y: 19.3, width: 17, height: 3, rx: 0.8, class: 'aurebesh-icon-swatch' }],
  ],
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
  // a box with a check, and a line of text
  task: [['rect', { x: 3.5, y: 4, width: 6, height: 6, rx: 1.2 }], ['path', { d: 'M5 7l1.4 1.4L8.4 6' }], ['path', { d: 'M13 7h7.5M13 17.5h7.5' }], ['rect', { x: 3.5, y: 14.5, width: 6, height: 6, rx: 1.2 }]],
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
  indent: [['path', { d: 'M4 5h16M12 9.5h8M12 14.5h8M4 19h16' }], ['path', { d: 'M4 9l3.5 3L4 15z' }]],
  outdent: [['path', { d: 'M4 5h16M12 9.5h8M12 14.5h8M4 19h16' }], ['path', { d: 'M7.5 9 4 12l3.5 3z' }]],
  // two sliders
  layout: [['path', { d: 'M4 8h9M19 8h1M4 16h1M11 16h9' }], ['circle', { cx: 16, cy: 8, r: 2.6 }], ['circle', { cx: 8, cy: 16, r: 2.6 }]],
  close: [['path', { d: 'M6 6l12 12M18 6 6 18' }]],
  // a bucket with a bar in the colour of the fill (see .aurebesh-icon-swatch in the styles)
  cellFill: [
    ['path', { d: 'M4.5 11.5 10.5 5.5l6 6-6 6z' }],
    ['path', { d: 'M8 4l2.5 2.5M19 13.5c1 1.5 1.6 2.4 1.6 3.2a1.6 1.6 0 0 1-3.2 0c0-.8.6-1.7 1.6-3.2z' }],
    ['rect', { x: 3.5, y: 19.3, width: 17, height: 3, rx: 0.8, class: 'aurebesh-icon-swatch' }],
  ],
  cellBorder: [['rect', { x: 4, y: 3.5, width: 16, height: 13, rx: 1.5, 'stroke-width': 2.6 }], ['rect', { x: 3.5, y: 19.3, width: 17, height: 3, rx: 0.8, class: 'aurebesh-icon-swatch' }]],
  // a row or a column, copied (two of them) and pasted (on a clipboard)
  rowCopy: [['rect', { x: 3, y: 4, width: 14, height: 6, rx: 1.2 }], ['rect', { x: 7, y: 13, width: 14, height: 6, rx: 1.2 }]],
  colCopy: [['rect', { x: 4, y: 3, width: 6, height: 14, rx: 1.2 }], ['rect', { x: 13, y: 7, width: 6, height: 14, rx: 1.2 }]],
  rowPaste: [['rect', { x: 4, y: 5, width: 16, height: 16, rx: 2 }], ['path', { d: 'M9 3.5h6v3H9zM8 13.5h8' }]],
  colPaste: [['rect', { x: 4, y: 5, width: 16, height: 16, rx: 2 }], ['path', { d: 'M9 3.5h6v3H9zM12 10v7' }]],
  moveUp: [['path', { d: 'M12 20V6M6.5 11.5 12 6l5.5 5.5' }]],
  moveDown: [['path', { d: 'M12 4v14M6.5 12.5 12 18l5.5-5.5' }]],
  moveLeft: [['path', { d: 'M20 12H6M11.5 6.5 6 12l5.5 5.5' }]],
  moveRight: [['path', { d: 'M4 12h14M12.5 6.5 18 12l-5.5 5.5' }]],
  // the building blocks: four of them, a heading, a text, a button
  blocks: [['rect', { x: 3.5, y: 3.5, width: 7, height: 7, rx: 1.4 }], ['rect', { x: 13.5, y: 3.5, width: 7, height: 7, rx: 1.4 }], ['rect', { x: 3.5, y: 13.5, width: 7, height: 7, rx: 1.4 }], ['rect', { x: 13.5, y: 13.5, width: 7, height: 7, rx: 1.4 }]],
  blockHeading: [['path', { d: 'M5 5v14M19 5v14M5 12h14' }]],
  blockText: [['path', { d: 'M4 6h16M4 10h16M4 14h16M4 18h9' }]],
  blockButton: [['rect', { x: 3, y: 8, width: 18, height: 8, rx: 3 }], ['path', { d: 'M8 12h8' }]],
  // a window with a sidebar on the right
  sidebar: [['rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }], ['path', { d: 'M15 4v16' }]],
  // a box with a bar on its left side and a line of text
  callout: [['rect', { x: 3.5, y: 4.5, width: 17, height: 15, rx: 2 }], ['path', { d: 'M3.5 4.5v15M8.5 10h8M8.5 14h5' }]],
  cellAlignTop: [['rect', { x: 4, y: 4, width: 16, height: 16, rx: 1.5 }], ['path', { d: 'M8 8h8' }]],
  cellAlignMiddle: [['rect', { x: 4, y: 4, width: 16, height: 16, rx: 1.5 }], ['path', { d: 'M8 12h8' }]],
  cellAlignBottom: [['rect', { x: 4, y: 4, width: 16, height: 16, rx: 1.5 }], ['path', { d: 'M8 16h8' }]],
  caption: [['path', { d: 'M7 4.5h10' }], ['rect', { x: 3, y: 9, width: 18, height: 11, rx: 1.5 }], ['path', { d: 'M3 14.5h18M10 9v11' }]],
  fullscreen: [['path', { d: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5' }]],
  fullWidth: [['path', { d: 'M3 5v14M21 5v14M7.5 12h9M10.5 8.5 7 12l3.5 3.5M13.5 8.5 17 12l-3.5 3.5' }]],
  trash: [['path', { d: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5' }]],
  landscape: [['rect', { x: 3, y: 6.5, width: 18, height: 11, rx: 2 }], ['path', { d: 'M7 10.5h6M7 13.5h10' }]],
};

const SVG = 'http://www.w3.org/2000/svg';

/** The icon as an SVG element, or null when there is none by that name. It is hidden from assistive technology: the button has a label. */
export function iconElement(doc: Document, name: string | undefined, extra?: Record<string, Shape[]>): SVGSVGElement | null {
  const shapes = name ? extra?.[name] ?? ICONS[name] : undefined;
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
