// Checks the built package (run `npm run build` first): every export of package.json points at files that exist, every entry can be
// loaded as ESM and as CommonJS in Node (with no browser: no part may need a DOM when it is loaded, so that a server can import it), and
// only `aurebesh/element` registers something when it is loaded (which is what `sideEffects` in package.json says).
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const require = createRequire(import.meta.url);
const problems = [];
const fail = (message) => problems.push(message);

// a browser for the check: it only counts what is registered
const registered = [];
globalThis.customElements = { get: () => undefined, define: (name) => registered.push(name) };

const files = (entry) => (typeof entry === 'string' ? [entry] : Object.values(entry).flatMap(files));
const entries = Object.entries(pkg.exports).filter(([key]) => key !== './package.json' && key !== './angular');

for (const [key, entry] of entries) {
  for (const file of files(entry)) if (!existsSync(resolve(root, file))) fail(`${key}: ${file} does not exist`);
}
for (const key of ['./docx', './comments', './suggestions', './mentions', './find', './locales/nl']) {
  if (!pkg.exports[key]) fail(`${key} is not in the exports of package.json`);
}
if (!Array.isArray(pkg.sideEffects) || !pkg.sideEffects.includes('./dist/element.js')) fail('sideEffects in package.json should list ./dist/element.js and ./dist/element.cjs');

const names = {};
for (const [key, entry] of entries) {
  const esm = resolve(root, entry.import.default);
  const cjs = resolve(root, entry.require.default);
  try {
    const before = registered.length;
    const loaded = await import(pathToFileURL(esm).href);
    const added = registered.length - before;
    if (key === './element' ? added !== 1 : added !== 0) fail(`${key}: loading it registered ${added} element(s)`);
    names[key] = Object.keys(loaded).sort();
    if (!names[key].length) fail(`${key}: the ESM entry exports nothing`);
  } catch (err) {
    fail(`${key}: cannot be loaded as ESM: ${err.message}`);
  }
  try {
    const loaded = require(cjs);
    const exported = Object.keys(loaded).filter((n) => n !== '__esModule').sort();
    if (names[key] && exported.join() !== names[key].join()) fail(`${key}: ESM and CommonJS export different names`);
  } catch (err) {
    fail(`${key}: cannot be loaded as CommonJS: ${err.message}`);
  }
}

if (problems.length) {
  console.error(problems.map((p) => '✗ ' + p).join('\n'));
  process.exit(1);
}
console.log(`✓ ${entries.length} entries: the files are there, they load as ESM and CommonJS without a browser, and only aurebesh/element registers something`);
