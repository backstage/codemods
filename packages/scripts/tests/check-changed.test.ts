// Regression: large changed-file lists reach every gate without exceeding
// Windows argv limits; failures stop later gates; fixture-only and
// shell-only diffs narrow the gates correctly.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { readCalls, runBin, tempDir, writeYarnStub } from './helpers.ts'

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
}

// Commits explicit paths only: the stub-yarn call log also lives in the fixture
// directory and must never enter the repository.
function commitAll(cwd: string, message: string, ...paths: string[]): void {
  git(cwd, 'add', '--', ...paths)
  git(cwd, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', message)
}

test('check-changed batches gates and stops on failure', () => {
  const fixture = tempDir('check-changed-')
  const callsDir = join(fixture, 'calls')
  mkdirSync(callsDir)
  const stub = writeYarnStub(fixture)
  const env = { npm_execpath: stub, CALLS: callsDir }

  try {
    git(fixture, 'init', '-q')
    git(fixture, 'config', 'core.autocrlf', 'false')
    writeFileSync(join(fixture, 'README.md'), 'fixture\n')
    commitAll(fixture, 'base', 'README.md')
    git(fixture, 'update-ref', 'refs/remotes/origin/main', 'HEAD')

    for (const directory of [
      'changed',
      'codemods/misc/fixture/scripts',
      'codemods/misc/fixture/tests/nested',
      'codemods/misc/fixture/tests-css/nested',
      'tests',
      'scripts',
    ]) {
      mkdirSync(join(fixture, directory), { recursive: true })
    }
    const allFiles: string[] = []
    for (let i = 1; i <= 110; i++) {
      const file = `changed/${String(i).padStart(3, '0')}_${'x'.repeat(100)}.ts`
      writeFileSync(join(fixture, file), 'export const fixture = true;\n')
      allFiles.push(file)
    }
    writeFileSync(join(fixture, 'changed/a file with spaces.ts'), 'export const fixture = true;\n')
    allFiles.push('changed/a file with spaces.ts')
    writeFileSync(join(fixture, 'codemods/misc/fixture/scripts/codemod.ts'), 'export const fixture = true;\n')
    writeFileSync(join(fixture, 'codemods/misc/fixture/tests/nested/input.ts'), 'export const fixture = true;\n')
    writeFileSync(join(fixture, 'codemods/misc/fixture/tests-css/nested/input.css'), 'fixture\n')
    writeFileSync(join(fixture, 'tests/input.tsx'), 'export const fixture = true;\n')
    writeFileSync(join(fixture, 'codemods/misc/fixture/package.json'), '{"name":"@backstage/fixture"}\n')
    writeFileSync(join(fixture, 'scripts/mixed-shell.sh'), '#!/usr/bin/env bash\n')
    const expectedFormat = [...allFiles, 'codemods/misc/fixture/scripts/codemod.ts', 'codemods/misc/fixture/package.json']
    const expectedLint = [
      ...allFiles,
      'codemods/misc/fixture/scripts/codemod.ts',
      'codemods/misc/fixture/tests/nested/input.ts',
      'tests/input.tsx',
    ]
    commitAll(fixture, 'changed', 'changed', 'codemods', 'tests', 'scripts')

    let result = runBin('check-changed.ts', [], { cwd: fixture, env })
    assert.equal(result.status, 0, result.stderr)
    let calls = readCalls(callsDir)
    // Both format and lint must require multiple batched invocations.
    assert.ok(calls.length > 4)

    const formatCalls = calls.filter((call) => call.command === 'format:check')
    const lintCalls = calls.filter((call) => call.command === 'lint')
    const testCalls = calls.filter((call) => call.command === 'test')
    assert.ok(formatCalls.length > 1 && lintCalls.length > 1)
    assert.deepEqual(
      testCalls.map((call) => call.cwd),
      [join(fixture, 'codemods', 'misc', 'fixture')],
    )
    assert.deepEqual(
      formatCalls.flatMap((call) => call.args).sort(),
      expectedFormat.slice().sort(),
    )
    assert.deepEqual(
      lintCalls.flatMap((call) => call.args).sort(),
      expectedLint.slice().sort(),
    )

    // A failing gate stops every later batch and gate.
    rmSync(join(callsDir, 'count'), { force: true })
    result = runBin('check-changed.ts', [], { cwd: fixture, env: { ...env, FAIL_ON: '2' } })
    assert.equal(result.status, 17)
    assert.equal(readCalls(callsDir).length, 2)

    // A shell-only diff triggers no formatter invocation.
    git(fixture, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
    writeFileSync(join(fixture, 'scripts/shell-only.sh'), '#!/usr/bin/env bash\n')
    commitAll(fixture, 'shell-only', 'scripts')
    rmSync(join(callsDir, 'count'), { force: true })
    result = runBin('check-changed.ts', [], { cwd: fixture, env })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(readCalls(callsDir).length, 0)

    // An ignored-fixture-only diff still lints and tests, but never formats.
    git(fixture, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
    writeFileSync(join(fixture, 'codemods/misc/fixture/tests/nested/input.ts'), 'export const fixture = false;\n')
    writeFileSync(join(fixture, 'codemods/misc/fixture/tests-css/nested/input.css'), 'fixture changed\n')
    commitAll(fixture, 'ignored-only', 'codemods')
    rmSync(join(callsDir, 'count'), { force: true })
    result = runBin('check-changed.ts', [], { cwd: fixture, env })
    assert.equal(result.status, 0, result.stderr)
    calls = readCalls(callsDir)
    assert.deepEqual(
      calls.map((call) => call.command),
      ['lint', 'test'],
    )
    assert.deepEqual(calls[0]?.args, ['codemods/misc/fixture/tests/nested/input.ts'])
    assert.equal(calls[1]?.cwd, join(fixture, 'codemods', 'misc', 'fixture'))
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
