import { describe, expect, it } from 'vitest';
import { fromMarkdown } from '../src';

const html = (md: string) => fromMarkdown(md);

describe('headings with #', () => {
  it('reads the level and the text, and takes the closing hashes away when they follow a space', () => {
    expect(html('# One')).toBe('<h1>One</h1>');
    expect(html('## Two')).toBe('<h2>Two</h2>');
    expect(html('### Three')).toBe('<h3>Three</h3>');
    expect(html('#### Four')).toBe('<h3>Four</h3>'); // the editor has three levels
    expect(html('# Closed #')).toBe('<h1>Closed</h1>');
    expect(html('## Closed ####   ')).toBe('<h2>Closed</h2>');
    expect(html('# foo#')).toBe('<h1>foo#</h1>');
    expect(html('#\tTab')).toBe('<h1>Tab</h1>');
    expect(html('   # Indented')).toBe('<h1>Indented</h1>');
    expect(html('#')).toBe('<h1></h1>');
  });

  it('is not a heading without a space after the hashes, or with too many hashes, or indented four spaces', () => {
    expect(html('#hashtag')).toBe('<p>#hashtag</p>');
    expect(html('####### seven')).toBe('<p>####### seven</p>');
    expect(html('    # code')).toContain('<pre>');
  });
});

describe('horizontal lines', () => {
  it('is three or more of the same mark, with spaces and tabs between', () => {
    for (const line of ['---', '***', '___', '- - -', '* * *', '_\t_\t_', '-----', '  ---  ', '- -  - -']) expect(html(line), line).toBe('<hr>');
  });

  it('is not two marks, or different marks, or other text', () => {
    expect(html('--')).not.toContain('<hr>');
    expect(html('-*-')).not.toContain('<hr>');
    expect(html('--- x')).not.toContain('<hr>');
    expect(html('a---')).not.toContain('<hr>');
  });
});

describe('the line under the heads of a table', () => {
  it('has cells of dashes, with colons for the alignment, with and without bars at the ends', () => {
    const cases: [string, string][] = [
      ['a | b', '|---|---|'],
      ['a | b', '--- | ---'],
      ['a | b | c', '| :--- | :---: | ---: |'],
      ['a | b', ':-- | --:'],
      ['a | b', '|-|-|'],
      ['a | b', '  |---|---|  '],
    ];
    for (const [head, delim] of cases) expect(html(`${head}\n${delim}\n1 | 2`), delim).toContain('<table>');
  });

  it('is not one when a cell is not dashes', () => {
    for (const delim of ['|---|-x-|', '| |---|', 'a | b', '|:|---|']) expect(html(`a | b\n${delim}\n1 | 2`), delim).not.toContain('<table>');
  });
});

describe('code fences', () => {
  it('takes the language after the fence, with spaces around it, and closes on a line of fence marks alone', () => {
    expect(html('```js\ncode\n```')).toContain('data-language="javascript"');
    expect(html('```  python  \ncode\n```')).toContain('data-language="python"');
    expect(html('~~~\ncode\n~~~')).toBe('<pre>code</pre>');
    expect(html('```\na\n```   \nafter')).toBe('<pre>a</pre><p>after</p>');
    // a closing fence has no text after it: this is code
    expect(html('```\na\n``` b\nc\n```')).toBe('<pre>a\n``` b\nc</pre>');
  });
});

describe('long lines of spaces and tabs', () => {
  const N = 200000;
  const shapes: Record<string, string> = {
    'a heading': '#' + '\t'.repeat(N) + 'x',
    'a heading, then hashes': '# a' + '\t'.repeat(N) + '#' + '\t'.repeat(N) + '#x',
    'a heading of spaces': '#' + ' '.repeat(N),
    'the line under a table': 'a | b\n-' + '\t'.repeat(N) + 'x',
    'cells under a table': 'a | b\n|-' + '\t|-'.repeat(N / 3) + 'x',
    'bars under a table': 'a | b\n-' + '\t'.repeat(N) + '|' + '\t'.repeat(N) + 'x',
    'a line of marks': '-' + '\t-'.repeat(N / 2) + 'x',
    'a fence': '```' + '\t'.repeat(N) + '`',
    'a fence of spaces': '~~~' + ' '.repeat(N) + 'x',
    'a closing fence': '```\na\n```' + '\t'.repeat(N) + 'x',
  };
  for (const [name, md] of Object.entries(shapes)) {
    it(`is read in a moment: ${name}`, () => {
      const start = performance.now();
      html(md);
      expect(performance.now() - start).toBeLessThan(1500);
    });
  }
});

