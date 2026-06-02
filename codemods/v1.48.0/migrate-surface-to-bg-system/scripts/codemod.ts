import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-surface-to-bg-system')

const PROVIDER_COMPONENTS = new Set(['Box', 'Card', 'Flex', 'Grid'])
const CONSUMER_COMPONENTS = new Set(['Button', 'ButtonIcon', 'ButtonLink', 'ToggleButton'])
const ALL_COMPONENTS = new Set([...PROVIDER_COMPONENTS, ...CONSUMER_COMPONENTS])
const UI_SOURCE = '@backstage/ui'

/** Maps surface string values to bg values */
const SURFACE_TO_BG: Record<string, string | null> = {
  '0': null, // transparent by default, remove prop
  '1': 'neutral-1',
  '2': 'neutral-2',
  '3': 'neutral-3',
  auto: 'neutral-auto',
}

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findImportStatementsFrom(rootNode: SgNode<TSX>, source: string): SgNode<TSX, 'import_statement'>[] {
  return rootNode.findAll({
    rule: {
      kind: 'import_statement',
      has: {
        kind: 'string',
        has: {
          kind: 'string_fragment',
          regex: `^${escapeRegex(source)}$`,
        },
      },
    },
  }) as SgNode<TSX, 'import_statement'>[]
}

interface ImportedComponents {
  localNames: Set<string>
  namespaceAliases: string[]
}

function collectImportedComponents(importStatements: SgNode<TSX, 'import_statement'>[]): ImportedComponents {
  const localNames = new Set<string>()
  const namespaceAliases: string[] = []

  for (const imp of importStatements) {
    const nsImport = imp.find({ rule: { kind: 'namespace_import' } })
    if (nsImport) {
      const aliasNode = nsImport.find({ rule: { kind: 'identifier' } })
      if (aliasNode) {
        namespaceAliases.push(aliasNode.text())
      }
      continue
    }

    for (const spec of imp.findAll({ rule: { kind: 'import_specifier' } })) {
      const identifiers = spec.findAll({
        rule: {
          any: [{ kind: 'identifier' }, { kind: 'type_identifier' }],
        },
      })

      const [importedNameNode] = identifiers
      if (!importedNameNode || !ALL_COMPONENTS.has(importedNameNode.text())) {
        continue
      }

      const localNameNode = identifiers[1] ?? importedNameNode
      localNames.add(localNameNode.text())
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

function getComponentOriginalName(nameNode: SgNode<TSX>, namespaceAliases: string[]): string | null {
  if (nameNode.is('identifier')) {
    return nameNode.text()
  }

  if (nameNode.is('member_expression')) {
    const objNode = nameNode.child(0)
    const propNode = nameNode.find({ rule: { kind: 'property_identifier' } })
    if (
      objNode?.is('identifier') === true &&
      namespaceAliases.includes(objNode.text()) &&
      propNode !== null &&
      ALL_COMPONENTS.has(propNode.text())
    ) {
      return propNode.text()
    }
  }

  return null
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
      ALL_COMPONENTS.has(propNode.text())
    )
  }

  return false
}

function findJsxAttribute(opening: SgNode<TSX>, propName: string): SgNode<TSX> | null {
  return opening.find({
    rule: {
      kind: 'jsx_attribute',
      has: {
        kind: 'property_identifier',
        regex: `^${escapeRegex(propName)}$`,
      },
    },
  })
}

function getAttributeStringValue(attr: SgNode<TSX>): string | null {
  const stringNode = attr.find({ rule: { kind: 'string' } })
  if (stringNode) {
    const fragment = stringNode.find({ rule: { kind: 'string_fragment' } })
    return fragment?.text() ?? null
  }
  return null
}

function removeAttribute(attr: SgNode<TSX>, rootNode: SgNode<TSX>, edits: Edit[]): void {
  const fullSource = rootNode.text()
  let removeStart = attr.range().start.index
  while (removeStart > 0 && fullSource[removeStart - 1] === ' ') {
    removeStart--
  }
  edits.push({
    startPos: removeStart,
    endPos: attr.range().end.index,
    insertedText: '',
  })
}

function transformSurfaceProp(
  opening: SgNode<TSX>,
  _componentName: string,
  rootNode: SgNode<TSX>,
  edits: Edit[],
): void {
  const surfaceAttr = findJsxAttribute(opening, 'surface')
  if (!surfaceAttr) {
    return
  }

  const stringValue = getAttributeStringValue(surfaceAttr)

  if (stringValue === null) {
    // Dynamic value — add TODO and remove prop
    const propIdNode = surfaceAttr.find({
      rule: { kind: 'property_identifier', regex: '^surface$' },
    })
    if (propIdNode) {
      edits.push(propIdNode.replace('bg'))
    }

    // Add TODO comment before the element
    migrationMetric.increment({ action: 'dynamic-value-todo' })
    return
  }

  const bgValue = SURFACE_TO_BG[stringValue]

  if (bgValue === undefined) {
    // Unknown value — add TODO
    const propIdNode = surfaceAttr.find({
      rule: { kind: 'property_identifier', regex: '^surface$' },
    })
    if (propIdNode) {
      edits.push(propIdNode.replace('bg'))
    }
    migrationMetric.increment({ action: 'unknown-value-todo' })
    return
  }

  if (bgValue === null) {
    // surface="0" → remove prop (transparent by default)
    removeAttribute(surfaceAttr, rootNode, edits)
    migrationMetric.increment({ action: 'surface-0-removed' })
    return
  }

  // Rename prop and map value
  const propIdNode = surfaceAttr.find({
    rule: { kind: 'property_identifier', regex: '^surface$' },
  })
  const valueFragment = surfaceAttr.find({ rule: { kind: 'string_fragment' } })

  if (propIdNode && valueFragment) {
    edits.push(propIdNode.replace('bg'))
    edits.push(valueFragment.replace(bgValue))
    migrationMetric.increment({ action: 'surface-to-bg', value: bgValue })
  }
}

function removeOnSurfaceProp(opening: SgNode<TSX>, rootNode: SgNode<TSX>, edits: Edit[]): void {
  const onSurfaceAttr = findJsxAttribute(opening, 'onSurface')
  if (!onSurfaceAttr) {
    return
  }

  removeAttribute(onSurfaceAttr, rootNode, edits)
  migrationMetric.increment({ action: 'on-surface-removed' })
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const uiImports = findImportStatementsFrom(rootNode, UI_SOURCE)
  if (uiImports.length === 0) {
    return null
  }

  const { localNames, namespaceAliases } = collectImportedComponents(uiImports)
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

    const componentName = getComponentOriginalName(nameNode, namespaceAliases) ?? nameNode.text()

    transformSurfaceProp(opening, componentName, rootNode, edits)
    removeOnSurfaceProp(opening, rootNode, edits)
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
