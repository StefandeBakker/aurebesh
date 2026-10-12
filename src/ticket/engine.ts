/**
 * Ticket templates: a text format with `[*tags*]` for fixed-width printers (receipts, order slips).
 *
 *   [*center*]Order [*Order.Number,"%6s"*]        field with a format
 *   [*groot*]TOTAL[*normaal*]                      size command (stays until the next one)
 *   [*If Order.Type,"1"*]...[*Endif*]              condition (also in the middle of a line, and nested)
 *   [*euro*] [*include "Footer.txt"*] [*cutbon*]   commands
 *
 * This file knows nothing about the browser: it reads such a template into lines of items (the model the editor shows),
 * writes it back, and works out what a template prints for a chosen set of values (the preview). The words used for
 * sizes, alignment and commands are configurable.
 */

// ---- configuration ----------------------------------------------------------------------------------------

import { isSafeImageSrc } from '../media-urls';

export interface TicketKeyword {
  /** The name used in the template, e.g. `Order.Total`. Matching is case-insensitive. */
  name: string;
  label?: string;
  /** The format used when the keyword is inserted, e.g. `%8s`. */
  format?: string;
  /** What the preview prints for it. */
  sample?: string;
}

export interface TicketCommand {
  name: string;
  label?: string;
  /**
   * What it does: `text` prints `display` (a euro sign), `include` prints a file (it takes a name), `break` is a line break
   * inside a line, `cut` cuts the paper, `logo` prints a stored logo. Default `text`.
   */
  kind?: 'text' | 'include' | 'break' | 'cut' | 'logo';
  display?: string;
  /** For a `logo`: the picture the preview shows (a data: URI or an address). */
  image?: string;
}

export interface TicketSize {
  name: string;
  label?: string;
  /** Printer columns used by one character, and its height in lines. */
  width: number;
  height: number;
}

export interface TicketOptions {
  keywords?: TicketKeyword[];
  /** Characters per line at the normal size. Default 41. */
  columns?: number;
  /** Text sizes; the first is the normal one. Default `normaal`, `groot` (twice as high), `extragroot` (twice as wide and high). */
  sizes?: TicketSize[];
  /** The words for alignment. Default `left`, `center`, `right`. */
  align?: { left?: string; center?: string; right?: string };
  commands?: TicketCommand[];
  /** Line ending of the code. Default `\n`. */
  eol?: '\n' | '\r\n';
  /** The template code to start with. */
  template?: string;
  /** Show a faint line every 10 columns in the layout. A switch in the panel changes it. Default true. */
  ruler?: boolean;
  /** The width of the paper in printer dots, to show a logo at the size it prints. Default 576 (80 mm paper). */
  dots?: number;
  /** The other parts of the ticket (header, item lines, footers...), to see the whole ticket in the panel. */
  parts?: TicketPart[];
  /** The name of the part this editor is for; its code is the editor's own. */
  part?: string;
  /** Test data for the preview. */
  data?: TicketData;
}

export type Align = 'left' | 'center' | 'right';

export interface ResolvedTicket {
  columns: number;
  dots: number;
  eol: string;
  sizes: TicketSize[];
  defaultSize: string;
  sizeByKey: Map<string, TicketSize>;
  alignName: Record<Align, string>;
  alignByKey: Map<string, Align>;
  commands: TicketCommand[];
  commandByKey: Map<string, TicketCommand>;
  keywords: TicketKeyword[];
  keywordByKey: Map<string, TicketKeyword>;
}

const NAME = /^[A-Za-z][\w.]{0,63}$/;

export const DEFAULT_TICKET_SIZES: TicketSize[] = [
  { name: 'normaal', label: 'Normal', width: 1, height: 1 },
  { name: 'groot', label: 'Large', width: 1, height: 2 },
  { name: 'extragroot', label: 'Extra large', width: 2, height: 2 },
];

export const DEFAULT_TICKET_COMMANDS: TicketCommand[] = [
  { name: 'euro', label: 'Euro sign', kind: 'text', display: '€' },
  { name: 'include', label: 'Include a file', kind: 'include' },
  { name: 'logo1', label: 'Logo', kind: 'logo' },
  { name: 'crlf', label: 'Line break', kind: 'break' },
  { name: 'cutbon', label: 'Cut', kind: 'cut' },
];

