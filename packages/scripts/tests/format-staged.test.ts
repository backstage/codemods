// Regression: staged formatting skips ignored test fixtures, preserves
// argument shape (including paths with spaces), and propagates failures.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { readCalls, runBin, tempDir, writeYarnStub } from './helpers.ts'

const repoRoot = join(import.meta.dirname, '..', '..', '..')
const lintstagedrc = readFileSync(join(repoRoot, '.lintstagedrc.json'), 'utf8')

test('lint-staged wires format-staged for every file group', () => {
  assert.equal((lintstagedrc.match(/"format-staged"/g) ?? []).length, 2)
})

test('format-staged skips ignored fixtures and forwards the rest verbatim', () => {
  const fixture = tempDir('format-staged-')
  const callsDir = join(fixture, 'calls')
  mkdirSync(callsDir)
  const stub = writeYarnStub(fixture)
  const env = { npm_execpath: stub, CALLS: callsDir }

  try {
    // Only fixture paths: no yarn invocation at all.
    let result = runBin('format-staged.ts', [
      'codemods/misc/example/tests/fixture/metrics.json',
      'C:\\repo\\codemods\\misc\\example\\tests-css\\fixture\\input.css',
    ], { env })
    assert.equal(result.status, 0)
    assert.equal(readCalls(callsDir).length, 0)

    // Mixed: fixtures filtered, spaces and order preserved.
    result = runBin('format-staged.ts', [
      'codemods/misc/example/tests/fixture/metrics.json',
      'docs/file with spaces.md',
      'C:\\repo\\codemods\\misc\\example\\tests-css\\fixture\\input.css',
      'src/code.ts',
    ], { env })
    assert.equal(result.status, 0)
    const calls = readCalls(callsDir)
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.command, 'format')
    assert.deepEqual(calls[0]?.args, ['docs/file with spaces.md', 'src/code.ts'])

    // A yarn failure propagates.
    rmSync(join(callsDir, 'count'))
    result = runBin('format-staged.ts', ['src/code.ts'], { env: { ...env, FAIL_ON: '1' } })
    assert.equal(result.status, 17)
    assert.ok(existsSync(join(callsDir, 'count')))
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
