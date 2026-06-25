import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-icon-button-to-button-icon')

const BUI_SOURCE = '@backstage/ui'

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findImportStatementsFrom(rootNode: SgNode<TSX>, source: string): SgNode<TSX>[] {
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
  })
}

function getDefaultImportName(imp: SgNode<TSX>): string | null {
  const clause = imp.find({ rule: { kind: 'import_clause' } })
  if (!clause) {
    return null
  }
  for (const child of clause.children()) {
    if (child.is('identifier')) {
      return child.text()
    }
  }
  return null
}

function getNamedImportLocalName(imp: SgNode<TSX>, targetName: string): string | null {
  for (const spec of imp.findAll({ rule: { kind: 'import_specifier' } })) {
    const identifiers = spec.findAll({
      rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] },
    })
    const [importedNameNode] = identifiers
    if (importedNameNode?.text() === targetName) {
      const localNameNode = identifiers[1] ?? importedNameNode
      return localNameNode.text()
    }
  }
  return null
}

function collectIconButtonImports(rootNode: SgNode<TSX>): {
  iconButtonLocalName: string | null
  importNodesToRemove: SgNode<TSX>[]
} {
  let iconButtonLocalName: string | null = null
  const importNodesToRemove: SgNode<TSX>[] = []

  // Default import: import IconButton from '@material-ui/core/IconButton'
  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core/IconButton')) {
    iconButtonLocalName = getDefaultImportName(imp)
    importNodesToRemove.push(imp)
  }

  // Named import from barrel: import { IconButton } from '@material-ui/core'
  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core')) {
    const localName = getNamedImportLocalName(imp, 'IconButton')
    if (localName) {
      iconButtonLocalName = localName
      const allSpecifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
      if (allSpecifiers.length <= 1) {
        importNodesToRemove.push(imp)
      }
    }
  }

  return { iconButtonLocalName, importNodesToRemove }
}

function addButtonIconToBuiImport(rootNode: SgNode<TSX>, edits: Edit[]): void {
  const existingImports = findImportStatementsFrom(rootNode, BUI_SOURCE)
  const existingImport = existingImports[0] ?? null

  if (existingImport) {
    const specifiers = existingImport.findAll({ rule: { kind: 'import_specifier' } })
    let hasButtonIcon = false
    for (const spec of specifiers) {
      const idents = spec.findAll({
        rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] },
      })
      if (idents[0]?.text() === 'ButtonIcon') {
        hasButtonIcon = true
      }
    }
    if (!hasButtonIcon) {
      const namedImports = existingImport.find({ rule: { kind: 'named_imports' } })
      if (namedImports) {
        const text = namedImports.text()
        const inner = text.slice(1, -1).trim()
        const names = inner
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean)
        names.push('ButtonIcon')
        names.sort()
        edits.push(namedImports.replace(`{ ${names.join(', ')} }`))
        migrationMetric.increment({ action: 'import-merged' })
      }
    }
  } else {
    const allImports = rootNode.findAll({ rule: { kind: 'import_statement' } })
    if (allImports.length > 0) {
      const lastImport = allImports.at(-1)
      if (lastImport) {
        edits.push(lastImport.replace(`${lastImport.text()}\nimport { ButtonIcon } from '${BUI_SOURCE}';`))
      }
    }
    migrationMetric.increment({ action: 'import-added' })
  }
}

function getElementName(opening: SgNode<TSX>): string | null {
  for (const child of opening.children()) {
    if (child.is('identifier') || child.is('member_expression')) {
      return child.text()
    }
  }
  return null
}

