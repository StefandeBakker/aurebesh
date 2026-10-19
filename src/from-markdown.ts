/**
 * Markdown to HTML: the other direction of `toMarkdown` (see export.ts). GitHub flavoured Markdown without the parts an editor of this
 * kind cannot show: headings, paragraphs, line breaks, emphasis, strong, strikethrough, inline code, fenced and indented code blocks,
 * links (inline, reference and automatic), images, block quotes, bullet and numbered lists (nested, with the loose and tight kind),
 * tables (with their alignment), horizontal lines, backslash escapes and HTML that Markdown allows inside text.
 *
 * `markdownToHtml` gives HTML that still has to be sanitized (Markdown may contain any HTML); `fromMarkdown` does that too. Both need
 * no DOM until the sanitizer runs. Only `h1` to `h3` exist in the editor: `####` and deeper become `h3`.
 */
import { sanitize } from './sanitize';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const PUNCT = /[!-/:-@[-`{-~‐-‧‰-⁞]/;
const isPunct = (c: string): boolean => c !== '' && PUNCT.test(c);
const isSpace = (c: string): boolean => c === '' || /\s/.test(c);

interface Ref {
  href: string;
  title?: string;
}
type Refs = Map<string, Ref>;
const refKey = (label: string): string => label.trim().replace(/\s+/g, ' ').toLowerCase();

// ---- inline ----------------------------------------------------------------------------------------------------------

interface Tok {
  /** html of a text, code, link...; for a delimiter run the literal characters */
  v: string;
  delim?: { ch: string; n: number; orig: number; open: boolean; close: boolean };
  pre: string;
  post: string;
  dead: boolean;
}

/** The index of the `]` that closes the `[` at `from`, or -1. Skips escapes, code spans and nested brackets. */
function closingBracket(s: string, from: number): number {
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') i++;
    else if (c === '`') {
      const run = /^`+/.exec(s.slice(i))![0];
      const end = s.indexOf(run, i + run.length);
      i = end < 0 ? i + run.length - 1 : end + run.length - 1;
    } else if (c === '[') depth++;
    else if (c === ']' && --depth === 0) return i;
  }
  return -1;
}

/** `(destination "title")` at `from` (the index of the `(`): the destination, title and the index after the `)`; or null. */
function linkTail(s: string, from: number): { href: string; title?: string; end: number } | null {
  let i = from + 1;
  while (i < s.length && /\s/.test(s[i])) i++;
  let href = '';
  if (s[i] === '<') {
    const end = s.indexOf('>', i);
    if (end < 0 || s.slice(i, end).includes('\n')) return null;
    href = s.slice(i + 1, end);
    i = end + 1;
  } else {
    let depth = 0;
    const start = i;
    for (; i < s.length; i++) {
      const c = s[i];
      if (c === '\\') i++;
      else if (/\s/.test(c)) break;
      else if (c === '(') depth++;
      else if (c === ')') {
        if (depth === 0) break;
        depth--;
      }
    }
    href = s.slice(start, i);
  }
  while (i < s.length && /\s/.test(s[i])) i++;
  let title: string | undefined;
  const q = s[i];
  if (q === '"' || q === "'" || q === '(') {
    const close = q === '(' ? ')' : q;
    let j = i + 1;
    for (; j < s.length && s[j] !== close; j++) if (s[j] === '\\') j++;
    if (j >= s.length) return null;
    title = s.slice(i + 1, j).replace(/\\(.)/g, '$1');
    i = j + 1;
    while (i < s.length && /\s/.test(s[i])) i++;
  }
  if (s[i] !== ')') return null;
  return { href: href.replace(/\\([!-/:-@[-`{-~])/g, '$1'), title, end: i + 1 };
}

