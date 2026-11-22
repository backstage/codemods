import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type YAML from 'codemod:ast-grep/langs/yaml'
import { useMetricAtom } from 'codemod:metrics'

const metric = useMetricAtom('migrate-ldap-search-attributes-yaml')
const comment =
  '# Preserves pre-1.57 behavior (all attributes). Narrow this list to the attributes your mappings and transformers use to benefit from attribute selection.'
const attributes = "attributes: ['*', '+']"

function collection(node: SgNode<YAML> | null, kind: string): SgNode<YAML> | null {
  if (!node) {
    return null
  }
  if (node.kind() === kind) {
    return node
  }
  if (!['document', 'block_node', 'flow_node'].includes(node.kind())) {
    return null
  }
  for (const child of node.children()) {
    const result = collection(child, kind)
    if (result) {
      return result
    }
  }
  return null
}

function mapping(value: SgNode<YAML> | null): SgNode<YAML> | null {
  return collection(value, 'block_mapping') ?? collection(value, 'flow_mapping')
}

function pairs(value: SgNode<YAML> | null): SgNode<YAML>[] {
  return (
    mapping(value)
      ?.children()
      .filter((node) => node.is('block_mapping_pair') || node.is('flow_pair')) ?? []
  )
}

function key(pair: SgNode<YAML>): string {
  return (pair.field('key')?.text().trim() ?? '').replace(/^(['"])(.*)\1$/, '$2')
}

function get(value: SgNode<YAML> | null, name: string): SgNode<YAML> | null {
  return (
    pairs(value)
      .find((pair) => key(pair) === name)
      ?.field('value') ?? null
  )
}

function items(value: SgNode<YAML> | null): SgNode<YAML>[] {
  if (!value) {
    return []
  }
  const sequence = collection(value, 'block_sequence') ?? collection(value, 'flow_sequence')
  if (!sequence) {
    return [value]
  }
  const result: SgNode<YAML>[] = []
  for (const item of sequence.children()) {
    if (item.is('flow_node')) {
      result.push(item)
    }
    if (item.is('block_sequence_item')) {
      const entry = item.children().find((node) => node.is('block_node') || node.is('flow_node'))
      if (entry) {
        result.push(entry)
      }
    }
  }
  return result
}

// Columns count code points, but edit indices count UTF-8 bytes.
function bytesAfterColumn(text: string, column: number): number {
  let length = 0
  for (const char of text) {
    if (column-- > 0) {
      continue
    }
    const code = char.codePointAt(0) ?? 0
    length += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
  }
  return length
}

const transform: Codemod<YAML> = async (root) => {
  const program = root.root()
  const source = program.text()
  if (!source.includes('ldap') || (!source.includes('users') && !source.includes('groups'))) {
    return null
  }
  const lines = source.split('\n')
  const edits: Edit[] = []
  const visited = new Set<number>()
  const addToMapping = (map: SgNode<YAML>, option: boolean) => {
    const existing = pairs(map)
    const [first] = existing
    if (!first) {
      return
    }
    // The first key's column accounts for the '- ' prefix in sequence items.
    // Insert at the end of the last line to preserve any trailing inline comment.
    const indent = ' '.repeat(first.range().start.column)
    const last = existing.at(-1)
    if (!last) {
      return
    }
    const { end } = last.range()
    const index = end.index + bytesAfterColumn(lines[end.line] ?? '', end.column)
    const content = option
      ? `${comment}\n${indent}${attributes}`
      : `options:\n${indent}  ${comment}\n${indent}  ${attributes}`
    edits.push({ startPos: index, endPos: index, insertedText: `\n${indent}${content}` })
  }
  const addOptions = (value: SgNode<YAML>) => {
    const map = mapping(value)
    if (!map?.is('block_mapping') || visited.has(map.id())) {
      return
    }
    visited.add(map.id())
    const existing = pairs(map)
    const option = existing.find((pair) => key(pair) === 'options')
    if (!option) {
      addToMapping(map, false)
    } else {
      const optionValue = option.field('value')
      const optionMap = mapping(optionValue)
      if (pairs(optionValue).some((pair) => key(pair) === 'attributes')) {
        return
      }
      if (optionMap?.is('block_mapping')) {
        addToMapping(optionMap, true)
      } else if (!optionValue && option.is('block_mapping_pair')) {
        const { end } = option.range()
        const line = lines[end.line] ?? ''
        const index = end.index + bytesAfterColumn(line, end.column)
        const indent = ' '.repeat(option.range().start.column + 2)
        edits.push({ startPos: index, endPos: index, insertedText: `\n${indent}${comment}\n${indent}${attributes}` })
      } else if (optionValue && ['null', 'Null', 'NULL', '~'].includes(optionValue.text().trim())) {
        const indent = ' '.repeat(option.range().start.column + 2)
        const { end } = option.range()
        const index = end.index + bytesAfterColumn(lines[end.line] ?? '', end.column)
        edits.push(optionValue.replace(''))
        edits.push({ startPos: index, endPos: index, insertedText: `\n${indent}${comment}\n${indent}${attributes}` })
      } else {
        return
      }
    }
    metric.increment({ action: 'attributes-added' })
  }
  const provider = (entry: SgNode<YAML>) => {
    for (const pair of pairs(entry)) {
      if (!['users', 'groups'].includes(key(pair))) {
        continue
      }
      for (const value of items(pair.field('value'))) {
        addOptions(value)
      }
    }
  }
  for (const document of program.children().filter((node) => node.is('document'))) {
    const catalog = get(document, 'catalog')
    const orgs = get(get(catalog, 'providers'), 'ldapOrg')
    for (const org of pairs(orgs)) {
      for (const entry of items(org.field('value'))) {
        provider(entry)
      }
    }
    const providers = [
      get(get(document, 'ldap'), 'providers'),
      get(get(get(catalog, 'processors'), 'ldapOrg'), 'providers'),
    ]
    for (const list of providers) {
      if (!list) {
        continue
      }
      const entries = items(list)
      if (entries.length === 1 && entries[0] === list && mapping(list)) {
        for (const pair of pairs(list)) {
          for (const entry of items(pair.field('value'))) {
            provider(entry)
          }
        }
      } else {
        for (const entry of entries) {
          provider(entry)
        }
      }
    }
  }
  return edits.length ? Promise.resolve(program.commitEdits(edits)) : null
}

export default transform
