import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

test('rename-bui-header-css-classes preserves CSS fixture coverage', () => {
  const result = spawnSync(
    'yarn exec codemod jssg test -l css scripts/rename-bui-header-css-classes-css.ts tests/rename-bui-header-css-classes/css',
    {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      encoding: 'utf8',
      shell: true,
    },
  )
  assert.equal(result.status, 0, result.error?.message ?? `${result.stdout}\n${result.stderr}`)
})
