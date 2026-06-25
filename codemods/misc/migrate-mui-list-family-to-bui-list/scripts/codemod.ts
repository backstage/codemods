import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-list-family-to-bui-list')

const BUI_SOURCE = '@backstage/ui'

const MUI_LIST_COMPONENTS = [
  'List',
  'ListItem',
  'ListItemIcon',
  'ListItemText',
  'ListItemAvatar',
  'ListItemSecondaryAction',
  'ListSubheader',
]

/** Props on ListItem that indicate complexity beyond a simple row. */
const TODO_PROPS = new Set([
  'button',
  'selected',
  'dense',
  'disableGutters',
  'divider',
  'alignItems',
  'ContainerComponent',
  'ContainerProps',
  'component',
  'classes',
])

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

interface ListImports {
  localNames: Map<string, string>
  importNodesToRemove: SgNode<TSX>[]
}

function collectListImports(rootNode: SgNode<TSX>): ListImports {
  const localNames = new Map<string, string>()
  const importNodesToRemove: SgNode<TSX>[] = []

  for (const componentName of MUI_LIST_COMPONENTS) {
    for (const imp of findImportStatementsFrom(rootNode, `@material-ui/core/${componentName}`)) {
      const name = getDefaultImportName(imp)
      if (name) {
        localNames.set(name, componentName)
      }
      importNodesToRemove.push(imp)
    }
  }

  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core')) {
    let foundCount = 0
    for (const componentName of MUI_LIST_COMPONENTS) {
      const localName = getNamedImportLocalName(imp, componentName)
      if (localName) {
        localNames.set(localName, componentName)
        foundCount++
      }
    }
    if (foundCount > 0) {
      const allSpecifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
      if (foundCount >= allSpecifiers.length) {
        importNodesToRemove.push(imp)
      }
    }
  }

  return { localNames, importNodesToRemove }
}

