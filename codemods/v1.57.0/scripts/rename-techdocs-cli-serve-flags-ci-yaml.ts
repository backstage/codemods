import type { Codemod } from 'codemod:ast-grep'
import type YAML from 'codemod:ast-grep/langs/yaml'
import { useMetricAtom } from 'codemod:metrics'

import { rewriteCommand } from './rename-techdocs-cli-serve-flags-command.ts'

const metric = useMetricAtom('rename-techdocs-cli-serve-flags-ci-yaml')

// Fold ordinary line breaks without changing offsets. More-indented and blank
// lines remain boundaries, so commands cannot accidentally cross them.
function foldLines(content: string): string {
  const lines = content.split('\n')
  const nonempty = lines.filter((line) => line.trim())
  const indent = Math.min(...nonempty.map((line) => line.match(/^ */)?.[0].length ?? 0))
  return lines
    .map((line, index) => {
      if (index === lines.length - 1) {
        return line
      }
      const next = lines[index + 1] ?? ''
      const sameIndent = (text: string) => text.trim() && (text.match(/^ */)?.[0].length ?? 0) === indent
      return line + (sameIndent(line) && sameIndent(next) ? ' ' : '\n')
    })
    .join('')
}

const transform: Codemod<YAML> = (root) => {
  const document = root.root()
  if (!document.text().includes('techdocs') || !document.text().includes('--mkdocs-')) {
    return Promise.resolve(null)
  }
  const edits = []
  for (const pair of document.findAll({
    rule: {
      any: [
        { kind: 'block_mapping_pair' },
        { kind: 'flow_pair' },
        { kind: 'block_sequence_item' },
        { kind: 'flow_node' },
      ],
    },
  })) {
    if (pair.kind() === 'flow_node' && pair.parent()?.kind() !== 'flow_sequence') {
      continue
    }
    const value =
      pair.kind() === 'flow_node'
        ? pair
        : pair.kind() === 'block_sequence_item'
          ? pair.children().find((node) => node.kind() === 'flow_node')
          : pair.field('value')
    if (!value) {
      continue
    }
    const scalar = value.kind() === 'flow_node' ? value.children()[0] : value
    if (!scalar) {
      continue
    }
    const raw = scalar.text()
    let content: string
    let folded = false
    let replacement: (updated: string) => string
    if (scalar.kind() === 'block_node' && (raw.startsWith('|') || raw.startsWith('>'))) {
      // Keep the YAML block header, indentation and chomping marker intact.
      const newline = raw.indexOf('\n')
      if (newline < 0) {
        continue
      }
      content = raw.slice(newline + 1)
      folded = raw.startsWith('>')
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
    const updated = rewriteCommand(folded ? foldLines(content) : content, content)
    if (updated !== content) {
      edits.push(scalar.replace(replacement(updated)))
      metric.increment({ action: 'command-updated' })
    }
  }
  return Promise.resolve(edits.length ? document.commitEdits(edits) : null)
}

export default transform
