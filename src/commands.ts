import { SAFE_COLOR } from './colors';
import { currentColumns, setColumns } from './columns';
import { currentDirection, setDirection } from './direction';
import { currentLink, isInlineCode, setLink, toggleInlineCode } from './inline';
import { canIndent, indent } from './indent';
import { insertImage, insertVideo, insertVideoFile, setImageAlign, setImageAlt, setImageWidth } from './media';
import { addColumn, addRow, canMerge, canSplit, cellProperty, deleteColumn, deleteRow, deleteTable, hasCaption, insertTable, mergeCells, setCellBorder, setCellProperty, splitCell, toggleCaption, toggleCellProperty, toggleHeaderRow } from './table';

/** Shown in a second toolbar row while the cursor is inside a table. */
export const TABLE_TOOLS = ['tableHeader', 'tableRowAdd', 'tableColAdd', 'tableRowDel', 'tableColDel', 'tableMerge', 'tableSplit', 'tableDel'];
/** The look of the selected cells and the caption, also in that row: the colour pickers and the border width are built by the editor. */
export const CELL_TOOLS = ['cellAlignLeft', 'cellAlignCenter', 'cellAlignRight', 'cellAlignTop', 'cellAlignMiddle', 'cellAlignBottom', 'tableCaption'];

export interface CommandDef {
  name: string;
  /** The text on the button, when it has no icon. */
  label: string;
  /** The name of its icon (see icons.ts): drawn instead of the label. The tooltip and the accessible name stay the title. */
  icon?: string;
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
  icon: name,
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
  code: { name: 'code', icon: 'code', label: '</>', title: 'Inline code', run: toggleInlineCode, isActive: isInlineCode },
  sup: { name: 'sup', label: 'x²', title: 'Superscript', run: () => exec('superscript'), isActive: () => state('superscript') },
  sub: { name: 'sub', label: 'x₂', title: 'Subscript', run: () => exec('subscript'), isActive: () => state('subscript') },
  h1: { name: 'h1', label: 'H1', title: 'Heading 1', run: toggleBlock('h1'), isActive: isBlock('h1') },
  h2: { name: 'h2', label: 'H2', title: 'Heading 2', run: toggleBlock('h2'), isActive: isBlock('h2') },
  /** Not in the default toolbar; reachable with Mod+Alt+3 and the `### ` Markdown shortcut. */
  h3: { name: 'h3', label: 'H3', title: 'Heading 3', run: toggleBlock('h3'), isActive: isBlock('h3') },
  quote: { name: 'quote', icon: 'quote', label: '❝', title: 'Quote', run: toggleBlock('blockquote'), isActive: isBlock('blockquote') },
  codeblock: { name: 'codeblock', icon: 'codeblock', label: '{ }', title: 'Code block', run: toggleBlock('pre'), isActive: isBlock('pre') },
  hr: { name: 'hr', icon: 'hr', label: '―', title: 'Horizontal line', run: () => exec('insertHorizontalRule') },
  ul: { name: 'ul', icon: 'ul', label: '• List', title: 'Bullet list', run: () => exec('insertUnorderedList'), isActive: () => state('insertUnorderedList') },
  ol: { name: 'ol', icon: 'ol', label: '1. List', title: 'Numbered list', run: () => exec('insertOrderedList'), isActive: () => state('insertOrderedList') },
  alignLeft: align('alignLeft', '≡', 'Align left', 'justifyLeft'),
  alignCenter: align('alignCenter', '≣', 'Align center', 'justifyCenter'),
  alignRight: align('alignRight', '≢', 'Align right', 'justifyRight'),
  alignJustify: align('alignJustify', '☰', 'Justify', 'justifyFull'),
  /** Not in the default toolbar: paragraphs already find their own direction; these force one (a second click goes back to automatic). */
  ltr: { name: 'ltr', icon: 'ltr', label: '¶→', title: 'Left to right', run: () => setDirection('ltr'), isActive: () => currentDirection() === 'ltr' },
  rtl: { name: 'rtl', icon: 'rtl', label: '←¶', title: 'Right to left', run: () => setDirection('rtl'), isActive: () => currentDirection() === 'rtl' },
  /** run(url): set or change the link; an empty url removes it. */
  link: { name: 'link', icon: 'link', label: 'Link', title: 'Link', run: (url) => setLink(url ?? ''), isActive: () => !!currentLink() },
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
  indent: { name: 'indent', icon: 'indent', label: '→', title: 'Indent', run: () => indent(1), isEnabled: () => canIndent(1) },
  outdent: { name: 'outdent', icon: 'outdent', label: '←', title: 'Outdent', run: () => indent(-1), isEnabled: () => canIndent(-1) },
  /** Opens and closes the layout panel beside the text; handled by the editor. */
  layout: { name: 'layout', icon: 'layout', label: '⚙', title: 'Layout', run: () => {} },
  /** A button that makes the editor fill the window and back; handled by the editor, which owns the view. */
  fullscreen: { name: 'fullscreen', icon: 'fullscreen', label: '⛶', title: 'Full screen', run: () => {} },
  /** A button that turns the sheet to landscape and back; like `page` it is handled by the editor. */
  orientation: { name: 'orientation', icon: 'landscape', label: '▭', title: 'Landscape', run: () => {} },
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
    icon: 'textColor',
    label: 'A',
    title: 'Text color',
    run: (value) => {
      if (value && SAFE_COLOR.test(value)) withCss(() => exec('foreColor', value));
    },
  },
  highlight: {
    name: 'highlight',
    icon: 'highlight',
    label: 'ab',
    title: 'Highlight color',
    run: (value) => {
      if (value && SAFE_COLOR.test(value)) withCss(() => exec('hiliteColor', value));
    },
  },
  image: { name: 'image', icon: 'image', label: '🖼', title: 'Image', run: (url, alt) => url && insertImage(url, alt) },
  video: { name: 'video', icon: 'video', label: '▶', title: 'Video', run: (url) => url && insertVideo(url) },
  /** Not a toolbar item: used after an upload, when the URL may have no file extension. */
  videoFile: { name: 'videoFile', label: '', title: 'Video file', run: (url) => url && insertVideoFile(url) },
  /** Not toolbar items: used by the image tools row, they act on the selected image. */
  imageWidth: { name: 'imageWidth', label: '', title: 'Image width', run: (percent) => setImageWidth(percent ?? '') },
  imageAlign: { name: 'imageAlign', label: '', title: 'Image alignment', run: (where) => setImageAlign(where ?? '') },
  imageAlt: { name: 'imageAlt', label: '', title: 'Alt text', run: (alt) => setImageAlt(alt ?? '') },
  table: {
    name: 'table',
    icon: 'table',
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
  /** Cell properties: they work on the cells that are selected (or the one under the caret). The pickers are built by the editor. */
  cellBackground: { name: 'cellBackground', icon: 'cellFill', label: 'Fill', title: 'Cell background', run: (color) => setCellProperty('background-color', color ?? '') },
  cellBorderColor: { name: 'cellBorderColor', icon: 'cellBorder', label: 'Border', title: 'Border color', run: (color) => setCellBorder('color', color ?? '') },
  cellBorder: { name: 'cellBorder', icon: 'cellBorder', label: 'Border', title: 'Cell border', run: (width) => setCellBorder('width', width ?? '') },
  cellAlignLeft: { name: 'cellAlignLeft', icon: 'alignLeft', label: '⇤', title: 'Align cell text left', run: () => toggleCellProperty('text-align', 'left'), isActive: () => cellProperty('text-align') === 'left' },
  cellAlignCenter: { name: 'cellAlignCenter', icon: 'alignCenter', label: '↔', title: 'Center cell text', run: () => toggleCellProperty('text-align', 'center'), isActive: () => cellProperty('text-align') === 'center' },
  cellAlignRight: { name: 'cellAlignRight', icon: 'alignRight', label: '⇥', title: 'Align cell text right', run: () => toggleCellProperty('text-align', 'right'), isActive: () => cellProperty('text-align') === 'right' },
  cellAlignTop: { name: 'cellAlignTop', icon: 'cellAlignTop', label: '⤒', title: 'Align cell text to the top', run: () => toggleCellProperty('vertical-align', 'top'), isActive: () => cellProperty('vertical-align') === 'top' },
  cellAlignMiddle: { name: 'cellAlignMiddle', icon: 'cellAlignMiddle', label: '↕', title: 'Center cell text vertically', run: () => toggleCellProperty('vertical-align', 'middle'), isActive: () => cellProperty('vertical-align') === 'middle' },
  cellAlignBottom: { name: 'cellAlignBottom', icon: 'cellAlignBottom', label: '⤓', title: 'Align cell text to the bottom', run: () => toggleCellProperty('vertical-align', 'bottom'), isActive: () => cellProperty('vertical-align') === 'bottom' },
  tableCaption: { name: 'tableCaption', icon: 'caption', label: 'Caption', title: 'Table caption', run: () => toggleCaption(), isActive: hasCaption },
  clear: { name: 'clear', icon: 'clear', label: 'Tx', title: 'Clear formatting', run: () => exec('removeFormat') },
  undo: { name: 'undo', icon: 'undo', label: '↶', title: 'Undo', run: () => exec('undo') },
  redo: { name: 'redo', icon: 'redo', label: '↷', title: 'Redo', run: () => exec('redo') },
};

