import { describe, expect, it } from 'vitest';
import { countCharacters, countText, countWords, plainText, truncateCharacters } from '../src/stats';

const el = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d;
};

describe('plainText', () => {
  it('puts a line break between blocks and at <br>, so words are not glued together', () => {
    expect(plainText(el('<p>one</p><p>two<br>three</p>'))).toBe('one\ntwo\nthree');
  });
  it('separates table cells with a tab and rows with a line break', () => {
    expect(plainText(el('<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>'))).toBe('a\tb\nc\td');
  });
  it('is empty for empty content', () => {
    expect(plainText(el('<p><br></p>'))).toBe('');
  });
});

describe('counting', () => {
  it('counts an emoji and a letter with accents as one character, and ignores line breaks', () => {
    expect(countCharacters('a\u{1F468}‍\u{1F469}‍\u{1F467}é\nb')).toBe(4);
  });
  it('counts words, an apostrophe word as one, and ignores punctuation', () => {
    expect(countWords("it's a fact, 42 times!")).toBe(5);
  });
  it('gives characters with and without spaces', () => {
    expect(countText('ab cd')).toEqual({ characters: 5, charactersNoSpaces: 4, words: 2 });
  });
  it('truncates by characters without cutting an emoji in half', () => {
    expect(truncateCharacters('ab\u{1F600}cd', 3)).toBe('ab\u{1F600}');
    expect(truncateCharacters('ab\ncd', 3)).toBe('ab\ncd'.slice(0, 4));
  });
});
