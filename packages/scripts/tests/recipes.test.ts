import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { recipeDirForFile, recipeDirs } from '../src/lib/recipes.ts'
import { runBin, tempDir } from './helpers.ts'

test('recipe discovery and version sync support flat versions and the nested misc recipe only', () => {
  const root = tempDir('recipes-')
  try {
    const directories = ['codemods/v1.54.0', 'codemods/misc/mui4-to-bui-migration-recipe']
    for (const directory of [...directories, 'codemods/v1.54.0/standalone']) {
      mkdirSync(join(root, directory), { recursive: true })
      writeFileSync(join(root, directory, 'package.json'), JSON.stringify({ version: '1.2.3' }))
      writeFileSync(join(root, directory, 'codemod.yaml'), "version: '0.0.0'\n")
    }
    assert.deepEqual(recipeDirs(join(root, 'codemods')), directories.map((directory) => join(root, directory)).sort())
    const result = runBin('sync-codemod-versions.ts', [], { cwd: root })
    assert.equal(result.status, 0, result.stderr)
    for (const directory of directories) {
      assert.equal(readFileSync(join(root, directory, 'codemod.yaml'), 'utf8'), "version: '1.2.3'\n")
      assert.equal(recipeDirForFile(`${directory}/scripts/transform.ts`), directory)
      assert.equal(recipeDirForFile(`${directory}/tests/transform/case/input.ts`), directory)
    }
    assert.equal(readFileSync(join(root, 'codemods/v1.54.0/standalone/codemod.yaml'), 'utf8'), "version: '0.0.0'\n")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
