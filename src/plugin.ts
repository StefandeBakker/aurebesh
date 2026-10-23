/**
 * Plugins: a way to add a mode or a set of tools to the editor without the editor knowing about it. A plugin is a plain object
 * that is handed over in the `plugins` option:
 *
 *     new Aurebesh(el, { plugins: [myPlugin({ ...its own options })] });
 *
 * A plugin can add toolbar items (they go through the same blocks as every other item: `|`, `/`, `#Name`, `>`), panels in the
 * sidebar, texts, styles, icons, events, output formats and what the sanitizer lets through; and it can take over keys, paste and
 * drop. It reaches the editor only through the context it is given, and the editor reaches it only through what it returns.
 */
import type { CommandDef } from './commands';
import type { Shape } from './icons';
import type { SanitizeExtension } from './sanitize';
import type { Aurebesh } from './editor';
import type { ImportedDocument } from './import';

export type { Shape, SanitizeExtension };

/** A panel for the sidebar. The toolbar gets an item with the id of the panel, which opens and closes it. */
export interface PluginPanel {
  /** Also the name of the toolbar item that opens it. */
  id: string;
  /** Shown in the header of the sidebar (and on the tab when there are several panels). Also the tooltip of the toolbar item. */
  title: string;
  /** The name of an icon (from `icons`, or a built-in one) for the toolbar item. Without one the item shows `label`. */
  icon?: string;
  /** The text on the toolbar item when it has no icon. Default: the first letters of the title. */
  label?: string;
  /** Builds what is in the panel. Called once, while the editor is built; the editor itself is ready after `attach`. */
  build(): HTMLElement;
}

export interface AurebeshPlugin {
  /** Unique; `editor.plugin(name)` returns the `api` of the plugin under it. */
  name: string;
  /** Styles of the plugin, added to the page once. */
  css?: string;
  /** Texts of the plugin, below the `labels` the user gives. Use keys like `ui.<name>.something`. */
  labels?: Record<string, string>;
  /** Toolbar items: a name with a label and a tooltip, and what it does (`run`, when it is a plain button). */
  commands?: Record<string, CommandDef>;
  /** Icons for those items (line drawings on a 24 by 24 grid, see `icons.ts`). */
  icons?: Record<string, Shape[]>;
  /** What the sanitizer lets through for this editor (extra attributes per tag, and a hook that cleans an element). */
  sanitize?: SanitizeExtension;
  /** Names of the events the plugin sends with `emit`; the custom element passes them on as DOM events. */
  events?: string[];
  /** Panels for the sidebar. */
  panels?: PluginPanel[];
  /** Called once for every editor, while it is built. */
  setup(context: PluginContext): PluginInstance;
}

/** What the plugin can use. `content` and `stage` exist from `attach` on (the toolbar is built before them). */
export interface PluginContext {
  readonly editor: Aurebesh;
  readonly doc: Document;
  readonly root: HTMLElement;
  readonly content: HTMLElement;
  readonly stage: HTMLElement;
  /** A text of the editor or of the plugin, in the language of the labels. `{name}` is filled in from `vars`. */
  t(key: string, vars?: Record<string, string>): string;
  /** The tooltip of a command (the user's label, or its title). */
  titleOf(command: string): string;
  /** The content changed by something other than typing: the editor reports it (`change`) and updates the toolbar. */
  changed(): void;
  /** Sends an event, to `editor.on(name)` and, when it is in `events`, as a DOM event of the element. */
  emit(name: string, detail?: unknown): void;
  /** Shows a message at the foot of the editor and sends `error`. */
  fail(error: unknown): void;
  /** Adds a listener that is removed again when the editor is destroyed. */
  listen(target: EventTarget, type: string, fn: (e: Event) => void): void;
  focus(): void;
  /**
   * Puts HTML or a node in the text, at the caret or at a point of the screen (`at`: the `clientX`/`clientY` of a drop). It is sanitized
   * (what the plugin wants to keep goes in its `sanitize`) and is one step for undo. False when nothing was inserted.
   */
  insert(content: string | Node, at?: { x: number; y: number }): boolean;
  restoreSelection(): void;
  /** For a popover: closes it on a click outside it and on Escape. */
  closeOnOutside(wrap: HTMLElement, pop: HTMLElement, toggle: HTMLElement): void;
  isEditable(): boolean;
  /** Opens a panel of the sidebar, closes it, or asks which one is open. */
  openPanel(id: string): void;
  closePanel(): void;
  openPanelId(): string | null;
}

