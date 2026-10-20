/**
 * The highlighting of one language: a small grammar (what its comments and strings look like, its keywords) that a tokenizer is made
 * of. Not a parser: it colours what is clear, and leaves the rest as it is. Languages without a grammar here use the generic
 * highlighter (see highlight.ts).
 */
import type { Token, TokenType } from './highlight';

type Comment = 'slash' | 'block' | 'hash' | 'dash' | 'html';
type Str = 'dq' | 'sq' | 'bt' | 'tq';

interface Grammar {
  comments: Comment[];
  strings: Str[];
  /** Words that are keywords, separated by spaces. */
  keywords: string;
  ignoreCase?: boolean;
  /** `name(` is a function (default: yes). */
  functions?: boolean;
  /** `PascalCase` is a type (default: yes). */
  types?: boolean;
  /** A tag (`<div`, `</div`) and the names of attributes. */
  tags?: boolean;
  /** `@name`: a decorator or annotation (type) or, in CSS, an at-rule (keyword). */
  at?: 'type' | 'keyword';
  /** `$name` and `${name}`: a variable. */
  variables?: boolean;
  /** `name:` (a key, a property) is a function, and so is a string that is followed by a colon. */
  keys?: boolean;
  /** Words may have hyphens (CSS, YAML). */
  hyphen?: boolean;
  /** Numbers can have a unit or be a colour (CSS). */
  units?: boolean;
}

const CLIKE = `break case catch class const continue default do else enum extends finally for if new return static super switch this throw try typeof void volatile while`;

const GRAMMARS: Record<string, Grammar> = {
  javascript: {
    comments: ['slash'],
    strings: ['dq', 'sq', 'bt'],
    keywords: `${CLIKE} async await debugger delete export from function get implements import in instanceof interface let of package private protected public set var with yield true false null undefined NaN Infinity`,
  },
  typescript: {
    comments: ['slash'],
    strings: ['dq', 'sq', 'bt'],
    at: 'type',
    keywords: `${CLIKE} abstract any as async await bigint boolean debugger declare delete enum export from function get implements import in infer instanceof interface is keyof let namespace never number object of override package private protected public readonly satisfies set string symbol type unknown var with yield true false null undefined`,
  },
  json: { comments: [], strings: ['dq'], keywords: 'true false null', functions: false, types: false, keys: true },
  html: { comments: ['html'], strings: ['dq', 'sq'], keywords: '', functions: false, types: false, tags: true },
  xml: { comments: ['html'], strings: ['dq', 'sq'], keywords: '', functions: false, types: false, tags: true },
  css: { comments: ['block'], strings: ['dq', 'sq'], keywords: '!important', functions: false, types: false, keys: true, hyphen: true, units: true, at: 'keyword' },
  python: {
    comments: ['hash'],
    strings: ['tq', 'dq', 'sq'],
    at: 'type',
    keywords: `and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None self cls match case`,
  },
  java: {
    comments: ['slash'],
    strings: ['dq', 'sq'],
    at: 'type',
    keywords: `abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package permits private protected public record return sealed short static strictfp super switch synchronized this throw throws transient try var void volatile while true false null`,
  },
  csharp: {
    comments: ['slash'],
    strings: ['dq', 'sq'],
    keywords: `abstract as async await base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in init int interface internal is lock long namespace new null object operator out override params private protected public readonly record ref required return sbyte sealed short sizeof static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using var virtual void volatile while`,
  },
  c: {
    comments: ['slash'],
    strings: ['dq', 'sq'],
    keywords: `auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while NULL true false`,
  },
  cpp: {
    comments: ['slash'],
    strings: ['dq', 'sq'],
    keywords: `alignas alignof and asm auto bool break case catch char class const constexpr const_cast continue decltype default delete do double dynamic_cast else enum explicit export extern false final float for friend goto if inline int long mutable namespace new noexcept not nullptr operator or override private protected public register reinterpret_cast return short signed sizeof static static_assert static_cast struct switch template this throw true try typedef typeid typename union unsigned using virtual void volatile while`,
  },
  go: {
    comments: ['slash'],
    strings: ['bt', 'dq', 'sq'],
    keywords: `break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil iota any bool byte error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr`,
  },
  rust: {
    comments: ['slash'],
    strings: ['dq', 'sq'],
    keywords: `as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while bool char f32 f64 i8 i16 i32 i64 i128 isize str u8 u16 u32 u64 u128 usize`,
  },
  php: {
    comments: ['slash', 'hash'],
    strings: ['dq', 'sq'],
    variables: true,
    keywords: `abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty extends final finally fn for foreach function global if implements include include_once instanceof interface isset list match namespace new null or print private protected public readonly require require_once return static switch throw trait true false try unset use var while xor yield`,
  },
  ruby: {
    comments: ['hash'],
    strings: ['dq', 'sq'],
    variables: false,
    keywords: `alias and begin break case class def do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield puts require attr_accessor attr_reader attr_writer`,
  },
  sql: {
    comments: ['dash', 'block'],
    strings: ['sq', 'dq'],
    ignoreCase: true,
    types: false,
    keywords: `select insert update delete from where join inner left right outer full cross on group by order having limit offset values into create alter drop table index view database schema set as and or not null is in like between exists union all distinct case when then else end primary key foreign references default unique constraint check count sum avg min max asc desc begin commit rollback transaction with returning truncate add column if replace`,
  },
  bash: {
    comments: ['hash'],
    strings: ['dq', 'sq'],
    variables: true,
    functions: false,
    types: false,
    keywords: `if then else elif fi for while until do done case esac in function select return exit break continue local export readonly declare unset set shift source alias echo cd test true false sudo`,
  },
  yaml: {
    comments: ['hash'],
    strings: ['dq', 'sq'],
    functions: false,
    types: false,
    keys: true,
    hyphen: true,
    keywords: 'true false null yes no on off',
  },
};

