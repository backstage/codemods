import { listImports } from '@jssg/utils/javascript/imports'
import { getFileStyle, getLineIndent } from '@jssg/utils/javascript/style'
import type { Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'

export type Node = SgNode<TSX>

// JSSG ranges use UTF-8 bytes; JavaScript strings use UTF-16 code units.
export function utf16IndexAtByte(source: string, offset: number): number {
  let bytes = 0
  let index = 0
  while (index < source.length && bytes < offset) {
    const code = source.codePointAt(index) ?? 0
    if (code < 0x80) {
      bytes += 1
      index += 1
    } else if (code < 0x800) {
      bytes += 2
      index += 1
    } else if (code > 0xffff) {
      bytes += 4
      index += 2
    } else {
      bytes += 3
      index += 1
    }
  }
  return index
}
export interface Specifier {
  node: Node
  importedName: string
  localName: string
  isTypeOnly: boolean
  text: string
  removed: boolean
}
export interface ImportState {
  node: Node
  named: Node
  source: string
  typeOnly: boolean
  defaultName: string | null
  specifiers: Specifier[]
  changed: boolean
}

export function importsFrom(program: SgNode<TSX, 'program'>, sources: string[]): ImportState[] {
  return listImports(program, { from: sources })
    .filter((item) => item.moduleType === 'esm' && item.node.is('import_statement'))
    .flatMap((item) => {
      const named = item.node.find({ rule: { kind: 'named_imports' } })
      if (!named) {
        return []
      }
      return [
        {
          node: item.node,
          named,
          source: item.source,
          typeOnly: item.isTypeOnly,
          defaultName: item.defaultName,
          specifiers: item.specifiers.map((spec) => ({ ...spec, text: spec.node.text(), removed: false })),
          changed: false,
        },
      ]
    })
}

export function references(binding: Node, filename: string): Node[] {
  const result: Node[] = []
  for (const group of binding.references()) {
    if (group.root.filename() !== filename) {
      continue
    }
    for (const ref of group.nodes) {
      if (ref.id() !== binding.id() && !ref.ancestors().some((node) => node.is('import_statement'))) {
        result.push(ref)
      }
    }
  }
  return result.sort((a, b) => a.range().start.index - b.range().start.index)
}

export function renderImports(program: SgNode<TSX, 'program'>, states: ImportState[]): Edit[] {
  const source = program.text()
  const { indentUnit } = getFileStyle(program)
  const edits: Edit[] = []
  for (const state of states) {
    if (!state.changed) {
      continue
    }
    const specs = state.specifiers.filter((spec) => !spec.removed)
    const comments = state.named.children().filter((child) => child.is('comment'))
    if (!specs.length && !state.defaultName) {
      const indent = getLineIndent(source, state.node)
      const commentText = comments.map((comment) => `${indent}${comment.text()}`).join('\n')
      if (commentText) {
        edits.push(state.node.replace(commentText))
      } else {
        let end = state.node.range().end.index
        const endChar = utf16IndexAtByte(source, end)
        if (source.slice(endChar, endChar + 2) === '\r\n') {
          end += 2
        } else if (source[endChar] === '\n') {
          end += 1
        }
        edits.push({ startPos: state.node.range().start.index, endPos: end, insertedText: '' })
      }
      continue
    }
    if (!specs.length) {
      const text = state.node.text()
      const base = state.node.range().start.index
      const start = utf16IndexAtByte(text, state.named.range().start.index - base)
      const end = utf16IndexAtByte(text, state.named.range().end.index - base)
      const comma = text.lastIndexOf(',', start)
      const indent = getLineIndent(source, state.node)
      const leading = comments.map((comment) => `${indent}${comment.text()}\n`).join('')
      edits.push(state.node.replace(leading + text.slice(0, comma >= 0 ? comma : start) + text.slice(end)))
      continue
    }
    let replacement: string
    if (!state.named.text().includes('\n') && !comments.length) {
      replacement = `{ ${specs.map((spec) => spec.text).join(', ')} }`
    } else {
      const sample = state.named.children().find((child) => child.is('import_specifier'))
      const indent = sample ? getLineIndent(source, sample) : getLineIndent(source, state.node) + indentUnit
      const closingIndent = getLineIndent(source, state.node)
      const parts: string[] = []
      const seen = new Set<number>()
      for (const child of state.named.children()) {
        if (child.is('comment')) {
          parts.push(child.text())
        } else if (child.is('import_specifier')) {
          const spec = specs.find((item) => item.node.id() === child.id())
          if (spec) {
            parts.push(`${spec.text},`)
            seen.add(spec.node.id())
          }
        }
      }
      parts.push(...specs.filter((spec) => !seen.has(spec.node.id())).map((spec) => `${spec.text},`))
      replacement = `{\n${parts.map((part) => `${indent}${part}`).join('\n')}\n${closingIndent}}`
    }
    edits.push(state.named.replace(replacement))
  }
  return edits
}

interface TodoAnchor {
  start: number
  end: number
  indent: string
  inline: boolean
  lines: string[]
}

export function todoWriter(program: SgNode<TSX, 'program'>) {
  const source = program.text()
  const { indentUnit } = getFileStyle(program)
  const entries = new Map<string, TodoAnchor>()
  return {
    add(target: Node, message: string): boolean {
      const candidates = [target, ...target.ancestors()]
      const member = candidates.find((candidate) => {
        if (candidate.is('pair')) {
          const value = candidate.field('value')
          if (
            target.range().start.index < value.range().start.index ||
            target.range().end.index > value.range().end.index
          ) {
            return false
          }
        } else if (!candidate.is('property_signature') && !candidate.is('public_field_definition')) {
          return false
        }
        const start = utf16IndexAtByte(source, candidate.range().start.index)
        const lineStart = source.lastIndexOf('\n', start - 1) + 1
        return /^[ \t]*$/.test(source.slice(lineStart, start))
      })
      const listKinds = new Set(['program', 'statement_block', 'class_body', 'switch_case'])
      const anchor = member ?? candidates.find((candidate) => listKinds.has(candidate.parent()?.kind() ?? '')) ?? target
      const byteStart = anchor.range().start.index
      const start = utf16IndexAtByte(source, byteStart)
      const lineStart = source.lastIndexOf('\n', start - 1) + 1
      const previous = source.slice(0, lineStart).split('\n')
      if (previous.at(-1)?.trim() === '') {
        previous.pop()
      }
      while (previous.length && previous.at(-1)?.trim().startsWith('//')) {
        if (previous.pop()?.includes(message)) {
          return false
        }
      }
      const prefix = source.slice(lineStart, start)
      const ownLine = /^[ \t]*$/.test(prefix)
      const indent = ownLine ? getLineIndent(source, anchor) : (prefix.match(/^[ \t]*/)?.[0] ?? '') + indentUnit
      const begin = ownLine ? byteStart - (start - lineStart) : byteStart - (prefix.match(/[ \t]*$/)?.[0].length ?? 0)
      const end = ownLine ? begin : byteStart
      const key = `${begin}:${end}`
      let entry = entries.get(key)
      if (!entry) {
        entry = { start: begin, end, indent, inline: !ownLine, lines: [] }
        entries.set(key, entry)
      }
      if (entry.lines.includes(message)) {
        return false
      }
      entry.lines.push(message)
      return true
    },
    edits(): Edit[] {
      return [...entries.values()].map((entry) => ({
        startPos: entry.start,
        endPos: entry.end,
        insertedText: `${entry.inline ? '\n' : ''}${entry.lines.map((line) => `${entry.indent}// ${line}`).join('\n')}\n${entry.inline ? entry.indent : ''}`,
      }))
    },
  }
}
