import { SAFE_COLOR } from './colors';
import { currentColumns, setColumns } from './columns';
import { currentDirection, setDirection } from './direction';
import { currentLink, isInlineCode, setLink, toggleInlineCode } from './inline';
import { insertImage, insertVideo, insertVideoFile, setImageAlign, setImageAlt, setImageWidth } from './media';
import { addColumn, addRow, canMerge, canSplit, deleteColumn, deleteRow, deleteTable, insertTable, mergeCells, splitCell, toggleHeaderRow } from './table';

/** Shown in a second toolbar row while the cursor is inside a table. */
export const TABLE_TOOLS = ['tableHeader', 'tableRowAdd', 'tableColAdd', 'tableRowDel', 'tableColDel', 'tableMerge', 'tableSplit', 'tableDel'];

export interface CommandDef {
  name: string;
  label: string;
  title: string;
  /** Runs the command on the current selection. */
  run: (arg?: string, extra?: string) => void;
  /** Whether the command is active at the current selection. */
  isActive?: () => boolean;
  /** Whether the command can do anything at the current selection; the button is disabled when not. */
  isEnabled?: () => boolean;
}

const exec = (cmd: string, value?: string) => document.execCommand(cmd, false, value);
const state = (cmd: string) => {
  try {
    return document.queryCommandState(cmd);
  } catch {
    return false;
  }
};
const isBlock = (tag: string) => () => {
  try {
    return document.queryCommandValue('formatBlock').toLowerCase() === tag;
  } catch {
    return false;
  }
};
const toggleBlock = (tag: string) => () => exec('formatBlock', isBlock(tag)() ? 'p' : tag);

/**
 * Runs a command with `styleWithCSS` on (so it produces <span style="..."> / text-align instead of <font>/align),
 * and switches it off again. Leaving it on makes later commands such as Bold emit
 * <span style="font-weight: bold">, which the sanitizer would then strip.
 */
const withCss = (fn: () => void) => {
  exec('styleWithCSS', 'true');
  try {
    fn();
  } finally {
    exec('styleWithCSS', 'false');
  }
};

const align = (name: string, label: string, title: string, command: string): CommandDef => ({
  name,
  label,
  title,
  run: () => withCss(() => exec(command)),
  isActive: () => state(command),
});

