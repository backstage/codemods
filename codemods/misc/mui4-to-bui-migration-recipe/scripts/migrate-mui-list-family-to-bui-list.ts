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
  importSpecifiersToRemove: Map<SgNode<TSX>, { source: string; names: string[] }>
}

function getImportedName(spec: SgNode<TSX>): string | null {
  const identifiers = spec.findAll({
    rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] },
  })
  return identifiers[0]?.text() ?? null
}

function getPrunedBarrelImportText(imp: SgNode<TSX>, namesToRemove: string[], source: string): string {
  const remainingSpecs = imp.findAll({ rule: { kind: 'import_specifier' } }).filter((spec) => {
    const importedName = getImportedName(spec)
    return importedName !== null && !namesToRemove.includes(importedName)
  })

  if (remainingSpecs.length === 0) {
    return ''
  }

  const typeOnly = imp.text().trimStart().startsWith('import type')
  const isMultiline = imp.text().includes('\n')
  const specTexts = remainingSpecs.map((spec) => spec.text())
  const typeKw = typeOnly ? 'type ' : ''

  return isMultiline
    ? `import ${typeKw}{\n  ${specTexts.join(',\n  ')},\n} from '${source}';`
    : `import ${typeKw}{ ${specTexts.join(', ')} } from '${source}';`
}

function pruneBarrelImportSpecifiers(imp: SgNode<TSX>, source: string, namesToRemove: string[], edits: Edit[]): void {
  edits.push(imp.replace(getPrunedBarrelImportText(imp, namesToRemove, source)))
  migrationMetric.increment({ action: 'import-removed' })
}

function withTodoComment(comment: string, elementText: string): string {
  return `<>
  ${comment}
  ${elementText}
</>`
}

function collectListImports(rootNode: SgNode<TSX>): ListImports {
  const localNames = new Map<string, string>()
  const importNodesToRemove: SgNode<TSX>[] = []
  const importSpecifiersToRemove = new Map<SgNode<TSX>, { source: string; names: string[] }>()

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
    const namesToRemove: string[] = []
    for (const componentName of MUI_LIST_COMPONENTS) {
      const localName = getNamedImportLocalName(imp, componentName)
      if (localName) {
        localNames.set(localName, componentName)
        namesToRemove.push(componentName)
      }
    }
    if (namesToRemove.length > 0) {
      const allSpecifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
      if (namesToRemove.length >= allSpecifiers.length) {
        importNodesToRemove.push(imp)
      } else {
        importSpecifiersToRemove.set(imp, { source: '@material-ui/core', names: namesToRemove })
      }
    }
  }

  return { localNames, importNodesToRemove, importSpecifiersToRemove }
}

