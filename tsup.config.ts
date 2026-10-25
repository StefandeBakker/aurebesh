import { defineConfig } from 'tsup';

// One entry for each thing that can be imported: the editor, the element, the wrappers, and the parts that work without the editor
// (Word, comments, suggestions, mentions, find, the texts of a language). The shared code is in chunks that are loaded once.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    element: 'src/element.ts',
    react: 'src/react.ts',
    vue: 'src/vue.ts',
    docx: 'src/entries/docx.ts',
    comments: 'src/entries/comments.ts',
    suggestions: 'src/entries/suggestions.ts',
    mentions: 'src/entries/mentions.ts',
    find: 'src/entries/find.ts',
    'locales/en': 'src/entries/locales/en.ts',
    'locales/nl': 'src/entries/locales/nl.ts',
    'locales/de': 'src/entries/locales/de.ts',
    'locales/fr': 'src/entries/locales/fr.ts',
    'locales/es': 'src/entries/locales/es.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: false, // minified code without maps keeps the package small; the readable source is on GitHub
  minify: true,
  target: 'es2020',
  // react and vue are peer dependencies and are never bundled
  external: ['react', 'vue'],
});