function addBuiImport(rootNode: SgNode<TSX>, names: string[], edits: Edit[]): void {
  const existingImports = findImportStatementsFrom(rootNode, BUI_SOURCE)
  const existingImport = existingImports[0] ?? null

  if (existingImport) {
    const namedImports = existingImport.find({ rule: { kind: 'named_imports' } })
    if (namedImports) {
      const text = namedImports.text()
      const inner = text.slice(1, -1).trim()
      const existing = inner
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
      for (const name of names) {
        if (!existing.includes(name)) {
          existing.push(name)
        }
      }
      existing.sort()
      edits.push(namedImports.replace(`{ ${existing.join(', ')} }`))
      migrationMetric.increment({ action: 'import-merged' })
    }
  } else {
    const allImports = rootNode.findAll({ rule: { kind: 'import_statement' } })
    const sortedNames = [...names].sort()
    if (allImports.length > 0) {
      const lastImport = allImports.at(-1)
      if (lastImport) {
        edits.push(
          lastImport.replace(`${lastImport.text()}\nimport { ${sortedNames.join(', ')} } from '${BUI_SOURCE}';`),
        )
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

function getPropStringValue(opening: SgNode<TSX>, propName: string): string | null {
  const attr = getPropAttr(opening, propName)
  if (!attr) {
    return null
  }
  const stringNode = attr.find({ rule: { kind: 'string' } })
  if (stringNode) {
    const frag = stringNode.find({ rule: { kind: 'string_fragment' } })
    return frag?.text() ?? null
  }
  return null
}

function getPropRawValue(opening: SgNode<TSX>, propName: string): string | null {
  const attr = getPropAttr(opening, propName)
  if (!attr) {
    return null
  }
  for (const child of attr.children()) {
    const kind = child.kind()
    if (kind === 'string' || kind === 'jsx_expression') {
      return child.text()
    }
  }
  return null
}

function getNonWhitespaceChildren(element: SgNode<TSX>): SgNode<TSX>[] {
  const children: SgNode<TSX>[] = []
  for (const child of element.children()) {
    const kind = child.kind()
    if (kind === 'jsx_opening_element' || kind === 'jsx_closing_element') {
      continue
    }
    if (kind === 'jsx_text' && child.text().trim().length === 0) {
      continue
    }
    children.push(child)
  }
  return children
}

interface ListItemAnalysis {
  iconContent: string | null
  primaryText: string | null
  primaryRaw: string | null
  secondaryText: string | null
  secondaryRaw: string | null
  hasComplexContent: boolean
  hasTodoProps: boolean
}

function analyzeListItem(el: SgNode<TSX>, localNames: Map<string, string>): ListItemAnalysis {
  const result: ListItemAnalysis = {
    iconContent: null,
    primaryText: null,
    primaryRaw: null,
    secondaryText: null,
    secondaryRaw: null,
    hasComplexContent: false,
    hasTodoProps: false,
  }

  const opening = el.child(0)
  if (!opening) {
    return result
  }

  // Check for TODO-triggering props on ListItem
  for (const prop of TODO_PROPS) {
    if (hasProp(opening, prop)) {
      result.hasTodoProps = true
      return result
    }
  }

  // Check for onClick — interactive list items need TODO
  if (hasProp(opening, 'onClick')) {
    result.hasTodoProps = true
    return result
  }

  const children = getNonWhitespaceChildren(el)

  const listItemIconLocal = [...localNames.entries()].find(([, v]) => v === 'ListItemIcon')?.[0] ?? null
  const listItemTextLocal = [...localNames.entries()].find(([, v]) => v === 'ListItemText')?.[0] ?? null
  const listItemAvatarLocal = [...localNames.entries()].find(([, v]) => v === 'ListItemAvatar')?.[0] ?? null
  const listItemSecondaryActionLocal =
    [...localNames.entries()].find(([, v]) => v === 'ListItemSecondaryAction')?.[0] ?? null

  for (const child of children) {
    const kind = child.kind()

    if (kind === 'jsx_text') {
      const trimmed = child.text().trim()
      if (trimmed.length > 0) {
        result.hasComplexContent = true
      }
      continue
    }

    if (kind === 'jsx_element' || kind === 'jsx_self_closing_element') {
      const childOpening = kind === 'jsx_self_closing_element' ? child : child.child(0)
      if (!childOpening) {
        result.hasComplexContent = true
        continue
      }

      const childName = getElementName(childOpening)

      // ListItemIcon
      if (childName && childName === listItemIconLocal) {
        if (kind === 'jsx_element') {
          const iconChildren = getNonWhitespaceChildren(child)
          const [iconChild] = iconChildren
          if (iconChild) {
            result.iconContent = iconChild.text()
          } else {
            result.hasComplexContent = true
          }
        }
        continue
      }

      // ListItemAvatar — complex, TODO
      if (childName && childName === listItemAvatarLocal) {
        result.hasComplexContent = true
        continue
      }

      // ListItemSecondaryAction — complex, TODO
      if (childName && childName === listItemSecondaryActionLocal) {
        result.hasComplexContent = true
        continue
      }

      // ListItemText
      if (childName && childName === listItemTextLocal) {
        const primaryStr = getPropStringValue(childOpening, 'primary')
        const primaryRaw = getPropRawValue(childOpening, 'primary')
        const secondaryStr = getPropStringValue(childOpening, 'secondary')
        const secondaryRaw = getPropRawValue(childOpening, 'secondary')

        if (primaryStr !== null) {
          result.primaryText = primaryStr
        } else if (primaryRaw !== null) {
          result.primaryRaw = primaryRaw
        }

        if (secondaryStr !== null) {
          result.secondaryText = secondaryStr
        } else if (secondaryRaw !== null) {
          result.secondaryRaw = secondaryRaw
        }

        // If ListItemText has children instead of primary prop, it's complex
        if (primaryStr === null && primaryRaw === null && kind === 'jsx_element') {
          const textChildren = getNonWhitespaceChildren(child)
          if (textChildren.length > 0) {
            result.hasComplexContent = true
          }
        }
        continue
      }

      // Unknown child element — mark complex
      result.hasComplexContent = true
      continue
    }

    if (kind === 'jsx_expression') {
      result.hasComplexContent = true
      continue
    }
  }

  return result
}

function transformListElements(rootNode: SgNode<TSX>, localNames: Map<string, string>, edits: Edit[]): void {
  const listLocalName = [...localNames.entries()].find(([, v]) => v === 'List')?.[0] ?? null
  const listItemLocalName = [...localNames.entries()].find(([, v]) => v === 'ListItem')?.[0] ?? null

  if (!listLocalName && !listItemLocalName) {
    return
  }

  const jsxElements = rootNode
    .findAll({
      rule: {
        any: [{ kind: 'jsx_element' }, { kind: 'jsx_self_closing_element' }],
      },
    })
    .sort((a, b) => {
      const rangeA = a.range()
      const rangeB = b.range()
      return rangeA.end.index - rangeA.start.index - (rangeB.end.index - rangeB.start.index)
    })

  for (const el of jsxElements) {
    const isSelfClosing = el.is('jsx_self_closing_element')
    const opening = isSelfClosing ? el : el.child(0)
    if (!opening) {
      continue
    }

    const name = getElementName(opening)
    if (!name) {
      continue
    }

    const muiName = localNames.get(name)

    // Transform ListItem → ListRow (BUI also uses <List> — leave List wrapper unchanged)
    if (muiName === 'ListItem') {
      if (isSelfClosing) {
        edits.push(el.replace('<ListRow />'))
        migrationMetric.increment({ action: 'list-item-migrated' })
        continue
      }

      const analysis = analyzeListItem(el, localNames)

      if (analysis.hasTodoProps || analysis.hasComplexContent) {
        edits.push(el.replace(`{/* TODO(backstage-codemod): verify nonstandard list row manually */}\n${el.text()}`))
        migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-list-item' })
        continue
      }

      // Build ListRow props
      const props: string[] = []

      if (analysis.iconContent) {
        props.push(`icon={${analysis.iconContent}}`)
      }

      if (analysis.secondaryText !== null) {
        props.push(`description="${analysis.secondaryText}"`)
      } else if (analysis.secondaryRaw !== null) {
        props.push(`description=${analysis.secondaryRaw}`)
      }

      const propsStr = props.length > 0 ? ` ${props.join(' ')}` : ''

      // Primary text becomes children
      let children = ''
      if (analysis.primaryText !== null) {
        children = analysis.primaryText
      } else if (analysis.primaryRaw !== null) {
        children = analysis.primaryRaw
      }

      if (children) {
        edits.push(el.replace(`<ListRow${propsStr}>${children}</ListRow>`))
      } else {
        edits.push(el.replace(`<ListRow${propsStr} />`))
      }

      migrationMetric.increment({ action: 'list-item-migrated' })
      continue
    }
  }
}

const transform: Codemod<TSX> = (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { localNames, importNodesToRemove } = collectListImports(rootNode)

  if (localNames.size === 0) {
    return Promise.resolve(null)
  }

  // Remove MUI imports
  for (const imp of importNodesToRemove) {
    edits.push(imp.replace(''))
    migrationMetric.increment({ action: 'import-removed' })
  }

  // Determine BUI names needed
  const buiNames = new Set<string>()
  for (const [, muiName] of localNames) {
    if (muiName === 'List' || muiName === 'ListSubheader') {
      buiNames.add('List')
    }
    if (
      muiName === 'ListItem' ||
      muiName === 'ListItemIcon' ||
      muiName === 'ListItemText' ||
      muiName === 'ListItemAvatar' ||
      muiName === 'ListItemSecondaryAction'
    ) {
      buiNames.add('ListRow')
    }
  }

  addBuiImport(rootNode, [...buiNames], edits)

  // Transform elements
  transformListElements(rootNode, localNames, edits)

  return Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
}

export default transform
