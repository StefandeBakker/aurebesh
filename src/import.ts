/**
 * Opening a file in the editor: what formats there are, which file is which, and the shape of what a reader of a format gives back
 * (the readers of the editor, and the ones that plugins bring: see `import` in `PluginInstance`).
 */
import type { CommentThread } from './comments';

/** What reading a file gives: the HTML, and what goes with it. */
export interface ImportedDocument {
  html: string;
  /** The page of the document, in CSS lengths (`210mm`). It is used when the editor has a page format of its own. */
  page?: { width: string; height: string; margin: string };
  /** The threads of comments that go with the `data-comment` marks in the HTML. They are used when the editor has `comments`. */
  comments?: CommentThread[];
  /** What was left out, in words for a person. */
  warnings?: string[];
}

/** What `importFile` tells when it is done (and the `imported` event). */
export interface ImportResult {
  /** The name of the file. */
  name: string;
  /** The format that was read: `docx`, `html`, `markdown`, `text`, or the name that a plugin reads (`pdf`). */
  format: string;
  /** What was left out of the file. */
  warnings: string[];
}

/** The largest file that is opened: a document is not this large, and a bigger file would only fill the memory. */
export const MAX_IMPORT_SIZE = 50 * 1024 * 1024;

/** The formats that the editor reads itself, by the extensions of their files. */
export const OWN_FORMATS: Record<string, string[]> = {
  docx: ['docx'],
  html: ['html', 'htm'],
  markdown: ['md', 'markdown'],
  text: ['txt', 'text'],
};

/** The extension of a file name, in lower case, without the dot ('' when there is none). */
export const extensionOf = (name: string): string => (/\.([A-Za-z0-9]+)$/.exec(name)?.[1] ?? '').toLowerCase();

/** The name of a file without its extension. */
export const baseName = (name: string): string => name.replace(/\.[A-Za-z0-9]+$/, '');

/** The format of a file of the editor itself, from its name; null for another one. */
export function ownFormat(name: string, type = ''): string | null {
  const ext = extensionOf(name);
  for (const [format, exts] of Object.entries(OWN_FORMATS)) if (exts.includes(ext)) return format;
  if (!ext) {
    if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
    if (type === 'text/html') return 'html';
    if (type === 'text/markdown') return 'markdown';
    if (type === 'text/plain') return 'text';
  }
  return null;
}
