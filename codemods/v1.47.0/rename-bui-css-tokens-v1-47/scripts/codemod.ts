import type { Codemod, Edit } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('bui-css-token-rename')

/**
 * Token replacements ordered longest-match-first to avoid partial matches.
 * e.g. --bui-bg-tint-hover must be replaced before --bui-bg-tint.
 */
const TOKEN_MAP: [RegExp, string][] = [
  [/--bui-bg-tint-hover/g, '--bui-bg-neutral-on-surface-0-hover'],
  [/--bui-bg-tint-pressed/g, '--bui-bg-neutral-on-surface-0-pressed'],
  [/--bui-bg-tint-disabled/g, '--bui-bg-neutral-on-surface-0-disabled'],
  [/--bui-bg-tint(?![-\w])/g, '--bui-bg-neutral-on-surface-0'],
  [/--bui-bg(?![-\w])/g, '--bui-bg-surface-0'],
]

/** Quick check — does the text contain any old token? */
function containsOldToken(text: string): boolean {
  return /--bui-bg(?:(?:-tint(?:-hover|-pressed|-disabled)?)?(?![-\w]))/.test(text)
}

function applyReplacements(text: string): string {
  let result = text
  for (const [pattern, replacement] of TOKEN_MAP) {
    result = result.replaceAll(pattern, replacement)
  }
  return result
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  // Find all string_fragment nodes that may contain BUI CSS tokens
  const stringFragments = rootNode.findAll({
    rule: {
      kind: 'string_fragment',
      regex: '--bui-bg',
    },
  })

  for (const fragment of stringFragments) {
    const text = fragment.text()

    if (!containsOldToken(text)) {
      continue
    }

    const newText = applyReplacements(text)

    if (newText !== text) {
      edits.push(fragment.replace(newText))
      migrationMetric.increment({
        type: 'string-fragment',
        action: 'renamed',
      })
    }
  }

  // Also handle template string content (template_string > string nodes)
  // In tree-sitter, template literal content lives in `string_fragment` nodes
  // within `template_string`, but let's also check `template_content` for safety.

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
