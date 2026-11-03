import type { Codemod } from 'codemod:ast-grep'
import type YAML from 'codemod:ast-grep/langs/yaml'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-app-experimental-packages')

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

function findBlockEnd(lines: string[], keyLine: number): number {
  const keyIndent = getLineIndent(lines[keyLine] ?? '')
  let endLine = keyLine + 1

  while (endLine < lines.length) {
    const line = lines[endLine] ?? ''
    if (isBlankOrComment(line)) {
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

function normalizeSource(source: string): string {
  return source.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}

interface ExperimentalPackagesMatch {
  appLine: number
  experimentalLine: number
  experimentalEnd: number
  packagesLine: number
  packagesEnd: number
  packagesValue: string
  hasOtherExperimentalKeys: boolean
}

function findExperimentalPackages(lines: string[]): ExperimentalPackagesMatch | null {
  const appLine = lines.findIndex((line) => isKeyLine(line, 'app', ''))
  if (appLine === -1) {
    return null
  }

  const appChildIndent = `${getLineIndent(lines[appLine] ?? '')}  `
  const appEnd = findBlockEnd(lines, appLine)

  let experimentalLine = -1
  for (let lineIndex = appLine + 1; lineIndex < appEnd; lineIndex += 1) {
    if (isKeyLine(lines[lineIndex] ?? '', 'experimental', appChildIndent)) {
      experimentalLine = lineIndex
      break
    }
  }

  if (experimentalLine === -1) {
    return null
  }

  const experimentalEnd = findBlockEnd(lines, experimentalLine)
  const experimentalChildIndent = `${appChildIndent}  `

  let packagesLine = -1
  let hasOtherExperimentalKeys = false

  for (let lineIndex = experimentalLine + 1; lineIndex < experimentalEnd; lineIndex += 1) {
    const line = lines[lineIndex] ?? ''
    if (isBlankOrComment(line)) {
      continue
    }
    if (isKeyLine(line, 'packages', experimentalChildIndent)) {
      packagesLine = lineIndex
    } else if (getLineIndent(line) === experimentalChildIndent && /^\s*[A-Za-z0-9_.-]+:/.test(line)) {
      hasOtherExperimentalKeys = true
    }
  }

  if (packagesLine === -1) {
    return null
  }

  const packagesEnd = findBlockEnd(lines, packagesLine)

  // Extract the packages value (could be inline or block)
  const packagesLineText = lines[packagesLine] ?? ''
  const valueMatch = packagesLineText.match(/^\s*packages:\s*(.*)$/)
  let packagesValue = valueMatch?.[1]?.trim() ?? ''

  // If value is block (multiline), collect all child lines
  if (!packagesValue) {
    const blockLines: string[] = []
    for (let lineIndex = packagesLine + 1; lineIndex < packagesEnd; lineIndex += 1) {
      blockLines.push(lines[lineIndex] ?? '')
    }
    packagesValue = blockLines.join('\n')
  }

  return {
    appLine,
    experimentalLine,
    experimentalEnd,
    packagesLine,
    packagesEnd,
    packagesValue,
    hasOtherExperimentalKeys,
  }
}

function hasExistingAppPackages(lines: string[]): boolean {
  const appLine = lines.findIndex((line) => isKeyLine(line, 'app', ''))
  if (appLine === -1) {
    return false
  }

  const appChildIndent = `${getLineIndent(lines[appLine] ?? '')}  `
  const appEnd = findBlockEnd(lines, appLine)

  for (let lineIndex = appLine + 1; lineIndex < appEnd; lineIndex += 1) {
    if (isKeyLine(lines[lineIndex] ?? '', 'packages', appChildIndent)) {
      return true
    }
  }
  return false
}

const transform: Codemod<YAML> = async (root) => {
  const rootNode = root.root()
  const source = normalizeSource(rootNode.text())
  const lines = source.split('\n')
  const match = findExperimentalPackages(lines)

  if (!match) {
    return null
  }

  // If app.packages already exists, add TODO and only remove packages from experimental
  if (hasExistingAppPackages(lines)) {
    let result: string
    if (match.hasOtherExperimentalKeys) {
      // Remove only the packages key, keep experimental with its other keys
      const packagesStart = lineOffset(lines, match.packagesLine)
      const packagesEndOffset = lineOffset(lines, match.packagesEnd)
      const indent = getLineIndent(lines[match.packagesLine] ?? '')
      const todoComment = `${indent}# TODO(backstage-codemod): app.packages already exists — manually merge app.experimental.packages value`
      result = `${source.slice(0, packagesStart)}${todoComment}\n${source.slice(packagesEndOffset)}`
    } else {
      // No other keys under experimental — remove the entire experimental block
      const experimentalStart = lineOffset(lines, match.experimentalLine)
      const experimentalEnd = lineOffset(lines, match.experimentalEnd)
      const indent = getLineIndent(lines[match.experimentalLine] ?? '')
      const todoComment = `${indent}# TODO(backstage-codemod): app.packages already exists — manually merge app.experimental.packages value`
      result = `${source.slice(0, experimentalStart)}${todoComment}\n${source.slice(experimentalEnd)}`
    }

    migrationMetric.increment({ action: 'todo-added-conflict' })
    await Promise.resolve()
    return result
  }

  const appChildIndent = `${getLineIndent(lines[match.appLine] ?? '')}  `

  // Build the new app.packages line
  const packagesLineText = lines[match.packagesLine] ?? ''
  const inlineValueMatch = packagesLineText.match(/^\s*packages:\s*(.+)$/)
  let newPackagesBlock: string

  if (inlineValueMatch) {
    // Inline value like "packages: all"
    newPackagesBlock = `${appChildIndent}packages: ${inlineValueMatch[1]?.trim()}`
  } else {
    // Block value - re-indent to app child level
    const oldIndent = `${appChildIndent}  `
    const newBlockLines: string[] = [`${appChildIndent}packages:`]
    for (let lineIndex = match.packagesLine + 1; lineIndex < match.packagesEnd; lineIndex += 1) {
      const line = lines[lineIndex] ?? ''
      // Re-indent: remove two levels of indent, add one
      if (line.startsWith(oldIndent)) {
        newBlockLines.push(`${appChildIndent}  ${line.slice(oldIndent.length)}`)
      } else {
        newBlockLines.push(line)
      }
    }
    newPackagesBlock = newBlockLines.join('\n')
  }

  let result: string

  if (match.hasOtherExperimentalKeys) {
    // Remove only the packages block from experimental, keep experimental
    const packagesStart = lineOffset(lines, match.packagesLine)
    const packagesEndOffset = lineOffset(lines, match.packagesEnd)

    // Add new app.packages right after the app: block start
    const experimentalStart = lineOffset(lines, match.experimentalLine)
    result = `${source.slice(0, experimentalStart)}${newPackagesBlock}\n${source.slice(experimentalStart, packagesStart)}${source.slice(packagesEndOffset)}`
  } else {
    // Remove the entire experimental block and add app.packages in its place
    const experimentalStart = lineOffset(lines, match.experimentalLine)
    const experimentalEnd = lineOffset(lines, match.experimentalEnd)
    result = `${source.slice(0, experimentalStart)}${newPackagesBlock}\n${source.slice(experimentalEnd)}`
  }

  migrationMetric.increment({ action: 'packages-migrated' })
  await Promise.resolve()
  return result
}

export default transform
