import type { Codemod, Edit } from 'codemod:ast-grep'
import type CSS from 'codemod:ast-grep/langs/css'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('loading-to-is-pending')

const OLD_ATTR = 'data-loading'
const NEW_ATTR = 'data-ispending'

const transform: Codemod<CSS> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const attributeNames = rootNode.findAll({
    rule: {
      kind: 'attribute_name',
      regex: `^${OLD_ATTR}$`,
    },
  })

  for (const attributeName of attributeNames) {
    edits.push(attributeName.replace(NEW_ATTR))
    migrationMetric.increment({ action: 'css-attribute-renamed' })
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
