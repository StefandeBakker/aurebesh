/**
 * All text the editor itself shows, per language. The editor picks the language from the `language` option, or from the `lang` of the
 * page (or of the element), or from the language of the browser; English is the fallback. Override single texts with the `labels`
 * option, e.g. `{ labels: { bold: 'Fett' } }`, or pin a whole language with `{ labels: LABELS_NL }`.
 *
 * Keys without a prefix are toolbar button names (they set the tooltip and the screen-reader label), `ui.*` and the other keys with a
 * dot are texts in popovers, the footer and the status line. `{name}`, `{count}` and `{max}` are filled in where shown.
 * Error messages thrown for bad links or files stay English.
 *
 * Adding a language: see "Texts and languages" in the README.
 */
import { LABELS_DE } from './locales/de';
import { LABELS_EN } from './locales/en';
import { LABELS_ES } from './locales/es';
import { LABELS_FR } from './locales/fr';
import { LABELS_NL } from './locales/nl';

export type Labels = Record<string, string>;

export { LABELS_DE, LABELS_EN, LABELS_ES, LABELS_FR, LABELS_NL };

/** English: what is used where a language has no text (and the reference for translations). */
export const DEFAULT_LABELS: Labels = LABELS_EN;

/** The languages that are built in, by their code. Add one with `LANGUAGES.xx = LABELS_XX` before an editor is made, or use `labels`. */
export const LANGUAGES: Record<string, Labels> = { en: LABELS_EN, nl: LABELS_NL, de: LABELS_DE, fr: LABELS_FR, es: LABELS_ES };

/** The built-in language for a language tag such as `nl`, `nl-BE` or `de_AT`; null when there is none. */
export function matchLanguage(tag: string | null | undefined): string | null {
  const primary = (tag ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return primary && primary in LANGUAGES ? primary : null;
}

/**
 * The language to use. An explicit code (`'nl'`) wins, also when it is written as a tag (`'nl-BE'`). Without one (or with `'auto'`) it is
 * the `lang` of the element or the page (the nearest one), and without that the languages of the browser, in the order the user has
 * them. What is not built in falls back to English.
 */
export function resolveLanguage(explicit: string | null | undefined, container?: Element | null): string {
  const asked = (explicit ?? '').trim();
  if (asked && asked.toLowerCase() !== 'auto') return matchLanguage(asked) ?? 'en';
  const page = container?.closest?.('[lang]')?.getAttribute('lang')?.trim();
  if (page) return matchLanguage(page) ?? 'en'; // the page says what its language is: the editor follows it
  const nav = typeof navigator === 'undefined' ? null : navigator;
  for (const tag of [...(nav?.languages ?? []), nav?.language]) {
    const found = matchLanguage(tag);
    if (found) return found;
  }
  return 'en';
}
