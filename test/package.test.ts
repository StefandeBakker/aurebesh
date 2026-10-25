import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
// the entries of the build, read from its configuration (which is not loaded: that would load the bundler in the browser-like test environment)
const config = readFileSync('tsup.config.ts', 'utf8');
const entries = [...config.matchAll(/^\s+'?([\w/]+)'?: 'src\/[^']+',?$/gm)].map((m) => m[1]);

describe('the entries of the package', () => {
  it('has an export for each entry that is built, and builds each export', () => {
    const exported = Object.entries(pkg.exports as Record<string, { import?: { default: string } }>)
      .filter(([key]) => key !== './package.json' && key !== './angular')
      .map(([key, value]) => [key, value.import!.default] as const);
    const fromExports = exported.map(([, file]) => file.replace(/^\.\/dist\//, '').replace(/\.js$/, '')).sort();
    expect(fromExports).toEqual([...entries].sort());
    for (const [key, file] of exported) expect(file, key).toBe(`./dist/${key === '.' ? 'index' : key.slice(2)}.js`);
  });

  it('has the types for older TypeScript (typesVersions) for each subpath', () => {
    const versions = pkg.typesVersions['*'] as Record<string, string[]>;
    for (const key of Object.keys(pkg.exports)) {
      if (key === '.' || key === './package.json' || key.startsWith('./locales/')) continue;
      expect(versions[key.slice(2)], key).toBeDefined();
    }
    expect(versions['locales/*']).toEqual(['./dist/locales/*.d.ts']);
  });

  it('says that only the element does something when it is loaded', () => {
    expect(pkg.sideEffects).toEqual(['./dist/element.js', './dist/element.cjs']);
  });

  it('has no dependencies to install: only peers of the wrappers, which are optional', () => {
    expect(pkg.dependencies).toBeUndefined();
    for (const name of Object.keys(pkg.peerDependencies)) expect(pkg.peerDependenciesMeta[name]?.optional, name).toBe(true);
  });
});

describe('the parts that work without the editor', () => {
  it('give what their names say', async () => {
    const docx = await import('../src/entries/docx');
    expect(Object.keys(docx).sort()).toEqual(['fromDocx', 'toDocx', 'toDocxBytes', 'unzipAll', 'zip']);
    const comments = await import('../src/entries/comments');
    expect(Object.keys(comments).sort()).toEqual(['COMMENT_ID', 'cleanThreads', 'commentCss', 'commentIdsIn']);
    const suggestions = await import('../src/entries/suggestions');
    expect(Object.keys(suggestions).sort()).toEqual(['SUGGESTION_ID', 'acceptIn', 'diffText', 'finalHtml', 'finalNode', 'rejectIn', 'suggestionCss', 'suggestionsIn']);
    const mentions = await import('../src/entries/mentions');
    expect(Object.keys(mentions).sort()).toEqual(['MENTION_ID', 'mentionCss', 'mentionsIn']);
    const find = await import('../src/entries/find');
    expect(Object.keys(find).sort()).toEqual(['findRanges', 'replaceRanges']);
  });

  it('has the texts of each language as the default export, the same as the named one, and each key in each language', async () => {
    const en = await import('../src/entries/locales/en');
    for (const code of ['en', 'nl', 'de', 'fr', 'es']) {
      const language = await import(`../src/entries/locales/${code}.ts`);
      expect(language.default, code).toBe(language[`LABELS_${code.toUpperCase()}`]);
      expect(Object.keys(language.default).sort(), code).toEqual(Object.keys(en.default).sort());
    }
  });

  it('works without the editor: Word, the suggestions of a text', async () => {
    const { toDocx, toDocxBytes, fromDocx } = await import('../src/entries/docx');
    const { finalHtml, suggestionsIn } = await import('../src/entries/suggestions');
    const html = '<h1>Title</h1><p>Some <strong>text</strong></p>';
    expect((await toDocx(html)).size).toBeGreaterThan(500);
    const back = await fromDocx(await toDocxBytes(html));
    expect(back.html).toContain('<h1>Title</h1>');
    const marked = '<p>a <span data-suggestion="s1" data-kind="delete">x</span><span data-suggestion="s1" data-kind="insert" data-author="a" data-name="A">y</span></p>';
    expect(finalHtml(marked)).toBe('<p>a y</p>');
    expect(suggestionsIn(new DOMParser().parseFromString(marked, 'text/html').body)[0].kind).toBe('replace');
  });
});
