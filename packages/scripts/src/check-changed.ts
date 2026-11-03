#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Shared quality gates for local hooks and CI.
// Checks the merge-base diff against BASE (default: origin/main).
import { cli } from 'cleye'

import { isFormatTarget, isLintTarget } from './lib/paths.ts'
import { exitOnFailure, runGit, runYarn } from './lib/spawn.ts'

const argv = cli({
  name: 'check-changed',
  parameters: ['[base]'],
})
const base = argv._.base ?? 'origin/main'

if (runGit(['rev-parse', '--verify', base], { capture: true }).status !== 0) {
  console.error(`error: base ref '${base}' not found. Fetch it first (e.g. git fetch origin main).`)
  process.exit(1)
}

function changedFiles(...pathspec: string[]): string[] {
  const args = ['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`]
  if (pathspec.length > 0) {
    args.push('--', ...pathspec)
  }
  return runGit(args, { capture: true })
    .stdout.split('\n')
    .filter((line) => line !== '')
}

const allFiles = changedFiles()
const formatFiles = allFiles.filter(isFormatTarget)
const lintFiles = allFiles.filter(isLintTarget)

// The codemod diff (without --diff-filter) also sees deleted packages so their
// tests stop running; existing package.json presence filters those out.
const codemodDirs = [
  ...new Set(
    runGit(['diff', '--name-only', `${base}...HEAD`, '--', 'codemods/'], { capture: true })
      .stdout.split('\n')
      .filter((line) => line.split('/').length >= 3)
      .map((line) => line.split('/').slice(0, 3).join('/')),
  ),
].sort()

// Keep each Yarn invocation below the Windows command-line limit (8191 chars).
// The 4000-char budget leaves room for Yarn, shell quoting, and executable paths.
function checkFilesInBatches(check: string, files: string[]): void {
  const batch: string[] = []
  let batchLength = 0
  const flush = () => {
    if (batch.length > 0) {
      exitOnFailure(runYarn([check, ...batch]))
      batch.length = 0
      batchLength = 0
    }
  }
  for (const file of files) {
    if (batch.length > 0 && batchLength + file.length + 3 > 4000) {
      flush()
    }
    batch.push(file)
    batchLength += file.length + 3
  }
  flush()
}

if (formatFiles.length > 0) {
  console.log('::group::Format check (changed files)')
  checkFilesInBatches('format:check', formatFiles)
  console.log('::endgroup::')
}

if (lintFiles.length > 0) {
  console.log('::group::Lint (changed files)')
  checkFilesInBatches('lint', lintFiles)
  console.log('::endgroup::')
}

if (codemodDirs.length > 0) {
  console.log('::group::Package name length check')
  let failed = false
  for (const directory of codemodDirs) {
    const packageJson = join(directory, 'package.json')
    if (!existsSync(packageJson)) {
      continue
    }
    const { name } = JSON.parse(readFileSync(packageJson, 'utf8')) as { name: string }
    if (name.length > 50) {
      console.error(`::error::Package name '${name}' is ${name.length} chars (max 50 for Codemod registry)`)
      failed = true
    }
  }
  if (failed) {
    process.exit(1)
  }
  console.log('::endgroup::')

  console.log('::group::Test (changed codemods)')
  for (const directory of codemodDirs) {
    if (!existsSync(join(directory, 'package.json'))) {
      continue
    }
    exitOnFailure(runYarn(['test'], { cwd: directory }))
  }
  console.log('::endgroup::')
}

console.log(`All changed-file checks passed (base: ${base}).`)
