/** Plain text of the content, and character / word counts. */

export interface TextStats {
  /** Characters including spaces, without line breaks (what a "max length" is usually about). Emoji and accents count as one. */
  characters: number;
  /** Characters without any whitespace. */
  charactersNoSpaces: number;
  /** Words; uses the browser's word segmentation where it has one, so Chinese and Japanese are counted too. */
  words: number;
}

const BLOCKS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'PRE', 'TABLE', 'TR', 'ASIDE', 'HR']);

/**
 * The text of the content with a line break between blocks and `<br>`, and a tab between table cells:
 * what you would get by copying it as plain text (`textContent` would glue "one" and "two" together).
 */
export function plainText(root: Node): string {
  const parts: string[] = [];
  const lineBreak = () => {
    if (parts.length && !parts[parts.length - 1].endsWith('\n')) parts.push('\n');
  };
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.nodeValue ?? '');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = (node as Element).tagName;
    if (tag === 'BR') {
      parts.push('\n');
      return;
    }
    const block = BLOCKS.has(tag);
    if (block) lineBreak();
    node.childNodes.forEach(walk);
    if (tag === 'TD' || tag === 'TH') parts.push('\t');
    if (block) lineBreak();
  };
  root.childNodes.forEach(walk);
  return parts.join('').replace(/ /g, ' ').replace(/\t\n/g, '\n').replace(/\n+$/, '');
}

type Segmenter = { segment(input: string): Iterable<{ segment: string; isWordLike?: boolean }> };
const segmenter = (granularity: 'grapheme' | 'word'): Segmenter | null => {
  const Ctor = (Intl as unknown as { Segmenter?: new (locale?: string, o?: { granularity: string }) => Segmenter }).Segmenter;
  return Ctor ? new Ctor(undefined, { granularity }) : null;
};

const graphemes = segmenter('grapheme');
const wordSegmenter = segmenter('word');

/** Number of characters as a person counts them (an emoji or a letter with accents is one), ignoring line breaks and tabs. */
export function countCharacters(text: string): number {
  const clean = text.replace(/[\r\n\t]/g, '');
  if (!graphemes) return Array.from(clean).length;
  let n = 0;
  for (const _ of graphemes.segment(clean)) n++;
  return n;
}

export function countWords(text: string): number {
  if (wordSegmenter) {
    let n = 0;
    for (const s of wordSegmenter.segment(text)) if (s.isWordLike) n++;
    return n;
  }
  return (text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length;
}

export function countText(text: string): TextStats {
  return {
    characters: countCharacters(text),
    charactersNoSpaces: countCharacters(text.replace(/\s/g, '')),
    words: countWords(text),
  };
}

/** The first `max` characters of `text` (counted like `countCharacters`; line breaks and tabs are kept but cost nothing). */
export function truncateCharacters(text: string, max: number): string {
  let used = 0;
  let out = '';
  const pieces: Iterable<string> = graphemes ? Array.from(graphemes.segment(text), (s) => s.segment) : Array.from(text);
  for (const piece of pieces) {
    const free = /^[\r\n\t]+$/.test(piece);
    if (!free && used >= max) break;
    out += piece;
    if (!free) used++;
  }
  return out;
}
