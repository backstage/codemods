import type { Codemod } from 'codemod:ast-grep'
import type YAML from 'codemod:ast-grep/langs/yaml'

import { rewriteCommand } from './command.js'

const transform: Codemod<YAML> = (root) => {
  const document = root.root()
  if (!document.text().includes('openapi') || !document.text().includes('verify')) {
    return Promise.resolve(null)
  }
  const edits = []
  for (const pair of document.findAll({
    rule: { kind: 'block_mapping_pair', has: { field: 'key', regex: '^run$' } },
  })) {
    const item = pair.parent()?.parent()?.parent()
    const steps = item?.parent()?.parent()?.parent()
    if (pair.field('key')?.text() !== 'run' || item?.kind() !== 'block_sequence_item') {
      continue
    }
    if (!steps) {
      continue
    }
    if (steps.field('key')?.text() !== 'steps') {
      continue
    }
    const value = pair.field('value')
    if (!value) {
      continue
    }
    const scalar = value.kind() === 'flow_node' ? value.children()[0] : value
    if (!scalar) {
      continue
    }
    const raw = scalar.text()
    let content: string
    let replacement: (updated: string) => string
    if (scalar.kind() === 'block_node' && raw.startsWith('|')) {
      // Keep the YAML block header, indentation and chomping marker intact.
      const newline = raw.indexOf('\n')
      if (newline < 0) {
        continue
      }
      content = raw.slice(newline + 1)
      replacement = (updated) => raw.slice(0, newline + 1) + updated
    } else if (scalar.kind() === 'single_quote_scalar') {
      content = raw.slice(1, -1).replaceAll("''", "'")
      replacement = (updated) => `'${updated.replaceAll("'", "''")}'`
    } else if (scalar.kind() === 'double_quote_scalar') {
      try {
        content = JSON.parse(raw) as string
      } catch {
        continue
      }
      replacement = (updated) => JSON.stringify(updated)
    } else if (scalar.kind() === 'plain_scalar') {
      content = raw
      replacement = (updated) => updated
    } else {
      continue
    }
    const updated = rewriteCommand(content)
    if (updated !== content) {
      edits.push(scalar.replace(replacement(updated)))
    }
  }
  return Promise.resolve(edits.length ? document.commitEdits(edits) : null)
}

export default transform
