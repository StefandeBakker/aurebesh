/**
 * The programming languages of a code block. A block that has a language says so in `data-language` (`<pre data-language="python">`); a
 * block without one is automatic: the generic highlighter, which does reasonably for most languages. `text` is plain text, with no colours.
 */
export interface CodeLanguage {
  id: string;
  /** The name in the list. `text` has none: the editor translates it. */
  name: string;
  /** Other names for it: what stands after the fence in Markdown. */
  aliases?: string[];
}

export const CODE_LANGUAGES: CodeLanguage[] = [
  { id: 'text', name: 'Plain text', aliases: ['plaintext', 'txt', 'none', 'plain'] },
  { id: 'javascript', name: 'JavaScript', aliases: ['js', 'jsx', 'mjs', 'cjs', 'node'] },
  { id: 'typescript', name: 'TypeScript', aliases: ['ts', 'tsx'] },
  { id: 'json', name: 'JSON', aliases: ['jsonc', 'json5'] },
  { id: 'html', name: 'HTML', aliases: ['htm', 'xhtml', 'vue', 'svelte'] },
  { id: 'xml', name: 'XML', aliases: ['svg', 'xsl', 'xslt', 'rss', 'plist'] },
  { id: 'css', name: 'CSS', aliases: ['scss', 'sass', 'less'] },
  { id: 'python', name: 'Python', aliases: ['py', 'python3', 'py3'] },
  { id: 'java', name: 'Java', aliases: [] },
  { id: 'csharp', name: 'C#', aliases: ['cs', 'c#', 'dotnet'] },
  { id: 'c', name: 'C', aliases: ['h'] },
  { id: 'cpp', name: 'C++', aliases: ['c++', 'cc', 'cxx', 'hpp'] },
  { id: 'go', name: 'Go', aliases: ['golang'] },
  { id: 'rust', name: 'Rust', aliases: ['rs'] },
  { id: 'php', name: 'PHP', aliases: [] },
  { id: 'ruby', name: 'Ruby', aliases: ['rb'] },
  { id: 'sql', name: 'SQL', aliases: ['mysql', 'postgres', 'postgresql', 'sqlite', 'tsql', 'plsql'] },
  { id: 'bash', name: 'Bash', aliases: ['sh', 'shell', 'zsh', 'console', 'terminal', 'shellscript'] },
  { id: 'yaml', name: 'YAML', aliases: ['yml'] },
];

/** What a language id may look like: a plain name (it is written in an attribute and after a Markdown fence). */
export const LANGUAGE_ID = /^[a-z][a-z0-9-]{0,19}$/;

const BY_NAME = new Map<string, string>();
for (const lang of CODE_LANGUAGES) {
  BY_NAME.set(lang.id, lang.id);
  for (const alias of lang.aliases ?? []) BY_NAME.set(alias, lang.id);
}

/**
 * The language id for a name (an id, an alias, or the word after a Markdown fence): `javascript` for `js`. A language that is not in
 * the list is kept as it is when it is a plain name (so that it survives a round trip), and null when there is nothing usable.
 */
export function normalizeLanguage(name: string | null | undefined): string | null {
  const word = (name ?? '').trim().split(/[\s{,]/)[0].toLowerCase().replace(/^\./, '').replace(/^language-/, '');
  if (!word) return null;
  const known = BY_NAME.get(word);
  if (known) return known;
  const slug = word.replace(/\+/g, 'p').replace(/#/g, 'sharp');
  return LANGUAGE_ID.test(slug) ? slug : null;
}

/** Whether a language id is one that has its own highlighting. */
export const isKnownLanguage = (id: string | null | undefined): boolean => !!id && CODE_LANGUAGES.some((l) => l.id === id);
