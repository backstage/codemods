// Regression: README generation is idempotent, the sync workflow wiring stays
// in place, and the bot branch/PR lifecycle is safe. The gh-dependent
// scenarios need a Unix PATH stub and are skipped on Windows (CI covers them).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { readCalls, runBin, tempDir, writeYarnStub } from './helpers.ts'

const repoRoot = join(import.meta.dirname, '..', '..', '..')

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.replace(/\n$/, '')
}

test('sync-readme workflow wiring stays in place', () => {
  const workflow = readFileSync(join(repoRoot, '.github', 'workflows', 'sync-readme.yml'), 'utf8')
  for (const line of [
    '  workflow_dispatch:',
    '  contents: write',
    '  pull-requests: write',
    '  cancel-in-progress: false',
    '        run: test "$GITHUB_REF" = refs/heads/main',
    '          ref: main',
    '          yarn format:check',
    '          yarn test',
    '          GH_TOKEN: ${{ github.token }}',
    '        run: yarn sync-readme-pr',
  ]) {
    assert.ok(workflow.includes(line), `missing line: ${line}`)
  }
  assert.doesNotMatch(workflow, /^\s+yarn lint([ ]|$)/m) // README-only dispatch must not require repository-wide lint.
})

test('README generation is idempotent', () => {
  const fixture = tempDir('generate-readme-')
  try {
    const stub = writeYarnStub(fixture)
    for (const dir of ['generator/scripts', 'generator/codemods/v1.2.0/example', 'generator/codemods/v1.1.0/example']) {
      mkdirSync(join(fixture, dir), { recursive: true })
    }
    writeFileSync(
      join(fixture, 'generator', 'package.json'),
      JSON.stringify({ name: 'fixture', private: true, workspaces: ['codemods/*'] }),
    )
    writeFileSync(
      join(fixture, 'generator', 'README.md'),
      '# Codemods\n<!-- CODEMODS_START -->\n<!-- CODEMODS_END -->\n',
    )
    writeFileSync(join(fixture, 'generator', 'codemods', 'v1.2.0', 'example', 'codemod.yaml'), "description: 'Example migration'\n")
    writeFileSync(join(fixture, 'generator', 'codemods', 'v1.1.0', 'example', 'codemod.yaml'), "description: 'Older migration'\n")

    const generator = join(fixture, 'generator')
    const run = () => runBin('generate-readme-codemods.ts', [], { cwd: generator, env: { npm_execpath: stub } })
    assert.equal(run().status, 0)
    const generated = readFileSync(join(generator, 'README.md'), 'utf8')
    assert.equal(run().status, 0)
    assert.equal(readFileSync(join(generator, 'README.md'), 'utf8'), generated)
    assert.ok(generated.includes('Example migration'))
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

test('sync-readme-pr branch and PR lifecycle', { skip: process.platform === 'win32' }, () => {
  const fixture = tempDir('sync-readme-pr-')
  try {
    const callsDir = join(fixture, 'calls')
    const stub = writeYarnStub(fixture)
    const binDir = join(fixture, 'bin')
    mkdirSync(binDir, { recursive: true })
    mkdirSync(callsDir)
    // gh stub: lists an open bot PR once created, creates exactly one PR.
    const ghCalls = join(fixture, 'gh-calls')
    const openPrFlag = join(fixture, 'open-pr')
    writeFileSync(
      join(binDir, 'gh'),
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s %s\\n' "$1" "$2" >> "${ghCalls}"
case "$1 $2" in
  'pr list') [ ! -f "${openPrFlag}" ] || printf '1 github-actions[bot]\\n' ;;
  'pr create') touch "${openPrFlag}"; echo 'https://example.invalid/pull/1' ;;
  *) exit 1 ;;
esac
`,
    )
    chmodSync(join(binDir, 'gh'), 0o755)
    const env = {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      npm_execpath: stub,
      CALLS: callsDir,
    }

    const remote = join(fixture, 'remote.git')
    git(fixture, 'init', '-q', '--bare', remote)
    const seed = join(fixture, 'seed')
    mkdirSync(seed)
    git(seed, 'init', '-q', '-b', 'main')
    git(seed, 'config', 'user.name', 'Fixture')
    git(seed, 'config', 'user.email', 'fixture@example.invalid')
    writeFileSync(join(seed, 'README.md'), 'old README\n')
    git(seed, 'add', 'README.md')
    git(seed, 'commit', '-qm', 'base')
    git(seed, 'remote', 'add', 'origin', remote)
    git(seed, 'push', '-q', '-u', 'origin', 'main')
    git(remote, 'symbolic-ref', 'HEAD', 'refs/heads/main')

    const runSync = (cwd: string) => {
      const result = spawnSync(process.execPath, [join(repoRoot, 'packages', 'scripts', 'src', 'sync-readme-pr.ts')], {
        cwd,
        env,
        encoding: 'utf8',
      })
      return { status: result.status, output: `${result.stdout}
${result.stderr}` }
    }

    const ghLog = () => (readFileSync(ghCalls, 'utf8').split('\n').filter((line) => line !== ''))

    // First run creates the branch and PR.
    const first = join(fixture, 'first')
    git(fixture, 'clone', '-q', remote, first)
    writeFileSync(join(first, 'README.md'), 'generated README v1\n')
    const firstResult = runSync(first)
    assert.equal(firstResult.status, 0, firstResult.output)
    assert.equal(ghLog().filter((line) => line === 'pr create').length, 1)
    const firstHead = git(remote, 'rev-parse', 'refs/heads/automation/readme-sync')

    // A current README is a no-op.
    const noOp = join(fixture, 'no-op')
    git(fixture, 'clone', '-q', remote, noOp)
    const noOpResult = runSync(noOp)
    assert.equal(noOpResult.status, 0, noOpResult.output)
    assert.equal(git(remote, 'rev-parse', 'refs/heads/automation/readme-sync'), firstHead)
    assert.equal(ghLog().length, 2) // Only the first run listed/created a PR.

    // main advanced: the bot branch updates without a force-push.
    writeFileSync(join(seed, 'codemod.yaml'), 'new codemod\n')
    git(seed, 'add', 'codemod.yaml')
    git(seed, 'commit', '-qm', 'add codemod')
    git(seed, 'push', '-q', 'origin', 'main')
    const update = join(fixture, 'update')
    git(fixture, 'clone', '-q', remote, update)
    writeFileSync(join(update, 'README.md'), 'generated README v2\n')
    const updateResult = runSync(update)
    assert.equal(updateResult.status, 0, updateResult.output)
    assert.equal(ghLog().filter((line) => line === 'pr create').length, 1)
    assert.equal(git(remote, 'diff', '--name-only', 'main...automation/readme-sync'), 'README.md')
    assert.equal(git(remote, 'show', 'automation/readme-sync:README.md'), 'generated README v2')

    // After merge, the retained bot branch can advance without a force-push.
    git(seed, 'fetch', '-q', 'origin')
    git(seed, 'merge', '-q', '--no-ff', 'origin/automation/readme-sync')
    writeFileSync(join(seed, 'another-codemod.yaml'), 'another codemod\n')
    git(seed, 'add', 'another-codemod.yaml')
    git(seed, 'commit', '-qm', 'add another codemod')
    git(seed, 'push', '-q', 'origin', 'main')
    rmSync(openPrFlag) // Merging closes the previous PR.
    const afterMerge = join(fixture, 'after-merge')
    git(fixture, 'clone', '-q', remote, afterMerge)
    writeFileSync(join(afterMerge, 'README.md'), 'generated README v3\n')
    const afterMergeResult = runSync(afterMerge)
    assert.equal(afterMergeResult.status, 0, afterMergeResult.output)
    assert.equal(ghLog().filter((line) => line === 'pr create').length, 2)
    assert.equal(git(remote, 'diff', '--name-only', 'main...automation/readme-sync'), 'README.md')

    // A foreign branch is never overwritten (even if it occupies the stable name).
    git(seed, 'switch', '-qc', 'foreign')
    writeFileSync(join(seed, 'README.md'), 'foreign\n')
    git(seed, 'add', 'README.md')
    git(seed, 'commit', '-qm', 'foreign')
    git(seed, 'push', '-q', '--force', 'origin', 'HEAD:refs/heads/automation/readme-sync')
    const foreignHead = git(remote, 'rev-parse', 'refs/heads/automation/readme-sync')
    const foreign = join(fixture, 'foreign')
    git(fixture, 'clone', '-q', remote, foreign)
    writeFileSync(join(foreign, 'README.md'), 'generated README v4\n')
    assert.notEqual(runSync(foreign).status, 0)
    assert.equal(git(remote, 'rev-parse', 'refs/heads/automation/readme-sync'), foreignHead)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