/**
 * The default toolbar: blocks of two rows. `|` starts a block and `/` a second row in it.
 * The font (typeface, size, clear formatting on top; character styles, highlight and colour below), the paragraph (lists; alignment),
 * the styles (headings and quote; inline code and code block, the two kinds of code side by side), what can be inserted (link, picture, video; table, line) and the layout (columns).
 * Undo and redo are not in it: they sit in a small strip of their own above it
 * (see DEFAULT_QUICKBAR). Items that are not in it have a place in the same blocks: `sub` `sup` after `strike`, `alignJustify`
 * `ltr` `rtl` after `alignRight`, `h3` after `h2`, and `page` `orientation` after `columns`.
 */
export const DEFAULT_TOOLBAR = [
  'font', 'size', 'clear', '/', 'bold', 'italic', 'underline', 'strike', 'highlight', 'color', '|',
  'ul', 'ol', '/', 'alignLeft', 'alignCenter', 'alignRight', '|',
  'h1', 'h2', 'quote', '/', 'code', 'codeblock', '|',
  'link', 'image', 'video', '/', 'table', 'hr', '|',
  'columns',
];

/** The strip above the toolbar. It is on when the default toolbar is used; set `quickbar` to change it. */
export const DEFAULT_QUICKBAR = ['undo', 'redo'];
