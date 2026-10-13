import type { Codemod, SgNode } from 'codemod:ast-grep'
import type YAML from 'codemod:ast-grep/langs/yaml'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('remove-ignored-github-repo-create-inputs')

const TARGET_ACTION = 'github:repo:create'
const TODO_COMMENT =
  '# TODO(backstage-codemod): github:repo:create input may include removed keys via YAML merge/anchor/expression; review manually'
const ACTION_TODO_COMMENT = '# TODO(backstage-codemod): action may resolve to github:repo:create; review input manually'

const REMOVED_INPUT_KEYS = new Set([
  'blockCreations',
  'branch',
  'bypassPullRequestAllowances',
  'defaultBranch',
  'dismissStaleReviews',
  'gitAuthorEmail',
  'gitAuthorName',
  'gitCommitMessage',
  'protectDefaultBranch',
  'protectEnforceAdmins',
  'requireBranchesToBeUpToDate',
  'requireCodeOwnerReviews',
  'requiredApprovingReviewCount',
  'requiredCommitSigning',
  'requiredConversationResolution',
  'requiredLinearHistory',
  'requiredStatusCheckContexts',
  'requireLastPushApproval',
  'restrictions',
  'sourcePath',
])

interface TextEdit {
  start: number
  end: number
  replacement: string
}

const YAML_DOUBLE_QUOTED_ESCAPES: Record<string, string> = {
  '0': '\0',
  a: '\x07',
  b: '\b',
  t: '\t',
  n: '\n',
  v: '\v',
  f: '\f',
  r: '\r',
  e: '\x1b',
  ' ': ' ',
  _: '\u00a0',
  N: '\u0085',
  L: '\u2028',
  P: '\u2029',
  '"': '"',
  "'": "'",
  '/': '/',
  '\\': '\\',
}

function parseScalarText(text: string): string | null {
  const trimmed = text.trim()
  if (trimmed === '') {
    return null
  }

  const singleQuoted = trimmed.match(/^'((?:[^']|'')*)'(?:\s+#.*)?$/u)
  if (singleQuoted) {
    return singleQuoted[1]?.replaceAll("''", "'") ?? null
  }

  const doubleQuoted = trimmed.match(/^"((?:[^"\\]|\\.)*)"(?:\s+#.*)?$/u)
  if (doubleQuoted) {
    const value = doubleQuoted[1] ?? ''
    let decoded = ''
    for (let index = 0; index < value.length; index += 1) {
      if (value[index] !== '\\') {
        decoded += value[index]
        continue
      }

      const escape = value[++index]
      if (escape === 'x' || escape === 'u' || escape === 'U') {
        const length = escape === 'x' ? 2 : escape === 'u' ? 4 : 8
        const digits = value.slice(index + 1, index + 1 + length)
        if (digits.length !== length || !/^[0-9a-fA-F]+$/u.test(digits)) {
          return null
        }
        const codePoint = Number.parseInt(digits, 16)
        if (codePoint > 0x10ffff) {
          return null
        }
        decoded += String.fromCodePoint(codePoint)
        index += length
      } else if (escape !== undefined && Object.hasOwn(YAML_DOUBLE_QUOTED_ESCAPES, escape)) {
        decoded += YAML_DOUBLE_QUOTED_ESCAPES[escape]
      } else {
        return null
      }
    }
    return decoded
  }

  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    return null
  }

  const withoutComment = trimmed.split(/\s+#/u)[0]?.trim() ?? ''
  return withoutComment === '' ? null : withoutComment
}

function isMapping(node: SgNode<YAML>): boolean {
  return node.kind() === 'block_mapping' || node.kind() === 'flow_mapping'
}

function isSequence(node: SgNode<YAML>): boolean {
  return node.kind() === 'block_sequence' || node.kind() === 'flow_sequence'
}

function getPairKey(pair: SgNode<YAML>): string | null {
  const keyNode = pair.field('key')
  if (!keyNode) {
    return null
  }

  return parseScalarText(keyNode.text())
}

function getPairValueNode(pair: SgNode<YAML>): SgNode<YAML> | null {
  return pair.field('value')
}

