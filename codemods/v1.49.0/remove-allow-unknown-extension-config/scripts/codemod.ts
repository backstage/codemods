import { getImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const FRONTEND_DEFAULTS = '@backstage/frontend-defaults'
const PROPERTY_NAME = 'allowUnknownExtensionConfig'

const removedProps = useMetricAtom('allow-unknown-extension-config-removals')

/**
 * Remove a property from an object literal by rebuilding the parent object
 * without it, so commas and whitespace stay correct.
 */
function removeProperty(propNode: SgNode<TSX>): Edit {
  const parent = propNode.parent()
  if (parent?.kind() !== 'object') {
    return propNode.replace('')
  }

  const propertyKinds = new Set(['pair', 'shorthand_property_identifier', 'spread_element', 'method_definition'])
  const allProperties = parent.children().filter((c) => propertyKinds.has(c.kind()))
  const remaining = allProperties.filter((c) => c.id() !== propNode.id())

  if (remaining.length === 0) {
    return parent.replace('{}')
  }

  const isMultiLine = parent.text().includes('\n')
  if (isMultiLine) {
    return parent.replace(`{\n  ${remaining.map((p) => p.text()).join(',\n  ')},\n}`)
  }
  return parent.replace(`{ ${remaining.map((p) => p.text()).join(', ')} }`)
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()

  // Only process files that import createApp from @backstage/frontend-defaults
  const imp = getImport(rootNode, {
    type: 'named',
    name: 'createApp',
    from: FRONTEND_DEFAULTS,
  })
  if (!imp) {
    return null
  }

  const edits: Edit[] = []

  // Find all object properties named allowUnknownExtensionConfig inside
  // createApp() call arguments
  const createAppCalls = rootNode.findAll({
    rule: {
      kind: 'call_expression',
      has: {
        field: 'function',
        kind: 'identifier',
        regex: '^createApp$',
      },
    },
  })

  for (const call of createAppCalls) {
    const args = call.field('arguments')
    if (!args) {
      continue
    }

    // Find property assignments named allowUnknownExtensionConfig inside the arguments
    const props = args.findAll({
      rule: {
        kind: 'pair',
        has: {
          field: 'key',
          kind: 'property_identifier',
          regex: `^${PROPERTY_NAME}$`,
        },
      },
    })

    // Also find shorthand properties
    const shorthandProps = args.findAll({
      rule: {
        kind: 'shorthand_property_identifier',
        regex: `^${PROPERTY_NAME}$`,
      },
    })

    for (const prop of props) {
      edits.push(removeProperty(prop))
      removedProps.increment({ property: PROPERTY_NAME })
    }

    for (const prop of shorthandProps) {
      edits.push(removeProperty(prop))
      removedProps.increment({ property: PROPERTY_NAME })
    }
  }

  if (edits.length === 0) {
    return null
  }
  const result = await Promise.resolve(rootNode.commitEdits(edits))
  return result
}

export default transform
