#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Repo-wide test runner for migration recipes (codemods/<version>/migration-recipe).
// Invoked by a recipe's package.json test script as `run-recipe-tests`, run from
// the recipe directory.
//
// Suites are discovered by convention; adding a script or fixture suite needs
// no change to any test command:
//
//   scripts/<name>.ts  +  tests/<name>/<case>/input.<ext>  -> codemod jssg test
//     (ext ts/tsx -> language tsx, json -> json, yaml/yml -> yaml; fixture roots
//      without JSSG input files, e.g. .sh suites, are skipped here and covered
//      by their node --test suites)
//   tests/<name>/assert-fixtures.ts                        -> node tests/<name>/assert-fixtures.ts
//   tests/**/tsconfig.json                                  -> tsc -p
//   tests/**/*.test.mjs                                     -> node --test
// plus codemod workflow validate.
//
// --list prints the planned suites and commands without running them.
import { cli } from 'cleye'

import { runYarn } from './lib/spawn.ts'

const argv = cli({
  name: 'run-recipe-tests',
  flags: {
    list: { type: Boolean, description: 'Print the planned suites and commands without running them' },
  },
})
const listOnly = argv.flags.list

const recipeDir = process.cwd()
if (!existsSync(join(recipeDir, 'workflow.yaml'))) {
  console.error(`error: run this from a recipe directory containing workflow.yaml (got ${recipeDir})`)
  process.exit(1)
}

function run(command: string, args: string[]): void {
  if (listOnly) {
    console.log(`  ${command} ${args.join(' ')}`)
    return
  }
  if (command === 'node') {
    const result = spawnSync(process.execPath, args, { stdio: 'inherit' })
    if (result.status !== 0) {
      process.exit(result.status ?? 1)
    }
    return
  }
  const result = runYarn(args)
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function isDirectory(path: string): boolean {
  return statSync(path).isDirectory()
}

function listDir(path: string): string[] {
  return existsSync(path) ? readdirSync(path).sort() : []
}

// Recursively collects files under a root, skipping node_modules.
function collectFiles(root: string, match: (name: string) => boolean): string[] {
  const found: string[] = []
  const pending = [root]
  while (pending.length > 0) {
    const directory = pending.pop()
    if (directory === undefined) {
      continue
    }
    for (const entry of readdirSync(directory)) {
      if (entry === 'node_modules') {
        continue
      }
      const path = join(directory, entry)
      if (isDirectory(path)) {
        pending.push(path)
      } else if (match(entry)) {
        found.push(path)
      }
    }
  }
  return found.sort()
}

const languages: Record<string, string> = {
  ts: 'tsx',
  tsx: 'tsx',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
}

// --- JSSG fixture suites, one per scripts/<name>.ts with a matching tests/<name>/
for (const scriptFile of listDir('scripts').filter((name) => name.endsWith('.ts'))) {
  const name = scriptFile.replace(/\.ts$/, '')
  const fixtureRoot = `tests/${name}`
  if (!existsSync(fixtureRoot) || !isDirectory(fixtureRoot)) {
    continue
  }

  let language: string | undefined
  for (const caseDir of listDir(fixtureRoot)) {
    const casePath = join(fixtureRoot, caseDir)
    if (!isDirectory(casePath)) {
      continue
    }
    for (const file of listDir(casePath)) {
      if (!file.startsWith('input.')) {
        continue
      }
      const discovered = languages[file.slice('input.'.length)]
      if (discovered === undefined) {
        continue
      }
      if (language !== undefined && language !== discovered) {
        console.error(`error: ${fixtureRoot} mixes fixture languages (${language} and ${discovered})`)
        process.exit(1)
      }
      language = discovered
    }
  }
  // No JSSG input files (e.g. shell fixtures): covered by node --test suites.
  if (language === undefined) {
    continue
  }

  console.log(`== jssg test: ${name} (${language})`)
  run('yarn', ['exec', 'codemod', 'jssg', 'test', '-l', language, `scripts/${scriptFile}`, fixtureRoot])
}

// --- Workflow-level fixture suites
for (const entry of listDir('tests')) {
  const fixtureRunner = `tests/${entry}/assert-fixtures.ts`
  if (!existsSync(fixtureRunner)) {
    continue
  }
  console.log(`== workflow fixtures: ${fixtureRunner}`)
  run('node', [fixtureRunner])
}

// --- Fixture type checks
for (const tsconfig of collectFiles('tests', (name) => name === 'tsconfig.json')) {
  const path = tsconfig.replaceAll('\\', '/')
  console.log(`== tsc: ${path}`)
  run('yarn', ['exec', 'tsc', '-p', path])
}

// --- Node unit tests
for (const testFile of collectFiles('tests', (name) => name.endsWith('.test.mjs'))) {
  const path = testFile.replaceAll('\\', '/')
  console.log(`== node --test: ${path}`)
  run('node', ['--test', path])
}

// --- Workflow schema
console.log('== codemod workflow validate')
run('yarn', ['exec', 'codemod', 'workflow', 'validate', '-w', 'workflow.yaml'])
