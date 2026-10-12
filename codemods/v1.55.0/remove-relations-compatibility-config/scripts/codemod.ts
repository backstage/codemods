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

function isHorizontalWhitespace(char: string): boolean {
  return char === ' ' || char === '\t'
}

function isWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r'
}

function trimFlowPairStart(source: string, start: number, boundary: number): number {
  let cursor = start
  while (cursor > boundary && isHorizontalWhitespace(source.charAt(cursor - 1))) {
    cursor -= 1
  }

  if (cursor === start || cursor <= boundary) {
    return start
  }

  const previousChar = source.charAt(cursor - 1)
  if (previousChar === ',' || previousChar === '\n' || previousChar === '\r') {
    return cursor
  }

  return start
}

function trimFlowPairEnd(source: string, end: number, boundary: number): number {
  let cursor = end
  while (cursor < boundary && isHorizontalWhitespace(source.charAt(cursor))) {
    cursor += 1
  }

  if (cursor < boundary && source.charAt(cursor) === '\r') {
    if (cursor + 1 < boundary && source.charAt(cursor + 1) === '\n') {
      return cursor + 2
    }

    return cursor + 1
  }

  if (cursor < boundary && source.charAt(cursor) === '\n') {
    return cursor + 1
  }

  return cursor
}

function findNextFlowCommaIndex(source: string, start: number, boundary: number): number | null {
  let cursor = start

  while (cursor < boundary) {
    const char = source.charAt(cursor)

    if (isWhitespace(char)) {
      cursor += 1
      continue
    }

    if (char === '#') {
      cursor = lineEndWithNewline(source, cursor)
      continue
    }

    return char === ',' ? cursor : null
  }

  return null
}

function findPreviousFlowCommaIndex(source: string, start: number, boundary: number): number | null {
  let cursor = start

  while (cursor >= boundary) {
    const char = source.charAt(cursor)

    if (isWhitespace(char)) {
      cursor -= 1
      continue
    }

    const currentLineStart = lineStart(source, cursor)
    const commentStart = source.lastIndexOf('#', cursor)

    if (commentStart >= currentLineStart) {
      cursor = commentStart - 1
      continue
    }

    return char === ',' ? cursor : null
  }

  return null
}

function mergeDeleteEdits(edits: Edit[]): Edit[] {
  if (edits.length <= 1) {
    return edits
  }

  const sortedEdits = [...edits].sort((left, right) => {
    if (left.startPos === right.startPos) {
      return left.endPos - right.endPos
    }

    return left.startPos - right.startPos
  })

  const firstEdit = sortedEdits.at(0)
  if (!firstEdit) {
    return []
  }

  const mergedEdits: Edit[] = [{ ...firstEdit }]

  for (const currentEdit of sortedEdits.slice(1)) {
    const lastEdit = mergedEdits.at(-1)
    if (!lastEdit) {
      continue
    }

    if (currentEdit.startPos <= lastEdit.endPos) {
      lastEdit.endPos = Math.max(lastEdit.endPos, currentEdit.endPos)
      continue
    }

    mergedEdits.push({ ...currentEdit })
  }

  return mergedEdits
}

function removeFlowPairs(flowMapping: SgNode<YAML>, pairsToRemove: SgNode<YAML>[], source: string): Edit[] {
  const mappingRange = flowMapping.range()
  const mappingStart = mappingRange.start.index
  const mappingEnd = mappingRange.end.index

  const deletedCommaIndexes = new Set<number>()
  const flowEdits: Edit[] = []

  const sortedPairs = [...pairsToRemove].sort((left, right) => left.range().start.index - right.range().start.index)

  for (const pair of sortedPairs) {
    const pairRange = pair.range()
    const pairStartPos = trimFlowPairStart(source, pairRange.start.index, mappingStart)
    const pairEndPos = trimFlowPairEnd(source, pairRange.end.index, mappingEnd)

    flowEdits.push({
      startPos: pairStartPos,
      endPos: pairEndPos,
      insertedText: '',
    })

    const commaAfter = findNextFlowCommaIndex(source, pairRange.end.index, mappingEnd)
    if (commaAfter !== null && !deletedCommaIndexes.has(commaAfter)) {
      let commaEndPos = commaAfter + 1
      while (commaEndPos < mappingEnd && isHorizontalWhitespace(source.charAt(commaEndPos))) {
        commaEndPos += 1
      }

      if (commaEndPos < mappingEnd && source.charAt(commaEndPos) === '\r') {
        if (commaEndPos + 1 < mappingEnd && source.charAt(commaEndPos + 1) === '\n') {
          commaEndPos += 2
        } else {
          commaEndPos += 1
        }
      } else if (commaEndPos < mappingEnd && source.charAt(commaEndPos) === '\n') {
        commaEndPos += 1
      }

      flowEdits.push({
        startPos: commaAfter,
        endPos: commaEndPos,
        insertedText: '',
      })
      deletedCommaIndexes.add(commaAfter)
      continue
    }

    const commaBefore = findPreviousFlowCommaIndex(source, pairRange.start.index - 1, mappingStart)
    if (commaBefore !== null && !deletedCommaIndexes.has(commaBefore)) {
      let commaStartPos = commaBefore
      if (commaStartPos > mappingStart && source.charAt(commaStartPos - 1) === ' ') {
        commaStartPos -= 1
      }

      flowEdits.push({
        startPos: commaStartPos,
        endPos: commaBefore + 1,
        insertedText: '',
      })
      deletedCommaIndexes.add(commaBefore)
    }
  }

  return mergeDeleteEdits(flowEdits)
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
            edits.push(...removeFlowPairs(topLevelMapping, [topLevelPair], source))
          } else {
            edits.push(removeFullLineRange(topLevelPair, source))
          }

          migrationMetric.increment({ action: 'empty-catalog-removed' })
          continue
        }

        edits.push(...removeFlowPairs(catalogMapping, targetPairs, source))
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
