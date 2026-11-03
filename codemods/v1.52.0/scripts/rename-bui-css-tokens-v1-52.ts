import type { Codemod, Edit } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('rename-bui-css-tokens-v1-52')

/**
 * Token replacements ordered longest-match-first to avoid partial matches.
 * Uses negative lookahead (?![-\w]) for word boundaries.
 */
interface TokenReplacement {
  pattern: RegExp
  replacement: string
  action: string
}

function buildReplacements(): TokenReplacement[] {
  const replacements: TokenReplacement[] = []

  // --- Accent (longest variants first) ---
  replacements.push({
    pattern: /--bui-bg-solid-hover(?![-\w])/g,
    replacement: '--bui-accent-bg-hover',
    action: 'accent-bg-solid-hover-renamed',
  })
  replacements.push({
    pattern: /--bui-bg-solid-disabled(?![-\w])/g,
    replacement: '--bui-accent-bg-disabled',
    action: 'accent-bg-solid-disabled-renamed',
  })
  replacements.push({
    pattern: /--bui-bg-solid(?![-\w])/g,
    replacement: '--bui-accent-bg',
    action: 'accent-bg-solid-renamed',
  })
  replacements.push({
    pattern: /--bui-fg-solid-disabled(?![-\w])/g,
    replacement: '--bui-accent-fg-disabled',
    action: 'accent-fg-solid-disabled-renamed',
  })
  replacements.push({
    pattern: /--bui-fg-solid(?![-\w])/g,
    replacement: '--bui-accent-fg',
    action: 'accent-fg-solid-renamed',
  })

  // --- Foreground renames (longer variants first) ---
  replacements.push({
    pattern: /--bui-fg-danger-on-bg(?![-\w])/g,
    replacement: '--bui-negative-fg-subdued',
    action: 'fg-danger-on-bg-renamed',
  })
  replacements.push({
    pattern: /--bui-fg-danger(?![-\w])/g,
    replacement: '--bui-fg-negative',
    action: 'fg-danger-renamed',
  })
  replacements.push({
    pattern: /--bui-fg-success-on-bg(?![-\w])/g,
    replacement: '--bui-positive-fg-subdued',
    action: 'fg-success-on-bg-renamed',
  })
  replacements.push({
    pattern: /--bui-fg-success(?![-\w])/g,
    replacement: '--bui-fg-positive',
    action: 'fg-success-renamed',
  })
  replacements.push({
    pattern: /--bui-fg-warning-on-bg(?![-\w])/g,
    replacement: '--bui-warning-fg-subdued',
    action: 'fg-warning-on-bg-renamed',
  })
  replacements.push({
    pattern: /--bui-fg-info-on-bg(?![-\w])/g,
    replacement: '--bui-announcement-fg-subdued',
    action: 'fg-info-on-bg-renamed',
  })
  replacements.push({
    pattern: /--bui-fg-info(?![-\w])/g,
    replacement: '--bui-fg-announcement',
    action: 'fg-info-renamed',
  })

  // --- Semantic backgrounds ---
  replacements.push({
    pattern: /--bui-bg-success(?![-\w])/g,
    replacement: '--bui-positive-bg-subdued',
    action: 'bg-success-renamed',
  })
  replacements.push({
    pattern: /--bui-bg-danger(?![-\w])/g,
    replacement: '--bui-negative-bg-subdued',
    action: 'bg-danger-renamed',
  })
  replacements.push({
    pattern: /--bui-bg-warning(?![-\w])/g,
    replacement: '--bui-warning-bg-subdued',
    action: 'bg-warning-renamed',
  })
  replacements.push({
    pattern: /--bui-bg-info(?![-\w])/g,
    replacement: '--bui-announcement-bg-subdued',
    action: 'bg-info-renamed',
  })

  // --- Semantic borders ---
  replacements.push({
    pattern: /--bui-border-success(?![-\w])/g,
    replacement: '--bui-positive-border',
    action: 'border-success-renamed',
  })
  replacements.push({
    pattern: /--bui-border-danger(?![-\w])/g,
    replacement: '--bui-negative-border',
    action: 'border-danger-renamed',
  })
  replacements.push({
    pattern: /--bui-border-warning(?![-\w])/g,
    replacement: '--bui-warning-border',
    action: 'border-warning-renamed',
  })
  replacements.push({
    pattern: /--bui-border-info(?![-\w])/g,
    replacement: '--bui-announcement-border',
    action: 'border-info-renamed',
  })

  // --- Neutral interaction tokens (no direct replacement — TODO) ---
  for (let n = 4; n >= 1; n--) {
    for (const state of ['hover', 'pressed', 'disabled'] as const) {
      replacements.push({
        pattern: new RegExp(`--bui-bg-neutral-${n}-${state}(?![-\\w])`, 'g'),
        replacement: `--bui-bg-neutral-${n}-${state} /* TODO(backstage-codemod): --bui-bg-neutral-${n}-${state} deprecated — remove or restyle */`,
        action: `neutral-${n}-${state}-todo`,
      })
    }
  }

  return replacements
}

const REPLACEMENTS = buildReplacements()

/** Detection pattern — any deprecated token we handle.
 *  Intentionally broad: matches any --bui- token that starts with a deprecated prefix.
 *  The actual replacement list handles longest-match-first ordering.
 */
const DETECTION_REGEX =
  /--bui-(?:bg-solid|fg-solid|fg-danger|fg-success|fg-info|fg-warning-on-bg|bg-success|bg-danger|bg-warning|bg-info|border-success|border-danger|border-warning|border-info|bg-neutral-[1-4]-(?:hover|pressed|disabled))/

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
