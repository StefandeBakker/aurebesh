// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// On Windows git may check the file out with CRLF line endings.
const workflow = readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const command = workflow.split('      - name: Stage package for npm approval\n        run: |\n')[1];

// The workflow's shell script is run with bash; on Windows `bash` may be the WSL stub, so this runs on Linux and macOS (CI).
describe.skipIf(process.platform === 'win32')('release publishing', () => {
  it.each([
    ['1.0.0', 'stage publish'],
    ['1.1.0-beta.0', 'stage publish --tag beta'],
  ])('stages %s with the correct distribution tag', (version, expected) => {
    expect(command).toBeDefined();
    const output = execFileSync('bash', ['-e', '-c', `
      node() { printf '%s\\n' "$VERSION"; }
      npm() { printf '%s\\n' "$*"; }
      ${command}
    `], { env: { ...process.env, VERSION: version }, encoding: 'utf8' });
    expect(output.trim()).toBe(expected);
  });
});