function link(href: string, title: string | undefined, inner: string): string {
  return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''}>${inner}</a>`;
}

function parseInline(src: string, refs: Refs): string {
  const toks: Tok[] = [];
  let text = '';
  const push = (v: string, extra: Partial<Tok> = {}) => toks.push({ v, pre: '', post: '', dead: false, ...extra });
  const flush = () => {
    if (text) push(esc(text));
    text = '';
  };
  const s = src;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      const n = s[i + 1];
      if (n === '\n') {
        flush();
        push('<br>');
        i += 2;
      } else if (n !== undefined && isPunct(n)) {
        text += n;
        i += 2;
      } else {
        text += '\\';
        i++;
      }
    } else if (c === '`') {
      const run = /^`+/.exec(s.slice(i))![0];
      let end = i + run.length;
      let found = -1;
      while (end < s.length) {
        const at = s.indexOf(run, end);
        if (at < 0) break;
        if (s[at + run.length] !== '`' && s[at - 1] !== '`') {
          found = at;
          break;
        }
        end = at + 1;
        while (s[end] === '`') end++;
      }
      if (found < 0) {
        text += run;
        i += run.length;
      } else {
        flush();
        let code = s.slice(i + run.length, found).replace(/\n/g, ' ');
        if (/^ .*[^ ].* $/.test(code) || (code.length > 2 && code.startsWith(' ') && code.endsWith(' ') && code.trim())) code = code.slice(1, -1);
        push(`<code>${esc(code)}</code>`);
        i = found + run.length;
      }
    } else if (c === '<') {
      const auto = /^<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*)>/.exec(s.slice(i));
      const mail = /^<([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)>/.exec(s.slice(i));
      const tag = /^<\/?[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][\w:.-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>/.exec(s.slice(i));
      const comment = /^<!--[\s\S]*?-->/.exec(s.slice(i));
      if (auto) {
        flush();
        push(link(auto[1], undefined, esc(auto[1])));
        i += auto[0].length;
      } else if (mail) {
        flush();
        push(link(`mailto:${mail[1]}`, undefined, esc(mail[1])));
        i += mail[0].length;
      } else if (comment) {
        i += comment[0].length;
      } else if (tag) {
        flush();
        push(tag[0]); // HTML inside Markdown stays HTML; the sanitizer decides what is allowed
        i += tag[0].length;
      } else {
        text += '<';
        i++;
      }
    } else if (c === '[' || (c === '!' && s[i + 1] === '[')) {
      const image = c === '!';
      const open = image ? i + 1 : i;
      const close = closingBracket(s, open);
      let done = false;
      if (close > 0) {
        const label = s.slice(open + 1, close);
        let href: string | undefined;
        let title: string | undefined;
        let end = close + 1;
        if (s[end] === '(') {
          const tail = linkTail(s, end);
          if (tail) {
            href = tail.href;
            title = tail.title;
            end = tail.end;
          }
        } else if (s[end] === '[') {
          const close2 = s.indexOf(']', end);
          if (close2 > 0) {
            const ref = refs.get(refKey(close2 === end + 1 ? label : s.slice(end + 1, close2)));
            if (ref) {
              href = ref.href;
              title = ref.title;
              end = close2 + 1;
            }
          }
        } else {
          const ref = refs.get(refKey(label));
          if (ref) {
            href = ref.href;
            title = ref.title;
          }
        }
        if (href !== undefined) {
          flush();
          if (image) push(`<img src="${esc(href)}" alt="${esc(label.replace(/\\(.)/g, '$1'))}"${title ? ` title="${esc(title)}"` : ''}>`);
          else push(link(href, title, parseInline(label, refs)));
          i = end;
          done = true;
        }
      }
      if (!done) {
        text += image ? '![' : '[';
        i += image ? 2 : 1;
      }
    } else if (c === '*' || c === '_' || c === '~') {
      let j = i;
      while (s[j] === c) j++;
      const n = j - i;
      if (c === '~' && n > 2) {
        text += s.slice(i, j);
      } else {
        const prev = i === 0 ? '' : s[i - 1];
        const next = s[j] ?? '';
        const left = !isSpace(next) && (!isPunct(next) || isSpace(prev) || isPunct(prev));
        const right = !isSpace(prev) && (!isPunct(prev) || isSpace(next) || isPunct(next));
        const open = c === '_' ? left && (!right || isPunct(prev)) : left;
        const close = c === '_' ? right && (!left || isPunct(next)) : right;
        flush();
        push(s.slice(i, j), { delim: { ch: c, n, orig: n, open, close } });
      }
      i = j;
    } else if (c === '\n') {
      const hard = / {2,}$/.test(text);
      text = text.replace(/ +$/, '');
      if (hard) {
        flush();
        push('<br>');
      } else {
        text += '\n';
      }
      i++;
      while (s[i] === ' ') i++; // the spaces at the start of the next line mean nothing
    } else if (c === '&') {
      const entity = /^&(?:#\d{1,7}|#[xX][0-9A-Fa-f]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/.exec(s.slice(i));
      if (entity) {
        flush();
        push(entity[0]);
        i += entity[0].length;
      } else {
        text += '&';
        i++;
      }
    } else if ((c === 'h' || c === 'w') && /^(?:https?:\/\/|www\.)[^\s<]+/i.test(s.slice(i)) && !/[A-Za-z0-9]/.test(s[i - 1] ?? '')) {
      let url = /^[^\s<]+/.exec(s.slice(i))![0];
      url = url.replace(/[?!.,:*_~'";]+$/, '');
      while (url.endsWith(')') && url.split(')').length > url.split('(').length) url = url.slice(0, -1);
      if (/^www\./i.test(url) && !/\./.test(url.slice(4))) {
        text += c;
        i++;
      } else {
        flush();
        push(link(/^www\./i.test(url) ? `http://${url}` : url, undefined, esc(url)));
        i += url.length;
      }
    } else {
      text += c;
      i++;
    }
  }
  flush();

  // emphasis, strong and strikethrough: the delimiter runs that match each other (CommonMark's rules, in short)
  for (let ci = 0; ci < toks.length; ci++) {
    const closer = toks[ci];
    if (!closer.delim || closer.dead) continue;
    while (closer.delim.close && closer.delim.n > 0) {
      let oi = ci - 1;
      for (; oi >= 0; oi--) {
        const o = toks[oi];
        if (!o.delim || o.dead || o.delim.ch !== closer.delim.ch || !o.delim.open || o.delim.n === 0) continue;
        if (o.delim.ch !== '~' && (o.delim.close || closer.delim.open) && (o.delim.orig + closer.delim.orig) % 3 === 0 && !(o.delim.orig % 3 === 0 && closer.delim.orig % 3 === 0)) continue;
        break;
      }
      if (oi < 0) break;
      const opener = toks[oi];
      const use = opener.delim!.ch === '~' ? Math.min(opener.delim!.n, closer.delim.n, 2) : opener.delim!.n >= 2 && closer.delim.n >= 2 ? 2 : 1;
      const tag = opener.delim!.ch === '~' ? 'del' : use === 2 ? 'strong' : 'em';
      opener.pre = `<${tag}>` + opener.pre;
      closer.post = closer.post + `</${tag}>`;
      opener.delim!.n -= use;
      closer.delim.n -= use;
      for (let k = oi + 1; k < ci; k++) if (toks[k].delim) toks[k].dead = true;
    }
  }
  let out = '';
  for (const t of toks) {
    if (!t.delim) {
      out += t.v;
      continue;
    }
    // the opener's tags sit where the characters it used were (at the end of the run), the closer's where its own were (at the start)
    out += t.post + esc(t.delim.ch.repeat(t.delim.n)) + t.pre;
  }
  return out;
}

// ---- blocks ----------------------------------------------------------------------------------------------------------

const BLANK = /^\s*$/;
const FENCE = /^( {0,3})(`{3,}|~{3,})\s*([^`]*)$/;
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}>/;
const LIST = /^( {0,3})([-*+]|\d{1,9}[.)])( +|$)(.*)$/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const TABLE_DELIM = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const HTML_BLOCK = /^ {0,3}<\/?(?:address|article|aside|blockquote|details|div|dl|fieldset|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|summary|table|tbody|td|th|thead|tr|ul)(?:\s|\/?>|$)/i;

