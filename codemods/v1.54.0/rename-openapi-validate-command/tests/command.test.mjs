import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rewriteCommand } from '../scripts/command.js'

test('rewriteCommand retains flags, quotes, environment, operators and line continuations', () => {
  assert.equal(
    rewriteCommand(
      'CI=1 yarn backstage-repo-tools repo schema openapi "verify" --strict && \\\n' +
      "env FOO=bar ./node_modules/.bin/backstage-repo-tools repo schema openapi 'verify' | cat\n",
    ),
    'CI=1 yarn backstage-repo-tools repo schema openapi "validate" --strict && \\\n' +
      "env FOO=bar ./node_modules/.bin/backstage-repo-tools repo schema openapi 'validate' | cat\n",
  )
})

test('rewriteCommand ignores comments, prose, aliases, substitutions and old test', () => {
  const input =
    '# backstage-repo-tools repo schema openapi verify\n' +
    'echo "backstage-repo-tools repo schema openapi verify"\n' +
    'tool repo schema openapi verify\n' +
    '$TOOL repo schema openapi verify\n' +
    'echo $(backstage-repo-tools repo schema openapi verify)\n' +
    'echo > backstage-repo-tools repo schema openapi verify\n' +
    'backstage-repo-tools repo schema openapi test\n' +
    "backstage-repo-tools repo schema openapi ve'rify'\n"
  assert.equal(rewriteCommand(input), input)
})
