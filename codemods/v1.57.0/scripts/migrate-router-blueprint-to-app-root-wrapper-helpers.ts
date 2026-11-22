import { resolveDefinition } from '@jssg/utils/javascript/bindings'
import { getFileStyle, getLineIndent } from '@jssg/utils/javascript/style'
import type { Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'

type Node = SgNode<TSX>

export function property(object: Node | null | undefined, key: string): Node | null {
  if (!object?.is('object')) {
    return null
  }
  return (
    object.children().find(
      (n) =>
        (n.is('pair') &&
          n
            .field('key')
            .text()
            .replaceAll(/^['"]|['"]$/g, '') === key) ||
        (n.is('method_definition') && n.field('name').text() === key) ||
        (n.is('shorthand_property_identifier') && n.text() === key),
    ) ?? null
  )
}

export function value(node: Node | null): Node | null {
  return node?.is('pair') ? node.field('value') : node
}

/** Tree-sitter columns count code points; JavaScript indexes count UTF-16 units. */
function columnIndex(line: string, column: number): number {
  let index = 0
  let count = 0
  for (const char of line) {
    if (count++ >= column) {
      break
    }
    index += char.length
  }
  return index
}

export function linePrefix(source: string, node: Node): string {
  const pos = node.range().start
  const line = source.split('\n')[pos.line] ?? ''
  return line.slice(0, columnIndex(line, pos.column))
}

export function functionFor(node: Node | null, filename: string): Node | null {
  if (!node) {
    return null
  }
  if (
    node.is('arrow_function') ||
    node.is('function_expression') ||
    node.is('function_declaration') ||
    node.is('method_definition')
  ) {
    return node
  }
  if (!node.is('identifier')) {
    return null
  }
  const definition = resolveDefinition(node)
  if (!definition || definition.getRoot().filename() !== filename) {
    return null
  }
  const parent = definition.is('identifier') ? definition.parent() : definition
  if (parent?.is('function_declaration')) {
    return parent
  }
  if (parent?.is('variable_declarator')) {
    const init = parent.field('value')
    if (init?.is('arrow_function') || init?.is('function_expression')) {
      return init
    }
  }
  return null
}

/** Resolve blueprint parameters, including calls to makeWithOverrides' original factory. */
export function blueprintParams(call: Node): { params: Node[]; unresolved: boolean } {
  const callee = call.field('function')
  if (!callee?.is('member_expression')) {
    return { params: [], unresolved: true }
  }
  const args =
    call
      .field('arguments')
      ?.children()
      .filter((n) => n.isNamed() && !n.is('comment')) ?? []
  const [options] = args
  if (!options?.is('object')) {
    return { params: [], unresolved: true }
  }
  if (callee.field('property').text() === 'make') {
    const params = value(property(options, 'params'))
    return params?.is('object') ? { params: [params], unresolved: false } : { params: [], unresolved: true }
  }
  const factory = value(property(options, 'factory'))
  if (
    !factory ||
    !['method_definition', 'arrow_function', 'function_expression', 'generator_function'].includes(factory.kind())
  ) {
    return { params: [], unresolved: true }
  }
  let parameter: Node | null = factory.is('arrow_function') ? factory.field('parameter') : null
  if (!parameter) {
    const parameters = factory.children().find((n) => n.is('formal_parameters'))
    const first = parameters?.children().find((n) => n.is('required_parameter') || n.is('optional_parameter'))
    parameter = first?.field('pattern') ?? null
  }
  if (!parameter?.is('identifier')) {
    return { params: [], unresolved: true }
  }
  let refs: Node[] = []
  try {
    refs = parameter
      .references()
      .filter((f) => f.root.filename() === call.getRoot().filename())
      .flatMap((f) => f.nodes)
  } catch {
    return { params: [], unresolved: true }
  }
  const params: Node[] = []
  let unresolved = false
  let calls = 0
  for (const ref of refs) {
    const invocation = ref.parent()
    if (!invocation?.is('call_expression') || invocation.field('function').id() !== ref.id()) {
      unresolved = true
      continue
    }
    calls++
    const actual = invocation
      .field('arguments')
      .children()
      .find((n) => n.isNamed() && !n.is('comment'))
    if (actual?.is('object')) {
      params.push(actual)
    } else {
      unresolved = true
    }
  }
  return { params, unresolved: unresolved || calls === 0 }
}

/** Remove an item and an adjacent comma; preserve unrelated list entries. */
export function removeListItem(item: Node, source: string): Edit {
  const parent = item.parent()
  const children = parent?.children() ?? []
  const index = children.findIndex((n) => n.id() === item.id())
  const next = children[index + 1]
  const prev = children[index - 1]
  const end = next?.kind() === ',' ? next.range().end : item.range().end
  const { start } = item.range()
  const lines = source.split('\n')
  const startLine = lines[start.line] ?? ''
  const endLine = lines[end.line] ?? ''
  const prefix = startLine.slice(0, columnIndex(startLine, start.column))
  const suffix = endLine.slice(columnIndex(endLine, end.column))
  if (!prefix.trim() && !suffix.trim() && end.line < lines.length - 1) {
    return {
      startPos: start.index - prefix.length,
      endPos: end.index + (suffix.endsWith('\r') ? 2 : 1),
      insertedText: '',
    }
  }
  if (next?.kind() === ',') {
    return { startPos: start.index, endPos: end.index + (suffix.match(/^[ \t]*/)?.[0].length ?? 0), insertedText: '' }
  }
  return {
    startPos: prev?.kind() === ',' ? prev.range().start.index : start.index,
    endPos: end.index,
    insertedText: '',
  }
}

export function todoCollector(source: string, onInsert: () => void) {
  const pending = new Map<number, { anchor: Node; messages: string[] }>()
  return {
    add(node: Node, message: string, preferred?: Node | null, useNodeLine = false) {
      let near =
        preferred && !linePrefix(source, preferred).trim()
          ? preferred
          : useNodeLine && !linePrefix(source, node).trim()
            ? node
            : null
      while (
        near?.parent() &&
        near.parent()?.range().start.index === near.range().start.index &&
        !near.parent()?.is('program')
      ) {
        near = near.parent()
      }
      const anchor =
        near ??
        [node, ...node.ancestors()].find((n) =>
          ['program', 'statement_block', 'class_body', 'switch_case'].includes(n.parent()?.kind() ?? ''),
        ) ??
        node
      let prev = anchor.prev()
      while (prev?.is('comment')) {
        if (prev.text().includes(message)) {
          return
        }
        prev = prev.prev()
      }
      const group = pending.get(anchor.id()) ?? { anchor, messages: [] }
      if (!group.messages.includes(message)) {
        group.messages.push(message)
      }
      pending.set(anchor.id(), group)
    },
    edits(): Edit[] {
      const result: Edit[] = []
      for (const { anchor, messages } of pending.values()) {
        const pos = anchor.range().start
        const prefix = linePrefix(source, anchor)
        const inline = prefix.trim().length > 0
        const trailing = inline ? (prefix.match(/[ \t]*$/)?.[0].length ?? 0) : 0
        const base = prefix.match(/^[ \t]*/)?.[0] ?? ''
        const indent =
          inline && anchor.parent()?.is('statement_block')
            ? base + getFileStyle(anchor.getRoot().root()).indentUnit
            : getLineIndent(source, anchor) || base
        result.push({
          startPos: pos.index - trailing,
          endPos: pos.index,
          insertedText: `${inline ? `\n${indent}` : ''}${messages.map((m) => `// ${m}`).join(`\n${indent}`)}\n${indent}`,
        })
        messages.forEach(() => onInsert())
      }
      return result
    },
  }
}
