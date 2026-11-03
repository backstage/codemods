#!/usr/bin/env node
import { appendFileSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Creates git tags for each codemod whose version was bumped by changesets.
// Outputs the list of changed codemod directories for the publish job.
// Tags follow the pattern: <name>@v<version>
//
// Idempotent: a tag is considered "already released" if it exists locally
// OR on the remote. The local check alone is unreliable on shallow CI
// clones where tags may not be fetched.
import { cli } from 'cleye'

import { exitOnFailure, runGit } from './lib/spawn.ts'

cli({ name: 'tag-and-publish' })

// Snapshot remote tags once so we don't run `git ls-remote` per codemod.
// A failed lookup must abort: an empty tag set would re-tag already-released
// codemods (the original bash aborted via set -euo pipefail).
const remote = runGit(['ls-remote', '--tags', 'origin'], { capture: true })
if (remote.status !== 0) {
  console.error(remote.stderr)
  process.exit(remote.status ?? 1)
}
const remoteTags = new Set(
  remote.stdout
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const ref = line.split(/\s+/)[1] ?? ''
      return ref.replace(/^refs\/tags\//, '').replace(/\^\{\}$/, '')
    }),
)

function tagExistsAnywhere(tag: string): boolean {
  if (runGit(['rev-parse', tag], { capture: true }).status === 0) {
    return true
  }
  return remoteTags.has(tag)
}

function listDirs(path: string): string[] {
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

const changedDirs: string[] = []
const newTags: string[] = []

for (const group of listDirs('codemods')) {
  for (const name of listDirs(join('codemods', group))) {
    const directory = join('codemods', group, name)
    const packageJson = join(directory, 'package.json')
    const manifest = JSON.parse(readFileSync(packageJson, 'utf8')) as {
      name: string
      version: string
    }
    const tag = `${manifest.name}@v${manifest.version}`

    if (tagExistsAnywhere(tag)) {
      console.log(`Tag ${tag} already exists, skipping`)
      continue
    }

    console.log(`Creating tag ${tag}`)
    exitOnFailure(runGit(['tag', tag]))
    newTags.push(tag)
    changedDirs.push(directory.replaceAll('\\', '/'))
  }
}

// Push only the tags this run created. Avoids `git push --tags` clobbering
// any unrelated local tag state and keeps push failures localized to the
// tag that actually failed.
for (const tag of newTags) {
  exitOnFailure(runGit(['push', 'origin', `refs/tags/${tag}`]))
}

const output = process.env.GITHUB_OUTPUT
if (output !== undefined && output !== '') {
  appendFileSync(output, `changed_dirs=${JSON.stringify(changedDirs)}\n`)
}