function findDirectNode(
  node: SgNode<YAML> | null,
  isTargetNode: (candidate: SgNode<YAML>) => boolean,
): SgNode<YAML> | null {
  if (!node) {
    return null
  }

  if (isTargetNode(node)) {
    return node
  }

  for (const child of node.children()) {
    if (isTargetNode(child)) {
      return child
    }

    if (child.kind() !== 'block_node' && child.kind() !== 'flow_node') {
      continue
    }

    const nestedTarget = child.children().find((grandchild) => isTargetNode(grandchild))
    if (nestedTarget) {
      return nestedTarget
    }
  }

  return null
}

function findMappingNode(node: SgNode<YAML> | null): SgNode<YAML> | null {
  return findDirectNode(node, isMapping)
}

function findSequenceNode(node: SgNode<YAML> | null): SgNode<YAML> | null {
  return findDirectNode(node, isSequence)
}

function getDirectPairs(mappingNode: SgNode<YAML>): SgNode<YAML>[] {
  if (mappingNode.kind() === 'block_mapping') {
    return mappingNode
      .findAll({ rule: { kind: 'block_mapping_pair' } })
      .filter((pair) => pair.parent()?.id() === mappingNode.id())
  }

  if (mappingNode.kind() === 'flow_mapping') {
    return mappingNode
      .findAll({ rule: { kind: 'flow_pair' } })
      .filter((pair) => pair.parent()?.id() === mappingNode.id())
  }

  return []
}

function findDirectPair(mappingNode: SgNode<YAML>, key: string): SgNode<YAML> | null {
  return getDirectPairs(mappingNode).find((pair) => getPairKey(pair) === key) ?? null
}

function isSafeInputAlias(documentNode: SgNode<YAML>, inputValueNode: SgNode<YAML> | null): boolean {
  const alias = inputValueNode?.find({ rule: { kind: 'alias' } })
  if (!alias || inputValueNode?.text().trim() !== alias.text()) {
    return false
  }

  const name = alias.text().slice(1)
  const anchors = documentNode.findAll({ rule: { kind: 'anchor' } }).filter((anchor) => anchor.text().slice(1) === name)
  if (anchors.length !== 1 || !anchors[0] || anchors[0].range().start.index >= alias.range().start.index) {
    return false
  }

  const mapping = anchors[0].parent()?.children().find(isMapping)
  if (!mapping || mapping.findAll({ rule: { kind: 'alias' } }).length > 0) {
    return false
  }

  return getDirectPairs(mapping).every((pair) => {
    const keyText = pair.field('key')?.text().trim() ?? ''
    // Only simple scalars have an unambiguous spelling here; YAML escapes can hide removed keys.
    if (!/^(?:[A-Za-z_][A-Za-z0-9_-]*|'[A-Za-z_][A-Za-z0-9_-]*'|"[A-Za-z_][A-Za-z0-9_-]*")$/.test(keyText)) {
      return false
    }

    const key = getPairKey(pair)
    return key !== null && !REMOVED_INPUT_KEYS.has(key)
  })
}

function hasDirectFlowComments(mappingNode: SgNode<YAML>): boolean {
  if (mappingNode.kind() !== 'flow_mapping') {
    return false
  }

  return mappingNode.children().some((child) => child.kind() === 'comment')
}

function getDirectStepItems(stepsSequence: SgNode<YAML>): SgNode<YAML>[] {
  if (stepsSequence.kind() === 'block_sequence') {
    return stepsSequence
      .findAll({ rule: { kind: 'block_sequence_item' } })
      .filter((item) => item.parent()?.id() === stepsSequence.id())
  }

  if (stepsSequence.kind() === 'flow_sequence') {
    return stepsSequence
      .findAll({ rule: { kind: 'flow_node' } })
      .filter((item) => item.parent()?.id() === stepsSequence.id())
  }

  return []
}

function getDocumentRootMapping(documentNode: SgNode<YAML>): SgNode<YAML> | null {
  const rootContainer =
    documentNode.children().find((child) => child.kind() === 'block_node' || child.kind() === 'flow_node') ?? null

  return findMappingNode(rootContainer)
}

function collectTemplateDocuments(rootNode: SgNode<YAML>): SgNode<YAML>[] {
  const documents: SgNode<YAML>[] = []

  for (const child of rootNode.children()) {
    if (child.kind() !== 'document') {
      continue
    }

    const mapping = getDocumentRootMapping(child)
    if (!mapping) {
      continue
    }

    const kindPair = findDirectPair(mapping, 'kind')
    if (!kindPair) {
      continue
    }

    const kindValueNode = getPairValueNode(kindPair)
    const kindValue = kindValueNode ? parseScalarText(kindValueNode.text()) : null

    if (kindValue === 'Template') {
      documents.push(child)
    }
  }

  return documents
}

