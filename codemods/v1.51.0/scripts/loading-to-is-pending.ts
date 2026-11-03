import { listImports } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('loading-to-is-pending')

const TARGET_COMPONENTS = new Set(['Alert', 'Button', 'ButtonIcon', 'Table', 'TableRoot'])
const OLD_PROP = 'loading'
const NEW_PROP = 'isPending'
const UI_SOURCE = '@backstage/ui'

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

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
      if (TARGET_COMPONENTS.has(spec.importedName)) {
        localNames.add(spec.localName)
      }
    }
  }

  return { localNames, namespaceAliases }
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
      propNode !== null &&
      TARGET_COMPONENTS.has(propNode.text())
    )
  }

  return false
}

function getComponentLabel(nameNode: SgNode<TSX>): string {
  if (nameNode.is('identifier')) {
    return nameNode.text()
  }
  if (nameNode.is('member_expression')) {
    const propNode = nameNode.find({ rule: { kind: 'property_identifier' } })
    return propNode?.text() ?? nameNode.text()
  }
  return nameNode.text()
}

function renameLoadingAttribute(opening: SgNode<TSX>, componentLabel: string, edits: Edit[]): void {
  const loadingAttr = opening.find({
    rule: {
      kind: 'jsx_attribute',
      has: {
        kind: 'property_identifier',
        regex: `^${escapeRegex(OLD_PROP)}$`,
      },
    },
  })

  if (!loadingAttr) {
    return
  }

  const propNode = loadingAttr.find({
    rule: {
      kind: 'property_identifier',
      regex: `^${escapeRegex(OLD_PROP)}$`,
    },
  })

  if (propNode) {
    edits.push(propNode.replace(NEW_PROP))
    migrationMetric.increment({ action: 'prop-renamed', component: componentLabel })
  }
}

function transformJsxElements(
  rootNode: SgNode<TSX>,
  localNames: Set<string>,
  namespaceAliases: string[],
  edits: Edit[],
): void {
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

    renameLoadingAttribute(opening, getComponentLabel(nameNode), edits)
  }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { localNames, namespaceAliases } = collectImportedComponents(rootNode)
  if (localNames.size === 0 && namespaceAliases.length === 0) {
    return null
  }

  transformJsxElements(rootNode, localNames, namespaceAliases, edits)

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
