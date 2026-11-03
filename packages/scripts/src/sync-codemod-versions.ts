#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Syncs the version field in each codemod's codemod.yaml with its package.json.
// Run after `changeset version` to keep both files in sync.
import { cli } from 'cleye'

import { recipeDirs } from './lib/recipes.ts'

cli({ name: 'sync-codemod-versions' })

for (const directory of recipeDirs()) {
  const packageJson = join(directory, 'package.json')
  const codemodYaml = join(directory, 'codemod.yaml')
  if (!existsSync(packageJson) || !existsSync(codemodYaml)) {
    continue
  }
  const { version } = JSON.parse(readFileSync(packageJson, 'utf8')) as { version: string }
  const yaml = readFileSync(codemodYaml, 'utf8')
  writeFileSync(codemodYaml, yaml.replace(/^version: .*/m, `version: '${version}'`))
  console.log(`Synced ${codemodYaml.replaceAll('\\', '/')} to version ${version}`)
}