const COMMENT: Record<Comment, string> = {
  slash: String.raw`\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*`,
  block: String.raw`\/\*[\s\S]*?(?:\*\/|$)`,
  hash: String.raw`#[^\n]*`,
  dash: String.raw`--[^\n]*`,
  html: String.raw`<!--[\s\S]*?(?:-->|$)`,
};
const STRING: Record<Str, string> = {
  tq: String.raw`"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)`,
  dq: String.raw`"(?:\\.|[^"\\\n])*"?`,
  sq: String.raw`'(?:\\.|[^'\\\n])*'?`,
  bt: String.raw`\x60(?:\\[\s\S]|[^\x60\\])*\x60?`,
};

interface Compiled {
  grammar: Grammar;
  regex: RegExp;
  keywords: Set<string>;
}
const cache = new Map<string, Compiled | null>();

function compile(id: string): Compiled | null {
  if (cache.has(id)) return cache.get(id)!;
  const grammar = GRAMMARS[id];
  if (!grammar) {
    cache.set(id, null);
    return null;
  }
  const parts: string[] = [];
  if (grammar.comments.length) parts.push(`(?<comment>${grammar.comments.map((c) => COMMENT[c]).join('|')})`);
  if (grammar.strings.length) parts.push(`(?<string>${grammar.strings.map((s) => STRING[s]).join('|')})`);
  if (grammar.tags) {
    parts.push(String.raw`(?<tag><\/?[A-Za-z][\w:-]*)`);
    parts.push(String.raw`(?<attr>[A-Za-z_:@][\w:.@-]*)(?==)`);
  }
  if (grammar.at) parts.push(String.raw`(?<at>@[A-Za-z_][\w-]*)`);
  if (grammar.variables) parts.push(String.raw`(?<variable>\$\{[^}\n]*\}|\$[A-Za-z_]\w*|\$[0-9#?@*!$-])`);
  parts.push(
    grammar.units
      ? String.raw`(?<number>#[\da-fA-F]{3,8}\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?(?:%|[A-Za-z]{1,4}\b)?|\.\d+(?:%|[A-Za-z]{1,4}\b)?)`
      : String.raw`(?<number>\b0[xXbBoO][\da-fA-F_]+\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?\b)`,
  );
  parts.push(grammar.hyphen ? String.raw`(?<word>!?[A-Za-z_][\w-]*)` : String.raw`(?<word>[A-Za-z_$][\w$]*)`);
  const compiled: Compiled = {
    grammar,
    regex: new RegExp(parts.join('|'), 'g'),
    keywords: new Set(grammar.keywords.split(/\s+/).filter(Boolean).map((w) => (grammar.ignoreCase ? w.toLowerCase() : w))),
  };
  cache.set(id, compiled);
  return compiled;
}

/** Whether a language has a grammar of its own. */
export const hasGrammar = (id: string): boolean => id in GRAMMARS;

/** The tokens of code in a language, or null when the language has no grammar here. */
export function tokenizeLanguage(code: string, id: string): Token[] | null {
  const lang = compile(id);
  if (!lang) return null;
  const { grammar, regex, keywords } = lang;
  const tokens: Token[] = [];
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(code))) {
    const start = m.index;
    const end = start + m[0].length;
    if (end === start) {
      regex.lastIndex++;
      continue;
    }
    const g = m.groups!;
    let type: TokenType | null = null;
    if (g.comment !== undefined) type = 'comment';
    else if (g.string !== undefined) type = grammar.keys && /^[ \t]*:/.test(code.slice(end, end + 8)) ? 'function' : 'string';
    else if (g.tag !== undefined) type = 'tag';
    else if (g.attr !== undefined) type = 'type';
    else if (g.at !== undefined) type = grammar.at === 'keyword' ? 'keyword' : 'type';
    else if (g.variable !== undefined) type = 'type';
    else if (g.number !== undefined) type = 'number';
    else if (g.word !== undefined) {
      const word = g.word;
      if (keywords.has(grammar.ignoreCase ? word.toLowerCase() : word)) type = 'keyword';
      else if (grammar.keys && /^[ \t]*:(?![:/])/.test(code.slice(end, end + 8))) type = 'function';
      else if (grammar.functions !== false && /^[ \t]*\(/.test(code.slice(end, end + 8))) type = 'function';
      else if (grammar.types !== false && /^[A-Z]/.test(word) && /[a-z]/.test(word)) type = 'type'; // PascalCase, not CONSTANTS
    }
    if (type) tokens.push({ type, start, end });
  }
  return tokens;
}
