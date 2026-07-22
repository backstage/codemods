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

function getImportedName(spec: SgNode<TSX>): string | null {
  const identifiers = spec.findAll({
    rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] },
  })
  return identifiers[0]?.text() ?? null
}

function collectIconButtonImports(rootNode: SgNode<TSX>): {
  iconButtonLocalName: string | null
  importNodesToRemove: SgNode<TSX>[]
  importSpecifiersToRemove: Map<SgNode<TSX>, string[]>
} {
  let iconButtonLocalName: string | null = null
  const importNodesToRemove: SgNode<TSX>[] = []
  const importSpecifiersToRemove = new Map<SgNode<TSX>, string[]>()

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
      } else {
        importSpecifiersToRemove.set(imp, ['IconButton'])
      }
    }
  }

  return { iconButtonLocalName, importNodesToRemove, importSpecifiersToRemove }
}

function pruneBarrelImportSpecifiers(imp: SgNode<TSX>, namesToRemove: string[], edits: Edit[]): void {
  const remainingSpecs = imp.findAll({ rule: { kind: 'import_specifier' } }).filter((spec) => {
    const importedName = getImportedName(spec)
    return importedName !== null && !namesToRemove.includes(importedName)
  })

  if (remainingSpecs.length === 0) {
    edits.push(imp.replace(''))
  } else {
    const specTexts = remainingSpecs.map((spec) => spec.text()).join(', ')
    edits.push(imp.replace(`import { ${specTexts} } from '@material-ui/core';`))
  }
  migrationMetric.increment({ action: 'import-removed' })
}

function addButtonIconToBuiImport(rootNode: SgNode<TSX>, importNodesToRemove: SgNode<TSX>[], edits: Edit[]): boolean {
  const existingImports = findImportStatementsFrom(rootNode, BUI_SOURCE)
  const existingImport = existingImports[0] ?? null

  if (existingImport) {
    const specifiers = existingImport.findAll({ rule: { kind: 'import_specifier' } })
    const hasButtonIcon = specifiers.some((spec) => getImportedName(spec) === 'ButtonIcon')
    if (!hasButtonIcon) {
      const namedImports = existingImport.find({ rule: { kind: 'named_imports' } })
      if (namedImports) {
        const names = specifiers.map((spec) => spec.text())
        names.push('ButtonIcon')
        names.sort()
        edits.push(namedImports.replace(`{ ${names.join(', ')} }`))
        migrationMetric.increment({ action: 'import-merged' })
      } else {
        edits.push(existingImport.replace(`${existingImport.text()}\nimport { ButtonIcon } from '${BUI_SOURCE}';`))
        migrationMetric.increment({ action: 'import-added' })
      }
    }
    return false
  }

  const removableIds = new Set(importNodesToRemove.map((imp) => imp.id()))
  const allImports = rootNode.findAll({ rule: { kind: 'import_statement' } })
  const anchorImport = [...allImports].reverse().find((imp) => !removableIds.has(imp.id())) ?? null

  if (anchorImport) {
    edits.push(anchorImport.replace(`${anchorImport.text()}\nimport { ButtonIcon } from '${BUI_SOURCE}';`))
  } else if (importNodesToRemove.length > 0) {
    const [importNode] = importNodesToRemove
    if (importNode) {
      edits.push(importNode.replace(`import { ButtonIcon } from '${BUI_SOURCE}';`))
      migrationMetric.increment({ action: 'import-added' })
      return true
    }
  } else if (allImports.length > 0) {
    const lastImport = allImports.at(-1)
    if (lastImport) {
      edits.push(lastImport.replace(`${lastImport.text()}\nimport { ButtonIcon } from '${BUI_SOURCE}';`))
    }
  }

  migrationMetric.increment({ action: 'import-added' })
  return false
}

function withTodoComment(comment: string, elementText: string): string {
  return `<>
  ${comment}
  ${elementText}
</>`
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

function formatIconProp(iconChild: SgNode<TSX>): string {
  const iconText = iconChild.text()
  if (iconChild.kind() === 'jsx_expression') {
    return `icon={${iconText.slice(1, -1)}}`
  }
  return `icon={${iconText}}`
}

function isSingleIconChild(child: SgNode<TSX>): boolean {
  const kind = child.kind()
  return kind === 'jsx_self_closing_element' || kind === 'jsx_element' || kind === 'jsx_expression'
}

/** Props that are dropped silently (MUI-specific, no BUI equivalent). */
const DROPPED_PROPS = new Set(['size', 'edge', 'color', 'disableRipple', 'disableFocusRipple'])

function transformIconButtonElements(
  rootNode: SgNode<TSX>,
  iconButtonLocalName: string,
  edits: Edit[],
): { preserveImport: boolean; migrated: boolean } {
  let preserveImport = false
  let migrated = false
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

    const insertTodo = (reason: string) => {
      preserveImport = true
      edits.push(
        el.replace(
          withTodoComment('{/* TODO(backstage-codemod): verify ButtonIcon accessibility manually */}', el.text()),
        ),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason })
    }

    if (isSelfClosing) {
      insertTodo('no-children')
      continue
    }

    const children = getJsxChildren(el)
    const [iconChild] = children
    if (children.length !== 1 || !iconChild || !isSingleIconChild(iconChild)) {
      insertTodo('complex-children')
      continue
    }

    const hasAriaLabel = hasProp(opening, 'aria-label')
    if (!hasAriaLabel) {
      insertTodo('missing-aria-label')
      continue
    }

    // Build new props
    const newProps: string[] = []

    // icon prop from child
    newProps.push(formatIconProp(iconChild))

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
    migrated = true
    migrationMetric.increment({ action: 'icon-button-migrated' })
  }

  return { preserveImport, migrated }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { iconButtonLocalName, importNodesToRemove, importSpecifiersToRemove } = collectIconButtonImports(rootNode)

  if (!iconButtonLocalName) {
    return null
  }

  const { preserveImport, migrated } = transformIconButtonElements(rootNode, iconButtonLocalName, edits)

  let replacedImport = false
  if (migrated) {
    replacedImport = addButtonIconToBuiImport(rootNode, importNodesToRemove, edits)
  }

  if (!preserveImport) {
    for (const imp of importNodesToRemove) {
      if (replacedImport && imp.id() === importNodesToRemove[0]?.id()) {
        migrationMetric.increment({ action: 'import-removed' })
        continue
      }
      edits.push(imp.replace(''))
      migrationMetric.increment({ action: 'import-removed' })
    }
    for (const [imp, namesToRemove] of importSpecifiersToRemove) {
      pruneBarrelImportSpecifiers(imp, namesToRemove, edits)
    }
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
