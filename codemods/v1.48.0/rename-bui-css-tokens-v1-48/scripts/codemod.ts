import type { Codemod, Edit } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('rename-bui-css-tokens')

/**
 * Token replacements, processed longest-first to avoid partial matches.
 * Order matters: some replacements chain (e.g. --bui-bg-surface-0 → --bui-bg-neutral-0 → --bui-bg-app).
 */

// --bui-bg-neutral-on-surface-N-{variant} → --bui-bg-neutral-(N+1)-{variant}
// Process these first (longest tokens)
const ON_SURFACE_VARIANTS = ['hover', 'pressed', 'disabled'] as const

// Build the ordered replacement map
interface TokenReplacement {
  pattern: RegExp
  replacement: string
  action: string
}

function buildReplacements(): TokenReplacement[] {
  const replacements: TokenReplacement[] = []

  // 1. --bui-bg-neutral-on-surface-N-variant → --bui-bg-neutral-(N+1)-variant (longest first)
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
      replacement: `/* TODO(backstage-codemod): --bui-border-${state} removed, no replacement */`,
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

// Pattern to detect --bui-bg-neutral-0 (after surface→neutral rename)
const NEUTRAL_0_PATTERN = /--bui-bg-neutral-0(?![-\w])/g

// Pattern to detect --bui-gray-N for N=5..8 (no replacement)
const GRAY_HIGH_PATTERN = /--bui-gray-([5-8])(?![-\w])/g

// Detection pattern - any token we care about
const DETECTION_REGEX =
  /--bui-bg-surface-|--bui-bg-neutral-on-surface-|--bui-gray-|--bui-bg-neutral-0(?![-\w])|--bui-border(?:-hover|-pressed|-disabled)?(?![-\w])/

function applyTokenReplacements(text: string): { result: string; actions: string[] } {
  let result = text
  const actions: string[] = []

  // Apply ordered replacements
  for (const { pattern, replacement, action } of REPLACEMENTS) {
    const newResult = result.replaceAll(pattern, replacement)
    if (newResult !== result) {
      actions.push(action)
      result = newResult
    }
  }

  // After surface→neutral rename, --bui-bg-neutral-0 → --bui-bg-app
  const afterAppRename = result.replaceAll(NEUTRAL_0_PATTERN, '--bui-bg-app')
  if (afterAppRename !== result) {
    actions.push('neutral-0-to-app')
    result = afterAppRename
  }

  // Handle --bui-gray-5 through --bui-gray-8 (no replacement, add TODO)
  const afterGrayHigh = result.replaceAll(
    GRAY_HIGH_PATTERN,
    '/* TODO(backstage-codemod): --bui-gray-$1 removed, no replacement */',
  )
  if (afterGrayHigh !== result) {
    actions.push('gray-high-todo')
    result = afterGrayHigh
  }

  return { result, actions }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  // Find all string fragments containing BUI tokens
  const stringFragments = rootNode.findAll({
    rule: {
      kind: 'string_fragment',
      regex: '--bui-',
    },
  })

  for (const fragment of stringFragments) {
    const text = fragment.text()

    if (!DETECTION_REGEX.test(text)) {
      continue
    }

    const { result, actions } = applyTokenReplacements(text)

    if (result !== text) {
      edits.push(fragment.replace(result))
      for (const action of actions) {
        migrationMetric.increment({ action })
      }
    }
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
