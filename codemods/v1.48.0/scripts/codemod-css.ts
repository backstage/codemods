import type { Codemod } from 'codemod:ast-grep'
import type CSS from 'codemod:ast-grep/langs/css'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('rename-bui-css-tokens')

/**
 * Token replacements, processed longest-first to avoid partial matches.
 */

const ON_SURFACE_VARIANTS = ['hover', 'pressed', 'disabled'] as const

interface TokenReplacement {
  pattern: RegExp
  replacement: string
  action: string
}

function buildReplacements(): TokenReplacement[] {
  const replacements: TokenReplacement[] = []

  // 1. --bui-bg-neutral-on-surface-N-variant → --bui-bg-neutral-(N+1)-variant
  for (const variant of ON_SURFACE_VARIANTS) {
    for (let n = 3; n >= 0; n--) {
      replacements.push({
        pattern: new RegExp(`--bui-bg-neutral-on-surface-${n}-${variant}`, 'g'),
        replacement: `--bui-bg-neutral-${n + 1}-${variant}`,
        action: `neutral-on-surface-${n}-${variant}-renamed`,
      })
    }
  }

  // 2. --bui-bg-neutral-on-surface-N → --bui-bg-neutral-(N+1)
  for (let n = 3; n >= 0; n--) {
    replacements.push({
      pattern: new RegExp(`--bui-bg-neutral-on-surface-${n}(?![-\\w])`, 'g'),
      replacement: `--bui-bg-neutral-${n + 1}`,
      action: `neutral-on-surface-${n}-renamed`,
    })
  }

  // 3. --bui-bg-surface-N → --bui-bg-neutral-N
  for (let n = 3; n >= 0; n--) {
    replacements.push({
      pattern: new RegExp(`--bui-bg-surface-${n}(?![-\\w])`, 'g'),
      replacement: `--bui-bg-neutral-${n}`,
      action: `surface-${n}-renamed`,
    })
  }

  // 4. --bui-gray-N → --bui-bg-neutral-N (N=1..4), TODO for N=5..8
  for (let n = 4; n >= 1; n--) {
    replacements.push({
      pattern: new RegExp(`--bui-gray-${n}(?![-\\w])`, 'g'),
      replacement: `--bui-bg-neutral-${n}`,
      action: `gray-${n}-renamed`,
    })
  }

  // 5. --bui-border-hover/pressed/disabled → TODO
  for (const state of ['hover', 'pressed', 'disabled'] as const) {
    replacements.push({
      pattern: new RegExp(`--bui-border-${state}(?![-\\w])`, 'g'),
      replacement: `--bui-border-${state} /* TODO(backstage-codemod): --bui-border-${state} removed, no replacement */`,
      action: `border-${state}-todo`,
    })
  }

  // 6. --bui-border (exact, not --bui-border-*) → --bui-border-2
  replacements.push({
    pattern: /--bui-border(?![-\w])/g,
    replacement: '--bui-border-2',
    action: 'border-renamed',
  })

  return replacements
}

const REPLACEMENTS = buildReplacements()

const NEUTRAL_0_PATTERN = /--bui-bg-neutral-0(?![-\w])/g
const GRAY_HIGH_PATTERN = /--bui-gray-([5-8])(?![-\w])/g
const BUTTON_SELECTOR_PATTERN = /\.bui-Button(?!Icon|Link|[-\w])/g

const DETECTION_REGEX =
  /--bui-bg-surface-|--bui-bg-neutral-on-surface-|--bui-gray-|--bui-bg-neutral-0(?![-\w])|--bui-border(?:-hover|-pressed|-disabled)?(?![-\w])|\.bui-Button(?!Icon|Link|[-\w])/

function applyTokenReplacements(text: string): { result: string; actions: string[] } {
  let result = text
  const actions: string[] = []

  for (const { pattern, replacement, action } of REPLACEMENTS) {
    const newResult = result.replaceAll(pattern, replacement)
    if (newResult !== result) {
      actions.push(action)
      result = newResult
    }
  }

  const afterAppRename = result.replaceAll(NEUTRAL_0_PATTERN, '--bui-bg-app')
  if (afterAppRename !== result) {
    actions.push('neutral-0-to-app')
    result = afterAppRename
  }

  const afterGrayHigh = result.replaceAll(
    GRAY_HIGH_PATTERN,
    '--bui-gray-$1 /* TODO(backstage-codemod): --bui-gray-$1 removed, no replacement */',
  )
  if (afterGrayHigh !== result) {
    actions.push('gray-high-todo')
    result = afterGrayHigh
  }

  // Handle .bui-Button selector split (→ .bui-ButtonIcon / .bui-ButtonLink)
  const afterButtonSplit = result.replaceAll(
    BUTTON_SELECTOR_PATTERN,
    '.bui-Button /* TODO(backstage-codemod): .bui-Button split into .bui-ButtonIcon / .bui-ButtonLink, manual review needed */',
  )
  if (afterButtonSplit !== result) {
    actions.push('button-selector-todo')
    result = afterButtonSplit
  }

  return { result, actions }
}

const transform: Codemod<CSS> = async (root) => {
  const rootNode = root.root()
  const source = rootNode.text()

  if (!DETECTION_REGEX.test(source)) {
    return null
  }

  const { result, actions } = applyTokenReplacements(source)

  if (result !== source) {
    for (const action of actions) {
      migrationMetric.increment({ action })
    }
    await Promise.resolve()
    return result
  }

  return null
}

export default transform
