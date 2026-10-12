import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type YAML from 'codemod:ast-grep/langs/yaml'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('remove-relations-compatibility-config')

const CATALOG_KEY = 'catalog'
const TARGET_KEY = 'enableRelationsCompatibility'

function normalizeKey(text: string): string {
  const trimmed = text.trim()

  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

function isMappingPair(node: SgNode<YAML>): boolean {
  return node.is('block_mapping_pair') || node.is('flow_pair')
}

function getMappingPairs(node: SgNode<YAML>): SgNode<YAML>[] {
  return node.children().filter((child) => isMappingPair(child))
}

function findMappingNode(node: SgNode<YAML> | null): SgNode<YAML> | null {
  if (!node) {
    return null
  }

  if (node.is('block_mapping') || node.is('flow_mapping')) {
    return node
  }

  for (const child of node.children()) {
    if (child.is('block_mapping') || child.is('flow_mapping')) {
      return child
    }

    if (child.is('block_node') || child.is('flow_node')) {
      const mapping = findMappingNode(child)
      if (mapping) {
        return mapping
      }
    }
  }

  return null
}

function getPairKeyName(pair: SgNode<YAML>): string | null {
  const keyNode = pair.field('key')
  if (!keyNode) {
    return null
  }

  return normalizeKey(keyNode.text())
}

function lineStart(source: string, index: number): number {
  let cursor = index
  while (cursor > 0 && source[cursor - 1] !== '\n') {
    cursor -= 1
  }
  return cursor
}

function lineEndWithoutNewline(source: string, index: number): number {
  let cursor = index
  while (cursor < source.length && source[cursor] !== '\n') {
    cursor += 1
  }

  return cursor
}

function lineEndWithNewline(source: string, index: number): number {
  const lineEnd = lineEndWithoutNewline(source, index)
  if (lineEnd < source.length && source[lineEnd] === '\n') {
    return lineEnd + 1
  }

  return lineEnd
}

function fullLineRange(node: SgNode<YAML>, source: string): Pick<Edit, 'startPos' | 'endPos'> {
  const range = node.range()
  const startPos = lineStart(source, range.start.index)
  const endPos = lineEndWithNewline(source, range.end.index)

  return {
    startPos,
    endPos,
  }
}

function removeFullLineRange(node: SgNode<YAML>, source: string): Edit {
  return {
    ...fullLineRange(node, source),
    insertedText: '',
  }
}

function toFlowMappingText(pairs: SgNode<YAML>[]): string {
  if (pairs.length === 0) {
    return '{}'
  }

  return `{ ${pairs.map((pair) => pair.text().trim()).join(', ')} }`
}

function lineContainsCommentOutsideRanges(
  source: string,
  lineStartPos: number,
  lineEndPos: number,
  excludedRanges: Pick<Edit, 'startPos' | 'endPos'>[],
): boolean {
  const text = source.slice(lineStartPos, lineEndPos)
  if (!text.trimStart().startsWith('#')) {
    return false
  }

  return !excludedRanges.some((range) => lineStartPos >= range.startPos && lineEndPos <= range.endPos)
}

function hasPreservableCommentLines(
  source: string,
  catalogPair: SgNode<YAML>,
  targetRanges: Pick<Edit, 'startPos' | 'endPos'>[],
): boolean {
  const pairRange = catalogPair.range()
  const blockStart = lineEndWithNewline(source, pairRange.start.index)
  const blockEnd = lineEndWithNewline(source, pairRange.end.index)

  let cursor = blockStart
  while (cursor < blockEnd) {
    const lineEndPos = lineEndWithNewline(source, cursor)
    if (lineContainsCommentOutsideRanges(source, cursor, lineEndPos, targetRanges)) {
      return true
    }

    cursor = lineEndPos
  }

  return false
}

function emptyMappingLine(line: string): string {
  const colonIndex = line.indexOf(':')
  if (colonIndex === -1) {
    return line
  }

  const keyPart = line.slice(0, colonIndex + 1)
  const afterColon = line.slice(colonIndex + 1).trimStart()

  if (afterColon.startsWith('#')) {
    return `${keyPart} {} ${afterColon}`
  }

  return `${keyPart} {}`
}

function replaceWithEmptyMapping(pair: SgNode<YAML>, source: string): Edit {
  const pairRange = pair.range()
  const startPos = lineStart(source, pairRange.start.index)
  const endPos = lineEndWithoutNewline(source, pairRange.start.index)
  const line = source.slice(startPos, endPos)

  return {
    startPos,
    endPos,
    insertedText: emptyMappingLine(line),
  }
}

const transform: Codemod<YAML> = async (root) => {
  const rootNode = root.root()
  const source = rootNode.text()
  const edits: Edit[] = []

  const documents = rootNode.findAll({
    rule: {
      kind: 'document',
    },
  })

  for (const documentNode of documents) {
    const rootMapping = findMappingNode(documentNode)
    if (!rootMapping) {
      continue
    }

    for (const topLevelPair of getMappingPairs(rootMapping)) {
      if (getPairKeyName(topLevelPair) !== CATALOG_KEY) {
        continue
      }

      const catalogValueNode = topLevelPair.field('value')
      const catalogMapping = findMappingNode(catalogValueNode)

      if (!catalogMapping) {
        continue
      }

      const catalogPairs = getMappingPairs(catalogMapping)
      const targetPairs = catalogPairs.filter((pair) => getPairKeyName(pair) === TARGET_KEY)

      if (targetPairs.length === 0) {
        continue
      }

      const remainingPairs = catalogPairs.filter((pair) => getPairKeyName(pair) !== TARGET_KEY)

      for (const _targetPair of targetPairs) {
        migrationMetric.increment({ action: 'key-removed' })
      }

      if (catalogMapping.is('flow_mapping')) {
        if (remainingPairs.length === 0) {
          const topLevelMapping = topLevelPair.parent()
          if (topLevelMapping?.is('flow_mapping')) {
            const remainingTopLevelPairs = getMappingPairs(topLevelMapping).filter(
              (pair) => pair.id() !== topLevelPair.id(),
            )
            edits.push(topLevelMapping.replace(toFlowMappingText(remainingTopLevelPairs)))
          } else {
            edits.push(removeFullLineRange(topLevelPair, source))
          }

          migrationMetric.increment({ action: 'empty-catalog-removed' })
          continue
        }

        edits.push(catalogMapping.replace(toFlowMappingText(remainingPairs)))
        continue
      }

      if (!catalogMapping.is('block_mapping')) {
        continue
      }

      if (remainingPairs.length === 0) {
        const targetRanges = targetPairs.map((pair) => fullLineRange(pair, source))
        const hasCommentsToKeep = hasPreservableCommentLines(source, topLevelPair, targetRanges)

        if (hasCommentsToKeep) {
          for (const targetRange of targetRanges) {
            edits.push({
              ...targetRange,
              insertedText: '',
            })
          }

          edits.push(replaceWithEmptyMapping(topLevelPair, source))
          continue
        }

        edits.push(removeFullLineRange(topLevelPair, source))
        migrationMetric.increment({ action: 'empty-catalog-removed' })
        continue
      }

      for (const targetPair of targetPairs) {
        edits.push(removeFullLineRange(targetPair, source))
      }
    }
  }

  if (edits.length === 0) {
    return null
  }

  const sortedEdits = [...edits].sort((left, right) => {
    if (left.startPos === right.startPos) {
      return right.endPos - left.endPos
    }
    return right.startPos - left.startPos
  })

  const result = await Promise.resolve(rootNode.commitEdits(sortedEdits))
  return result === source ? null : result
}

export default transform
