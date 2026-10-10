// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8');
const command = workflow.split('      - name: Stage package for npm approval\n        run: |\n')[1];

describe('release publishing', () => {
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
