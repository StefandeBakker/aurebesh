import { SAFE_COLOR } from './colors';
import { insertImage, insertVideo, insertVideoFile } from './media';
import { addColumn, addRow, deleteColumn, deleteRow, deleteTable, insertTable } from './table';

/** Shown in a second toolbar row while the cursor is inside a table. */
export const TABLE_TOOLS = ['tableRowAdd', 'tableColAdd', 'tableRowDel', 'tableColDel', 'tableDel'];

export interface CommandDef {
  name: string;
  label: string;
  title: string;
  /** Runs the command on the current selection. */
  run: (arg?: string, extra?: string) => void;
  /** Whether the command is active at the current selection. */
  isActive?: () => boolean;
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

export const COMMANDS: Record<string, CommandDef> = {
  bold: { name: 'bold', label: 'B', title: 'Bold', run: () => exec('bold'), isActive: () => state('bold') },
  italic: { name: 'italic', label: 'I', title: 'Italic', run: () => exec('italic'), isActive: () => state('italic') },
  underline: { name: 'underline', label: 'U', title: 'Underline', run: () => exec('underline'), isActive: () => state('underline') },
  strike: { name: 'strike', label: 'S', title: 'Strikethrough', run: () => exec('strikeThrough'), isActive: () => state('strikeThrough') },
  h1: { name: 'h1', label: 'H1', title: 'Heading 1', run: toggleBlock('h1'), isActive: isBlock('h1') },
  h2: { name: 'h2', label: 'H2', title: 'Heading 2', run: toggleBlock('h2'), isActive: isBlock('h2') },
  quote: { name: 'quote', label: '❝', title: 'Quote', run: toggleBlock('blockquote'), isActive: isBlock('blockquote') },
  codeblock: { name: 'codeblock', label: '{ }', title: 'Code block', run: toggleBlock('pre'), isActive: isBlock('pre') },
  ul: { name: 'ul', label: '• List', title: 'Bullet list', run: () => exec('insertUnorderedList'), isActive: () => state('insertUnorderedList') },
  ol: { name: 'ol', label: '1. List', title: 'Numbered list', run: () => exec('insertOrderedList'), isActive: () => state('insertOrderedList') },
  link: {
    name: 'link',
    label: 'Link',
    title: 'Link',
    run: (url) => {
      if (url === undefined) url = window.prompt('URL') ?? '';
      if (url) exec('createLink', url);
      else exec('unlink');
    },
  },
  font: {
    name: 'font',
    label: 'Font',
    title: 'Font',
    run: (family) => {
      if (!family) return;
      exec('styleWithCSS', 'true'); // emit <span style="font-family"> instead of <font face>
      exec('fontName', family);
    },
  },
  color: {
    name: 'color',
    label: 'A',
    title: 'Text color',
    run: (value) => {
      if (!value || !SAFE_COLOR.test(value)) return;
      exec('styleWithCSS', 'true');
      exec('foreColor', value);
    },
  },
  highlight: {
    name: 'highlight',
    label: 'ab',
    title: 'Highlight color',
    run: (value) => {
      if (!value || !SAFE_COLOR.test(value)) return;
      exec('styleWithCSS', 'true');
      exec('hiliteColor', value);
    },
  },
  image: { name: 'image', label: '🖼', title: 'Image', run: (url, alt) => url && insertImage(url, alt) },
  video: { name: 'video', label: '▶', title: 'Video', run: (url) => url && insertVideo(url) },
  /** Not a toolbar item: used after an upload, when the URL may have no file extension. */
  videoFile: { name: 'videoFile', label: '', title: 'Video file', run: (url) => url && insertVideoFile(url) },
  table: {
    name: 'table',
    label: '▦',
    title: 'Table',
    run: (size) => {
      const m = size?.match(/^(\d+)x(\d+)$/);
      if (m) insertTable(Math.min(+m[1], 50), Math.min(+m[2], 20));
    },
  },
  tableRowAdd: { name: 'tableRowAdd', label: '+ Row', title: 'Insert row below', run: () => addRow() },
  tableColAdd: { name: 'tableColAdd', label: '+ Col', title: 'Insert column right', run: () => addColumn() },
  tableRowDel: { name: 'tableRowDel', label: '− Row', title: 'Delete row', run: () => deleteRow() },
  tableColDel: { name: 'tableColDel', label: '− Col', title: 'Delete column', run: () => deleteColumn() },
  tableDel: { name: 'tableDel', label: 'Delete table', title: 'Delete table', run: () => deleteTable() },
  clear: { name: 'clear', label: 'Tx', title: 'Clear formatting', run: () => exec('removeFormat') },
  undo: { name: 'undo', label: '↶', title: 'Undo', run: () => exec('undo') },
  redo: { name: 'redo', label: '↷', title: 'Redo', run: () => exec('redo') },
};

export const DEFAULT_TOOLBAR = [
  'font', '|', 'bold', 'italic', 'underline', 'strike', 'color', 'highlight', '|', 'h1', 'h2', 'quote', 'codeblock', '|', 'ul', 'ol', 'link', 'image', 'video', 'table', '|', 'clear', 'undo', 'redo',
];
