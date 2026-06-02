import { getImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

/**
 * Components that had their `variant` prop removed, grouped by source package.
 */
const VARIANT_COMPONENTS: Record<string, string[]> = {
  '@backstage/plugin-catalog': [
    'EntityAboutCard',
    'EntityLinksCard',
    'EntityLabelsCard',
    'EntityOwnershipCard',
    'MembersListCard',
  ],
  '@backstage/plugin-org': ['EntityUserProfileCard', 'EntityGroupProfileCard'],
  '@backstage/plugin-catalog-graph': ['EntityCatalogGraphCard'],
}

/**
 * Components that had specific extra props removed.
 */
const EXTRA_PROP_REMOVALS: Record<string, { pkg: string; props: string[] }> = {
  AboutField: { pkg: '@backstage/plugin-catalog', props: ['gridSizes'] },
}

const removedProps = useMetricAtom('catalog-card-variant-prop-removals')

/**
 * Remove a JSX attribute node and the whitespace before it, so that
 * `<Foo variant="gridItem" />` becomes `<Foo />`.
 */
function removeJsxAttribute(attrNode: SgNode<TSX>, fullSource: string): Edit {
  let startPos = attrNode.range().start.index
  const endPos = attrNode.range().end.index

  // Consume leading whitespace (the space before this attribute)
  while (startPos > 0 && fullSource[startPos - 1] === ' ') {
    startPos--
  }

  return {
    startPos,
    endPos,
    insertedText: '',
  }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const fullSource = rootNode.text()
  const edits: Edit[] = []

  // Build a set of component names that are imported from known packages
  const knownVariantComponents = new Set<string>()

  for (const [pkg, components] of Object.entries(VARIANT_COMPONENTS)) {
    for (const component of components) {
      const imp = getImport(rootNode, { type: 'named', name: component, from: pkg })
      if (imp && !imp.isNamespace) {
        // Use the local alias (or original name if not aliased)
        knownVariantComponents.add(imp.alias || component)
      }
    }
  }

  // Check for extra prop removal components
  const knownExtraPropComponents = new Map<string, string[]>()
  for (const [component, config] of Object.entries(EXTRA_PROP_REMOVALS)) {
    const imp = getImport(rootNode, { type: 'named', name: component, from: config.pkg })
    if (imp && !imp.isNamespace) {
      knownExtraPropComponents.set(imp.alias || component, config.props)
    }
  }

  if (knownVariantComponents.size === 0 && knownExtraPropComponents.size === 0) {
    return null
  }

  // Find all JSX opening elements
  const jsxOpeningElements = rootNode.findAll({
    rule: {
      kind: 'jsx_opening_element',
    },
  })

  // Also find self-closing elements
  const jsxSelfClosingElements = rootNode.findAll({
    rule: {
      kind: 'jsx_self_closing_element',
    },
  })

  const allElements = [...jsxOpeningElements, ...jsxSelfClosingElements]

  for (const element of allElements) {
    // Get the component name (first identifier child)
    const nameNode = element.children().find((c) => c.is('identifier'))
    if (!nameNode) {
      continue
    }
    const componentName = nameNode.text()

    // Collect props to remove for this component
    const propsToRemove: string[] = []
    if (knownVariantComponents.has(componentName)) {
      propsToRemove.push('variant')
    }
    const extraProps = knownExtraPropComponents.get(componentName)
    if (extraProps) {
      propsToRemove.push(...extraProps)
    }
    if (propsToRemove.length === 0) {
      continue
    }

    // Find JSX attributes by iterating children
    for (const child of element.children()) {
      if (!child.is('jsx_attribute')) {
        continue
      }
      const attrNameNode = child.find({ rule: { kind: 'property_identifier' } })
      if (!attrNameNode) {
        continue
      }
      const attrName = attrNameNode.text()
      if (propsToRemove.includes(attrName)) {
        edits.push(removeJsxAttribute(child, fullSource))
        removedProps.increment({ component: componentName, prop: attrName })
      }
    }
  }

  if (edits.length === 0) {
    return null
  }
  const result = await Promise.resolve(rootNode.commitEdits(edits))
  return result
}

export default transform
