import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type YAML from 'codemod:ast-grep/langs/yaml'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('remove-atlassian-username-resolver-yaml')

const REMOVED_RESOLVER = 'usernameMatchingUserEntityName'
const ATLASSIAN_PROVIDER_KEY = 'atlassian'
const RESOLVER_KEY = 'resolver'

const TODO_MARKER = 'TODO(backstage-codemod)'
const TODO_LINE = `# ${TODO_MARKER}: replace usernameMatchingUserEntityName with emailLocalPartMatchingUserEntityName or emailMatchingUserEntityProfileEmail`

function normalizeKey(text: string): string {
  const trimmed = text.trim()

  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

function getPairKeyName(pair: SgNode<YAML>): string | null {
  const keyNode = pair.field('key')
  if (!keyNode) {
    return null
  }

  return normalizeKey(keyNode.text())
}

function getPairValueText(pair: SgNode<YAML>): string | null {
  const valueNode = pair.field('value')
  if (!valueNode) {
    return null
  }

  return valueNode.text().trim()
}

/** True when the pair sits somewhere below an `atlassian:` mapping key. */
function isUnderAtlassianProvider(pair: SgNode<YAML>): boolean {
  for (const ancestor of pair.ancestors()) {
    if (!ancestor.is('block_mapping_pair') && !ancestor.is('flow_pair')) {
      continue
    }

    if (getPairKeyName(ancestor) === ATLASSIAN_PROVIDER_KEY) {
      return true
    }
  }

  return false
}

function lineStartOf(source: string, index: number): number {
  return source.lastIndexOf('\n', index - 1) + 1
}

function lineIndentOf(source: string, index: number): string {
  const line = source.slice(lineStartOf(source, index), index)
  const match = line.match(/^[ \t]*/)
  return match?.[0] ?? ''
}

function insertTodoAbove(pair: SgNode<YAML>, source: string, edits: Edit[]): void {
  const start = pair.range().start.index
  const lineStart = lineStartOf(source, start)

  // Idempotency: skip when the previous non-empty line already carries the marker.
  const previousLineEnd = source.lastIndexOf('\n', Math.max(lineStart - 2, 0))
  const previousLine = source.slice(previousLineEnd + 1, lineStart)
  if (previousLine.includes(TODO_MARKER)) {
    return
  }

  const indent = lineIndentOf(source, start)
  edits.push({
    startPos: lineStart,
    endPos: lineStart,
    insertedText: `${indent}${TODO_LINE}\n`,
  })
}

/**
 * Flags `resolver: usernameMatchingUserEntityName` under the Atlassian auth
 * provider. The choice between the two email resolvers is a data-alignment
 * decision, so the value is never rewritten here.
 */
const transform: Codemod<YAML> = async (root) => {
  const rootNode = root.root()
  const source = rootNode.text()
  const edits: Edit[] = []

  for (const pair of rootNode.findAll({ rule: { kind: 'block_mapping_pair' } })) {
    if (getPairKeyName(pair) !== RESOLVER_KEY) {
      continue
    }

    if (getPairValueText(pair) !== REMOVED_RESOLVER) {
      continue
    }

    if (!isUnderAtlassianProvider(pair)) {
      continue
    }

    insertTodoAbove(pair, source, edits)
    migrationMetric.increment({ action: 'resolver-flagged' })
  }

  if (edits.length === 0) {
    return null
  }

  const result = await Promise.resolve(rootNode.commitEdits(edits))
  return result
}

export default transform