describe('a table cell with a long run of spaces', () => {
  it('is written in a moment, and a line break in it is one space or a <br>', async () => {
    const { toMarkdown } = await import('../src');
    const start = performance.now();
    toMarkdown('<table><tbody><tr><td>' + ' '.repeat(200000) + 'x</td><td>a\n \n b</td></tr></tbody></table>');
    expect(performance.now() - start).toBeLessThan(1500);
    expect(toMarkdown('<table><tbody><tr><th>h</th></tr><tr><td>a \n\n  b<br>c</td></tr></tbody></table>')).toContain('| a b<br>c |');
  });
});

describe('taking characters off the ends', () => {
  it('takes them off at the end, at the start and at both', async () => {
    const { strip, stripEnd, stripStart } = await import('../src/strings');
    expect(stripEnd('abc...', '.')).toBe('abc');
    expect(stripEnd('abc', '.')).toBe('abc');
    expect(stripEnd('...', '.')).toBe('');
    expect(stripStart('  abc ', ' ')).toBe('abc ');
    expect(strip('. .a. b. .', '. ')).toBe('a. b');
    expect(strip('', 'x')).toBe('');
  });
});

describe('a file name', () => {
  it('has no path, no characters that a system refuses, and no spaces or dots at the ends', async () => {
    const { safeFilename } = await import('../src/download');
    expect(safeFilename('  ..My: report?.docx. ')).toBe('My report .docx');
    expect(safeFilename('a/b:c')).toBe('a b c');
    expect(safeFilename('...', 'fallback')).toBe('fallback');
    expect(safeFilename(undefined)).toBe('document');
    expect(safeFilename('x'.repeat(300))).toHaveLength(120);
  });

  it('is made in a moment from a name of many dots and spaces', async () => {
    const { safeFilename } = await import('../src/download');
    const start = performance.now();
    safeFilename('. '.repeat(200000) + 'x' + '. '.repeat(200000) + 'y');
    safeFilename('a' + ' '.repeat(300000) + '#');
    expect(performance.now() - start).toBeLessThan(1500);
  });
});

describe('text with long runs of what is taken off its ends', () => {
  const N = 300000;
  it('is read in a moment: spaces before a line break, punctuation at the end of an address, line breaks in plain text', async () => {
    const { toMarkdown } = await import('../src');
    const start = performance.now();
    html('a' + ' '.repeat(N) + 'b\nc');
    html('see www.example.com/' + '!'.repeat(N) + 'x and more');
    html('x' + ' '.repeat(N) + 'y');
    toMarkdown('<table><tbody><tr><td>' + ' '.repeat(N) + 'x ' + ' '.repeat(N) + '</td></tr></tbody></table>');
    toMarkdown('<p><strong>' + ' '.repeat(N) + 'x' + ' '.repeat(N) + 'y</strong></p>');
    expect(performance.now() - start).toBeLessThan(3000);
  });

  it('keeps the meaning: a hard break is two spaces and a line break, an address loses the punctuation at its end', () => {
    expect(html('one  \ntwo')).toBe('<p>one<br>two</p>');
    expect(html('one \ntwo')).toBe('<p>one\ntwo</p>');
    expect(html('see https://example.com/page.')).toContain('<a href="https://example.com/page">');
    expect(html('see https://example.com/page?!')).toContain('<a href="https://example.com/page">');
  });
});