function getLineStarts(source: string): number[] {
  const starts = [0]

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') {
      starts.push(index + 1)
    }
  }

  return starts
}

function getLineStart(lineStarts: number[], line: number, sourceLength: number): number {
  if (line < 0) {
    return 0
  }

  return lineStarts[line] ?? sourceLength
}

function getLineText(lines: string[], line: number): string {
  return lines[line] ?? ''
}

function isBlankOrComment(line: string): boolean {
  const trimmed = line.trim()
  return trimmed === '' || trimmed.startsWith('#')
}

function getIndentLength(line: string): number {
  const match = line.match(/^(\s*)/)
  return match?.[1]?.length ?? 0
}

function findNextContentLine(lines: string[], startLine: number, endLine: number): number {
  for (let line = startLine; line < endLine; line += 1) {
    if (!isBlankOrComment(getLineText(lines, line))) {
      return line
    }
  }

  return endLine
}

function getBlockPairRemovalRange(
  pairNode: SgNode<YAML>,
  mappingNode: SgNode<YAML>,
  lines: string[],
  lineStarts: number[],
  sourceLength: number,
): TextEdit {
  const pairRange = pairNode.range()
  const startLine = pairRange.start.line
  const pairIndent = pairRange.start.column
  const mappingEndLine = Math.min(lines.length, mappingNode.range().end.line + 1)

  let endLine = startLine + 1
  while (endLine < mappingEndLine) {
    const line = getLineText(lines, endLine)

    if (isBlankOrComment(line)) {
      const nextContent = findNextContentLine(lines, endLine + 1, mappingEndLine)
      if (nextContent >= mappingEndLine) {
        endLine += 1
        continue
      }

      if (getIndentLength(getLineText(lines, nextContent)) <= pairIndent) {
        break
      }

      endLine += 1
      continue
    }

    if (getIndentLength(line) <= pairIndent) {
      break
    }

    endLine += 1
  }

  return {
    start: getLineStart(lineStarts, startLine, sourceLength),
    end: getLineStart(lineStarts, endLine, sourceLength),
    replacement: '',
  }
}

function getCommentedFlowPairRemovalRange(
  pair: SgNode<YAML>,
  mappingNode: SgNode<YAML>,
  source: string,
  lineStarts: number[],
): TextEdit | null {
  const range = pair.range()
  const lineStart = getLineStart(lineStarts, range.start.line, source.length)
  const nextLineStart = getLineStart(lineStarts, range.start.line + 1, source.length)
  const pairStart = utf8ByteOffsetToStringIndex(source, range.start.index)
  const pairEnd = utf8ByteOffsetToStringIndex(source, range.end.index)
  const suffix = source.slice(pairEnd, nextLineStart)

  if (
    range.end.line === range.start.line &&
    source.slice(lineStart, pairStart).trim() === '' &&
    /^,?\s*(?:#.*)?\r?\n?$/.test(suffix)
  ) {
    return { start: lineStart, end: nextLineStart, replacement: '' }
  }

  const followingComma = suffix.match(/^[ \t]*,[ \t]*/)
  if (followingComma) {
    return { start: pairStart, end: pairEnd + followingComma[0].length, replacement: '' }
  }

  const mappingEnd = utf8ByteOffsetToStringIndex(source, mappingNode.range().end.index)
  if (/^[ \t]*\}$/u.test(source.slice(pairEnd, mappingEnd))) {
    return { start: pairStart, end: mappingEnd - 1, replacement: '' }
  }

  return null
}

function hasExistingTodo(stepNode: SgNode<YAML>): boolean {
  return stepNode.text().includes(TODO_COMMENT)
}

function utf8ByteOffsetToStringIndex(source: string, offset: number): number {
  let bytes = 0
  let index = 0
  while (bytes < offset && index < source.length) {
    const codePoint = source.codePointAt(index) ?? 0
    bytes += codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4
    index += codePoint > 0xffff ? 2 : 1
  }
  return index
}

