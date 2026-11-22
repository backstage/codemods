import type { Edit, SgNode } from 'codemod:ast-grep'
import type YAML from 'codemod:ast-grep/langs/yaml'

type Node = SgNode<YAML>

export function key(pair: Node): string {
  const text = pair.field('key')?.text().trim() ?? ''
  if (text.startsWith('"') && text.endsWith('"')) {
    try {
      return JSON.parse(text) as string
    } catch {
      return ''
    }
  }
  return text.startsWith("'") && text.endsWith("'") ? text.slice(1, -1).replaceAll("''", "'") : text
}

export function pairs(pair: Node): Node[] | null {
  const value = pair.field('value')
  const mapping = value?.children().find((node) => node.kind() === 'block_mapping')
  return mapping ? mapping.children().filter((node) => node.kind() === 'block_mapping_pair') : null
}

export function flowPairs(pair: Node): Node[] | null {
  const mapping = pair
    .field('value')
    ?.children()
    .find((node) => node.kind() === 'flow_mapping')
  return mapping ? mapping.children().filter((node) => node.kind() === 'flow_pair') : null
}

export function topLevel(pair: Node): boolean {
  return pair.parent()?.kind() === 'block_mapping' && pair.parent()?.parent()?.parent()?.kind() === 'document'
}

function byteLength(text: string): number {
  let length = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    length += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
  }
  return length
}

/** Remove whole block lines, including immediately preceding same-indent comments. */
export function removeLines(source: string, node: Node, replacement = '', comments = true): Edit {
  const lines = source.split('\n')
  let start = node.range().start.line
  const indent = lines[start]?.match(/^[ \t]*/)?.[0] ?? ''
  if (comments) {
    while (
      start > 0 &&
      (lines[start - 1] ?? '').startsWith(`${indent}#`) &&
      !(lines[start - 1] ?? '').includes('TODO(backstage-codemod)')
    ) {
      start--
    }
  }
  let end = node.range().end.line
  if (node.range().end.column === 0 && end > start) {
    end--
  }
  // Tree-sitter includes comments belonging to the next sibling in this pair's range.
  while (end > node.range().start.line) {
    const line = lines[end] ?? ''
    const comment = line.match(/^([ \t]*)#/)
    if (!line.trim() || (comment && (comment[1]?.length ?? 0) <= indent.length)) {
      end--
    } else {
      break
    }
  }
  const prefix = lines.slice(0, start).join('\n') + (start ? '\n' : '')
  const removed = lines.slice(start, end + 1).join('\n') + (end + 1 < lines.length ? '\n' : '')
  return { startPos: byteLength(prefix), endPos: byteLength(prefix + removed), insertedText: replacement }
}
