import type { Codemod } from 'codemod:ast-grep'
import type YAML from 'codemod:ast-grep/langs/yaml'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-valkey-config')

const MIGRATION_COMMENT = '# Migrated by @backstage/migrate-valkey-config — Valkey native options in 1.46'
const DEFAULT_SEPARATOR = ':'

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

function extractScalarValue(line: string): string | null {
  const colonIndex = line.indexOf(':')
  if (colonIndex === -1) {
    return null
  }

  const raw = line.slice(colonIndex + 1).trim()

  // Strip inline comments before checking for quotes.
  // An inline comment starts with ` #` (space then hash) outside of quotes.
  let value = raw
  const commentMatch = value.match(/^([^'"#]*(?:['"][^'"]*['"][^'"#]*)*)(\s+#.*)$/)
  if (commentMatch?.[1] !== undefined) {
    value = commentMatch[1].trim()
  }

  // Handle quoted strings
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    return value.slice(1, -1)
  }

  return value
}

function hasMigrationComment(lines: string[]): boolean {
  return lines.some((line) => line.includes('@backstage/migrate-valkey-config'))
}

interface ClientBlockInfo {
  clientLine: number
  clientEnd: number
  clientIndent: string
  childIndent: string
  namespaceLine: number | null
  namespaceValue: string | null
  separatorLine: number | null
  separatorValue: string | null
  clearBatchSizeLine: number | null
  useUnlinkLine: number | null
  keyPrefixLine: number | null
  keyPrefixValue: string | null
  otherKeyLines: number[]
}

function normalizeSource(source: string): string {
  return source.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}

function findValkeyClientBlock(lines: string[]): ClientBlockInfo | null {
  // Find backend key at root level
  const backendLine = lines.findIndex((line) => isKeyLine(line, 'backend', ''))
  if (backendLine === -1) {
    return null
  }

  const backendChildIndent = `${getLineIndent(lines[backendLine] ?? '')}  `
  const backendEnd = findBlockEnd(lines, backendLine)

  // Find cache key under backend
  let cacheLine = -1
  for (let lineIndex = backendLine + 1; lineIndex < backendEnd; lineIndex += 1) {
    if (isKeyLine(lines[lineIndex] ?? '', 'cache', backendChildIndent)) {
      cacheLine = lineIndex
      break
    }
  }

  if (cacheLine === -1) {
    return null
  }

  const cacheChildIndent = `${backendChildIndent}  `
  const cacheEnd = findBlockEnd(lines, cacheLine)

  // Check store: valkey
  let isValkey = false
  for (let lineIndex = cacheLine + 1; lineIndex < cacheEnd; lineIndex += 1) {
    const line = lines[lineIndex] ?? ''
    if (isKeyLine(line, 'store', cacheChildIndent)) {
      const value = extractScalarValue(line)
      if (value === 'valkey') {
        isValkey = true
      }
      break
    }
  }

  if (!isValkey) {
    return null
  }

  // Find client key under cache
  let clientLine = -1
  for (let lineIndex = cacheLine + 1; lineIndex < cacheEnd; lineIndex += 1) {
    if (isKeyLine(lines[lineIndex] ?? '', 'client', cacheChildIndent)) {
      clientLine = lineIndex
      break
    }
  }

  if (clientLine === -1) {
    return null
  }

  const clientIndent = cacheChildIndent
  const childIndent = `${clientIndent}  `
  const clientEnd = findBlockEnd(lines, clientLine)

  // Parse client children
  let namespaceLine: number | null = null
  let namespaceValue: string | null = null
  let separatorLine: number | null = null
  let separatorValue: string | null = null
  let clearBatchSizeLine: number | null = null
  let useUnlinkLine: number | null = null
  let keyPrefixLine: number | null = null
  let keyPrefixValue: string | null = null
  const otherKeyLines: number[] = []

  for (let lineIndex = clientLine + 1; lineIndex < clientEnd; lineIndex += 1) {
    const line = lines[lineIndex] ?? ''
    if (isBlankOrComment(line)) {
      continue
    }

    const indent = getLineIndent(line)
    if (indent !== childIndent) {
      continue
    }

    if (isKeyLine(line, 'namespace', childIndent)) {
      namespaceLine = lineIndex
      namespaceValue = extractScalarValue(line)
    } else if (isKeyLine(line, 'keyPrefixSeparator', childIndent)) {
      separatorLine = lineIndex
      separatorValue = extractScalarValue(line)
    } else if (isKeyLine(line, 'clearBatchSize', childIndent)) {
      clearBatchSizeLine = lineIndex
    } else if (isKeyLine(line, 'useUnlink', childIndent)) {
      useUnlinkLine = lineIndex
    } else if (isKeyLine(line, 'keyPrefix', childIndent)) {
      keyPrefixLine = lineIndex
      keyPrefixValue = extractScalarValue(line)
    } else {
      otherKeyLines.push(lineIndex)
    }
  }

  return {
    clientLine,
    clientEnd,
    clientIndent,
    childIndent,
    namespaceLine,
    namespaceValue,
    separatorLine,
    separatorValue,
    clearBatchSizeLine,
    useUnlinkLine,
    keyPrefixLine,
    keyPrefixValue,
    otherKeyLines,
  }
}

const transform: Codemod<YAML> = async (root) => {
  const rootNode = root.root()
  const source = normalizeSource(rootNode.text())
  const lines = source.split('\n')

  const block = findValkeyClientBlock(lines)
  if (!block) {
    return null
  }

  // Determine what needs to change
  const hasNamespace = block.namespaceLine !== null
  const hasSeparator = block.separatorLine !== null
  const hasClearBatchSize = block.clearBatchSizeLine !== null
  const hasUseUnlink = block.useUnlinkLine !== null
  const hasKeyPrefix = block.keyPrefixLine !== null

  // Nothing to migrate if none of the target keys exist
  if (!hasNamespace && !hasSeparator && !hasClearBatchSize && !hasUseUnlink) {
    return null
  }

  const linesToRemove = new Set<number>()
  const linesToAdd: { afterLine: number; content: string }[] = []

  // Handle namespace + keyPrefixSeparator → keyPrefix
  if (hasNamespace && !hasKeyPrefix) {
    const separator = block.separatorValue ?? DEFAULT_SEPARATOR
    const keyPrefixVal = `${block.namespaceValue ?? ''}${separator}`
    linesToAdd.push({
      afterLine: block.namespaceLine as number,
      content: `${block.childIndent}keyPrefix: '${keyPrefixVal}'`,
    })
    linesToRemove.add(block.namespaceLine as number)
    if (hasSeparator) {
      linesToRemove.add(block.separatorLine as number)
    }
    migrationMetric.increment({ action: 'namespace-to-keyprefix' })
  } else if (hasNamespace && hasKeyPrefix) {
    // keyPrefix already exists, just remove namespace + separator
    linesToRemove.add(block.namespaceLine as number)
    if (hasSeparator) {
      linesToRemove.add(block.separatorLine as number)
    }
    migrationMetric.increment({ action: 'namespace-removed-keyprefix-kept' })
  } else if (hasSeparator && !hasNamespace) {
    // Separator without namespace — just remove it
    linesToRemove.add(block.separatorLine as number)
    migrationMetric.increment({ action: 'separator-removed' })
  }

  // Remove clearBatchSize
  if (hasClearBatchSize) {
    linesToRemove.add(block.clearBatchSizeLine as number)
    migrationMetric.increment({ action: 'clear-batch-size-removed' })
  }

  // Remove useUnlink
  if (hasUseUnlink) {
    linesToRemove.add(block.useUnlinkLine as number)
    migrationMetric.increment({ action: 'use-unlink-removed' })
  }

  if (linesToRemove.size === 0 && linesToAdd.length === 0) {
    return null
  }

  // Check if removing lines leaves client block empty
  const remainingClientKeys = block.otherKeyLines.filter((l) => !linesToRemove.has(l))
  const hasKeyPrefixResult = hasKeyPrefix || linesToAdd.length > 0
  const clientWillBeEmpty = remainingClientKeys.length === 0 && !hasKeyPrefixResult

  // Build the result
  const resultLines: string[] = []
  const includeComment = !hasMigrationComment(lines)
  const commentLine = `${block.clientIndent}${MIGRATION_COMMENT}`

  // Determine where to insert the comment: right after the client block's last output line
  // We track whether we're inside the client block and insert the comment when we leave
  let insideClientBlock = false
  let commentInserted = false

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (clientWillBeEmpty && lineIndex === block.clientLine) {
      // Skip the entire client block, insert comment here instead
      if (includeComment && !commentInserted) {
        resultLines.push(commentLine)
        commentInserted = true
      }
      lineIndex = block.clientEnd - 1
      continue
    }

    // Track entering the client block
    if (lineIndex === block.clientLine) {
      insideClientBlock = true
    }

    // Detect leaving the client block — insert comment before the first line outside
    if (insideClientBlock && lineIndex >= block.clientEnd) {
      insideClientBlock = false
      if (includeComment && !commentInserted) {
        resultLines.push(commentLine)
        commentInserted = true
      }
    }

    if (linesToRemove.has(lineIndex)) {
      // Check for additions after this line
      for (const addition of linesToAdd) {
        if (addition.afterLine === lineIndex) {
          resultLines.push(addition.content)
        }
      }
      continue
    }

    resultLines.push(lines[lineIndex] ?? '')

    // Check for additions after this line
    for (const addition of linesToAdd) {
      if (addition.afterLine === lineIndex) {
        resultLines.push(addition.content)
      }
    }
  }

  // If the client block extends to the end of the file and we haven't inserted the comment
  if (includeComment && !commentInserted) {
    // Find the last non-empty line in resultLines and insert comment after it
    let insertPos = resultLines.length
    while (insertPos > 0 && (resultLines[insertPos - 1] ?? '').trim() === '') {
      insertPos -= 1
    }
    resultLines.splice(insertPos, 0, commentLine)
  }

  const result = resultLines.join('\n')
  if (result === source) {
    return null
  }

  await Promise.resolve()
  return result
}

export default transform
