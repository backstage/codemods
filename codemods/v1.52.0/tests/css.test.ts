import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

for (const name of ['migrate-bui-props-to-intersection-css', 'rename-bui-css-tokens-v1-52-css']) {
  test(`${name} fixtures`, () => {
    const result = spawnSync(
      'yarn',
      ['exec', 'codemod', 'jssg', 'test', '-l', 'css', `scripts/${name}.ts`, `tests/${name}`],
      {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        encoding: 'utf8',
        shell: process.platform === 'win32',
      },
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}