function applyTextEdits(source: string, edits: TextEdit[]): string {
  const sortedAscending = [...edits].sort((a, b) => a.start - b.start || a.end - b.end)

  for (let index = 1; index < sortedAscending.length; index += 1) {
    const previous = sortedAscending[index - 1]
    const current = sortedAscending[index]

    if (!previous || !current) {
      continue
    }

    if (current.start < previous.end) {
      return source
    }
  }

  const sortedDescending = [...sortedAscending].sort((a, b) => b.start - a.start || b.end - a.end)
  let result = source

  for (const edit of sortedDescending) {
    result = `${result.slice(0, edit.start)}${edit.replacement}${result.slice(edit.end)}`
  }

  return result
}

const transform: Codemod<YAML> = async (root) => {
  const source = root.source()
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  const lines = source.split('\n')
  const lineStarts = getLineStarts(source)
  const sourceLength = source.length

  const edits: TextEdit[] = []
  const templateDocuments = collectTemplateDocuments(root.root())

  for (const documentNode of templateDocuments) {
    const documentMapping = getDocumentRootMapping(documentNode)
    if (!documentMapping) {
      continue
    }

    const specPair = findDirectPair(documentMapping, 'spec')
    if (!specPair) {
      continue
    }

    const specMapping = findMappingNode(getPairValueNode(specPair))
    if (!specMapping) {
      continue
    }

    const stepsPair = findDirectPair(specMapping, 'steps')
    if (!stepsPair) {
      continue
    }

    const stepsSequence = findSequenceNode(getPairValueNode(stepsPair))
    if (!stepsSequence) {
      continue
    }

    const referencedAnchors = new Set(
      documentNode.findAll({ rule: { kind: 'alias' } }).map((alias) => alias.text().slice(1)),
    )

    for (const stepItem of getDirectStepItems(stepsSequence)) {
      const stepMapping = findMappingNode(stepItem)
      if (!stepMapping) {
        continue
      }

      const actionPair = findDirectPair(stepMapping, 'action')
      const actionValueNode = actionPair ? getPairValueNode(actionPair) : null
      const actionValue = actionValueNode ? parseScalarText(actionValueNode.text()) : null
      if (actionValue !== TARGET_ACTION) {
        const actionIsAmbiguous = actionValueNode && (actionValue === null || actionValue.startsWith('*'))
        if (actionIsAmbiguous) {
          const possibleInput = findDirectPair(stepMapping, 'input')
          const possibleInputMapping = possibleInput ? findMappingNode(getPairValueNode(possibleInput)) : null
          if (
            possibleInput &&
            possibleInputMapping &&
            getDirectPairs(possibleInputMapping).some((pair) => {
              const key = getPairKey(pair)
              return key === null || REMOVED_INPUT_KEYS.has(key) || key === '<<'
            }) &&
            !stepMapping.text().includes(ACTION_TODO_COMMENT)
          ) {
            const inputLine = possibleInput.range().start.line
            edits.push({
              start: getLineStart(lineStarts, inputLine, sourceLength),
              end: getLineStart(lineStarts, inputLine, sourceLength),
              replacement: `${' '.repeat(possibleInput.range().start.column)}${ACTION_TODO_COMMENT}${newline}`,
            })
            migrationMetric.increment({ action: 'todo-added' })
          }
        }
        continue
      }

      const inputPair = findDirectPair(stepMapping, 'input')
      if (!inputPair) {
        continue
      }

      const inputLine = inputPair.range().start.line
      const inputIndent = ' '.repeat(inputPair.range().start.column)
      const inputLineText = getLineText(lines, inputLine)
      const inputValueNode = getPairValueNode(inputPair)
      const inputValueText = inputValueNode?.text().trim() ?? ''
      const inputMapping = findMappingNode(inputValueNode)
      const stepHasTodo =
        hasExistingTodo(stepMapping) || getLineText(lines, stepItem.range().start.line - 1).trim() === TODO_COMMENT

      const inputHasAnchor = /:\s*&[A-Za-z0-9_-]+/.test(inputLineText)
      const inputIsAlias = inputValueText.startsWith('*')
      const safeInputAlias = inputIsAlias && isSafeInputAlias(documentNode, inputValueNode)

      let shouldAddTodo = (inputHasAnchor && !inputMapping) || (inputIsAlias && !safeInputAlias)
      let removedInStep = 0

      if (!inputMapping) {
        if (inputValueText !== '' && inputValueText !== '{}' && inputValueText !== '{ }' && !safeInputAlias) {
          shouldAddTodo = true
        }
      } else {
        const directPairs = getDirectPairs(inputMapping)
        const removablePairs = directPairs.filter((pair) => {
          const key = getPairKey(pair)
          return key !== null && REMOVED_INPUT_KEYS.has(key)
        })

        if (directPairs.some((pair) => getPairKey(pair) === null)) {
          shouldAddTodo = true
        }

        const hasMergePair = directPairs.some((pair) => getPairKey(pair) === '<<')
        const hasReferencedRemovedAnchor = removablePairs.some((pair) =>
          pair.findAll({ rule: { kind: 'anchor' } }).some((anchor) => referencedAnchors.has(anchor.text().slice(1))),
        )

        if (hasMergePair || hasReferencedRemovedAnchor || (inputHasAnchor && removablePairs.length > 0)) {
          shouldAddTodo = true
        }

        if (removablePairs.length > 0 && !inputHasAnchor && !hasMergePair && !hasReferencedRemovedAnchor) {
          if (inputMapping.kind() === 'flow_mapping') {
            if (hasDirectFlowComments(inputMapping)) {
              const commentEdits = removablePairs.map((pair) =>
                getCommentedFlowPairRemovalRange(pair, inputMapping, source, lineStarts),
              )
              if (commentEdits.every((edit): edit is TextEdit => edit !== null)) {
                edits.push(...commentEdits)
                removedInStep += removablePairs.length
              } else {
                shouldAddTodo = true
              }
            } else {
              const remainingPairs = directPairs.filter(
                (pair) => !removablePairs.some((removed) => removed.id() === pair.id()),
              )
              const replacement =
                remainingPairs.length === 0
                  ? '{}'
                  : `{ ${remainingPairs.map((pair) => pair.text().trim()).join(', ')} }`

              const valueRange = inputMapping.range()
              edits.push({
                start: utf8ByteOffsetToStringIndex(source, valueRange.start.index),
                end: utf8ByteOffsetToStringIndex(source, valueRange.end.index),
                replacement,
              })

              removedInStep += removablePairs.length
            }
          } else {
            for (const removablePair of removablePairs) {
              edits.push(getBlockPairRemovalRange(removablePair, inputMapping, lines, lineStarts, sourceLength))
              removedInStep += 1
            }

            const remainingNonRemovedPairs = directPairs.filter(
              (pair) => !removablePairs.some((removed) => removed.id() === pair.id()) && getPairKey(pair) !== '<<',
            )

            if (remainingNonRemovedPairs.length === 0) {
              const inputStart = getLineStart(lineStarts, inputLine, sourceLength)
              const inputEnd = getLineStart(lineStarts, inputLine + 1, sourceLength)
              const keyText = inputPair.field('key')?.text() ?? 'input'
              const keyStart = inputLineText.indexOf(keyText)
              const headerEnd = inputLineText.indexOf(':', keyStart) + 1
              const inputHeader = inputLineText.slice(0, headerEnd)
              const inlineComment = inputLineText.slice(headerEnd).match(/\s+#.*$/)?.[0] ?? ''

              edits.push({
                start: inputStart,
                end: inputEnd,
                replacement: `${inputHeader} {}${inlineComment}${newline}`,
              })
            }
          }
        }
      }

      for (let index = 0; index < removedInStep; index += 1) {
        migrationMetric.increment({ action: 'input-key-removed' })
      }

      if (shouldAddTodo && !stepHasTodo) {
        const insertAt = getLineStart(lineStarts, inputLine, sourceLength)
        edits.push({
          start: insertAt,
          end: insertAt,
          replacement: `${stepMapping.kind() === 'flow_mapping' ? ' '.repeat(getIndentLength(inputLineText)) : inputIndent}${TODO_COMMENT}${newline}`,
        })
        migrationMetric.increment({ action: 'todo-added' })
      }
    }
  }

  if (edits.length === 0) {
    return null
  }

  const sourceEndsWithNewline = source.endsWith('\n')
  let result = applyTextEdits(source, edits)

  if (sourceEndsWithNewline && !result.endsWith('\n')) {
    result = `${result}${newline}`
  }

  if (!sourceEndsWithNewline && result.endsWith('\n')) {
    result = result.slice(0, result.endsWith('\r\n') ? -2 : -1)
  }

  if (result === source) {
    return null
  }

  await Promise.resolve()
  return result
}

export default transform
