import { describe, expect, it } from 'vitest';
import { EMOJI_GROUPS, SKIN_TONES, emojiName, searchEmoji, withTone } from '../src/entries/emoji';
import { sanitize, toMarkdown } from '../src';

const all = EMOJI_GROUPS.flatMap((g) => g.items);
const find = (char: string) => all.find((i) => i.char === char)!;

describe('the emoji', () => {
  it('are over five hundred, in eight groups, each once, each with a name in English and in Dutch', () => {
    expect(all.length).toBeGreaterThan(500);
    expect(EMOJI_GROUPS.map((g) => g.id)).toEqual(['smileys', 'people', 'animals', 'food', 'activities', 'travel', 'objects', 'symbols']);
    const chars = all.map((i) => i.char);
    expect(new Set(chars).size).toBe(chars.length);
    for (const item of all) {
      expect(item.name.en, item.char).toBeTruthy();
      expect(item.name.nl, item.char).toBeTruthy();
      expect(item.words, item.char).toBeTruthy();
    }
  });

  it('are found by their name and by their words, in English and in Dutch', () => {
    expect(searchEmoji('thumbs up')[0].char).toBe('👍');
    expect(searchEmoji('duim')[0].char).toBe('👍');
    expect(searchEmoji('hond').map((i) => i.char)).toContain('🐶');
    expect(searchEmoji('rocket').map((i) => i.char)).toContain('🚀');
    expect(searchEmoji('raket').map((i) => i.char)).toContain('🚀');
  });

  it('are found from the start of a word, with any case and without accents', () => {
    expect(searchEmoji('SMIL').length).toBeGreaterThan(0);
    expect(searchEmoji('geirriteerd').map((i) => i.char)).toContain('🙄'); // written geïrriteerd
    expect(searchEmoji('mile')).toEqual([]); // the middle of a word is not the start of one
    expect(searchEmoji('   ')).toEqual([]);
  });

  it('are found by all the words typed, the ones whose name starts with it first', () => {
    expect(searchEmoji('face kiss').every((i) => /kiss/.test(i.words))).toBe(true);
    const names = searchEmoji('heart').map((i) => i.name.en);
    expect(names[0]).toMatch(/^heart|heart/);
    expect(searchEmoji('heart', 3)).toHaveLength(3);
  });

  it('have skin tones for hands and people, and a tone is a modifier after the character', () => {
    expect(SKIN_TONES).toHaveLength(6);
    expect(withTone(find('👍'), 0)).toBe('👍');
    expect(withTone(find('👍'), 3)).toBe('👍\u{1F3FD}');
    expect(withTone(find('✌'), 5)).toBe('✌\u{1F3FF}'); // the variation selector goes, the modifier takes its place
    expect(withTone(find('😀'), 4)).toBe('😀'); // a face has none
    expect(withTone(find('👍'), 9)).toBe('👍');
  });

  it('are named in the language of the editor: Dutch has names of its own', () => {
    expect(emojiName(find('👍'), 'nl')).toBe('duim omhoog');
    expect(emojiName(find('👍'), 'en')).toBe('thumbs up');
    expect(emojiName(find('👍'), 'de')).toBe('thumbs up');
  });

  it('are only characters: the HTML keeps them and Markdown has them', () => {
    expect(sanitize('<p>Hi 😀 👍🏽 🇳🇱</p>')).toBe('<p>Hi 😀 👍🏽 🇳🇱</p>');
    expect(toMarkdown('<p>Hi 😀</p>')).toContain('😀');
  });
});
