// Regression: release tagging aborts when the remote tag lookup fails and
// creates/pushes tags plus the publish-job output on success.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { runBin, tempDir } from './helpers.ts'

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.replace(/\n$/, '')
}

function makeCodemodRepo(directory: string): void {
  mkdirSync(join(directory, 'codemods', 'misc', 'fixture'), { recursive: true })
  writeFileSync(
    join(directory, 'codemods', 'misc', 'fixture', 'package.json'),
    JSON.stringify({ name: '@backstage/fixture', version: '1.2.3' }),
  )
  writeFileSync(join(directory, 'codemods', 'misc', 'fixture', 'codemod.yaml'), "name: '@backstage/fixture'\nversion: '1.2.3'\n")
  git(directory, 'init', '-q')
  git(directory, 'add', '-A')
  git(directory, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'base')
}

test('tag-and-publish aborts when the remote tag lookup fails', () => {
  const fixture = tempDir('tag-publish-fail-')
  try {
    makeCodemodRepo(fixture)
    // A broken remote makes `git ls-remote --tags origin` fail; tagging must
    // abort instead of treating the empty result as "nothing released yet".
    git(fixture, 'remote', 'add', 'origin', join(fixture, 'does-not-exist.git'))

    const result = runBin('tag-and-publish.ts', [], { cwd: fixture })
    assert.notEqual(result.status, 0)
    assert.notEqual(git(fixture, 'tag', '-l'), '@backstage/fixture@v1.2.3')
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

test('tag-and-publish creates, pushes and reports changed directories', () => {
  const fixture = tempDir('tag-publish-ok-')
  try {
    makeCodemodRepo(fixture)
    const remote = join(fixture, 'remote.git')
    git(fixture, 'init', '-q', '--bare', remote)
    git(fixture, 'remote', 'add', 'origin', remote)

    const output = join(fixture, 'github-output')
    const result = runBin('tag-and-publish.ts', [], { cwd: fixture, env: { GITHUB_OUTPUT: output } })
    assert.equal(result.status, 0, result.stderr)

    assert.equal(git(fixture, 'tag', '-l'), '@backstage/fixture@v1.2.3')
    assert.equal(git(remote, 'tag', '-l'), '@backstage/fixture@v1.2.3')
    assert.equal(readFileSync(output, 'utf8'), 'changed_dirs=["codemods/misc/fixture"]\n')

    // Idempotent: a second run skips the already-released tag.
    rmSync(output)
    const again = runBin('tag-and-publish.ts', [], { cwd: fixture, env: { GITHUB_OUTPUT: output } })
    assert.equal(again.status, 0, again.stderr)
    assert.equal(readFileSync(output, 'utf8'), 'changed_dirs=[]\n')
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