const checkName = (name: string, what: string): string => {
  if (typeof name !== 'string' || !NAME.test(name)) throw new Error(`Aurebesh: invalid ticket ${what} "${name}" (letters, digits, _ and . only)`);
  return name;
};

/** Fills in the defaults and checks the names (they end up in generated markup and CSS). */
export function resolveTicket(o: TicketOptions = {}): ResolvedTicket {
  const columns = o.columns ?? 41;
  if (!Number.isInteger(columns) || columns < 10 || columns > 200) throw new Error('Aurebesh: ticket columns must be a whole number from 10 to 200');
  const sizes = (o.sizes ?? DEFAULT_TICKET_SIZES).map((s) => {
    checkName(s.name, 'size name');
    for (const n of [s.width, s.height]) if (!Number.isInteger(n) || n < 1 || n > 8) throw new Error(`Aurebesh: ticket size "${s.name}" needs a width and height from 1 to 8`);
    return s;
  });
  if (!sizes.length) throw new Error('Aurebesh: a ticket needs at least one size');
  const alignName: Record<Align, string> = { left: 'left', center: 'center', right: 'right', ...o.align } as Record<Align, string>;
  for (const a of ['left', 'center', 'right'] as const) checkName(alignName[a], 'alignment name');
  const commands = (o.commands ?? DEFAULT_TICKET_COMMANDS).map((c) => {
    if (c.image !== undefined && !isSafeImageSrc(c.image)) throw new Error(`Aurebesh: the image of ticket command "${c.name}" is not a safe address`);
    return { ...c, kind: c.kind ?? 'text', name: checkName(c.name, 'command name') };
  });
  const dots = o.dots ?? 576;
  if (!Number.isInteger(dots) || dots < 100 || dots > 4000) throw new Error('Aurebesh: ticket dots must be a whole number from 100 to 4000');
  const keywords = (o.keywords ?? []).map((k) => ({ ...k, name: checkName(k.name, 'keyword') }));
  const key = (s: string) => s.toLowerCase();
  const sizeByKey = new Map(sizes.map((s) => [key(s.name), s]));
  const alignByKey = new Map<string, Align>((['left', 'center', 'right'] as const).map((a) => [key(alignName[a]), a]));
  return {
    columns,
    dots,
    eol: o.eol ?? '\n',
    sizes,
    defaultSize: sizes[0].name,
    sizeByKey,
    alignName,
    alignByKey,
    commands,
    commandByKey: new Map(commands.map((c) => [key(c.name), c])),
    keywords,
    keywordByKey: new Map(keywords.map((k) => [key(k.name), k])),
  };
}

/** Does this command put something on the paper (so that alignment and size matter for it)? */
export const printsText = (c: TicketCommand | undefined): boolean => !c || c.kind === 'text' || c.kind === 'include';

// ---- tokens: the template as it is written ------------------------------------------------------------------

export type Token =
  | { k: 'text'; text: string }
  | { k: 'nl' }
  | { k: 'field'; name: string; fmt?: string }
  | { k: 'cmd'; name: string; arg?: string }
  | { k: 'size'; name: string }
  | { k: 'align'; name: Align }
  | { k: 'if'; field: string; value?: string; not: boolean }
  | { k: 'endif' };

