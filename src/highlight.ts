/**
 * Dependency-free syntax highlighting for <pre> blocks.
 *
 * A small generic tokenizer (comments, strings, numbers, keywords, functions, types, tags) that works
 * reasonably for C-like languages, Python, JSON, HTML/CSS, shell... It paints with the CSS Custom Highlight
 * API (`CSS.highlights`), so the editor DOM is never modified: typing, caret and undo stay untouched.
 * Browsers without that API simply show no colours.
 */

import { tokenizeLanguage } from './grammars';

export type TokenType = 'comment' | 'string' | 'number' | 'keyword' | 'function' | 'type' | 'tag';
export interface Token {
  type: TokenType;
  start: number;
  end: number;
}

const TYPES: TokenType[] = ['comment', 'string', 'number', 'keyword', 'function', 'type', 'tag'];

const KEYWORDS = new Set(
  `abstract and as assert async await break case catch class const continue debugger declare def default del delete do
  elif else enum except export extends false final finally fn for from func function global goto if impl implements
  import in instanceof interface is lambda let mut namespace new nil None nonlocal not null of or package
  pass private protected pub public raise readonly return static struct super switch this throw throws trait true
  True False try typeof undefined unsigned using var void volatile while with yield
  bool boolean byte char double float int long short string
  SELECT INSERT UPDATE DELETE FROM WHERE JOIN GROUP ORDER BY LIMIT VALUES INTO CREATE TABLE AND OR NOT NULL`
    .split(/\s+/)
    .filter(Boolean),
);

const TOKEN = new RegExp(
  [
    // comments: /* */, <!-- -->, //, and # followed by whitespace or ! (shell/python, not #fff or #id)
    String.raw`(?<comment>\/\*[\s\S]*?(?:\*\/|$)|<!--[\s\S]*?(?:-->|$)|\/\/[^\n]*|#(?=[ \t!\n]|$)[^\n]*)`,
    // strings: triple quotes, ' ", and multi-line template literals
    String.raw`(?<string>"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|\x60(?:\\[\s\S]|[^\x60\\])*\x60?)`,
    // html-ish tags, but not comparisons/generics such as i<n or Array<T>
    String.raw`(?<tag><\/[A-Za-z][\w:-]*|(?<![\w)\]$])<[A-Za-z][\w:-]*)`,
    String.raw`(?<number>\b0[xX][\da-fA-F]+\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?\b)`,
    String.raw`(?<word>[A-Za-z_$][\w$]*)`,
  ].join('|'),
  'g',
);

/**
 * The tokens of code. With a language that has a grammar the code is read as that language, `text` has no colours, and anything else
 * (no language, or one that has no grammar) is read by the generic tokenizer, which does reasonably for most languages.
 */
export function tokenize(code: string, language?: string | null): Token[] {
  if (language === 'text') return [];
  if (language) {
    const own = tokenizeLanguage(code, language);
    if (own) return own;
  }
  const tokens: Token[] = [];
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(code))) {
    const start = m.index;
    const end = start + m[0].length;
    if (end === start) {
      TOKEN.lastIndex++;
      continue;
    }
    const g = m.groups!;
    let type: TokenType | null = null;
    if (g.comment !== undefined) type = 'comment';
    else if (g.string !== undefined) type = 'string';
    else if (g.tag !== undefined) type = 'tag';
    else if (g.number !== undefined) type = 'number';
    else if (g.word !== undefined) {
      const word = g.word;
      if (KEYWORDS.has(word)) type = 'keyword';
      else if (/^[ \t]*\(/.test(code.slice(end, end + 8))) type = 'function';
      else if (/^[A-Z]/.test(word) && /[a-z]/.test(word)) type = 'type'; // PascalCase, not CONSTANTS
    }
    if (type) tokens.push({ type, start, end });
  }
  return tokens;
}

// ---- painting -------------------------------------------------------------------------------------------

type HighlightRegistry = { set(name: string, h: unknown): void; delete(name: string): void };
const registryApi = (): HighlightRegistry | null => {
  const css = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  return css?.highlights && typeof (globalThis as { Highlight?: unknown }).Highlight === 'function' ? css.highlights : null;
};

/** Ranges per editor, so several editors on one page don't overwrite each other's highlights. */
const perEditor = new Map<HTMLElement, Map<TokenType, Range[]>>();

function flush(api: HighlightRegistry): void {
  const Highlight = (globalThis as unknown as { Highlight: new (...r: Range[]) => unknown }).Highlight;
  for (const type of TYPES) {
    const ranges: Range[] = [];
    perEditor.forEach((byType) => ranges.push(...(byType.get(type) ?? [])));
    if (ranges.length) api.set(`aurebesh-${type}`, new Highlight(...ranges));
    else api.delete(`aurebesh-${type}`);
  }
}

function collect(pre: HTMLElement, out: Map<TokenType, Range[]>): void {
  const segs: { node: Text; start: number }[] = [];
  let text = '';
  const walker = pre.ownerDocument.createTreeWalker(pre, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      segs.push({ node: n as Text, start: text.length });
      text += n.textContent ?? '';
    } else if (n.nodeName === 'BR') {
      text += '\n'; // a <br> inside a code block is a line break
    }
  }
  if (!segs.length) return;

  const locate = (offset: number, isEnd: boolean): [Text, number] => {
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i];
      if (isEnd ? offset > s.start : offset >= s.start) return [s.node, Math.min(offset - s.start, s.node.length)];
    }
    return [segs[0].node, 0];
  };

  for (const t of tokenize(text, pre.getAttribute('data-language'))) {
    const range = pre.ownerDocument.createRange();
    const [sn, so] = locate(t.start, false);
    const [en, eo] = locate(t.end, true);
    range.setStart(sn, so);
    range.setEnd(en, eo);
    const list = out.get(t.type);
    if (list) list.push(range);
    else out.set(t.type, [range]);
  }
}

/** (Re)paints the highlights of every <pre> inside `root`. */
export function highlightCode(root: HTMLElement): void {
  const api = registryApi();
  if (!api) return;
  const byType = new Map<TokenType, Range[]>();
  root.querySelectorAll('pre').forEach((pre) => collect(pre as HTMLElement, byType));
  perEditor.set(root, byType);
  flush(api);
}

export function clearHighlights(root: HTMLElement): void {
  const api = registryApi();
  if (!perEditor.delete(root) || !api) return;
  flush(api);
}
