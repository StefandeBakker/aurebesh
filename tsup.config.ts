import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/element.ts', 'src/react.ts', 'src/vue.ts', 'src/ticket.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: false, // minified code without maps keeps the package small; the readable source is on GitHub
  minify: true,
  target: 'es2020',
  // react and vue are peer dependencies and are never bundled
  external: ['react', 'vue'],
});
