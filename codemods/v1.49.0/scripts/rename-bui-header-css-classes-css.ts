import type { Codemod, Edit } from 'codemod:ast-grep'
import type CSS from 'codemod:ast-grep/langs/css'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('bui-header-css-renames')

/**
 * Longest-match-first rename map for CSS class selectors.
 */
const RENAME_MAP: [string, string][] = [
  ['bui-HeaderPageContent', 'bui-HeaderContent'],
  ['bui-HeaderPageBreadcrumbs', 'bui-HeaderBreadcrumbs'],
  ['bui-HeaderPageTabsWrapper', 'bui-HeaderTabsWrapper'],
  ['bui-HeaderPageControls', 'bui-HeaderControls'],
  ['bui-HeaderPage', 'bui-Header'],
]

const transform: Codemod<CSS> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  for (const [oldName, newName] of RENAME_MAP) {
    // Find CSS class_selector identifiers matching old names
    const classNames = rootNode.findAll({
      rule: {
        kind: 'identifier',
        regex: `^${oldName}$`,
        inside: {
          kind: 'class_name',
          inside: {
            kind: 'class_selector',
            stopBy: 'neighbor',
          },
          stopBy: 'neighbor',
        },
      },
    })

    for (const className of classNames) {
      edits.push(className.replace(newName))
      migrationMetric.increment({ type: 'css-class-name', from: oldName, to: newName })
    }
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
