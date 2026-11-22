import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type YAML from 'codemod:ast-grep/langs/yaml'
import { useMetricAtom } from 'codemod:metrics'

const metric = useMetricAtom('flag-webhook-secret-config-yaml')
const todo =
  '# TODO(backstage-codemod): since 1.57 webhook requests are rejected (HTTP 403) without webhookSecret. Configure it here or in an environment-specific app-config.'

function key(pair: SgNode<YAML>): string | undefined {
  const text = pair.field('key')?.text().trim()
  if (!text) {
    return undefined
  }
  return (text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))
    ? text.slice(1, -1)
    : text
}

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

function pairs(value: SgNode<YAML> | null): SgNode<YAML>[] {
  const mapping = collection(value, 'block_mapping') ?? collection(value, 'flow_mapping')
  return mapping?.children().filter((child) => child.is('block_mapping_pair') || child.is('flow_pair')) ?? []
}

function valueAt(value: SgNode<YAML> | null, name: string): SgNode<YAML> | null {
  return (
    pairs(value)
      .find((pair) => key(pair) === name)
      ?.field('value') ?? null
  )
}

function sequence(value: SgNode<YAML> | null): SgNode<YAML>[] {
  const seq = collection(value, 'block_sequence') ?? collection(value, 'flow_sequence')
  if (!seq) {
    return []
  }
  const result: SgNode<YAML>[] = []
  for (const child of seq.children()) {
    if (child.is('flow_node')) {
      result.push(child)
    } else if (child.is('block_sequence_item')) {
      const entry = child.children().find((node) => node.is('block_node') || node.is('flow_node'))
      if (entry) {
        result.push(entry)
      }
    }
  }
  return result
}

function hasSecret(value: SgNode<YAML> | null): boolean {
  return pairs(value).some((pair) => {
    if (key(pair) !== 'webhookSecret') {
      return false
    }
    const secret = pair.field('value')?.text().trim()
    return !!secret && !['~', 'null', 'Null', 'NULL', "''", '""'].includes(secret)
  })
}

function githubHasSecret(document: SgNode<YAML>): boolean {
  const github = valueAt(valueAt(document, 'integrations'), 'github')
  return sequence(github).some((entry) => sequence(valueAt(entry, 'apps')).some(hasSecret))
}

const transform: Codemod<YAML> = async (root) => {
  const program = root.root()
  const source = program.text()
  if (!source.includes('events') || !source.includes('modules')) {
    return null
  }
  const lines = source.split('\n')
  const documents = program.children().filter((node) => node.is('document'))
  const githubSecret = documents.some(githubHasSecret)
  const edits: Edit[] = []
  for (const document of documents) {
    const modules = valueAt(valueAt(document, 'events'), 'modules')
    for (const pair of pairs(modules).filter((entry) => entry.is('block_mapping_pair'))) {
      const name = key(pair)
      if (!name || !['github', 'gitlab', 'azureDevOps'].includes(name) || (name === 'github' && githubSecret)) {
        continue
      }
      const value = pair.field('value')
      const entries = pairs(value)
      if (
        value &&
        entries.length === 0 &&
        !collection(value, 'block_mapping') &&
        !collection(value, 'flow_mapping') &&
        !['null', '~'].includes(value.text().trim())
      ) {
        continue
      }
      if (
        hasSecret(value) ||
        entries.some((entry) => {
          const name = key(entry)
          const value = entry.field('value')?.text().trim()
          return (
            name === 'dangerouslyAllowUnauthenticatedEvents' &&
            ['true', 'True', 'TRUE', "'true'", '"true"'].includes(value ?? '')
          )
        })
      ) {
        continue
      }
      const { line, index } = pair.range().start
      if (line > 0 && lines[line - 1]?.includes(todo)) {
        continue
      }
      const indent = lines[line]?.match(/^[ \t]*/)?.[0] ?? ''
      edits.push({ startPos: index, endPos: index, insertedText: `${todo}\n${indent}` })
      metric.increment({ action: 'module-flagged', module: name })
    }
  }
  return edits.length ? Promise.resolve(program.commitEdits(edits)) : null
}

export default transform
