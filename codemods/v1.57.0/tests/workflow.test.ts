import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parse } from 'yaml'

const source = readFileSync(new URL('../workflow.yaml', import.meta.url), 'utf8')
const workflow = parse(source)

const SOURCE_EXCLUDES = [
  '**/node_modules/**',
  '**/dist/**',
  '**/dist-types/**',
  '**/build/**',
  '**/coverage/**',
]
const TEST_FILE_EXCLUDES = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/*.stories.*',
  '**/__fixtures__/**',
  '**/__mocks__/**',
]
const APP_CONFIG = ['**/app-config.yaml', '**/app-config.*.yaml', '**/app-config.yml', '**/app-config.*.yml']

// [js_file, language] in #193 steps-table order. `shell` marks the host-run step.
const EXPECTED: Array<[string, string]> = [
  ['scripts/migrate-frontend-plugin-api-imports.ts', 'tsx'], // 1
  ['scripts/replace-removed-frontend-plugin-api-types.ts', 'tsx'], // 2
  ['scripts/migrate-api-refs-to-core-apis.ts', 'tsx'], // 3
  ['scripts/replace-create-specialized-app.ts', 'tsx'], // 4
  ['scripts/replace-removed-mock-api-types.ts', 'tsx'], // 5
  ['scripts/add-timestamp-to-root-logger-json-format.ts', 'tsx'], // 6
  ['scripts/add-logger-to-gitlab-token-validator.ts', 'tsx'], // 7a
  ['scripts/flag-webhook-secret-config-yaml.ts', 'yaml'], // 7c
  ['scripts/migrate-ldap-search-attributes-yaml.ts', 'yaml'], // 8
  ['scripts/remove-dynamic-client-registration-config.ts', 'yaml'], // 9
  ['scripts/remove-alert-display-anchor-origin.ts', 'yaml'], // 10
  ['scripts/rename-techdocs-cli-serve-flags-package-json.ts', 'json'], // 11
  ['scripts/rename-techdocs-cli-serve-flags-ci-yaml.ts', 'yaml'], // 11
  ['scripts/rename-techdocs-cli-serve-flags-shell.ts', 'shell'], // 11 (host-run)
  ['scripts/update-react-peer-dependency-ranges.ts', 'json'], // 12
  ['scripts/wrap-icon-bundle-icons-in-elements.ts', 'tsx'], // 13
  ['scripts/migrate-router-blueprint-to-app-root-wrapper.ts', 'tsx'], // 14
  ['scripts/migrate-nav-content-items-to-nav-items.ts', 'tsx'], // 15
  ['scripts/flag-bui-standalone-routing.ts', 'tsx'], // 16
]

type Step = {
  name: string
  run?: string
  env?: Record<string, string>
  'js-ast-grep'?: { js_file: string; language: string; semantic_analysis?: string; include: string[]; exclude: string[] }
}

const steps: Step[] = workflow.nodes[0].steps

function scriptOf(step: Step): string {
  return step['js-ast-grep']?.js_file ?? step.env?.CODEMOD_SCRIPT ?? ''
}

test('v1.57.0 runs every local step in a single node, in #193 order', () => {
  assert.deepEqual(
    workflow.nodes.map((node: { id: string }) => node.id),
    ['apply-recipe'],
  )
  assert.doesNotMatch(source, /^\s+codemod:\s*$/m)
  assert.deepEqual(
    steps.map(step => [scriptOf(step), step['js-ast-grep']?.language ?? 'shell']),
    EXPECTED,
  )
})

test('selectors match each step language', () => {
  for (const step of steps) {
    const ast = step['js-ast-grep']
    if (!ast) continue
    const file = ast.js_file
    if (file === 'scripts/flag-bui-standalone-routing.ts') {
      assert.deepEqual(ast.exclude, [...SOURCE_EXCLUDES, ...TEST_FILE_EXCLUDES], file)
    } else {
      assert.deepEqual(ast.exclude, SOURCE_EXCLUDES, file)
    }
    if (ast.language === 'tsx') {
      assert.equal(ast.semantic_analysis, 'file', file)
      assert.deepEqual(ast.include, ['**/*.ts', '**/*.tsx'], file)
    } else if (ast.language === 'json') {
      assert.deepEqual(ast.include, ['**/package.json'], file)
    } else if (file === 'scripts/rename-techdocs-cli-serve-flags-ci-yaml.ts') {
      assert.deepEqual(ast.include, ['**/.github/workflows/*.yml', '**/.github/workflows/*.yaml'], file)
    } else {
      assert.equal(ast.language, 'yaml', file)
      assert.deepEqual(ast.include, APP_CONFIG, file)
    }
  }
})

test('TechDocs shell step runs after the package.json step that sets targetDirEncoded', () => {
  const scripts = steps.map(scriptOf)
  const packageJson = scripts.indexOf('scripts/rename-techdocs-cli-serve-flags-package-json.ts')
  const ciYaml = scripts.indexOf('scripts/rename-techdocs-cli-serve-flags-ci-yaml.ts')
  const shell = scripts.indexOf('scripts/rename-techdocs-cli-serve-flags-shell.ts')
  assert.ok(packageJson >= 0 && packageJson < ciYaml && ciYaml < shell)
  assert.equal(steps[shell]?.['js-ast-grep'], undefined)
  // Without any package.json the state stays unset; the guard skips the step instead of failing the recipe.
  assert.equal((steps[shell] as Step & { if?: string }).if, 'state.targetDirEncoded')
})

test('shell step payload is quoted for sh and cmd compatibility', () => {
  // An unquoted parenthesized node -e payload is an sh syntax error on Linux.
  const runLine = source.split('\n').find(line => line.includes("run: 'node -e"))
  assert.ok(runLine !== undefined, 'run step not found')
  assert.match(runLine, /run: 'node -e "import\(require\(process\.env\.CODEMOD_URL_MODULE\)/)
  assert.match(runLine, /\)" \$\{\{ state\.targetDirEncoded \}\}'/)
  assert.match(source, /CODEMOD_SCRIPT: 'scripts\/rename-techdocs-cli-serve-flags-shell\.ts'/)
})

test('the recipe takes no parameters', () => {
  assert.equal(workflow.params, undefined)
})
