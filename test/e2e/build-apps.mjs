// Playwright global setup: bundles the small React and Vue test apps (they import the wrappers from src).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

export default async function globalSetup() {
  await build({
    entryPoints: {
      'react-app': `${root}test/e2e/apps/react-app.ts`,
      'vue-app': `${root}test/e2e/apps/vue-app.ts`,
    },
    outdir: `${root}test/e2e/.build`,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    logLevel: 'warning',
    define: {
      'process.env.NODE_ENV': '"development"',
      __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
  });
}
