import { describe, expect, it } from 'vitest';
import { fromMarkdown, sanitize, toMarkdown } from '../src';
import { tokenize } from '../src/highlight';
import { CODE_LANGUAGES, normalizeLanguage } from '../src/languages';
import type { TokenType } from '../src/highlight';

/** The words of the code that have a type of token, as text. */
const found = (code: string, language: string | null | undefined, type: TokenType): string[] =>
  tokenize(code, language)
    .filter((t) => t.type === type)
    .map((t) => code.slice(t.start, t.end));

describe('the names of languages', () => {
  it('turns the names after a fence into the language of the list', () => {
    for (const [name, id] of [['js', 'javascript'], ['JS', 'javascript'], ['ts', 'typescript'], ['py', 'python'], ['c#', 'csharp'], ['cs', 'csharp'], ['c++', 'cpp'], ['sh', 'bash'], ['yml', 'yaml'], ['golang', 'go'], ['plaintext', 'text'], ['python', 'python']]) {
      expect(normalizeLanguage(name), name).toBe(id);
    }
  });

  it('keeps a language that is not in the list when it is a plain name, and drops what is not usable', () => {
    expect(normalizeLanguage('mermaid')).toBe('mermaid');
    expect(normalizeLanguage('language-python')).toBe('python');
    expect(normalizeLanguage('js {highlight: 1}')).toBe('javascript');
    expect(normalizeLanguage('')).toBeNull();
    expect(normalizeLanguage(null)).toBeNull();
    expect(normalizeLanguage('"><script>')).toBeNull();
  });

  it('has an id that is a plain name for every language', () => {
    for (const lang of CODE_LANGUAGES) expect(lang.id).toMatch(/^[a-z][a-z0-9-]{0,19}$/);
  });
});

describe('the colours of a language', () => {
  it('has no colours for plain text, and the generic colours without a language or with one that has no grammar', () => {
    expect(tokenize('const a = 1; // x', 'text')).toEqual([]);
    expect(found('const a = 1;', undefined, 'keyword')).toEqual(['const']);
    expect(found('const a = 1;', 'mermaid', 'keyword')).toEqual(['const']);
  });

  it('knows the keywords of a language, and not those of another', () => {
    expect(found('def f(self): return None', 'python', 'keyword')).toEqual(['def', 'self', 'return', 'None']);
    expect(found('function f() { return null }', 'javascript', 'keyword')).toEqual(['function', 'return', 'null']);
    expect(found('func main() { defer x() }', 'go', 'keyword')).toEqual(['func', 'defer']);
    expect(found('def x', 'javascript', 'keyword')).toEqual([]); // def is Python
    expect(found('fn main() -> i32 { let mut x = 1; }', 'rust', 'keyword')).toEqual(['fn', 'i32', 'let', 'mut']);
  });

  it('has the comments and strings of a language', () => {
    expect(found('x = 1 # note', 'python', 'comment')).toEqual(['# note']);
    expect(found('x = 1 // note', 'python', 'comment')).toEqual([]); // // is division in Python
    expect(found('select 1 -- note', 'sql', 'comment')).toEqual(['-- note']);
    expect(found('<p>a</p><!-- c -->', 'html', 'comment')).toEqual(['<!-- c -->']);
    expect(found('a = """doc\nmore"""', 'python', 'string')).toEqual(['"""doc\nmore"""']);
    expect(found('const s = `a ${b}`;', 'javascript', 'string')).toEqual(['`a ${b}`']);
    expect(found("echo 'a' \"b\"", 'bash', 'string')).toEqual(["'a'", '"b"']);
  });

  it('reads SQL keywords in any case', () => {
    expect(found('SELECT name FROM users where id = 1', 'sql', 'keyword')).toEqual(['SELECT', 'FROM', 'where']);
  });

  it('colours the keys of JSON and YAML, and the values another way', () => {
    expect(found('{"a": 1, "b": "x"}', 'json', 'function')).toEqual(['"a"', '"b"']);
    expect(found('{"a": 1, "b": "x"}', 'json', 'string')).toEqual(['"x"']);
    expect(found('{"ok": true, "n": null}', 'json', 'keyword')).toEqual(['true', 'null']);
    expect(found('name: aurebesh\nversion: 1\n# c', 'yaml', 'function')).toEqual(['name', 'version']);
  });

  it('colours the tags and attributes of HTML, and the properties, units and colours of CSS', () => {
    expect(found('<a href="x">t</a>', 'html', 'tag')).toEqual(['<a', '</a']);
    expect(found('<a href="x">t</a>', 'html', 'type')).toEqual(['href']);
    expect(found('a { color: #fff; margin: 10px; }', 'css', 'number')).toEqual(['#fff', '10px']);
    expect(found('a { color: #fff; margin: 10px; }', 'css', 'function')).toEqual(['color', 'margin']);
    expect(found('@media (min-width: 1px) {}', 'css', 'keyword')).toEqual(['@media']);
  });

  it('colours the variables of shell and PHP scripts', () => {
    expect(found('echo $HOME ${PATH}', 'bash', 'type')).toEqual(['$HOME', '${PATH}']);
    expect(found('<?php echo $name; ?>', 'php', 'type')).toEqual(['$name']);
  });

  it('colours every language of the list without throwing, also on odd input', () => {
    for (const lang of CODE_LANGUAGES) {
      expect(() => tokenize('a = "unterminated\n/* open\n#fff 0x1F ${x', lang.id), lang.id).not.toThrow();
    }
  });
});

describe('the language of a code block in the HTML', () => {
  it('keeps the language on a pre, when it is a plain name', () => {
    expect(sanitize('<pre data-language="python">x</pre>')).toBe('<pre data-language="python">x</pre>');
    expect(sanitize('<pre data-language="Py thon">x</pre>')).toBe('<pre>x</pre>');
    expect(sanitize('<pre data-language="a&quot;&gt;&lt;script">x</pre>')).toBe('<pre>x</pre>');
    expect(sanitize('<p data-language="python">x</p>')).toBe('<p>x</p>');
  });
});

describe('the language of a code block in Markdown', () => {
  it('stands after the fence, and is read from it, also by its short name', () => {
    expect(toMarkdown('<pre data-language="python">print(1)</pre>')).toBe('```python\nprint(1)\n```');
    expect(toMarkdown('<pre>plain</pre>')).toBe('```\nplain\n```');
    expect(fromMarkdown('```py\nprint(1)\n```')).toBe('<pre data-language="python">print(1)</pre>');
    expect(fromMarkdown('~~~sh\nls\n~~~')).toBe('<pre data-language="bash">ls</pre>');
    expect(fromMarkdown('```\nplain\n```')).toBe('<pre>plain</pre>');
    expect(fromMarkdown('    indented')).toBe('<pre>indented</pre>');
  });

  it('is the same after a round trip, with a language that is not in the list too', () => {
    for (const md of ['```javascript\nlet a = 1;\n```', '```sql\nSELECT 1;\n```', '```mermaid\ngraph TD;\n```']) {
      expect(toMarkdown(fromMarkdown(md))).toBe(md);
    }
  });
});