const indentOf = (line: string): number => /^ */.exec(line)![0].length;

function splitCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cell = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cell += '|';
      i++;
    } else if (s[i] === '|') {
      cells.push(cell.trim());
      cell = '';
    } else cell += s[i];
  }
  cells.push(cell.trim());
  return cells;
}

/** Whether a line starts something that ends a paragraph. */
function interrupts(line: string, next: string | undefined): boolean {
  if (FENCE.test(line) || ATX.test(line) || HR.test(line) || QUOTE.test(line) || HTML_BLOCK.test(line)) return true;
  const list = LIST.exec(line);
  if (list && list[4].trim() !== '' && (/^[-*+]$/.test(list[2]) || list[2].startsWith('1'))) return true;
  if (next !== undefined && line.includes('|') && TABLE_DELIM.test(next) && next.includes('-') && splitCells(line).length === splitCells(next).length) return true;
  return false;
}

function parseBlocks(lines: string[], refs: Refs): string {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (BLANK.test(line)) {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const [, indent, marks] = fence;
      const code: string[] = [];
      i++;
      while (i < lines.length) {
        const close = new RegExp(`^ {0,3}${marks[0] === '`' ? '`' : '~'}{${marks.length},}[ \\t]*$`);
        if (close.test(lines[i])) {
          i++;
          break;
        }
        code.push(lines[i].replace(new RegExp(`^ {0,${indent.length}}`), ''));
        i++;
      }
      out.push(`<pre>${esc(code.join('\n'))}</pre>`);
      continue;
    }

    const atx = ATX.exec(line);
    if (atx) {
      const level = Math.min(3, atx[1].length);
      out.push(`<h${level}>${parseInline((atx[2] ?? '').trim(), refs)}</h${level}>`);
      i++;
      continue;
    }

    if (HR.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && !BLANK.test(lines[i])) {
        if (QUOTE.test(lines[i])) inner.push(lines[i].replace(/^ {0,3}> ?/, ''));
        else if (!interrupts(lines[i], lines[i + 1]) && !LIST.test(lines[i]) && inner.length && !BLANK.test(inner[inner.length - 1])) inner.push(lines[i]); // lazy continuation
        else break;
        i++;
      }
      out.push(`<blockquote>${parseBlocks(inner, refs)}</blockquote>`);
      continue;
    }

    if (HTML_BLOCK.test(line)) {
      const html: string[] = [];
      while (i < lines.length && !BLANK.test(lines[i])) html.push(lines[i++]);
      out.push(html.join('\n'));
      continue;
    }

    const list = LIST.exec(line);
    if (list) {
      i = parseList(lines, i, refs, out);
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_DELIM.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const head = splitCells(line);
      const delim = splitCells(lines[i + 1]);
      if (head.length === delim.length) {
        const align = delim.map((d) => (d.startsWith(':') && d.endsWith(':') ? 'center' : d.endsWith(':') ? 'right' : d.startsWith(':') ? 'left' : ''));
        const cell = (tag: string, text: string, col: number) => `<${tag}${align[col] ? ` style="text-align: ${align[col]}"` : ''}>${parseInline(text, refs)}</${tag}>`;
        const rows = [`<tr>${head.map((h, c) => cell('th', h, c)).join('')}</tr>`];
        i += 2;
        while (i < lines.length && !BLANK.test(lines[i]) && !interrupts(lines[i], undefined)) {
          const cells = splitCells(lines[i]);
          rows.push(`<tr>${head.map((_, c) => cell('td', cells[c] ?? '', c)).join('')}</tr>`);
          i++;
        }
        out.push(`<table><tbody>${rows.join('')}</tbody></table>`);
        continue;
      }
    }

    if (indentOf(line) >= 4) {
      const code: string[] = [];
      while (i < lines.length && (BLANK.test(lines[i]) || indentOf(lines[i]) >= 4)) code.push(lines[i++].replace(/^ {0,4}/, ''));
      while (code.length && BLANK.test(code[code.length - 1])) code.pop();
      out.push(`<pre>${esc(code.join('\n'))}</pre>`);
      continue;
    }

    // a paragraph, or a heading with a line under it
    const para: string[] = [];
    while (i < lines.length && !BLANK.test(lines[i])) {
      if (para.length) {
        const under = SETEXT.exec(lines[i]);
        if (under) {
          const level = under[1][0] === '=' ? 1 : 2;
          out.push(`<h${level}>${parseInline(para.map((l) => l.trim()).join('\n'), refs)}</h${level}>`);
          para.length = 0;
          i++;
          break;
        }
        if (interrupts(lines[i], lines[i + 1])) break;
      }
      para.push(lines[i]);
      i++;
    }
    if (para.length) out.push(`<p>${parseInline(para.map((l) => l.replace(/^ +/, '')).join('\n').replace(/ +$/, ''), refs)}</p>`);
  }
  return out.join('');
}

