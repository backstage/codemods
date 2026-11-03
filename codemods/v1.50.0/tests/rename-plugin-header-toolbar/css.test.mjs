import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('codemod-css preserves CSS fixture coverage', () => {
  const result = spawnSync(
    'yarn exec codemod jssg test -l css scripts/codemod-css.ts tests/rename-plugin-header-toolbar/css',
    {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      encoding: 'utf8',
      shell: true,
    },
  );
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
});
