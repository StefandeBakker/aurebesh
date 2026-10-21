// Playwright global setup: bundles the small React and Vue test apps (they import the wrappers from src).
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

export default async function globalSetup() {
  // the pages of the tests load dist/: build it, so that a run is never of an older build than the source
  execSync('npx tsup', { cwd: root, stdio: 'ignore' });
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
