import type { Codemod } from 'codemod:ast-grep'
import type JSON from 'codemod:ast-grep/langs/json'
import { setState } from 'codemod:workflow'

import { rewriteCommand } from './rename-openapi-validate-command-command.js'

const transform: Codemod<JSON> = async (root, options) => {
  const document = root.root()
  // The shell step needs the explicit -t target; the runner's cwd may differ.
  if (root.filename().replaceAll('\\', '/') === `${options.targetDir.replaceAll('\\', '/')}/package.json`) {
    setState(
      'targetDirEncoded',
      encodeURIComponent(options.targetDir).replaceAll(
        /[!'()*]/g,
        (character) => `%${character.codePointAt(0)?.toString(16).toUpperCase()}`,
      ),
    )
  }
  if (!document.text().includes('openapi') || !document.text().includes('verify')) {
    return null
  }
  // Reject invalid JSON rather than allowing tree-sitter's error recovery to change it.
  try {
    globalThis.JSON.parse(document.text())
  } catch {
    return null
  }

  const topLevel = document.find({ rule: { kind: 'object' } })
  const scripts = topLevel
    ?.children()
    .find((node) => node.kind() === 'pair' && globalThis.JSON.parse(node.field('key')?.text() ?? 'null') === 'scripts')
    ?.field('value')
  if (scripts?.kind() !== 'object') {
    return null
  }

  const edits = []
  for (const pair of scripts.children()) {
    if (pair.kind() !== 'pair') {
      continue
    }
    const value = pair.field('value')
    if (value?.kind() !== 'string') {
      continue
    }
    const original = globalThis.JSON.parse(value.text()) as string
    const updated = rewriteCommand(original)
    if (updated !== original) {
      edits.push(value.replace(globalThis.JSON.stringify(updated)))
    }
  }
  return edits.length ? Promise.resolve(document.commitEdits(edits)) : null
}

export default transform
