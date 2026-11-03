import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = new URL('../../', import.meta.url)
const workflow = readFileSync(new URL('workflow.yaml', root), 'utf8')

test('bootstrap precedes transforms and dependency cleanup follows them', () => {
  assert.match(workflow, /id: apply-recipe/)
  const scripts = [...workflow.matchAll(/js_file: '?([^'\n]+)'?/g)].map(match => match[1])
  assert.equal(scripts.length, 28)
  assert.equal(new Set(scripts).size, 28)
  assert.deepEqual(scripts.slice(0, 2), [
    'scripts/migrate-mui-bootstrap-to-bui-package-json-codemod.ts',
    'scripts/migrate-mui-bootstrap-to-bui.ts',
  ])
  assert.deepEqual(scripts.slice(-2), [
    'scripts/remove-mui-dependencies.ts',
    'scripts/remove-mui-dependencies-package-json-codemod.ts',
  ])
})

test('styles transform writes expected CSS module goldens', async t => {
  // Stage the workflow inside the package tree: the styles script imports
  // @jssg/utils, which resolves through the repo root node_modules and would
  // not resolve from an OS temp directory.
  const workflowDir = mkdtempSync(join(fileURLToPath(root), '.mui-styles-workflow-'))
  try {
    mkdirSync(join(workflowDir, 'scripts'))
    copyFileSync(new URL('scripts/migrate-mui-styles-to-bui-css-modules.ts', root), join(workflowDir, 'scripts/migrate-mui-styles-to-bui-css-modules.ts'))
    writeFileSync(join(workflowDir, 'workflow.yaml'), `version: '1'
nodes:
  - id: styles
    name: 'Migrate styles'
    type: automatic
    steps:
      - name: 'Write CSS modules'
        js-ast-grep:
          js_file: 'scripts/migrate-mui-styles-to-bui-css-modules.ts'
          language: 'tsx'
          semantic_analysis: 'file'
          include: ['**/*.tsx']
`)
    const testsRoot = fileURLToPath(new URL('tests/migrate-mui-styles-to-bui-css-modules/', root))
    const fixtures = readdirSync(testsRoot).filter(name => existsSync(join(testsRoot, name, 'expected.module.css')))
    assert.ok(fixtures.length, 'No fixtures with expected.module.css found')
    for (const fixture of fixtures) {
      await t.test(fixture, () => {
        const workDir = mkdtempSync(join(tmpdir(), `mui-styles-${fixture}-`))
        try {
          const fixtureDir = join(testsRoot, fixture)
          copyFileSync(join(fixtureDir, 'input.tsx'), join(workDir, 'input.tsx'))
          if (existsSync(join(fixtureDir, 'input.module.css'))) copyFileSync(join(fixtureDir, 'input.module.css'), join(workDir, 'input.module.css'))
          const cli = fileURLToPath(new URL('../../../../../node_modules/codemod/codemod', import.meta.url))
          const result = spawnSync(process.execPath, [cli, 'workflow', 'run', '-w', join(workflowDir, 'workflow.yaml'), '--target', workDir, '--no-interactive', '--allow-dirty', '--allow-fs'], { cwd: root, encoding: 'utf8' })
          assert.equal(result.status, 0, `FAIL ${fixture}: workflow run failed
${result.error ?? ''}
${result.stdout}
${result.stderr}`)
          assert.equal(readFileSync(join(workDir, 'input.module.css'), 'utf8').trimEnd(), readFileSync(join(fixtureDir, 'expected.module.css'), 'utf8').trimEnd(), 'FAIL: CSS module mismatch')
          console.log(`PASS ${fixture}`)
        } finally {
          rmSync(workDir, { recursive: true, force: true })
        }
      })
    }
  } finally {
    rmSync(workflowDir, { recursive: true, force: true })
  }
})
