import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const cli = fileURLToPath(new URL('../../../../node_modules/codemod/codemod', import.meta.url))

function run(command: string, args: string[], env = process.env) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8' })
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`)
  return result.stdout.trim().replaceAll('\r', '')
}

function assertCases() {
  // Git hooks export the caller's repository location; -C alone cannot override it.
  const env = { ...process.env }
  for (const name of run('git', ['rev-parse', '--local-env-vars']).split('\n')) delete env[name]
  for (const positive of [true, false]) {
    const repo = mkdtempSync(join(tmpdir(), `rename-connections-workflow-test-${positive ? 'positive' : 'noop'}-`))
    try {
      mkdirSync(join(repo, 'src'))
      const files = positive ? {
        'positive.ts': "import { ConnectionAuthValue, LookupStrategy } from '@backstage/connections'\n\nexport type Combined = ConnectionAuthValue | LookupStrategy\n",
        'inert.ts': 'export const unchanged = true\n',
      } : {
        'noop.ts': "import { notConnections } from '@backstage/core-plugin-api'\n\nexport const x = notConnections\n",
        'extra.tsx': 'export const Widget = () => <div />\n',
      }
      for (const [name, content] of Object.entries(files)) writeFileSync(join(repo, 'src', name), content)
      const git = (...args: string[]) => run('git', ['-C', repo, ...args], env)
      git('init', '-q')
      git('config', 'user.name', 'Workflow Test')
      git('config', 'user.email', 'workflow-test@example.com')
      git('add', '.')
      git('commit', '-qm', 'init')
      run(process.execPath, [cli, 'workflow', 'run', '-w', 'workflow.yaml', '--target', repo, '--allow-dirty', '--allow-fs', '--no-interactive'], env)
      const changed = git('diff', '--name-only')
      if (positive) {
        assert.equal(changed, 'src/positive.ts', `expected only src/positive.ts to change, got: ${changed || '<none>'}`)
        const output = readFileSync(join(repo, 'src/positive.ts'), 'utf8')
        assert.match(output, /ConnectionAuth/)
        assert.match(output, /ConnectionLookupStrategy/)
        assert.doesNotMatch(output, /\bConnectionAuthValue\b|\bLookupStrategy\b/, 'expected legacy names to be removed from transformed positive.ts')
      } else assert.equal(changed, '', 'expected no files to change for noop workflow case')
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  }
}

test('rename connections workflow changes only matching files and isolates Git state', () => {
  if (process.env.RENAME_CONNECTIONS_HOSTILE_CHILD) {
    assertCases()
  } else {
    const env = { ...process.env }
    for (const name of run('git', ['rev-parse', '--local-env-vars']).split('\n')) delete env[name]
    const git = (...args: string[]) => run('git', args, env)
    const repoRoot = git('rev-parse', '--show-toplevel')
    const gitDir = git('rev-parse', '--absolute-git-dir')
    const index = join(gitDir, 'index')
    const headBefore = git('rev-parse', 'HEAD')
    const indexBefore = git('hash-object', index)
    // A nested node:test process must not inherit the parent's test-runner context.
    delete env.NODE_TEST_CONTEXT
    const result = spawnSync(process.execPath, ['--test', fileURLToPath(import.meta.url)], {
      cwd: root,
      env: { ...env, GIT_DIR: gitDir, GIT_WORK_TREE: repoRoot, GIT_INDEX_FILE: index, RENAME_CONNECTIONS_HOSTILE_CHILD: '1' },
      encoding: 'utf8',
    })
    assert.equal(git('rev-parse', 'HEAD'), headBefore, 'hostile Git environment changed the caller HEAD or index')
    assert.equal(git('hash-object', index), indexBefore, 'hostile Git environment changed the caller HEAD or index')
    assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`)
  }
  console.log('workflow-run.test: pass')
})