/** A list that starts at `start`: adds its HTML to `out` and returns the index of the line after it. */
function parseList(lines: string[], start: number, refs: Refs, out: string[]): number {
  const first = LIST.exec(lines[start])!;
  const ordered = /\d/.test(first[2]);
  const kind = ordered ? first[2].slice(-1) : first[2];
  const items: { lines: string[]; loose: boolean }[] = [];
  let loose = false;
  let i = start;
  while (i < lines.length) {
    const m = LIST.exec(lines[i]);
    if (!m || (/\d/.test(m[2]) ? m[2].slice(-1) : m[2]) !== kind || /\d/.test(m[2]) !== ordered) break;
    const spaces = m[3].length > 4 || m[4].trim() === '' ? 1 : m[3].length;
    const offset = m[1].length + m[2].length + spaces;
    const body: string[] = [m[4]];
    i++;
    let blankBefore = false;
    while (i < lines.length) {
      const l = lines[i];
      if (BLANK.test(l)) {
        // the item goes on if what follows the blank lines is indented enough
        let j = i;
        while (j < lines.length && BLANK.test(lines[j])) j++;
        if (j < lines.length && indentOf(lines[j]) >= offset) {
          for (; i < j; i++) body.push('');
          blankBefore = true;
          continue;
        }
        break;
      }
      if (indentOf(l) >= offset) {
        body.push(l.slice(offset));
        i++;
      } else if (!blankBefore && body.length && !BLANK.test(body[body.length - 1]) && !interrupts(l, lines[i + 1]) && !LIST.test(l)) {
        body.push(l.trim()); // lazy continuation of the text of the item
        i++;
      } else break;
    }
    while (body.length && BLANK.test(body[body.length - 1])) body.pop();
    items.push({ lines: body, loose: body.some((b, k) => BLANK.test(b) && k > 0 && k < body.length - 1 && !/^ *(?:[-*+]|\d+[.)])/.test(body[k + 1] ?? '')) });
    // blank lines between this item and the next make the list loose
    let j = i;
    while (j < lines.length && BLANK.test(lines[j])) j++;
    if (j > i && j < lines.length) {
      const nm = LIST.exec(lines[j]);
      if (nm && (/\d/.test(nm[2]) ? nm[2].slice(-1) : nm[2]) === kind && /\d/.test(nm[2]) === ordered) {
        loose = true;
        i = j;
      } else break;
    }
  }
  const tag = ordered ? 'ol' : 'ul';
  const html = items
    .map((item) => {
      const inner = parseBlocks(item.lines, refs);
      // tight: the text of an item is not in a paragraph, like the editor writes it
      const text = !loose && !item.loose ? inner.replace(/^<p>([\s\S]*?)<\/p>/, '$1') : inner;
      return `<li>${text}</li>`;
    })
    .join('');
  out.push(`<${tag}>${html}</${tag}>`);
  return i;
}

