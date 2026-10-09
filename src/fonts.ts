export interface FontDef {
  /** Label shown in the font picker. */
  name: string;
  /** CSS font-family list. Only letters, digits, spaces, commas, quotes, dots and dashes are allowed. */
  family: string;
}

/**
 * Built-in fonts. These are font *stacks* of typefaces that ship with the operating system
 * (the "modern font stacks" approach), so there is nothing to download or license.
 * The look differs slightly per OS; the last entry of each stack is a generic fallback.
 */
export const DEFAULT_FONTS: FontDef[] = [
  { name: 'System', family: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { name: 'Humanist', family: "Seravek, 'Gill Sans Nova', Ubuntu, Calibri, 'DejaVu Sans', sans-serif" },
  { name: 'Grotesque', family: "Inter, Roboto, 'Helvetica Neue', 'Arial Nova', Arial, sans-serif" },
  { name: 'Geometric', family: "Avenir, Montserrat, Corbel, 'URW Gothic', 'Century Gothic', sans-serif" },
  { name: 'Flare', family: "Optima, Candara, 'Noto Sans', sans-serif" },
  { name: 'Transitional', family: "Charter, 'Bitstream Charter', 'Sitka Text', Cambria, serif" },
  { name: 'Old Style', family: "'Iowan Old Style', 'Palatino Linotype', Palatino, P052, serif" },
  { name: 'Classic Serif', family: "'Times New Roman', Times, 'Liberation Serif', serif" },
  { name: 'Didone', family: "Didot, 'Bodoni MT', 'Noto Serif Display', 'Times New Roman', serif" },
  { name: 'Slab Serif', family: "Rockwell, 'Rockwell Nova', 'Roboto Slab', 'DejaVu Serif', serif" },
  { name: 'Monospace', family: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace" },
  { name: 'Typewriter', family: "'Courier New', Courier, 'Liberation Mono', monospace" },
  { name: 'Rounded', family: "ui-rounded, 'Hiragino Maru Gothic ProN', Quicksand, Comfortaa, Calibri, sans-serif" },
  { name: 'Handwritten', family: "'Segoe Print', 'Bradley Hand', Chilanka, 'Comic Sans MS', cursive" },
  { name: 'Condensed', family: "Impact, Haettenschweiler, 'Franklin Gothic Condensed', 'Arial Narrow Bold', sans-serif" },
];

/** Only allow plain font-family lists; no `;`, `(`, `:` or `url(...)`. */
export const SAFE_FAMILY = /^[\w\s,'"\-.]+$/;

/** First family name of a stack, lowercased and unquoted, for matching against what the browser reports. */
export function firstFamily(family: string): string {
  return family.split(',')[0].trim().replace(/^['"]|['"]$/g, '').toLowerCase();
}
