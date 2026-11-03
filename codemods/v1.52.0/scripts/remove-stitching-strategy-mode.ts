import type { Codemod } from 'codemod:ast-grep'
import type YAML from 'codemod:ast-grep/langs/yaml'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('remove-stitching-strategy-mode')

/**
 * Matches any `mode:` key line regardless of value (immediate, deferred,
 * empty, quoted, or trailing comment).
 */
const MODE_LINE = /^\s*mode:\s*.*$/

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

interface StitchingMatch {
  /** First line of the `stitchingStrategy:` block */
  blockStartLine: number
  /** Line after the last line of the `stitchingStrategy:` block */
  blockEndLine: number
  /** Line number of the `mode:` key */
  modeLine: number
  /** Whether stitchingStrategy has other keys besides `mode` */
  hasOtherKeys: boolean
}

function findAllStitchingStrategyBlocks(lines: string[]): StitchingMatch[] {
  const matches: StitchingMatch[] = []

  for (let catalogLine = 0; catalogLine < lines.length; catalogLine += 1) {
    if (!isKeyLine(lines[catalogLine] ?? '', 'catalog', '')) {
      continue
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

        if (MODE_LINE.test(child)) {
          modeLine = childLine
          continue
        }

        if (/^\s*[A-Za-z0-9_.-]+:/.test(child)) {
          hasOtherKeys = true
        }
      }

      if (modeLine !== null) {
        matches.push({
          blockStartLine: lineIndex,
          blockEndLine: endLine,
          modeLine,
          hasOtherKeys,
        })
      }
    }

    // Skip past this catalog block
    catalogLine = catalogEnd - 1
  }

  return matches
}

function normalizeSource(source: string): string {
  return source.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}

// Uses text/line manipulation (same pattern as v1.51 remove-immediate-stitching-mode)
// because ast-grep's YAML node removal via replace('') leaves orphaned whitespace.
// The AST is used for typing and the codemod harness; the transform itself operates
// on the normalised source text.
const transform: Codemod<YAML> = async (root) => {
  const rootNode = root.root()
  const source = normalizeSource(rootNode.text())
  const lines = source.split('\n')
  const matches = findAllStitchingStrategyBlocks(lines)

  if (matches.length === 0) {
    return null
  }

  // Process matches in reverse order so line offsets stay valid
  const updatedLines = [...lines]
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const match = matches[i]
    if (!match) {
      continue
    }

    if (match.hasOtherKeys) {
      // Remove only the mode line, keep other keys (pollingInterval, stitchTimeout)
      updatedLines.splice(match.modeLine, 1)
      migrationMetric.increment({ action: 'mode-removed' })
    } else {
      // stitchingStrategy only had mode — remove the entire block
      updatedLines.splice(match.blockStartLine, match.blockEndLine - match.blockStartLine)

      // Check if the parent catalog: key now has no children.
      // If so, append ` {}` to avoid bare `catalog:` (YAML null).
      // Walk backward from the removed block to find the correct parent catalog: key
      // (handles multi-document YAML and multiple catalog: blocks).
      let catalogLine = -1
      for (let cl = match.blockStartLine - 1; cl >= 0; cl -= 1) {
        if (isKeyLine(updatedLines[cl] ?? '', 'catalog', '')) {
          catalogLine = cl
          break
        }
      }
      if (catalogLine !== -1) {
        const nextContent = findNextContentLine(updatedLines, catalogLine + 1)
        const catalogIndent = getLineIndent(updatedLines[catalogLine] ?? '')
        const nextIndent = nextContent < updatedLines.length ? getLineIndent(updatedLines[nextContent] ?? '') : ''
        if (nextContent >= updatedLines.length || nextIndent.length <= catalogIndent.length) {
          // catalog has no remaining children — make it an empty mapping
          updatedLines[catalogLine] = `${updatedLines[catalogLine]} {}`
        }
      }

      migrationMetric.increment({ action: 'block-removed' })
    }
  }

  const result = updatedLines.join('\n')

  if (result === source) {
    return null
  }

  await Promise.resolve()
  return result
}

export default transform
