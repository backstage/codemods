// Regression: the recipe test runner discovers suites by convention and
// --list prints the plan without executing anything.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runBin, tempDir } from './helpers.ts'

function list(cwd: string): { status: number | null; stdout: string } {
  const result = runBin('run-recipe-tests.ts', ['--list'], { cwd })
  return { status: result.status, stdout: result.stdout.replace(/\n$/, '') }
}

test('run-recipe-tests discovers suites by convention', () => {
  const fixture = tempDir('recipe-runner-')
  try {
    for (const dir of [
      'scripts',
      'tests/alpha/case-ts',
      'tests/alpha/case-tsx',
      'tests/beta/case',
      'tests/gamma/case',
      'tests/delta/case',
      'tests/epsilon',
      'tests/zeta/typed-extension',
    ]) {
      mkdirSync(join(fixture, dir), { recursive: true })
    }
    const file = (path: string, content: string) => writeFileSync(join(fixture, path), content)
    file('workflow.yaml', 'version: 1\n')
    for (const [name, content] of [
      ['alpha.ts', 'export const a = 1;\n'],
      ['beta.ts', 'export const b = 2;\n'],
      ['gamma.ts', 'export const c = 3;\n'],
      ['delta.ts', 'export const d = 4;\n'],
      ['lib.js', 'export const lib = true;\n'],
    ] as [string, string][]) {
      file(`scripts/${name}`, content)
    }
    file('tests/alpha/case-ts/input.ts', 'fixture\n')
    file('tests/alpha/case-tsx/input.tsx', 'fixture\n')
    file('tests/beta/case/input.json', '{"fixture":true}\n')
    file('tests/gamma/case/input.yaml', 'fixture: true\n')
    file('tests/delta/case/input.sh', 'fixture\n')
    file('tests/epsilon/assert-fixtures.ts', 'process.exit(0)\n')
    file('tests/zeta/typed-extension/tsconfig.json', '{}\n')
    file('tests/unit.test.mjs', "import { test } from 'node:test'\ntest('unit', () => {})\n")

    const plan = list(fixture)

    // Workflow structure comes first; jssg suites follow, one per script with a
    // matching fixture root, language inferred from the input extension; ts and
    // tsx fold into tsx; delta (.sh) and lib.js are skipped; epsilon and zeta
    // are not jssg suites.
    const expectedPlan = `== workflow structure
== jssg test: alpha (tsx)
  yarn exec codemod jssg test -l tsx scripts/alpha.ts tests/alpha
== jssg test: beta (json)
  yarn exec codemod jssg test -l json scripts/beta.ts tests/beta
== jssg test: gamma (yaml)
  yarn exec codemod jssg test -l yaml scripts/gamma.ts tests/gamma
== workflow fixtures: tests/epsilon/assert-fixtures.ts
  node tests/epsilon/assert-fixtures.ts
== tsc: tests/zeta/typed-extension/tsconfig.json
  yarn exec tsc -p tests/zeta/typed-extension/tsconfig.json
== node --test: tests/unit.test.mjs
  node --test tests/unit.test.mjs
== codemod workflow validate
  yarn exec codemod workflow validate -w workflow.yaml`

    assert.equal(plan.status, 0)
    assert.equal(plan.stdout, expectedPlan)

    // Nothing was executed: --list must not run the discovered suites.
    assert.ok(!existsSync(join(fixture, 'tests/epsilon/ran')))

    // Mixed fixture languages in one suite must fail loudly.
    mkdirSync(join(fixture, 'tests/alpha/case-mixed'))
    file('tests/alpha/case-mixed/input.json', 'fixture\n')
    assert.notEqual(list(fixture).status, 0)

    // Running outside a recipe directory must fail loudly.
    assert.notEqual(list(join(fixture, 'tests')).status, 0)

    // Structural violations must fail loudly.
    rmSync(join(fixture, 'scripts', 'alpha.ts'))
    file('workflow.yaml', "version: '1'\nnodes:\n  - id: n\n    steps:\n      - name: 'missing script'\n        js-ast-grep:\n          js_file: scripts/alpha.ts\n      - name: 'registry step'\n        codemod:\n          source: '@backstage/some-codemod'\n")
    const invalid = runBin('run-recipe-tests.ts', [], { cwd: fixture })
    assert.notEqual(invalid.status, 0)
    assert.match(invalid.stderr, /js_file 'scripts\/alpha\.ts' does not exist/)
    assert.match(invalid.stderr, /registry codemod steps are not allowed/)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

