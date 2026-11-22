import type { Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'

export function statementAnchor(node: SgNode<TSX>): SgNode<TSX> {
  return (
    [node, ...node.ancestors()].find((candidate) =>
      ['program', 'statement_block', 'class_body', 'switch_case', 'switch_default'].includes(
        candidate.parent()?.kind() ?? '',
      ),
    ) ?? node
  )
}

export function startsOwnLine(node: SgNode<TSX>, lines: string[]): boolean {
  const { line, column } = node.range().start
  return column === (lines[line]?.match(/^[ \t]*/)?.[0].length ?? 0)
}

export function hasTodo(lines: string[], line: number, todo: string): boolean {
  for (let index = line - 1; index >= 0; index--) {
    const previous = lines[index]?.trim() ?? ''
    if (!previous.startsWith('// TODO(backstage-codemod):')) {
      return false
    }
    if (previous === todo) {
      return true
    }
  }
  return false
}

// Inline statements share their enclosing line; put the TODO above it without moving code.
export function todoEdit(lines: string[], anchor: SgNode<TSX>, todos: string[]): Edit {
  const { line, column, index } = anchor.range().start
  const indent = lines[line]?.match(/^[ \t]*/)?.[0] ?? ''
  // Tree-sitter columns count code points, while edit indices count UTF-8 bytes.
  // oxlint-disable-next-line unicorn/prefer-spread
  const prefix = Array.from(lines[line] ?? '')
    .slice(0, column)
    .join('')
  const start = index - new TextEncoder().encode(prefix).length
  return {
    startPos: start,
    endPos: start,
    insertedText: `${indent}${todos.join(`\n${indent}`)}\n`,
  }
}
