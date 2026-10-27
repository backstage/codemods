// Regression: staged package tests dedupe packages, handle paths with spaces,
// stop on the first failure, and the pre-commit hook selects them via
// lint-staged.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { readCalls, runBin, src, tempDir, writeYarnStub } from './helpers.ts'

const repoRoot = join(import.meta.dirname, '..', '..', '..')

test('test-staged runs each owning package once, in order', () => {
  const fixture = tempDir('test-staged-')
  const callsDir = join(fixture, 'calls')
  mkdirSync(callsDir)
  const stub = writeYarnStub(fixture)
  const first = join(fixture, 'repo with spaces', 'codemods', 'misc', 'first')
  const second = join(fixture, 'repo with spaces', 'codemods', 'misc', 'second')
  for (const directory of [first, second]) {
    mkdirSync(join(directory, 'scripts'), { recursive: true })
    writeFileSync(join(directory, 'package.json'), '{}\n')
  }
  const env = { npm_execpath: stub, CALLS: callsDir }

  try {
    // No staged files: no yarn invocation at all.
    let result = runBin('test-staged.ts', [], { env })
    assert.equal(result.status, 0)
    assert.equal(readCalls(callsDir).length, 0)

    // Two packages, one file each repeated: deduplicated to two test runs.
    const files = [join(first, 'scripts', 'a.ts'), join(first, 'scripts', 'b.ts'), join(second, 'scripts', 'c.ts')]
    result = runBin('test-staged.ts', files, { env })
    assert.equal(result.status, 0)
    let calls = readCalls(callsDir).filter((call) => call.command === 'test')
    assert.deepEqual(
      calls.map((call) => call.cwd),
      [first, second],
    )

    // A failing package test stops the run (calls are still recorded first).
    rmSync(join(callsDir, 'count'))
    result = runBin('test-staged.ts', files, { env: { ...env, FAIL_ON: '2' } })
    assert.equal(result.status, 17)
    calls = readCalls(callsDir).filter((call) => call.command === 'test')
    assert.deepEqual(
      calls.map((call) => call.cwd),
      [first, second],
    )
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

test('pre-commit hook runs package tests through lint-staged', { skip: process.platform === 'win32' }, () => {
  const fixture = tempDir('test-staged-hook-')
  const callsDir = join(fixture, 'calls')
  mkdirSync(callsDir)
  const stub = writeYarnStub(fixture)
  const repo = join(fixture, 'repo with spaces')
  const binDir = join(repo, 'node_modules', '.bin')
  mkdirSync(binDir, { recursive: true })
  copyFileSync(join(repoRoot, '.lintstagedrc.json'), join(repo, '.lintstagedrc.json'))
  mkdirSync(join(repo, '.husky'))
  copyFileSync(join(repoRoot, '.husky', 'pre-commit'), join(repo, '.husky', 'pre-commit'))
  // The hook and lint-staged resolve yarn and the stage bins from PATH/.bin.
  writeFileSync(join(binDir, 'yarn'), `#!/usr/bin/env sh\nexec node "${stub}" "$@"\n`)
  for (const name of ['format-staged', 'test-staged']) {
    writeFileSync(join(binDir, name), `#!/usr/bin/env sh\nexec node "${src(`${name}.ts`)}" "$@"\n`)
    chmodSync(join(binDir, name), 0o755)
  }
  chmodSync(join(binDir, 'yarn'), 0o755)
  writeFileSync(
    join(repo, 'package.json'),
    JSON.stringify({ scripts: { format: 'node -e "process.exit(0)"', lint: 'node -e "process.exit(0)"' } }),
  )
  for (const name of ['first', 'second']) {
    const directory = join(repo, 'codemods', 'misc', name, 'scripts')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(repo, 'codemods', 'misc', name, 'package.json'), JSON.stringify({ scripts: { test: 'node -e "process.exit(0)"' } }))
    writeFileSync(join(directory, `${name}.ts`), 'export const fixture = true;\n')
  }

  const hook = spawnSync('sh', ['.husky/pre-commit'], {
    cwd: repo,
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      npm_execpath: stub,
      CALLS: callsDir,
      LINT_STAGED: join(repoRoot, 'node_modules', '.bin', 'lint-staged'),
    },
    encoding: 'utf8',
  })
  assert.equal(hook.status, 0, hook.stderr)
  const calls = readCalls(callsDir).filter((call) => call.command === 'test')
  assert.deepEqual(
    calls.map((call) => call.cwd),
    [join(repo, 'codemods', 'misc', 'first'), join(repo, 'codemods', 'misc', 'second')],
  )
  rmSync(fixture, { recursive: true, force: true })
})
