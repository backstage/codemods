import { importBindingOf } from '@jssg/utils/javascript/bindings'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('remove-total-items-option')

const STREAM_ENTITIES_FUNCTION = 'streamEntities'
const TOTAL_ITEMS_KEY = 'totalItems'
const REQUEST_TYPE = 'StreamEntitiesRequest'
const REQUEST_TYPE_SOURCES = new Set(['@backstage/catalog-client', '@backstage/plugin-catalog-node'])

function getPairKeyName(pair: SgNode<TSX>): string | null {
  const keyNode = pair.field('key')
  if (!keyNode) {
    return null
  }

  const kind = keyNode.kind()
  if (kind !== 'property_identifier' && kind !== 'string') {
    return null
  }

  return keyNode.text()
}

function isHorizontalWhitespace(char: string): boolean {
  return char === ' ' || char === '\t'
}

/**
 * Removes a `totalItems` pair from an object literal, absorbing an adjacent
 * comma. A single-pair object keeps its `{}` braces.
 */
function removePairEdit(pair: SgNode<TSX>, source: string, objectNode: SgNode<TSX>): Edit | null {
  const pairs = objectNode.children().filter((child) => child.is('pair'))
  if (pairs.length === 1) {
    return objectNode.replace('{}')
  }

  let startPos = pair.range().start.index
  let endPos = pair.range().end.index

  // Absorb a following comma plus the horizontal whitespace after it.
  let cursor = endPos
  while (cursor < source.length && isHorizontalWhitespace(source.charAt(cursor))) {
    cursor += 1
  }

  if (source.charAt(cursor) === ',') {
    endPos = cursor + 1
    while (endPos < source.length && isHorizontalWhitespace(source.charAt(endPos))) {
      endPos += 1
    }

    // Absorb the following newline boundary and the next line's indent when
    // the removed pair started its own line.
    if (source.charAt(endPos) === '\r') {
      endPos += 1
    }
    if (source.charAt(endPos) === '\n') {
      endPos += 1
      while (endPos < source.length && isHorizontalWhitespace(source.charAt(endPos))) {
        endPos += 1
      }
    }
  } else {
    // Absorb a preceding comma plus the whitespace before the pair.
    cursor = startPos
    while (cursor > 0 && isHorizontalWhitespace(source.charAt(cursor - 1))) {
      cursor -= 1
    }

    if (source.charAt(cursor - 1) !== ',') {
      return null
    }

    startPos = cursor - 1
  }

  return { startPos, endPos, insertedText: '' }
}

/** Calls to `streamEntities` or `<anything>.streamEntities`. */
function findStreamEntitiesCalls(rootNode: SgNode<TSX>): SgNode<TSX>[] {
  const calls: SgNode<TSX>[] = []

  for (const call of rootNode.findAll({ rule: { kind: 'call_expression' } })) {
    const callee = call.field('function')
    if (!callee) {
      continue
    }

    if (callee.is('identifier') && callee.text() === STREAM_ENTITIES_FUNCTION) {
      calls.push(call)
      continue
    }

    if (callee.is('member_expression')) {
      const property = callee.field('property')
      if (property.text() === STREAM_ENTITIES_FUNCTION) {
        calls.push(call)
      }
    }
  }

  return calls
}

function isStreamEntitiesRequestType(node: SgNode<TSX> | null): boolean {
  if (!node?.is('type_identifier') || node.text() !== REQUEST_TYPE) {
    return false
  }

  const binding = importBindingOf(node)
  return binding !== null && REQUEST_TYPE_SOURCES.has(binding.source)
}

/** `const request: StreamEntitiesRequest = { ... }` declarators. */
function findTypedRequestObjects(rootNode: SgNode<TSX>): SgNode<TSX>[] {
  const objects: SgNode<TSX>[] = []

  for (const declarator of rootNode.findAll({ rule: { kind: 'variable_declarator' } })) {
    const typeAnnotation = declarator.find({ rule: { kind: 'type_annotation' } })
    const typeIdentifier = typeAnnotation?.find({ rule: { kind: 'type_identifier' } }) ?? null
    if (!isStreamEntitiesRequestType(typeIdentifier)) {
      continue
    }

    const value = declarator.children().find((child) => child.is('object'))
    if (value) {
      objects.push(value)
    }
  }

  return objects
}

function removeTotalItemsPairs(objectNode: SgNode<TSX>, source: string, edits: Edit[]): number {
  let removed = 0

  for (const pair of objectNode.children().filter((child) => child.is('pair'))) {
    if (getPairKeyName(pair) !== TOTAL_ITEMS_KEY) {
      continue
    }

    const edit = removePairEdit(pair, source, objectNode)
    if (edit) {
      edits.push(edit)
      removed += 1
    }
  }

  return removed
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const source = rootNode.text()
  const edits: Edit[] = []

  for (const call of findStreamEntitiesCalls(rootNode)) {
    const argumentsNode = call.field('arguments')
    if (!argumentsNode) {
      continue
    }

    for (const argument of argumentsNode.children().filter((child) => child.is('object'))) {
      const removed = removeTotalItemsPairs(argument, source, edits)
      if (removed > 0) {
        migrationMetric.increment({ action: 'totalItems-removed', context: 'call' })
      }
    }
  }

  for (const objectNode of findTypedRequestObjects(rootNode)) {
    const removed = removeTotalItemsPairs(objectNode, source, edits)
    if (removed > 0) {
      migrationMetric.increment({ action: 'totalItems-removed', context: 'typed-literal' })
    }
  }

  if (edits.length === 0) {
    return null
  }

  const result = await Promise.resolve(rootNode.commitEdits(edits))
  return result
}

export default transform
