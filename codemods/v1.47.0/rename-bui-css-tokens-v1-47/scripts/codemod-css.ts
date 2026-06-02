import type { Codemod, Edit } from 'codemod:ast-grep'
import type CSS from 'codemod:ast-grep/langs/css'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('bui-css-token-rename')

/**
 * Token replacements ordered longest-match-first to avoid partial matches.
 */
const TOKEN_MAP: [RegExp, string][] = [
  [/--bui-bg-tint-hover(?![-\w])/g, '--bui-bg-neutral-on-surface-0-hover'],
  [/--bui-bg-tint-pressed(?![-\w])/g, '--bui-bg-neutral-on-surface-0-pressed'],
  [/--bui-bg-tint-disabled(?![-\w])/g, '--bui-bg-neutral-on-surface-0-disabled'],
  [/--bui-bg-tint(?![-\w])/g, '--bui-bg-neutral-on-surface-0'],
  [/--bui-bg(?![-\w])/g, '--bui-bg-surface-0'],
]

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

const transform: Codemod<CSS> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  // In CSS tree-sitter, custom properties appear as `plain_value` nodes
  // inside property values, or as `property_name` nodes for declarations.
  // We need to find all identifiers that contain our old token names.

  // Strategy: find all `plain_value` and `property_name` nodes matching --bui-bg
  const propertyNames = rootNode.findAll({
    rule: {
      kind: 'property_name',
      regex: '--bui-bg',
    },
  })

  for (const node of propertyNames) {
    const text = node.text()
    if (!containsOldToken(text)) {
      continue
    }
    const newText = applyReplacements(text)
    if (newText !== text) {
      edits.push(node.replace(newText))
      migrationMetric.increment({
        type: 'css-property-name',
        action: 'renamed',
      })
    }
  }

  // plain_value nodes appear in var() function calls and other value positions
  const plainValues = rootNode.findAll({
    rule: {
      kind: 'plain_value',
      regex: '--bui-bg',
    },
  })

  for (const node of plainValues) {
    const text = node.text()
    if (!containsOldToken(text)) {
      continue
    }
    const newText = applyReplacements(text)
    if (newText !== text) {
      edits.push(node.replace(newText))
      migrationMetric.increment({
        type: 'css-plain-value',
        action: 'renamed',
      })
    }
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
