import type { Codemod } from 'codemod:ast-grep'
import type YAML from 'codemod:ast-grep/langs/yaml'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('remove-immediate-stitching-mode')

const MIGRATION_COMMENT = '# Migrated by @backstage/remove-immediate-stitching-mode — immediate mode deprecated in 1.51'

const IMMEDIATE_MODE_VALUE = /^\s*mode:\s*['"]?immediate['"]?\s*(?:#.*)?$/
const DOTTED_IMMEDIATE_MODE_VALUE = /^\s*catalog\.stitchingStrategy\.mode:\s*['"]?immediate['"]?\s*(?:#.*)?$/

function getLineIndent(line: string): string {
  const match = line.match(/^(\s*)/)
  return match?.[1] ?? ''
}

function isBlankOrComment(line: string): boolean {
  const trimmed = line.trim()
  return trimmed === '' || trimmed.startsWith('#')
}

function isKeyLine(line: string, key: string, expectedIndent: string): boolean {
  if (isBlankOrComment(line)) {
    return false
  }

  const indent = getLineIndent(line)
  if (indent !== expectedIndent) {
    return false
  }

  const keyMatch = line.trim().match(/^([A-Za-z0-9_.-]+):/)
  return keyMatch?.[1] === key
}

function findNextContentLine(lines: string[], startLine: number): number {
  for (let lineIndex = startLine; lineIndex < lines.length; lineIndex += 1) {
    if (!isBlankOrComment(lines[lineIndex] ?? '')) {
      return lineIndex
    }
  }

  return lines.length
}

function findBlockEnd(lines: string[], keyLine: number): number {
  const keyIndent = getLineIndent(lines[keyLine] ?? '')
  let endLine = keyLine + 1

  while (endLine < lines.length) {
    const line = lines[endLine] ?? ''
    if (isBlankOrComment(line)) {
      const nextContentLine = findNextContentLine(lines, endLine + 1)
      if (nextContentLine >= lines.length) {
        endLine += 1
        continue
      }

      const nextIndent = getLineIndent(lines[nextContentLine] ?? '')
      if (nextIndent.length <= keyIndent.length) {
        break
      }

      endLine += 1
      continue
    }

    const indent = getLineIndent(line)
    if (indent.length <= keyIndent.length) {
      break
    }

    endLine += 1
  }

  return endLine
}

function lineOffset(lines: string[], lineIndex: number): number {
  let offset = 0
  for (let index = 0; index < lineIndex; index += 1) {
    offset += (lines[index] ?? '').length + 1
  }
  return offset
}

function replaceImmediateModeLine(line: string): string {
  return line.replace(/^(\s*mode:\s*)['"]?immediate['"]?(\s*(?:#.*)?)$/, '$1deferred$2')
}

function replaceDottedImmediateModeLine(line: string): string {
  return line.replace(/^(\s*catalog\.stitchingStrategy\.mode:\s*)['"]?immediate['"]?(\s*(?:#.*)?)$/, '$1deferred$2')
}

function isOtherDottedStitchingKey(line: string): boolean {
  const keyMatch = line.trim().match(/^catalog\.stitchingStrategy\.([A-Za-z0-9_.-]+):/)
  return keyMatch !== null && keyMatch[1] !== 'mode'
}

function hasMigrationComment(lines: string[]): boolean {
  return lines.some((line) => line.includes('@backstage/remove-immediate-stitching-mode'))
}

interface StitchingStrategyMatch {
  startLine: number
  endLine: number
  commentIndent: string
  modeLine: number
  hasOtherKeys: boolean
  form: 'nested' | 'dotted'
}

function findNestedStitchingStrategyBlock(lines: string[]): StitchingStrategyMatch | null {
  const catalogLine = lines.findIndex((line) => isKeyLine(line, 'catalog', ''))
  if (catalogLine === -1) {
    return null
  }

  const catalogChildIndent = `${getLineIndent(lines[catalogLine] ?? '')}  `
  const catalogEnd = findBlockEnd(lines, catalogLine)

  for (let lineIndex = catalogLine + 1; lineIndex < catalogEnd; lineIndex += 1) {
    const line = lines[lineIndex] ?? ''
    if (!isKeyLine(line, 'stitchingStrategy', catalogChildIndent)) {
      continue
    }

    const blockIndent = `${catalogChildIndent}  `
    const endLine = findBlockEnd(lines, lineIndex)
    let modeLine: number | null = null
    let hasOtherKeys = false

    for (let childLine = lineIndex + 1; childLine < endLine; childLine += 1) {
      const child = lines[childLine] ?? ''
      if (isBlankOrComment(child)) {
        continue
      }

      const childIndent = getLineIndent(child)
      if (childIndent !== blockIndent) {
        continue
      }

      if (IMMEDIATE_MODE_VALUE.test(child)) {
        modeLine = childLine
        continue
      }

      if (/^\s*[A-Za-z0-9_.-]+:/.test(child)) {
        hasOtherKeys = true
      }
    }

    if (modeLine === null) {
      return null
    }

    return {
      startLine: lineIndex,
      endLine,
      commentIndent: catalogChildIndent,
      modeLine,
      hasOtherKeys,
      form: 'nested',
    }
  }

  return null
}

function findDottedStitchingStrategy(lines: string[]): StitchingStrategyMatch | null {
  let modeLine: number | null = null
  let hasOtherKeys = false

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? ''
    if (isBlankOrComment(line)) {
      continue
    }

    if (DOTTED_IMMEDIATE_MODE_VALUE.test(line)) {
      modeLine = lineIndex
      continue
    }

    if (isOtherDottedStitchingKey(line)) {
      hasOtherKeys = true
    }
  }

  if (modeLine === null) {
    return null
  }

  return {
    startLine: modeLine,
    endLine: modeLine + 1,
    commentIndent: getLineIndent(lines[modeLine] ?? ''),
    modeLine,
    hasOtherKeys,
    form: 'dotted',
  }
}

function findStitchingStrategyMatch(lines: string[]): StitchingStrategyMatch | null {
  return findNestedStitchingStrategyBlock(lines) ?? findDottedStitchingStrategy(lines)
}

function normalizeSource(source: string): string {
  return source.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}

const transform: Codemod<YAML> = async (root) => {
  const rootNode = root.root()
  const source = normalizeSource(rootNode.text())
  const lines = source.split('\n')
  const match = findStitchingStrategyMatch(lines)

  if (!match) {
    return null
  }

  const startPos = lineOffset(lines, match.startLine)
  const endPos = lineOffset(lines, match.endLine)
  const commentLine = `${match.commentIndent}${MIGRATION_COMMENT}\n`
  const includeComment = !hasMigrationComment(lines)

  let insertedText: string
  let action: string

  if (match.hasOtherKeys) {
    const updatedLines = [...lines]
    const replaceModeLine = match.form === 'dotted' ? replaceDottedImmediateModeLine : replaceImmediateModeLine
    updatedLines[match.modeLine] = replaceModeLine(lines[match.modeLine] ?? '')
    const blockText = `${updatedLines.slice(match.startLine, match.endLine).join('\n')}\n`
    insertedText = includeComment ? `${blockText}${commentLine}` : blockText
    action = 'mode-changed'
  } else {
    insertedText = includeComment ? commentLine : ''
    action = 'block-removed'
  }

  if (insertedText === '' && startPos === endPos) {
    return null
  }

  migrationMetric.increment({ action })

  const result = source.slice(0, startPos) + insertedText + source.slice(endPos)
  if (result === source) {
    return null
  }

  await Promise.resolve()
  return result
}

export default transform
