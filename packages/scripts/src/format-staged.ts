#!/usr/bin/env node
// Formats staged files, skipping ignored test fixtures. oxfmt exits 2 when
// every staged target is an ignored fixture, so those are filtered out here.
import { cli } from 'cleye'

import { isTestPath } from './lib/paths.ts'
import { exitOnFailure, runYarn } from './lib/spawn.ts'

const argv = cli({
  name: 'format-staged',
  parameters: ['[files...]'],
})

const files: string[] = argv._.files
const targets = files.filter((file) => !isTestPath(file))

if (targets.length > 0) {
  exitOnFailure(runYarn(['format', ...targets]))
}
