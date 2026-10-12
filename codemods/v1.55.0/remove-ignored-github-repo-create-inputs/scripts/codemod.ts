import type { Codemod, SgNode } from 'codemod:ast-grep'
import type YAML from 'codemod:ast-grep/langs/yaml'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('remove-ignored-github-repo-create-inputs')

const TARGET_ACTION = 'github:repo:create'
const TODO_COMMENT =
  '# TODO(backstage-codemod): github:repo:create input may include removed keys via YAML merge/anchor/expression; review manually'

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

function parseScalarText(text: string): string | null {
  const trimmed = text.trim()
  if (trimmed === '') {
    return null
  }

  const singleQuoted = trimmed.match(/^'([^']*)'(?:\s+#.*)?$/)
  if (singleQuoted) {
    return singleQuoted[1] ?? null
  }

  const doubleQuoted = trimmed.match(/^"([^"]*)"(?:\s+#.*)?$/)
  if (doubleQuoted) {
    return doubleQuoted[1] ?? null
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

  return parseScalarText(keyNode.text()) ?? keyNode.text().trim()
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

function hasExistingTodo(stepNode: SgNode<YAML>): boolean {
  return stepNode.text().includes(TODO_COMMENT)
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
  if (!source.includes('Template') || !source.includes('github:repo:create')) {
    return null
  }

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

    for (const stepItem of getDirectStepItems(stepsSequence)) {
      const stepMapping = findMappingNode(stepItem)
      if (!stepMapping) {
        continue
      }

      const actionPair = findDirectPair(stepMapping, 'action')
      const actionValueNode = actionPair ? getPairValueNode(actionPair) : null
      const actionValue = actionValueNode ? parseScalarText(actionValueNode.text()) : null
      if (actionValue !== TARGET_ACTION) {
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
      const stepHasTodo = hasExistingTodo(stepMapping)

      const inputHasAnchor = /:\s*&[A-Za-z0-9_-]+/.test(inputLineText)
      const inputIsAlias = inputValueText.startsWith('*')

      let shouldAddTodo = inputHasAnchor || inputIsAlias
      let removedInStep = 0

      if (!inputMapping) {
        if (inputValueText !== '' && inputValueText !== '{}' && inputValueText !== '{ }') {
          shouldAddTodo = true
        }
      } else {
        const directPairs = getDirectPairs(inputMapping)
        const removablePairs = directPairs.filter((pair) => {
          const key = getPairKey(pair)
          return key !== null && REMOVED_INPUT_KEYS.has(key)
        })

        const hasMergePair = directPairs.some((pair) => getPairKey(pair) === '<<')

        if (hasMergePair) {
          shouldAddTodo = true
        }

        if (removablePairs.length > 0 && !inputHasAnchor && !hasMergePair) {
          if (inputMapping.kind() === 'flow_mapping') {
            if (hasDirectFlowComments(inputMapping)) {
              shouldAddTodo = true
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
                start: valueRange.start.index,
                end: valueRange.end.index,
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
              const inputPrefix = inputPair.text().trimStart().startsWith('- ') ? '- input: {}' : 'input: {}'

              edits.push({
                start: inputStart,
                end: inputEnd,
                replacement: `${inputIndent}${inputPrefix}${newline}`,
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
          replacement: `${inputIndent}${TODO_COMMENT}${newline}`,
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
    result = `${result}\n`
  }

  if (!sourceEndsWithNewline && result.endsWith('\n')) {
    result = result.slice(0, -1)
  }

  if (result === source) {
    return null
  }

  await Promise.resolve()
  return result
}

export default transform
