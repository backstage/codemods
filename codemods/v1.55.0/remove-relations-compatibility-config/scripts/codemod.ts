import type { Codemod } from 'codemod:ast-grep'
import type YAML from 'codemod:ast-grep/langs/yaml'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('remove-relations-compatibility-config')

const CATALOG_KEY = 'catalog'
const TARGET_KEY = 'enableRelationsCompatibility'

function normalizeSource(source: string): string {
  return source.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}

function getLineIndent(line: string): string {
  const match = line.match(/^(\s*)/)
  return match?.[1] ?? ''
}

function getIndentLength(line: string): number {
  return getLineIndent(line).length
}

function isCommentLine(line: string): boolean {
  return line.trim().startsWith('#')
}

function isBlankOrComment(line: string): boolean {
  const trimmed = line.trim()
  return trimmed === '' || trimmed.startsWith('#')
}

function parseKeyName(line: string): string | null {
  const keyMatch = line.match(/^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z0-9_.-]+))\s*:/)
  if (!keyMatch) {
    return null
  }

  return keyMatch[1] ?? keyMatch[2] ?? keyMatch[3] ?? null
}

function isKeyLine(line: string, key: string, expectedIndent: string): boolean {
  if (isBlankOrComment(line)) {
    return false
  }

  if (getLineIndent(line) !== expectedIndent) {
    return false
  }

  return parseKeyName(line) === key
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
  const keyIndentLength = getIndentLength(lines[keyLine] ?? '')
  let endLine = keyLine + 1

  while (endLine < lines.length) {
    const line = lines[endLine] ?? ''

    if (line.trim() === '') {
      const nextContentLine = findNextContentLine(lines, endLine + 1)
      if (nextContentLine >= lines.length) {
        endLine += 1
        continue
      }

      const nextIndentLength = getIndentLength(lines[nextContentLine] ?? '')
      if (nextIndentLength <= keyIndentLength) {
        break
      }

      endLine += 1
      continue
    }

    if (isCommentLine(line)) {
      if (getIndentLength(line) <= keyIndentLength) {
        break
      }

      endLine += 1
      continue
    }

    if (getIndentLength(line) <= keyIndentLength) {
      break
    }

    endLine += 1
  }

  return endLine
}

function hasCatalogChildren(lines: string[], catalogLine: number): boolean {
  const catalogIndentLength = getIndentLength(lines[catalogLine] ?? '')
  const catalogEnd = findBlockEnd(lines, catalogLine)

  for (let lineIndex = catalogLine + 1; lineIndex < catalogEnd; lineIndex += 1) {
    const line = lines[lineIndex] ?? ''
    if (isBlankOrComment(line)) {
      continue
    }

    if (getIndentLength(line) > catalogIndentLength) {
      return true
    }
  }

  return false
}

const transform: Codemod<YAML> = async (root) => {
  const source = normalizeSource(root.root().text())
  const lines = source.split('\n')
  let changed = false

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (!isKeyLine(lines[lineIndex] ?? '', CATALOG_KEY, '')) {
      continue
    }

    const catalogLine = lineIndex
    const catalogChildIndent = `${getLineIndent(lines[catalogLine] ?? '')}  `
    const catalogEnd = findBlockEnd(lines, catalogLine)
    const targetLines: number[] = []

    for (let childLine = catalogLine + 1; childLine < catalogEnd; childLine += 1) {
      if (isKeyLine(lines[childLine] ?? '', TARGET_KEY, catalogChildIndent)) {
        targetLines.push(childLine)
      }
    }

    if (targetLines.length === 0) {
      lineIndex = catalogEnd - 1
      continue
    }

    changed = true

    for (let i = targetLines.length - 1; i >= 0; i -= 1) {
      const targetLine = targetLines[i]
      if (targetLine === undefined) {
        continue
      }

      const targetEnd = findBlockEnd(lines, targetLine)
      lines.splice(targetLine, targetEnd - targetLine)
      migrationMetric.increment({ action: 'key-removed' })
    }

    if (!hasCatalogChildren(lines, catalogLine)) {
      const emptyCatalogEnd = findBlockEnd(lines, catalogLine)
      lines.splice(catalogLine, emptyCatalogEnd - catalogLine)
      migrationMetric.increment({ action: 'empty-catalog-removed' })
      lineIndex = catalogLine - 1
      continue
    }

    lineIndex = findBlockEnd(lines, catalogLine) - 1
  }

  if (!changed) {
    return null
  }

  const result = lines.join('\n')
  if (result === source) {
    return null
  }

  await Promise.resolve()
  return result
}

export default transform