export interface PluginInstance {
  /** The toolbar when the user gives none (instead of the default one). */
  toolbar?: string[];
  /** Items that are added to the toolbar, also when the user gives their own (they are left out where the user already has them). */
  toolbarExtend?: ToolbarExtension[];
  /** Builds a toolbar item of the plugin. Return undefined for an item that is not the plugin's. */
  buildItem?(item: string): HTMLElement | null | undefined;
  /** The editor is built: `content` and `stage` can be used. */
  attach?(): void;
  /** Return true when the key was dealt with: the editor then leaves it alone. */
  keydown?(e: KeyboardEvent): boolean | void;
  paste?(e: ClipboardEvent): boolean | void;
  /** Something is dragged over the text. Return true when the plugin accepts it (a browser only sends `drop` to a target that does). */
  dragover?(e: DragEvent): boolean | void;
  drop?(e: DragEvent): boolean | void;
  /** The user typed, or the content was set. */
  input?(): void;
  /** Read-only was switched on or off. */
  readOnlyChanged?(): void;
  destroy?(): void;
  /** Extra output formats: `editor.getValue('name')`, and the `format` of the element. */
  output?: Record<string, () => string>;
  /**
   * Formats to save as a file (the `export` item and `editor.export('name')`): a function that gives the file, as a `Blob` (any kind of file)
   * or as text, also late (a promise). The name is the extension. A name that the editor has (such as `pdf`) is made by the plugin instead.
   */
  export?: Record<string, () => Blob | string | Promise<Blob | string>>;
  /**
   * Formats that the plugin can open (the `import` item and `editor.importFile()`), by the extension of the file (`pdf`): a function that
   * reads the file and gives the HTML, or an object with the HTML and what goes with it. A format that the editor has itself (`docx`) is read
   * by the plugin instead.
   */
  import?: Record<string, (file: Blob, name: string) => ImportedDocument | string | Promise<ImportedDocument | string>>;
  /** The other side of `output`: reads a value of that format and returns HTML, for `editor.setValue(value, 'name')`. */
  load?: Record<string, (value: string) => string>;
  /** What `editor.plugin(name)` returns. */
  api?: object;
  /** The default of `markdownShortcuts` while this plugin is in. */
  markdownShortcuts?: boolean;
}

/** Where a plugin puts items in the toolbar: after or before an item (a name, not a `#Group`), or at the end when there is no such item. */
export interface ToolbarExtension {
  after?: string;
  before?: string;
  /** Same blocks as every toolbar: names, `|`, `/`, `#Name`, `>`. */
  items: string[];
}

const SEPARATORS = new Set(['|', '/', '>']);

/** The toolbar with the items of the plugins in it. A name that is in the toolbar already is not added a second time. */
export function extendToolbar(items: string[], extensions: ToolbarExtension[]): string[] {
  const out = [...items];
  for (const ext of extensions) {
    const add = ext.items.filter((i) => SEPARATORS.has(i) || i.startsWith('#') || !out.includes(i));
    if (!add.some((i) => !SEPARATORS.has(i) && !i.startsWith('#'))) continue; // only separators and groups: nothing to show
    const anchor = ext.after ?? ext.before;
    const at = anchor ? out.indexOf(anchor) : -1;
    if (at < 0) out.push(...add);
    else out.splice(ext.after ? at + 1 : at, 0, ...add);
  }
  return out;
}

/** Gives a plugin its type checking. It returns the plugin as it is. */
export const definePlugin = <T extends AurebeshPlugin>(plugin: T): T => plugin;