export const COMMANDS: Record<string, CommandDef> = {
  bold: { name: 'bold', label: 'B', title: 'Bold', run: () => exec('bold'), isActive: () => state('bold') },
  italic: { name: 'italic', label: 'I', title: 'Italic', run: () => exec('italic'), isActive: () => state('italic') },
  underline: { name: 'underline', label: 'U', title: 'Underline', run: () => exec('underline'), isActive: () => state('underline') },
  strike: { name: 'strike', label: 'S', title: 'Strikethrough', run: () => exec('strikeThrough'), isActive: () => state('strikeThrough') },
  code: { name: 'code', label: '</>', title: 'Inline code', run: toggleInlineCode, isActive: isInlineCode },
  sup: { name: 'sup', label: 'x²', title: 'Superscript', run: () => exec('superscript'), isActive: () => state('superscript') },
  sub: { name: 'sub', label: 'x₂', title: 'Subscript', run: () => exec('subscript'), isActive: () => state('subscript') },
  h1: { name: 'h1', label: 'H1', title: 'Heading 1', run: toggleBlock('h1'), isActive: isBlock('h1') },
  h2: { name: 'h2', label: 'H2', title: 'Heading 2', run: toggleBlock('h2'), isActive: isBlock('h2') },
  /** Not in the default toolbar; reachable with Mod+Alt+3 and the `### ` Markdown shortcut. */
  h3: { name: 'h3', label: 'H3', title: 'Heading 3', run: toggleBlock('h3'), isActive: isBlock('h3') },
  quote: { name: 'quote', label: '❝', title: 'Quote', run: toggleBlock('blockquote'), isActive: isBlock('blockquote') },
  codeblock: { name: 'codeblock', label: '{ }', title: 'Code block', run: toggleBlock('pre'), isActive: isBlock('pre') },
  hr: { name: 'hr', label: '―', title: 'Horizontal line', run: () => exec('insertHorizontalRule') },
  ul: { name: 'ul', label: '• List', title: 'Bullet list', run: () => exec('insertUnorderedList'), isActive: () => state('insertUnorderedList') },
  ol: { name: 'ol', label: '1. List', title: 'Numbered list', run: () => exec('insertOrderedList'), isActive: () => state('insertOrderedList') },
  alignLeft: align('alignLeft', '≡', 'Align left', 'justifyLeft'),
  alignCenter: align('alignCenter', '≣', 'Align center', 'justifyCenter'),
  alignRight: align('alignRight', '≢', 'Align right', 'justifyRight'),
  alignJustify: align('alignJustify', '☰', 'Justify', 'justifyFull'),
  /** Not in the default toolbar: paragraphs already find their own direction; these force one (a second click goes back to automatic). */
  ltr: { name: 'ltr', label: '¶→', title: 'Left to right', run: () => setDirection('ltr'), isActive: () => currentDirection() === 'ltr' },
  rtl: { name: 'rtl', label: '←¶', title: 'Right to left', run: () => setDirection('rtl'), isActive: () => currentDirection() === 'rtl' },
  /** run(url): set or change the link; an empty url removes it. */
  link: { name: 'link', label: 'Link', title: 'Link', run: (url) => setLink(url ?? ''), isActive: () => !!currentLink() },
  font: {
    name: 'font',
    label: 'Font',
    title: 'Font',
    run: (family) => {
      if (family) withCss(() => exec('fontName', family));
    },
  },
  /** run('1'..'4'): newspaper-style columns for the selected blocks (1 removes them). */
  columns: {
    name: 'columns',
    label: 'Columns',
    title: 'Columns',
    run: (count) => setColumns(Number(count) || 1),
    isActive: () => currentColumns() > 1,
  },
  /** Ticket mode items: built by the ticket controller (see `ticket` in the options); these entries give them a label and tooltip. */
  ticketTag: { name: 'ticketTag', label: '[*]', title: 'Insert field', run: () => {} },
  ticketCmd: { name: 'ticketCmd', label: '[…]', title: 'Insert command', run: () => {} },
  ticketSize: { name: 'ticketSize', label: 'Size', title: 'Text size', run: () => {} },
  ticketCondition: { name: 'ticketCondition', label: 'If', title: 'Condition', run: () => {} },
  /** A button that turns the sheet to landscape and back; like `page` it is handled by the editor. */
  orientation: { name: 'orientation', label: '▭', title: 'Landscape', run: () => {} },
  /** A select in the toolbar, not in the default one; it is handled by the editor (`setPage`), since the format belongs to the editor, not the selection. */
  page: { name: 'page', label: 'Page', title: 'Page format', run: () => {} },
  /** run('1'..'7'): the browser's seven size steps (small .. huge). */
  size: {
    name: 'size',
    label: 'Size',
    title: 'Size',
    run: (step) => {
      if (step && /^[1-7]$/.test(step)) withCss(() => exec('fontSize', step));
    },
  },
  color: {
    name: 'color',
    label: 'A',
    title: 'Text color',
    run: (value) => {
      if (value && SAFE_COLOR.test(value)) withCss(() => exec('foreColor', value));
    },
  },
  highlight: {
    name: 'highlight',
    label: 'ab',
    title: 'Highlight color',
    run: (value) => {
      if (value && SAFE_COLOR.test(value)) withCss(() => exec('hiliteColor', value));
    },
  },
  image: { name: 'image', label: '🖼', title: 'Image', run: (url, alt) => url && insertImage(url, alt) },
  video: { name: 'video', label: '▶', title: 'Video', run: (url) => url && insertVideo(url) },
  /** Not a toolbar item: used after an upload, when the URL may have no file extension. */
  videoFile: { name: 'videoFile', label: '', title: 'Video file', run: (url) => url && insertVideoFile(url) },
  /** Not toolbar items: used by the image tools row, they act on the selected image. */
  imageWidth: { name: 'imageWidth', label: '', title: 'Image width', run: (percent) => setImageWidth(percent ?? '') },
  imageAlign: { name: 'imageAlign', label: '', title: 'Image alignment', run: (where) => setImageAlign(where ?? '') },
  imageAlt: { name: 'imageAlt', label: '', title: 'Alt text', run: (alt) => setImageAlt(alt ?? '') },
  table: {
    name: 'table',
    label: '▦',
    title: 'Table',
    run: (size) => {
      const m = size?.match(/^(\d+)x(\d+)$/);
      if (m) insertTable(Math.min(+m[1], 50), Math.min(+m[2], 20));
    },
  },
  tableHeader: { name: 'tableHeader', label: 'Header', title: 'Toggle header row', run: () => toggleHeaderRow() },
  tableRowAdd: { name: 'tableRowAdd', label: '+ Row', title: 'Insert row below', run: () => addRow() },
  tableColAdd: { name: 'tableColAdd', label: '+ Col', title: 'Insert column right', run: () => addColumn() },
  tableMerge: { name: 'tableMerge', label: 'Merge', title: 'Merge cells', run: () => mergeCells(), isEnabled: canMerge },
  tableSplit: { name: 'tableSplit', label: 'Split', title: 'Split cell', run: () => splitCell(), isEnabled: canSplit },
  tableRowDel: { name: 'tableRowDel', label: '− Row', title: 'Delete row', run: () => deleteRow() },
  tableColDel: { name: 'tableColDel', label: '− Col', title: 'Delete column', run: () => deleteColumn() },
  tableDel: { name: 'tableDel', label: 'Delete table', title: 'Delete table', run: () => deleteTable() },
  clear: { name: 'clear', label: 'Tx', title: 'Clear formatting', run: () => exec('removeFormat') },
  undo: { name: 'undo', label: '↶', title: 'Undo', run: () => exec('undo') },
  redo: { name: 'redo', label: '↷', title: 'Redo', run: () => exec('redo') },
};

export const DEFAULT_TOOLBAR = [
  'font', 'size', '|',
  'bold', 'italic', 'underline', 'strike', 'code', '|',
  'color', 'highlight', '|',
  'h1', 'h2', 'quote', 'codeblock', '|',
  'ul', 'ol', 'alignLeft', 'alignCenter', 'alignRight', 'columns', '|',
  'link', 'image', 'video', 'table', 'hr', '|',
  'clear', 'undo', 'redo',
];
