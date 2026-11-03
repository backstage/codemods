import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const cli = fileURLToPath(new URL('../../../../node_modules/codemod/codemod', import.meta.url))

test('dense GitHub repo create flow preserves exact bytes without quadratic edits', () => {
  const target = mkdtempSync(join(tmpdir(), 'dense-flow-'))
  try {
    const header = 'apiVersion: scaffolder.backstage.io/v1beta3\nkind: Template\nmetadata:\n  name: dense\nspec:\n  steps:\n'
    const input = header + Array.from({ length: 1200 }, (_, i) =>
      `    - id: create-${String(i).padStart(4, '0')}\n      action: github:repo:create\n      input: { repoUrl: github.com?repo=dense${i}&owner=team, sourcePath: ./skeleton, defaultBranch: main, description: keep-${i} }\n`,
    ).join('')
    const expected = input.replaceAll(', sourcePath: ./skeleton, defaultBranch: main', '')
    // One character per action changes; size, parser shape, and workflow stay the same.
    const noop = input.replaceAll('action: github:repo:create', 'action: github:repo:creatE')
    const file = join(target, 'dense.yaml')
    function runFlow() {
      const start = Date.now()
      const result = spawnSync(process.execPath, [cli, 'workflow', 'run', '-w', 'workflow.yaml', '--target', target, '--allow-dirty', '--no-interactive', '--disable-analytics'], { cwd: root, encoding: 'utf8' })
      assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`)
      return Date.now() - start
    }
    const noopTimes: number[] = []
    const realTimes: number[] = []
    for (let iteration = 0; iteration < 3; iteration++) {
      writeFileSync(file, noop)
      noopTimes.push(runFlow())
      assert.deepEqual(readFileSync(file), Buffer.from(noop))
      writeFileSync(file, input)
      realTimes.push(runFlow())
      assert.deepEqual(readFileSync(file), Buffer.from(expected))
    }
    runFlow()
    assert.deepEqual(readFileSync(file), Buffer.from(expected))
    const noopMedian = noopTimes.sort((a, b) => a - b)[1]!
    const realMedian = realTimes.sort((a, b) => a - b)[1]!
    console.log(`dense flow mapping (1200 steps): no-op=${noopMedian}ms real=${realMedian}ms (medians of 3)`)
    assert.ok(realMedian < noopMedian * 5, 'dense edit application regressed relative to the same-size no-op workflow')
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})
