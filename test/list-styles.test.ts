import { describe, expect, it } from 'vitest';
import { sanitize, toMarkdown } from '../src';
import { fromMarkdown } from '../src/from-markdown';
import { toDocxBytes } from '../src/docx';
import { unzip } from '../src/zip';
import { BULLET_STYLES, DEFAULT_LIST_STYLE, LIST_SAMPLES, NUMBER_STYLES } from '../src/lists';

const numbering = async (html: string): Promise<string> => {
  const bytes = await toDocxBytes(html);
  const files = await unzip(bytes);
  const file = files.find((f) => f.name === 'word/numbering.xml')!;
  return new TextDecoder().decode(file.data);
};

describe('the look of the marker of a list', () => {
  it('is in the style of the list, and the sanitizer keeps these looks and no other', () => {
    for (const style of [...BULLET_STYLES, ...NUMBER_STYLES]) {
      const tag = BULLET_STYLES.includes(style) ? 'ul' : 'ol';
      expect(sanitize(`<${tag} style="list-style-type: ${style}"><li>a</li></${tag}>`)).toBe(`<${tag} style="list-style-type: ${style}"><li>a</li></${tag}>`);
    }
    expect(sanitize('<ul style="list-style-type: url(x)"><li>a</li></ul>')).toBe('<ul><li>a</li></ul>');
    expect(sanitize('<ol style="list-style-type: lower-greek; color: red"><li>a</li></ol>')).toBe('<ol><li>a</li></ol>');
    expect(sanitize('<ul style="position: fixed"><li>a</li></ul>')).toBe('<ul><li>a</li></ul>');
  });

  it('has a sample for each look, and the plain looks are the ones a list has without a style', () => {
    for (const style of [...BULLET_STYLES, ...NUMBER_STYLES]) expect(LIST_SAMPLES[style], style).toBeTruthy();
    expect(DEFAULT_LIST_STYLE).toEqual({ ul: 'disc', ol: 'decimal' });
  });

  it('does not change the Markdown: it has a list, not the look of its marker', () => {
    expect(toMarkdown('<ol style="list-style-type: upper-roman"><li>a</li><li>b</li></ol>').trim()).toBe('1. a\n2. b');
    expect(toMarkdown('<ul style="list-style-type: square"><li>a</li></ul>').trim()).toBe('- a');
  });

  it('is in the Word document as the kind of numbering that Word has for it', async () => {
    const letters = await numbering('<ol style="list-style-type: lower-alpha"><li>a</li></ol>');
    expect(letters).toMatch(/<w:num w:numId="3"><w:abstractNumId w:val="3"\/>/);
    expect(letters).toMatch(/w:abstractNumId="3"[^]*?<w:lvl w:ilvl="0"><w:start w:val="1"\/><w:numFmt w:val="lowerLetter"\/>/);
    const roman = await numbering('<ol style="list-style-type: upper-roman"><li>a</li></ol>');
    expect(roman).toContain('<w:numFmt w:val="upperRoman"/>');
    const squares = await numbering('<ul style="list-style-type: square"><li>a</li></ul>');
    expect(squares).toMatch(/<w:numFmt w:val="bullet"\/><w:lvlText w:val="▪"\/>/);
    const circles = await numbering('<ul style="list-style-type: circle"><li>a</li></ul>');
    expect(circles).toContain('<w:lvlText w:val="◦"/>');
  });
});

describe('the six levels of heading', () => {
  it('are in the HTML, the Markdown and back', () => {
    const html = '<h1>1</h1><h2>2</h2><h3>3</h3><h4>4</h4><h5>5</h5><h6>6</h6>';
    expect(sanitize(html)).toBe(html);
    expect(toMarkdown(html).trim().split('\n\n')).toEqual(['# 1', '## 2', '### 3', '#### 4', '##### 5', '###### 6']);
    expect(fromMarkdown('#### 4\n\n###### 6')).toBe('<h4>4</h4><h6>6</h6>');
  });
});
