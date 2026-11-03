import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

for (const name of ['loading-to-is-pending-css', 'rename-header-main-class-css']) {
  test(`${name} fixtures`, () => {
    const result = spawnSync(
      'yarn',
      ['exec', 'codemod', 'jssg', 'test', '-l', 'css', `scripts/${name}.ts`, `tests/${name}`],
      { cwd: new URL('../', import.meta.url), encoding: 'utf8', shell: process.platform === 'win32' },
    );
    assert.equal(result.status, 0, result.error?.message ?? `${result.stdout}\n${result.stderr}`);
  });
}
