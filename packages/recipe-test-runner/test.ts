// Regression: the recipe test runner discovers suites by convention and
// --list prints the plan without executing anything.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(fileURLToPath(import.meta.url))
const runner = join(packageRoot, 'run-recipe-tests.ts')

const fixture = join(tmpdir(), `recipe-runner-${process.pid}`)
mkdirSync(join(fixture, 'scripts'), { recursive: true })
for (const dir of [
  'tests/alpha/case-ts',
  'tests/alpha/case-tsx',
  'tests/beta/case',
  'tests/gamma/case',
  'tests/delta/case',
  'tests/epsilon',
  'tests/zeta/typed-extension',
  'tests',
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
file('tests/epsilon/assert-fixtures.sh', '#!/usr/bin/env bash\nprintf ran > tests/epsilon/ran\n')
file('tests/zeta/typed-extension/tsconfig.json', '{}\n')
file('tests/unit.test.mjs', "import { test } from 'node:test'\ntest('unit', () => {})\n")

function list(cwd: string): { status: number | null; stdout: string } {
  const result = spawnSync(process.execPath, [runner, '--list'], { cwd, encoding: 'utf8' })
  return { status: result.status, stdout: result.stdout.replace(/\n$/, '') }
}

const plan = list(fixture)

// JSSG suites: one per script with a matching fixture root, language inferred
// from the input extension; ts and tsx fold into tsx; delta (.sh) and lib.js
// are skipped; epsilon and zeta are not jssg suites.
const expectedPlan = `== jssg test: alpha (tsx)
  yarn exec codemod jssg test -l tsx scripts/alpha.ts tests/alpha
== jssg test: beta (json)
  yarn exec codemod jssg test -l json scripts/beta.ts tests/beta
== jssg test: gamma (yaml)
  yarn exec codemod jssg test -l yaml scripts/gamma.ts tests/gamma
== workflow fixtures: tests/epsilon/assert-fixtures.sh
  bash tests/epsilon/assert-fixtures.sh
== tsc: tests/zeta/typed-extension/tsconfig.json
  yarn exec tsc -p tests/zeta/typed-extension/tsconfig.json
== node --test: tests/unit.test.mjs
  node --test tests/unit.test.mjs
== codemod workflow validate
  yarn exec codemod workflow validate -w workflow.yaml`

if (plan.status !== 0 || plan.stdout !== expectedPlan) {
  console.error(`error: unexpected discovery plan\n\n${plan.stdout}`)
  process.exit(1)
}

// Nothing was executed: --list must not run the discovered suites.
if (existsSync(join(fixture, 'tests/epsilon/ran'))) {
  console.error('error: --list executed a discovered suite')
  process.exit(1)
}

// Mixed fixture languages in one suite must fail loudly.
mkdirSync(join(fixture, 'tests/alpha/case-mixed'), { recursive: true })
file('tests/alpha/case-mixed/input.json', 'fixture\n')
if (list(fixture).status === 0) {
  console.error('error: mixed fixture languages were not rejected')
  process.exit(1)
}

// Running outside a recipe directory must fail loudly.
if (list(join(fixture, 'tests')).status === 0) {
  console.error('error: running outside a recipe directory was not rejected')
  process.exit(1)
}

console.log('run-recipe-tests: ok')