function addBuiImport(
  rootNode: SgNode<TSX>,
  names: string[],
  importNodesToRemove: SgNode<TSX>[],
  importSpecifiersToRemove: Map<SgNode<TSX>, { source: string; names: string[] }>,
  edits: Edit[],
  handledBarrelIds: Set<number>,
): boolean {
  const existingImports = findImportStatementsFrom(rootNode, BUI_SOURCE)
  const existingImport = existingImports[0] ?? null
  const sortedNames = [...names].sort()
  const buiImport = `import { ${sortedNames.join(', ')} } from '${BUI_SOURCE}';`

  if (existingImport) {
    const namedImports = existingImport.find({ rule: { kind: 'named_imports' } })
    if (namedImports) {
      const specifiers = existingImport.findAll({ rule: { kind: 'import_specifier' } })
      const existingImported = new Set<string>()
      const existingTexts: string[] = []
      for (const spec of specifiers) {
        const imported = getImportedName(spec)
        if (imported) {
          existingImported.add(imported)
        }
        existingTexts.push(spec.text())
      }
      for (const name of names) {
        if (!existingImported.has(name)) {
          existingTexts.push(name)
          existingImported.add(name)
        }
      }
      existingTexts.sort()
      edits.push(namedImports.replace(`{ ${existingTexts.join(', ')} }`))
      migrationMetric.increment({ action: 'import-merged' })
    }
    return false
  }

  const skipIds = new Set([
    ...importNodesToRemove.map((imp) => imp.id()),
    ...[...importSpecifiersToRemove.keys()].map((imp) => imp.id()),
  ])
  const allImports = rootNode.findAll({ rule: { kind: 'import_statement' } })
  const anchorImport = [...allImports].reverse().find((imp) => !skipIds.has(imp.id())) ?? null

  if (anchorImport) {
    edits.push(anchorImport.replace(`${anchorImport.text()}\n${buiImport}`))
  } else {
    const [barrelToFold] = [...importSpecifiersToRemove.entries()]
    if (barrelToFold) {
      const [imp, { source, names: namesToRemove }] = barrelToFold
      const pruned = getPrunedBarrelImportText(imp, namesToRemove, source)
      edits.push(imp.replace(pruned.length > 0 ? `${pruned}\n${buiImport}` : buiImport))
      handledBarrelIds.add(imp.id())
      migrationMetric.increment({ action: 'import-added' })
      migrationMetric.increment({ action: 'import-removed' })
      return false
    }

    if (importNodesToRemove.length > 0) {
      const [importNode] = importNodesToRemove
      if (importNode) {
        edits.push(importNode.replace(buiImport))
        migrationMetric.increment({ action: 'import-added' })
        return true
      }
    }
  }

  migrationMetric.increment({ action: 'import-added' })
  return false
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

function formatIconProp(iconContent: string): string {
  const trimmed = iconContent.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return `icon=${trimmed}`
  }
  return `icon={${trimmed}}`
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

function transformListElements(
  rootNode: SgNode<TSX>,
  localNames: Map<string, string>,
  edits: Edit[],
): { preserveImport: boolean; migrated: boolean; buiNames: Set<string> } {
  let preserveImport = false
  let migrated = false
  const buiNames = new Set<string>()

  const listLocalName = [...localNames.entries()].find(([, v]) => v === 'List')?.[0] ?? null
  const listItemLocalName = [...localNames.entries()].find(([, v]) => v === 'ListItem')?.[0] ?? null

  if (!listLocalName && !listItemLocalName) {
    return { preserveImport, migrated, buiNames }
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
        buiNames.add('ListRow')
        if (listLocalName) {
          buiNames.add('List')
        }
        migrated = true
        migrationMetric.increment({ action: 'list-item-migrated' })
        continue
      }

      const analysis = analyzeListItem(el, localNames)

      if (analysis.hasTodoProps || analysis.hasComplexContent) {
        preserveImport = true
        edits.push(
          el.replace(
            withTodoComment(`{/* TODO(backstage-codemod): verify nonstandard list row manually */}`, el.text()),
          ),
        )
        migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-list-item' })
        continue
      }

      // Build ListRow props
      const props: string[] = []

      if (analysis.iconContent) {
        props.push(formatIconProp(analysis.iconContent))
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

      buiNames.add('ListRow')
      if (listLocalName) {
        buiNames.add('List')
      }
      migrated = true
      migrationMetric.increment({ action: 'list-item-migrated' })
      continue
    }
  }

  return { preserveImport, migrated, buiNames }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { localNames, importNodesToRemove, importSpecifiersToRemove } = collectListImports(rootNode)

  if (localNames.size === 0) {
    return null
  }

  const { preserveImport, migrated, buiNames } = transformListElements(rootNode, localNames, edits)

  let replacedImport = false
  const handledBarrelIds = new Set<number>()
  if (migrated) {
    replacedImport = addBuiImport(
      rootNode,
      [...buiNames],
      importNodesToRemove,
      importSpecifiersToRemove,
      edits,
      handledBarrelIds,
    )
  }

  if (!preserveImport) {
    for (const [imp, { source, names }] of importSpecifiersToRemove) {
      if (handledBarrelIds.has(imp.id())) {
        continue
      }
      pruneBarrelImportSpecifiers(imp, source, names, edits)
    }
    for (const imp of importNodesToRemove) {
      if (replacedImport && imp.id() === importNodesToRemove[0]?.id()) {
        migrationMetric.increment({ action: 'import-removed' })
        continue
      }
      edits.push(imp.replace(''))
      migrationMetric.increment({ action: 'import-removed' })
    }
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
