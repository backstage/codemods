#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Generate the "## Codemods" section of README.md from the filesystem.
// Shows only the latest 2 versions. Older versions are discoverable
// by browsing the codemods/ directory.
import { cli } from 'cleye'

import { runYarn } from './lib/spawn.ts'

cli({ name: 'generate-readme-codemods' })

// Run from the repository root (yarn readme); walk up to the workspace root.
function findRepoRoot(): string {
  let directory = process.cwd()
  for (;;) {
    const manifest = join(directory, 'package.json')
    if (existsSync(manifest) && 'workspaces' in JSON.parse(readFileSync(manifest, 'utf8'))) {
      return directory
    }
    const parent = resolve(directory, '..')
    if (parent === directory) {
      console.error('error: no workspace root found above the current directory')
      process.exit(1)
    }
    directory = parent
  }
}

const repoRoot = findRepoRoot()
const readme = join(repoRoot, 'README.md')
const codemodsDir = join(repoRoot, 'codemods')

const START_MARKER = '<!-- CODEMODS_START -->'
const END_MARKER = '<!-- CODEMODS_END -->'

function listDirs(path: string): string[] {
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
}

// Numeric-aware version sort (like `sort -V`), newest first.
function compareVersions(a: string, b: string): number {
  const left = a
    .replaceAll(/^v|[^\d.]/g, '')
    .split('.')
    .map(Number)
  const right = b
    .replaceAll(/^v|[^\d.]/g, '')
    .split('.')
    .map(Number)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const delta = (right[i] ?? 0) - (left[i] ?? 0)
    if (delta !== 0) {
      return delta
    }
  }
  return 0
}

// Renders a table for a group of codemods, without a trailing newline
// (matching the command-substitution semantics of the previous generator).
function renderGroup(group: string): string {
  const groupDir = join(codemodsDir, group)
  const lines: string[] = [`### ${group}`, '']

  // Only show migration-recipe link for version directories that have one
  if (existsSync(join(groupDir, 'migration-recipe'))) {
    const standalone = listDirs(groupDir).some(
      (name) => name !== 'migration-recipe' && existsSync(join(groupDir, name, 'codemod.yaml')),
    )
    const recipeLink = `[\`migration-recipe\`](./codemods/${group}/migration-recipe)`
    lines.push(
      standalone
        ? `Run the ${recipeLink} to apply every codemod below in one pass, or run any individual codemod on its own.`
        : `Run the ${recipeLink} to apply every codemod below in one pass. Individual scripts can still be run on their own; see the recipe's README.`,
      '',
    )
  }

  lines.push('| Codemod | Description |', '| ------- | ----------- |')
  for (const name of listDirs(groupDir)) {
    const yaml = join(groupDir, name, 'codemod.yaml')
    if (!existsSync(yaml)) {
      continue
    }
    const descriptionLine = readFileSync(yaml, 'utf8')
      .split('\n')
      .find((line) => line.startsWith('description:'))
    if (descriptionLine === undefined) {
      continue
    }
    const description = descriptionLine
      .replace(/^description: *'(.*)'$/, '$1')
      .replace(/^description: *"(.*)"$/, '$1')
      .replace(/^description: */, '')
      .replace(/^Backstage [\d.]*: */, '')
    lines.push(`| [${name}](./codemods/${group}/${name}) | ${description} |`)
  }

  return lines.join('\n')
}

// Separate version directories (v*) from non-version groups (misc, etc.).
const versionDirs = listDirs(codemodsDir)
  .filter((name) => name.startsWith('v'))
  .sort(compareVersions)
const otherDirs = listDirs(codemodsDir)
  .filter((name) => !name.startsWith('v'))
  .sort()

// Show the latest 2 versions.
const show = Math.min(versionDirs.length, 2)

let section = ''
for (const version of versionDirs.slice(0, show)) {
  section += `${renderGroup(version)}\n\n`
}
if (versionDirs.length > show) {
  section += 'Older versions are available in the [`codemods/`](./codemods) directory.\n\n'
}

// Append non-version groups (misc, etc.) that contain any codemods.
for (const group of otherDirs) {
  const hasCodemods = listDirs(join(codemodsDir, group)).some((name) =>
    existsSync(join(codemodsDir, group, name, 'codemod.yaml')),
  )
  if (hasCodemods) {
    section += `${renderGroup(group)}\n\n`
  }
}

if (!readFileSync(readme, 'utf8').includes(START_MARKER)) {
  console.error(`ERROR: ${START_MARKER} not found in README.md`)
  console.error('Add these markers around the Codemods section:')
  console.error(`  ${START_MARKER}`)
  console.error(`  ${END_MARKER}`)
  process.exit(1)
}

// Replace the content between the markers.
const readmeContents = readFileSync(readme, 'utf8')
const startIndex = readmeContents.indexOf(START_MARKER)
const endIndex = readmeContents.indexOf(END_MARKER)
if (endIndex === -1 || endIndex < startIndex) {
  console.error(`ERROR: ${END_MARKER} not found after ${START_MARKER} in README.md`)
  process.exit(1)
}
const updated = `${readmeContents.slice(0, startIndex + START_MARKER.length)}\n${section}${readmeContents.slice(endIndex)}`
writeFileSync(readme, updated)

// Format so the committed output matches what oxfmt expects.
runYarn(['format', readme], { capture: true })

const shown = versionDirs.slice(0, 2).join(' and ')
console.log(`✅ README.md updated with ${shown} (${versionDirs.length} versions on disk)`)
