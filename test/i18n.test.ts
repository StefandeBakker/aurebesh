import { readdirSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Aurebesh, COMMANDS, DEFAULT_LABELS, LABELS_DE, LABELS_EN, LABELS_ES, LABELS_FR, LABELS_NL, LANGUAGES, matchLanguage, resolveLanguage } from '../src';
import { defineAurebeshElement } from '../src/element';
import { AurebeshEditor as ReactEditor } from '../src/react';

const reference = Object.keys(LABELS_EN);
const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join(',');

/** Commands that are never shown in the toolbar, so they have no text of their own. */
const INTERNAL_COMMANDS = ['videoFile', 'imageWidth', 'imageAlign', 'imageAlt'];

describe('the built-in languages', () => {
  it('are English, Dutch, German, French and Spanish', () => {
    expect(Object.keys(LANGUAGES).sort()).toEqual(['de', 'en', 'es', 'fr', 'nl']);
    expect(DEFAULT_LABELS).toBe(LABELS_EN);
  });

  describe.each([
    ['nl', LABELS_NL],
    ['de', LABELS_DE],
    ['fr', LABELS_FR],
    ['es', LABELS_ES],
  ])('%s', (_code, labels) => {
    it('has a text for every key of the English reference, and no key that English does not have', () => {
      expect(reference.filter((k) => !(k in labels)), 'missing').toEqual([]);
      expect(Object.keys(labels).filter((k) => !(k in LABELS_EN)), 'unknown').toEqual([]);
    });

    it('has no empty text, and keeps the {placeholders} of the English text', () => {
      for (const k of reference) {
        expect(labels[k].trim(), k).not.toBe('');
        expect(placeholders(labels[k]), k).toBe(placeholders(LABELS_EN[k]));
      }
    });
  });

  it('English has a text for everything the editor shows: every command, and every text it asks for', () => {
    for (const [name, cmd] of Object.entries(COMMANDS)) {
      if (INTERNAL_COMMANDS.includes(name)) continue;
      expect(LABELS_EN[name], `command ${name}`).toBeDefined();
      expect(LABELS_EN[name], `command ${name} must be the title of the command`).toBe(name === 'page' ? 'Page format' : cmd.title);
    }
    const used = new Set<string>();
    const prefixes = new Set<string>();
    for (const file of readdirSync('src')) {
      if (!file.endsWith('.ts')) continue;
      const source = readFileSync(`src/${file}`, 'utf8');
      for (const m of source.matchAll(/\bt\(\s*['"]([\w.-]+)['"]/g)) used.add(m[1]);
      for (const m of source.matchAll(/\bt\(\s*`([\w.-]+)\$\{/g)) prefixes.add(m[1]);
    }
    expect([...used].filter((k) => !(k in LABELS_EN)), 'texts the code asks for').toEqual([]);
    for (const prefix of prefixes) expect(reference.some((k) => k.startsWith(prefix)), `texts starting with ${prefix}`).toBe(true);
  });

  it('keeps the Dutch of before', () => {
    expect(LABELS_NL.bold).toBe('Vet');
    expect(LABELS_NL['ui.limitReached']).toBe('Het maximum van {max} tekens is bereikt.');
    expect(LABELS_NL['page.custom']).toBe('Aangepast');
  });

  it('has the plural forms the editor uses', () => {
    for (const labels of Object.values(LANGUAGES)) for (const k of ['ui.words.one', 'ui.words.other', 'ui.characters.one', 'ui.characters.other']) expect(labels[k]).toBeTruthy();
  });
});

describe('finding the language', () => {
  afterEach(() => vi.restoreAllMocks());
  const browser = (languages: string[]) => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
    vi.spyOn(navigator, 'language', 'get').mockReturnValue(languages[0] ?? 'en');
  };

  it('matches a language tag to a built-in language by its first part', () => {
    expect(matchLanguage('nl')).toBe('nl');
    expect(matchLanguage('nl-BE')).toBe('nl');
    expect(matchLanguage('DE_at')).toBe('de');
    expect(matchLanguage('fr-CA')).toBe('fr');
    expect(matchLanguage('ja')).toBeNull();
    expect(matchLanguage('')).toBeNull();
    expect(matchLanguage(undefined)).toBeNull();
  });

  it('uses the language that is asked for, also written as a tag, and English for one that is not built in', () => {
    browser(['nl-NL']);
    expect(resolveLanguage('de')).toBe('de');
    expect(resolveLanguage('es-MX')).toBe('es');
    expect(resolveLanguage('ja')).toBe('en');
  });

  it('follows the browser without one, in the order of the languages of the user, skipping what is not built in', () => {
    browser(['ja-JP', 'fr-FR', 'en']);
    expect(resolveLanguage(undefined)).toBe('fr');
    expect(resolveLanguage('auto')).toBe('fr');
    browser(['ja-JP', 'ko']);
    expect(resolveLanguage(undefined)).toBe('en');
  });

  it('follows the lang of the element or the page before the browser', () => {
    browser(['nl-NL']);
    const page = document.createElement('div');
    page.setAttribute('lang', 'de-CH');
    const inner = document.createElement('div');
    page.appendChild(inner);
    expect(resolveLanguage(undefined, inner)).toBe('de');
    inner.setAttribute('lang', 'es');
    expect(resolveLanguage(undefined, inner)).toBe('es'); // the nearest one
    inner.setAttribute('lang', 'ja');
    expect(resolveLanguage(undefined, inner)).toBe('en'); // a page in a language that is not built in: English, not the browser's
    expect(resolveLanguage('fr', inner)).toBe('fr'); // asked for: it wins
  });

  it('is English where there is no browser', () => {
    vi.stubGlobal('navigator', undefined);
    expect(resolveLanguage(undefined)).toBe('en');
    vi.unstubAllGlobals();
  });
});

describe('the editor', () => {
  afterEach(() => vi.restoreAllMocks());
  const make = (o: object = {}, lang?: string) => {
    const el = document.createElement('div');
    if (lang) el.setAttribute('lang', lang);
    document.body.appendChild(el);
    const ed = new Aurebesh(el, { toolbar: ['bold', 'link', '|', 'table'], ...o });
    return { el, ed };
  };
  const title = (el: HTMLElement, name: string) => el.querySelector(`.aurebesh-cmd-${name}`)!.getAttribute('title');

  it('shows its texts in the language that is asked for', () => {
    for (const [code, expected] of [['en', 'Bold'], ['nl', 'Vet'], ['de', 'Fett'], ['fr', 'Gras'], ['es', 'Negrita']]) {
      const { el, ed } = make({ language: code });
      expect(title(el, 'bold')).toBe(expected);
      expect(ed.getLanguage()).toBe(code);
      el.remove();
    }
  });

  it('follows the browser, and the lang of the page before it, when nothing is asked for', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-DE', 'en']);
    const browser = make();
    expect(title(browser.el, 'bold')).toBe('Fett');
    expect(browser.ed.getLanguage()).toBe('de');
    const page = make({}, 'fr');
    expect(title(page.el, 'bold')).toBe('Gras');
    const asked = make({ language: 'es' }, 'fr');
    expect(title(asked.el, 'bold')).toBe('Negrita');
    for (const x of [browser, page, asked]) x.el.remove();
  });

  it('lets single labels win over the language, and the texts of a plugin stay as they are', () => {
    const { el } = make({ language: 'de', labels: { bold: 'Extra fett' } });
    expect(title(el, 'bold')).toBe('Extra fett');
    expect(title(el, 'link')).toBe('Link einfügen');
    el.remove();
  });

  it('still takes a whole language through labels, as before', () => {
    const { el } = make({ language: 'en', labels: LABELS_NL });
    expect(title(el, 'bold')).toBe('Vet');
    el.remove();
  });

  it('uses the language in the popovers and the footer too', () => {
    const { el } = make({ language: 'fr', counter: true, value: '<p>un deux</p>' });
    expect(el.querySelector('.aurebesh-count')!.textContent).toBe('2 mots · 7 caractères');
    el.remove();
  });
});

describe('the element and the wrappers', () => {
  defineAurebeshElement();
  const attach = HTMLElement.prototype.attachInternals;
  HTMLElement.prototype.attachInternals = function (this: HTMLElement) {
    const internals = (attach ? attach.call(this) : {}) as Record<string, unknown>;
    internals['setFormValue'] ??= () => {};
    internals['setValidity'] ??= () => {};
    return internals as unknown as ElementInternals;
  };
  const settle = () => new Promise((r) => setTimeout(r, 5));

  it('takes the language from the language attribute or lang, and builds the editor again when it changes, keeping the text', async () => {
    const el = document.createElement('aurebesh-editor') as HTMLElement & { value: string };
    el.setAttribute('toolbar', 'bold');
    el.setAttribute('language', 'es');
    el.innerHTML = '<p>keep</p>';
    document.body.appendChild(el);
    await settle();
    expect(el.querySelector('.aurebesh-cmd-bold')!.getAttribute('title')).toBe('Negrita');
    el.setAttribute('language', 'fr');
    expect(el.querySelector('.aurebesh-cmd-bold')!.getAttribute('title')).toBe('Gras');
    expect(el.value).toBe('<p>keep</p>');
    el.removeAttribute('language');
    el.setAttribute('lang', 'de');
    el.setAttribute('language', 'auto');
    expect(el.querySelector('.aurebesh-cmd-bold')!.getAttribute('title')).toBe('Fett');
    el.remove();
  });

  it('has a language prop in the React wrapper that reaches the element', () => {
    const out = renderToString(createElement(ReactEditor, { language: 'nl', toolbar: ['bold'] }));
    expect(out).toContain('language="nl"');
  });
});

describe('registering a language', () => {
  it('makes a language known to the option, to the lang of the page and to the browser', () => {
    const it = { ...LABELS_EN, bold: 'Grassetto' };
    LANGUAGES.it = it;
    try {
      expect(matchLanguage('it-IT')).toBe('it');
      const el = document.createElement('div');
      el.setAttribute('lang', 'it');
      document.body.appendChild(el);
      const ed = new Aurebesh(el, { toolbar: ['bold'] });
      expect(el.querySelector('.aurebesh-cmd-bold')!.getAttribute('title')).toBe('Grassetto');
      expect(ed.getLanguage()).toBe('it');
      el.remove();
    } finally {
      delete LANGUAGES.it;
    }
    expect(matchLanguage('it')).toBeNull();
  });
});