/** Collects the link definitions (`[label]: url "title"`) and returns the other lines. */
function definitions(lines: string[], refs: Refs): string[] {
  const rest: string[] = [];
  let fence = '';
  for (const line of lines) {
    const f = FENCE.exec(line);
    if (f) {
      if (!fence) fence = f[2];
      else if (f[2][0] === fence[0] && f[2].length >= fence.length && !f[3]) fence = '';
      rest.push(line);
      continue;
    }
    const def = !fence ? /^ {0,3}\[([^\]]+)\]:[ \t]*<?([^\s>]+)>?(?:[ \t]+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?[ \t]*$/.exec(line) : null;
    if (def) {
      const key = refKey(def[1]);
      if (!refs.has(key)) refs.set(key, { href: def[2], title: def[3] ?? def[4] ?? def[5] });
    } else rest.push(line);
  }
  return rest;
}

/** HTML for Markdown. It is not sanitized: Markdown may contain HTML. */
export function markdownToHtml(markdown: string): string {
  const lines = markdown
    .replace(/\r\n?/g, '\n')
    .replace(/^﻿/, '')
    .split('\n')
    .map((l) => l.replace(/^\t+/, (t) => '    '.repeat(t.length)));
  const refs: Refs = new Map();
  return parseBlocks(definitions(lines, refs), refs);
}

/** Sanitized HTML for Markdown (needs a DOM, like `toMarkdown`). */
export function fromMarkdown(markdown: string): string {
  return sanitize(markdownToHtml(markdown));
}

/** HTML for plain text: a paragraph for each block of lines, a line break for each other line. Nothing in it is read as markup. */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.replace(/^\n+|\n+$/g, ''))
    .filter((block) => block.trim())
    .map((block) => `<p>${block.split('\n').map(esc).join('<br>')}</p>`)
    .join('');
}
