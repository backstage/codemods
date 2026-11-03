import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

test('v1.48.0 CSS token fixtures', () => {
  const command = 'yarn exec codemod jssg test -l css scripts/codemod-css.ts tests/codemod-css';
  const result = spawnSync(
    process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'sh',
    process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-c', command],
    {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      encoding: 'utf8',
    },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
