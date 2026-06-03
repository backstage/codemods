import type { Codemod, Edit } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('bui-header-css-renames')

/**
 * Longest-match-first rename map. Order matters to avoid partial matches:
 * bui-HeaderPageContent must be matched before bui-HeaderPage.
 */
const RENAME_MAP: [string, string][] = [
  ['bui-HeaderPageContent', 'bui-HeaderContent'],
  ['bui-HeaderPageBreadcrumbs', 'bui-HeaderBreadcrumbs'],
  ['bui-HeaderPageTabsWrapper', 'bui-HeaderTabsWrapper'],
  ['bui-HeaderPageControls', 'bui-HeaderControls'],
  ['bui-HeaderPage', 'bui-Header'],
]

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  // Find all string_fragment nodes that contain any of the old class names
  const stringFragments = rootNode.findAll({
    rule: {
      kind: 'string_fragment',
      regex: 'bui-HeaderPage',
    },
  })

  for (const fragment of stringFragments) {
    let text = fragment.text()
    let changed = false

    for (const [oldName, newName] of RENAME_MAP) {
      const before = text
      text = text.replaceAll(new RegExp(`\\b${oldName}\\b`, 'g'), newName)
      if (text !== before) {
        changed = true
        migrationMetric.increment({ type: 'string-fragment', from: oldName, to: newName })
      }
    }

    if (changed) {
      edits.push(fragment.replace(text))
    }
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