const TAG = /\[\*([\s\S]*?)\*\]/g;
const COND = /^(if|ifnot)\s+(\S.*)$/i;
const COND_ARG = /^([^,\s"]+)\s*(?:,\s*"([^"]*)")?$/;
const WITH_ARG = /^([^,\s"]+)\s+"([^"]*)"$/;
const FIELD = /^([^,\s"]+)\s*(?:,\s*"([^"]*)")?$/;

function pushText(out: Token[], s: string): void {
  const parts = s.split(/\r?\n/);
  parts.forEach((part, i) => {
    if (i > 0) out.push({ k: 'nl' });
    if (part) out.push({ k: 'text', text: part });
  });
}

/** Reads template code into tokens. A tag it does not understand stays in the text as it is. */
export function lex(code: string, R: ResolvedTicket): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of code.matchAll(TAG)) {
    pushText(out, code.slice(last, m.index));
    last = m.index! + m[0].length;
    const inner = m[1].trim();
    const cond = COND.exec(inner);
    const arg = cond ? COND_ARG.exec(cond[2].trim()) : null;
    if (cond && arg) {
      out.push({ k: 'if', field: arg[1], value: arg[2], not: cond[1].toLowerCase() === 'ifnot' });
      continue;
    }
    if (/^endif$/i.test(inner)) {
      out.push({ k: 'endif' });
      continue;
    }
    const withArg = WITH_ARG.exec(inner);
    if (withArg && R.commandByKey.get(withArg[1].toLowerCase())?.kind === 'include') {
      out.push({ k: 'cmd', name: R.commandByKey.get(withArg[1].toLowerCase())!.name, arg: withArg[2] });
      continue;
    }
    const f = FIELD.exec(inner);
    if (f) {
      const key = f[1].toLowerCase();
      const size = R.sizeByKey.get(key);
      const align = R.alignByKey.get(key);
      const cmd = R.commandByKey.get(key);
      if (f[2] === undefined && size) out.push({ k: 'size', name: size.name });
      else if (f[2] === undefined && align) out.push({ k: 'align', name: align });
      else if (f[2] === undefined && cmd) out.push({ k: 'cmd', name: cmd.name });
      else out.push(f[2] === undefined ? { k: 'field', name: f[1] } : { k: 'field', name: f[1], fmt: f[2] });
      continue;
    }
    pushText(out, m[0]);
  }
  pushText(out, code.slice(last));
  return out;
}

/** Writes tokens back as template code. */
export function toCode(tokens: Token[], R: ResolvedTicket): string {
  let s = '';
  for (const t of tokens) {
    switch (t.k) {
      case 'text':
        s += t.text;
        break;
      case 'nl':
        s += R.eol;
        break;
      case 'field':
        s += t.fmt === undefined ? `[*${t.name}*]` : `[*${t.name},"${t.fmt}"*]`;
        break;
      case 'cmd':
        s += t.arg === undefined ? `[*${t.name}*]` : `[*${t.name} "${t.arg}"*]`;
        break;
      case 'size':
        s += `[*${t.name}*]`;
        break;
      case 'align':
        s += `[*${R.alignName[t.name]}*]`;
        break;
      case 'if':
        s += `[*${t.not ? 'Ifnot' : 'If'} ${t.field}${t.value === undefined ? '' : `,"${t.value}"`}*]`;
        break;
      case 'endif':
        s += '[*Endif*]';
        break;
    }
  }
  return s;
}

// ---- the model: lines of items, what the editor shows ---------------------------------------------------------

export type Item =
  | { t: 'text'; text: string; size: string }
  | { t: 'field'; name: string; fmt?: string; size: string }
  | { t: 'cmd'; name: string; arg?: string; size: string }
  | { t: 'if'; field: string; value?: string; not: boolean }
  | { t: 'endif' };

export interface Line {
  align: Align;
  items: Item[];
}

/** Adds text to a list of items, joining it to the text before it when that has the same size. */
export function addText(items: Item[], text: string, size: string): void {
  const last = items[items.length - 1];
  if (last && last.t === 'text' && last.size === size) last.text += text;
  else items.push({ t: 'text', text, size });
}

/**
 * Turns tokens into lines. Sizes and alignment are applied as the printer would with every condition true: a size stays
 * until the next one, and an alignment applies to the line it comes before the first printed character of (later in the
 * line it is for the next line, like on the printer).
 */
export function buildModel(tokens: Token[], R: ResolvedTicket): Line[] {
  const lines: Line[] = [];
  let size = R.defaultSize;
  let align: Align = 'left';
  let cur: Line = { align, items: [] };
  let printed = false;
  for (const t of tokens) {
    switch (t.k) {
      case 'text':
        addText(cur.items, t.text, size);
        printed = true;
        break;
      case 'nl':
        if (!printed && !hasLogo(cur, R)) cur.align = 'left'; // a line that prints nothing has no alignment to keep
        lines.push(cur);
        cur = { align, items: [] };
        printed = false;
        break;
      case 'field':
        cur.items.push({ t: 'field', name: t.name, ...(t.fmt === undefined ? {} : { fmt: t.fmt }), size });
        printed = true;
        break;
      case 'cmd':
        cur.items.push({ t: 'cmd', name: t.name, ...(t.arg === undefined ? {} : { arg: t.arg }), size });
        if (printsText(R.commandByKey.get(t.name.toLowerCase()))) printed = true;
        break;
      case 'size':
        size = t.name;
        break;
      case 'align':
        if (!printed) cur.align = t.name;
        align = t.name;
        break;
      case 'if':
        cur.items.push({ t: 'if', field: t.field, ...(t.value === undefined ? {} : { value: t.value }), not: t.not });
        break;
      case 'endif':
        cur.items.push({ t: 'endif' });
        break;
    }
  }
  if (!printed && !hasLogo(cur, R)) cur.align = 'left';
  lines.push(cur);
  return lines;
}

/** A logo prints a picture, which is placed by the alignment like text, so a line with only a logo has one. */
const hasLogo = (line: Line, R: ResolvedTicket): boolean => line.items.some((i) => i.t === 'cmd' && R.commandByKey.get(i.name.toLowerCase())?.kind === 'logo');

/** Template code to lines. */
export function parseTemplate(code: string, R: ResolvedTicket): Line[] {
  return buildModel(lex(code, R), R);
}

/**
 * Turns lines into tokens, with the size and alignment commands needed. A command is only written where the printer is
 * not already in that state, except after a condition that contains such a command: whether that ran is not known, so the
 * next text states its size and alignment again.
 */
export function modelToTokens(lines: Line[], R: ResolvedTicket): Token[] {
  const out: Token[] = [];
  let size = R.defaultSize;
  let align: Align = 'left';
  let sizeKnown = true;
  let alignKnown = true;
  const open: { size: boolean; align: boolean }[] = [];
  const changed = (what: 'size' | 'align') => open.forEach((o) => (o[what] = true)); // a command inside a condition may or may not run

  lines.forEach((line, li) => {
    if (li > 0) out.push({ k: 'nl' });
    let first = true;
    for (const it of line.items) {
      if (it.t === 'if') {
        out.push({ k: 'if', field: it.field, ...(it.value === undefined ? {} : { value: it.value }), not: it.not });
        open.push({ size: false, align: false });
        continue;
      }
      if (it.t === 'endif') {
        out.push({ k: 'endif' });
        const closed = open.pop();
        if (closed?.size) sizeKnown = false;
        if (closed?.align) alignKnown = false;
        continue;
      }
      if (it.t === 'cmd' && !printsText(R.commandByKey.get(it.name.toLowerCase()))) {
        // a logo alone on its line is placed by the alignment, which then has to come before it
        if (first && R.commandByKey.get(it.name.toLowerCase())?.kind === 'logo' && !line.items.some((x) => x.t === 'text' || x.t === 'field' || (x.t === 'cmd' && printsText(R.commandByKey.get(x.name.toLowerCase()))))) {
          first = false;
          if (line.align !== align || !alignKnown) {
            out.push({ k: 'align', name: line.align });
            align = line.align;
            alignKnown = true;
            changed('align');
          }
        }
        out.push({ k: 'cmd', name: it.name, ...(it.arg === undefined ? {} : { arg: it.arg }) });
        continue;
      }
      if (first) {
        first = false;
        if (line.align !== align || !alignKnown) {
          out.push({ k: 'align', name: line.align });
          align = line.align;
          alignKnown = true;
          changed('align');
        }
      }
      if (it.size !== size || !sizeKnown) {
        out.push({ k: 'size', name: it.size });
        size = it.size;
        sizeKnown = true;
        changed('size');
      }
      if (it.t === 'text') out.push({ k: 'text', text: it.text });
      else if (it.t === 'field') out.push({ k: 'field', name: it.name, ...(it.fmt === undefined ? {} : { fmt: it.fmt }) });
      else out.push({ k: 'cmd', name: it.name, ...(it.arg === undefined ? {} : { arg: it.arg }) });
    }
  });
  return out;
}

/** Lines to template code. */
export function exportTemplate(lines: Line[], R: ResolvedTicket): string {
  return toCode(modelToTokens(lines, R), R);
}

// ---- conditions ------------------------------------------------------------------------------------------------

/** A plain value is compared with what is chosen for the field; anything else (`{9000`, `-?`, no value) is a switch of its own. */
export const isPlainValue = (value: string | undefined): value is string => value !== undefined && /^-?[\w ,.]+$/.test(value);

export const condKey = (field: string, value: string | undefined): string => `${field.toLowerCase()}|${value ?? ''}`;

export interface Problem {
  kind: 'unclosed' | 'extraEndif';
  field?: string;
  value?: string;
  not?: boolean;
  line: number;
}

/** Finds `Endif`s without an `If` and `If`s without an `Endif`. */
export function validateModel(lines: Line[]): Problem[] {
  const problems: Problem[] = [];
  const stack: Problem[] = [];
  lines.forEach((line, li) =>
    line.items.forEach((it) => {
      if (it.t === 'if') stack.push({ kind: 'unclosed', field: it.field, value: it.value, not: it.not, line: li });
      else if (it.t === 'endif') {
        if (stack.pop() === undefined) problems.push({ kind: 'extraEndif', line: li });
      }
    }),
  );
  return [...problems, ...stack];
}

export interface CondGroup {
  field: string;
  /** The plain values found for this field, in the order they appear. */
  values: string[];
  /** Conditions that are a switch of their own: a value that is not plain, or none at all. */
  flags: { key: string; value: string | undefined }[];
  /** The first plain condition on the field: what it compares to, and whether it is an `Ifnot`. */
  first?: { value: string; not: boolean };
}

/** The fields the conditions are about, with what they are compared to, for the preview options. */
export function groupConditions(tokens: Token[]): CondGroup[] {
  const groups = new Map<string, CondGroup>();
  for (const t of tokens) {
    if (t.k !== 'if') continue;
    const id = t.field.toLowerCase();
    let g = groups.get(id);
    if (!g) groups.set(id, (g = { field: t.field, values: [], flags: [] }));
    if (isPlainValue(t.value)) {
      g.first ??= { value: t.value, not: t.not };
      if (!g.values.includes(t.value)) g.values.push(t.value);
    } else {
      const key = condKey(t.field, t.value);
      if (!g.flags.some((f) => f.key === key)) g.flags.push({ key, value: t.value });
    }
  }
  return [...groups.values()];
}

// ---- formats ---------------------------------------------------------------------------------------------------

const DATE_TOKEN = /%[DMYhm]/;
const two = (n: number) => String(n).padStart(2, '0');

/**
 * Applies a format to a value: `%s`, `%8s` (right-aligned in 8), `%-18s` (left-aligned in 18), text around it (`-%5s`, `$$%6s`),
 * and for dates `%D` day, `%M` month, `%Y` year, `%h` hour, `%m` minute.
 */
export function formatValue(value: string, fmt: string | undefined): string {
  if (!fmt) return value;
  if (DATE_TOKEN.test(fmt)) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return fmt.replace(/%([DMYhm])/g, (_, c: string) => ({ D: two(d.getDate()), M: two(d.getMonth() + 1), Y: String(d.getFullYear()), h: two(d.getHours()), m: two(d.getMinutes()) })[c]!);
  }
  return fmt.replace(/%%|%(-?)(\d*)s/g, (m, left: string, width: string) => {
    if (m === '%%') return '%';
    const w = Number(width) || 0;
    return left ? value.padEnd(w) : value.padStart(w);
  });
}

const WIDTH = /%-?(\d+)s/;

/** The width a format reserves for its value (`%8s` is 8), or 0 when it does not say. */
export function formatWidth(fmt: string | undefined): number {
  return Number(WIDTH.exec(fmt ?? '')?.[1] ?? 0);
}

/**
 * What the preview and the layout print for a field: its sample, or its name when it has none. A name is cut to the width
 * of the format (`Order.Total` in `%8s` becomes `Order.T…`), so the columns of the layout stay where they will be on paper.
 */
export function fieldText(name: string, fmt: string | undefined, R: ResolvedTicket, useNames = false, lookup?: (name: string) => string | undefined): string {
  const sample = useNames ? undefined : lookup?.(name) ?? R.keywordByKey.get(name.toLowerCase())?.sample;
  if (sample !== undefined) return formatValue(sample, fmt);
  const w = formatWidth(fmt);
  return formatValue(w >= 2 && name.length > w ? `${name.slice(0, w - 1)}…` : name, fmt);
}

// ---- the preview: what a template prints ------------------------------------------------------------------------

export interface PreviewContext {
  /** The chosen value per field (field names in lower case). */
  values: Record<string, string>;
  /** Switches for conditions that are not a plain comparison, by `condKey`. */
  flags: Record<string, boolean>;
  /** Show field names instead of their samples. */
  useNames?: boolean;
  /** The value of a field in the test data. It comes before the sample, and decides a plain condition that has no chosen value. */
  data?: (name: string) => string | undefined;
}

export interface Run {
  text: string;
  size: string;
  kind?: 'logo' | 'cut' | 'include';
  /** For a logo: its picture. */
  image?: string;
}

export interface OutLine {
  align: Align;
  runs: Run[];
  cut?: boolean;
}

const holds = (t: Extract<Token, { k: 'if' }>, ctx: PreviewContext): boolean => {
  const key = t.field.toLowerCase();
  // a value chosen for the field (even "other") decides; without one the test data does
  const actual = key in ctx.values ? ctx.values[key] : ctx.data?.(t.field) ?? '';
  const r = isPlainValue(t.value) ? actual === t.value : !!ctx.flags[condKey(t.field, t.value)];
  return t.not ? !r : r;
};

/** One template and what its fields and conditions are worked out from. */
export interface Segment {
  tokens: Token[];
  ctx: PreviewContext;
}

/**
 * Runs templates one after the other, like the printer would with them end to end: the size and alignment carry on from one
 * template to the next, and so does a line that was not finished. A condition that was left open does not.
 */
export function interpretSegments(segments: Segment[], R: ResolvedTicket): OutLine[] {
  const out: OutLine[] = [];
  let size = R.defaultSize;
  let align: Align = 'left';
  let cur: OutLine = { align, runs: [] };
  const endLine = () => {
    out.push(cur);
    cur = { align, runs: [] };
  };
  const run = (text: string, kind?: Run['kind'], image?: string) => {
    const last = cur.runs[cur.runs.length - 1];
    if (!kind && last && !last.kind && last.size === size) last.text += text;
    else cur.runs.push({ text, size, ...(kind ? { kind } : {}), ...(image ? { image } : {}) });
  };
  for (const { tokens, ctx } of segments) {
    const skip: boolean[] = []; // one entry per open condition: is it false?
    let skipping = 0;
    for (const t of tokens) {
      if (t.k === 'if') {
        const off = !holds(t, ctx);
        skip.push(off);
        if (off) skipping++;
        continue;
      }
      if (t.k === 'endif') {
        if (skip.pop()) skipping--;
        continue;
      }
      if (skipping) continue;
      switch (t.k) {
        case 'text':
          run(t.text);
          break;
        case 'nl':
          endLine();
          break;
        case 'field':
          run(fieldText(t.name, t.fmt, R, ctx.useNames, ctx.data));
          break;
        case 'size':
          size = t.name;
          break;
        case 'align':
          if (!cur.runs.some((r) => r.kind !== 'logo')) cur.align = t.name; // a logo does not decide the alignment of its line
          align = t.name;
          break;
        case 'cmd': {
          const c = R.commandByKey.get(t.name.toLowerCase());
          if (c?.kind === 'break') endLine();
          else if (c?.kind === 'cut') {
            if (cur.runs.length) endLine();
            out.push({ align: 'left', runs: [{ text: c.label ?? c.name, size, kind: 'cut' }], cut: true });
          } else if (c?.kind === 'logo') run(c.label ?? c.name, 'logo', c.image);
          else if (c?.kind === 'include') run(`‹${t.arg ?? ''}›`, 'include');
          else run(c?.display ?? `[${t.name}]`);
          break;
        }
      }
    }
  }
  if (cur.runs.length) out.push(cur);
  return out;
}

/** Runs a template like the printer would, with the values and switches chosen. */
export function interpret(tokens: Token[], ctx: PreviewContext, R: ResolvedTicket): OutLine[] {
  return interpretSegments([{ tokens, ctx }], R);
}

// ---- the whole ticket: parts and test data ---------------------------------------------------------------------------

export interface TicketPart {
  name: string;
  code: string;
  /** The name of a list in the test data: the part is printed once for every row of it (the lines of a bill, the payments). */
  repeat?: string;
}

export interface TicketData {
  /** Values of fields for the whole ticket, by field name (the case does not matter). */
  values?: Record<string, string>;
  /** Lists of rows, each row with its own values for fields; a row comes before `values`. */
  lists?: Record<string, Record<string, string>[]>;
}

const lowerKeys = (o?: Record<string, string>): Map<string, string> => new Map(Object.entries(o ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));

/** Looks up a field in the test data: in the row first, then in the values of the whole ticket. */
export function dataLookup(data: TicketData | undefined, row?: Record<string, string>): (name: string) => string | undefined {
  const global = lowerKeys(data?.values);
  const own = row ? lowerKeys(row) : null;
  return (name) => {
    const k = name.toLowerCase();
    return own?.get(k) ?? global.get(k);
  };
}

/** What a whole ticket prints: its parts one after the other, a repeating part once for each row of its list. */
export function previewTicket(parts: TicketPart[], data: TicketData | undefined, flags: Record<string, boolean>, R: ResolvedTicket, useNames = false): OutLine[] {
  const segments: Segment[] = [];
  for (const part of parts) {
    const tokens = lex(part.code, R);
    if (part.repeat) {
      for (const row of data?.lists?.[part.repeat] ?? []) segments.push({ tokens, ctx: { values: {}, flags, useNames, data: dataLookup(data, row) } });
    } else {
      segments.push({ tokens, ctx: { values: {}, flags, useNames, data: dataLookup(data) } });
    }
  }
  return interpretSegments(segments, R);
}

/** The names of the fields a template uses, in a tag or in a condition, in the order they appear. */
export function usedFields(tokens: Token[]): string[] {
  const seen = new Map<string, string>();
  for (const t of tokens) {
    const name = t.k === 'field' ? t.name : t.k === 'if' ? t.field : null;
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  }
  return [...seen.values()];
}

/** How many printer columns a line takes. */
export function lineColumns(line: OutLine, R: ResolvedTicket): number {
  return line.runs.reduce((n, r) => n + [...r.text].length * (R.sizeByKey.get(r.size.toLowerCase())?.width ?? 1), 0);
}

/** A preview as plain text, aligned inside the width of the paper: what a text printer would put on it. */
export function previewText(lines: OutLine[], R: ResolvedTicket): string {
  return lines
    .map((l) => {
      if (l.cut) return '- - - - - - - - ✂ - - - - - - - -'.slice(0, R.columns);
      const text = l.runs.map((r) => r.text).join('');
      const free = Math.max(0, R.columns - lineColumns(l, R));
      return (l.align === 'center' ? ' '.repeat(Math.floor(free / 2)) : l.align === 'right' ? ' '.repeat(free) : '') + text;
    })
    .join('\n');
}

// ---- editing items by position -----------------------------------------------------------------------------------
//
// Positions in a line count one per character of text and one per marker or command, like the editor's line does.

export const itemUnits = (it: Item): number => (it.t === 'text' ? it.text.length : 1);

export const lineUnits = (items: Item[]): number => items.reduce((n, it) => n + itemUnits(it), 0);

/** Joins neighbouring text of the same size and drops empty text. */
export function normalizeItems(items: Item[]): Item[] {
  const out: Item[] = [];
  for (const it of items) {
    if (it.t === 'text') {
      if (it.text) addText(out, it.text, it.size);
    } else out.push(it);
  }
  return out;
}

/** Cuts a line's items in two at a position. */
export function splitItems(items: Item[], offset: number): [Item[], Item[]] {
  const left: Item[] = [];
  const right: Item[] = [];
  let at = 0;
  for (const it of items) {
    const n = itemUnits(it);
    if (at + n <= offset) left.push(it);
    else if (at >= offset) right.push(it);
    else if (it.t === 'text') {
      left.push({ ...it, text: it.text.slice(0, offset - at) });
      right.push({ ...it, text: it.text.slice(offset - at) });
    } else left.push(it);
    at += n;
  }
  return [left, right];
}

/** Puts items in at a position. */
export function insertItems(items: Item[], offset: number, add: Item[]): Item[] {
  const [left, right] = splitItems(items, offset);
  return normalizeItems([...left, ...add, ...right]);
}

/** Gives the text and commands from `start` to `end` a size. */
export function setSizeBetween(items: Item[], start: number, end: number, size: string): Item[] {
  const [before, rest] = splitItems(items, start);
  const [middle, after] = splitItems(rest, Math.max(0, end - start));
  return normalizeItems([...before, ...middle.map((it) => (it.t === 'text' || it.t === 'field' || it.t === 'cmd' ? { ...it, size } : it)), ...after]);
}

/** What size typing at a position gets: that of the character before it, or of the first one at the start of a line. */
export function sizeAt(items: Item[], offset: number, R: ResolvedTicket): string {
  let at = 0;
  let first: string | undefined;
  let before: string | undefined;
  for (const it of items) {
    const n = itemUnits(it);
    if (it.t !== 'if' && it.t !== 'endif') {
      first ??= it.size;
      if (at < offset) before = it.size; // it has at least one character before the position
    }
    at += n;
  }
  return before ?? first ?? R.defaultSize;
}
