#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

// Runs `yarn test` in the package owning each staged codemod script file.
import { cli } from 'cleye'

import { exitOnFailure, runYarn } from './lib/spawn.ts'

const argv = cli({
  name: 'test-staged',
  parameters: ['[files...]'],
})

// A staged script lives in <package>/scripts/<file>; its package is the parent.
const packageDirs = [...new Set(argv._.files.map((file) => resolve(dirname(file), '..')))].sort()

for (const packageDir of packageDirs) {
  if (!existsSync(join(packageDir, 'package.json'))) {
    continue
  }
  exitOnFailure(runYarn(['test'], { cwd: packageDir }))
}