function getPropAttr(opening: SgNode<TSX>, propName: string): SgNode<TSX> | null {
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

function hasProp(opening: SgNode<TSX>, propName: string): boolean {
  return getPropAttr(opening, propName) !== null
}

function getJsxChildren(element: SgNode<TSX>): SgNode<TSX>[] {
  const children: SgNode<TSX>[] = []
  for (const child of element.children()) {
    const kind = child.kind()
    if (kind === 'jsx_opening_element' || kind === 'jsx_closing_element') {
      continue
    }
    if (kind === 'jsx_text') {
      if (child.text().trim().length === 0) {
        continue
      }
    }
    children.push(child)
  }
  return children
}

function isSingleIconChild(child: SgNode<TSX>): boolean {
  const kind = child.kind()
  return kind === 'jsx_self_closing_element' || kind === 'jsx_element' || kind === 'jsx_expression'
}

/** Props that are dropped silently (MUI-specific, no BUI equivalent). */
const DROPPED_PROPS = new Set(['size', 'edge', 'color', 'disableRipple', 'disableFocusRipple'])

function transformIconButtonElements(rootNode: SgNode<TSX>, iconButtonLocalName: string, edits: Edit[]): void {
  const jsxElements = rootNode.findAll({
    rule: {
      any: [{ kind: 'jsx_element' }, { kind: 'jsx_self_closing_element' }],
    },
  })

  for (const el of jsxElements) {
    const isSelfClosing = el.is('jsx_self_closing_element')
    const opening = isSelfClosing ? el : el.child(0)
    if (!opening) {
      continue
    }

    const name = getElementName(opening)
    if (name !== iconButtonLocalName) {
      continue
    }

    // Self-closing IconButton has no icon child — TODO
    if (isSelfClosing) {
      edits.push(el.replace(`{/* TODO(backstage-codemod): verify ButtonIcon accessibility manually */}\n${el.text()}`))
      migrationMetric.increment({ action: 'todo-inserted', reason: 'no-children' })
      continue
    }

    // Need exactly one icon child
    const children = getJsxChildren(el)
    if (children.length !== 1 || !isSingleIconChild(children[0]!)) {
      edits.push(el.replace(`{/* TODO(backstage-codemod): verify ButtonIcon accessibility manually */}\n${el.text()}`))
      migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-children' })
      continue
    }

    const iconChild = children[0]!
    const iconText = iconChild.text()

    // Check for aria-label — required for accessibility
    const hasAriaLabel = hasProp(opening, 'aria-label')
    if (!hasAriaLabel) {
      edits.push(el.replace(`{/* TODO(backstage-codemod): verify ButtonIcon accessibility manually */}\n${el.text()}`))
      migrationMetric.increment({ action: 'todo-inserted', reason: 'missing-aria-label' })
      continue
    }

    // Build new props
    const newProps: string[] = []

    // icon prop from child
    newProps.push(`icon={${iconText}}`)

    // Map props from opening element
    const allAttrs = opening.findAll({ rule: { kind: 'jsx_attribute' } })
    for (const attr of allAttrs) {
      const propIdent = attr.find({ rule: { kind: 'property_identifier' } })
      if (!propIdent) {
        continue
      }
      const propName = propIdent.text()

      if (propName === 'disabled') {
        // Map disabled → isDisabled
        const exprNode = attr.find({ rule: { kind: 'jsx_expression' } })
        if (exprNode) {
          newProps.push(`isDisabled=${exprNode.text()}`)
        } else {
          newProps.push('isDisabled')
        }
        continue
      }

      if (propName === 'onClick') {
        // Map onClick → onPress
        const exprNode = attr.find({ rule: { kind: 'jsx_expression' } })
        if (exprNode) {
          newProps.push(`onPress=${exprNode.text()}`)
        }
        continue
      }

      if (DROPPED_PROPS.has(propName)) {
        migrationMetric.increment({ action: 'prop-dropped', prop: propName })
        continue
      }

      // Preserve all other props (aria-label, className, data-*, etc.)
      newProps.push(attr.text())
    }

    // Preserve spread attributes
    const spreadAttrs = opening.findAll({ rule: { kind: 'jsx_expression' } })
    for (const spread of spreadAttrs) {
      if (spread.text().startsWith('{...')) {
        newProps.push(spread.text())
      }
    }

    const propsStr = newProps.length > 0 ? ` ${newProps.join(' ')}` : ''
    edits.push(el.replace(`<ButtonIcon${propsStr} />`))
    migrationMetric.increment({ action: 'icon-button-migrated' })
  }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { iconButtonLocalName, importNodesToRemove } = collectIconButtonImports(rootNode)

  if (!iconButtonLocalName) {
    return null
  }

  // Remove MUI imports
  for (const imp of importNodesToRemove) {
    edits.push(imp.replace(''))
    migrationMetric.increment({ action: 'import-removed' })
  }

  // Add BUI import
  addButtonIconToBuiImport(rootNode, edits)

  // Transform JSX elements
  transformIconButtonElements(rootNode, iconButtonLocalName, edits)

  return edits.length > 0 ? rootNode.commitEdits(edits) : null
}

export default transform
