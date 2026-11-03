import { listImports } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('remove-alert-surface-prop')

const TARGET_COMPONENT = 'Alert'
const REMOVED_PROP = 'surface'
const UI_SOURCE = '@backstage/ui'

interface ImportedComponents {
  localNames: Set<string>
  namespaceAliases: string[]
}

function collectImportedComponents(rootNode: SgNode<TSX, 'program'>): ImportedComponents {
  const localNames = new Set<string>()
  const namespaceAliases: string[] = []

  for (const imp of listImports(rootNode, { from: UI_SOURCE })) {
    if (imp.namespaceName) {
      namespaceAliases.push(imp.namespaceName)
    }
    for (const spec of imp.specifiers) {
      if (spec.importedName === TARGET_COMPONENT) {
        localNames.add(spec.localName)
      }
    }
  }

  return { localNames, namespaceAliases }
}

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getOpeningElement(el: SgNode<TSX>): SgNode<TSX> | null {
  if (el.is('jsx_self_closing_element')) {
    return el
  }
  if (el.is('jsx_element')) {
    const opening = el.child(0)
    return opening?.is('jsx_opening_element') ? opening : null
  }
  return null
}

function getComponentNameNode(opening: SgNode<TSX>): SgNode<TSX> | null {
  return opening.child(1) ?? null
}

function isTargetComponent(nameNode: SgNode<TSX>, localNames: Set<string>, namespaceAliases: string[]): boolean {
  if (nameNode.is('identifier')) {
    return localNames.has(nameNode.text())
  }

  if (nameNode.is('member_expression')) {
    const objNode = nameNode.child(0)
    const propNode = nameNode.find({ rule: { kind: 'property_identifier' } })
    return (
      objNode?.is('identifier') === true &&
      namespaceAliases.includes(objNode.text()) &&
      propNode?.text() === TARGET_COMPONENT
    )
  }

  return false
}

function removeSurfaceAttribute(opening: SgNode<TSX>, rootNode: SgNode<TSX>, edits: Edit[]): void {
  const surfaceAttr = opening.find({
    rule: {
      kind: 'jsx_attribute',
      has: {
        kind: 'property_identifier',
        regex: `^${escapeRegex(REMOVED_PROP)}$`,
      },
    },
  })

  if (!surfaceAttr) {
    return
  }

  // Remove leading whitespace before the attribute
  const fullSource = rootNode.text()
  let removeStart = surfaceAttr.range().start.index
  while (removeStart > 0 && fullSource[removeStart - 1] === ' ') {
    removeStart--
  }

  edits.push({
    startPos: removeStart,
    endPos: surfaceAttr.range().end.index,
    insertedText: '',
  })
  migrationMetric.increment({ action: 'surface-prop-removed' })
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { localNames, namespaceAliases } = collectImportedComponents(rootNode)
  if (localNames.size === 0 && namespaceAliases.length === 0) {
    return null
  }

  const jsxElements = rootNode.findAll({
    rule: {
      any: [{ kind: 'jsx_element' }, { kind: 'jsx_self_closing_element' }],
    },
  })

  for (const el of jsxElements) {
    const opening = getOpeningElement(el)
    if (!opening) {
      continue
    }

    const nameNode = getComponentNameNode(opening)
    if (!nameNode || !isTargetComponent(nameNode, localNames, namespaceAliases)) {
      continue
    }

    removeSurfaceAttribute(opening, rootNode, edits)
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
