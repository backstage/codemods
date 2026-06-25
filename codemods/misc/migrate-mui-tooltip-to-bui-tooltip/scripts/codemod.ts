import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-tooltip-to-bui-tooltip')

const BUI_SOURCE = '@backstage/ui'

const TODO_PROPS = new Set([
  'leaveDelay',
  'enterDelay',
  'enterTouchDelay',
  'leaveTouchDelay',
  'interactive',
  'TransitionComponent',
  'TransitionProps',
  'PopperProps',
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

function getImportedName(spec: SgNode<TSX>): string | null {
  const identifiers = spec.findAll({
    rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] },
  })
  return identifiers[0]?.text() ?? null
}

function collectTooltipImports(rootNode: SgNode<TSX>): {
  tooltipLocalName: string | null
  importNodesToRemove: SgNode<TSX>[]
  importSpecifiersToRemove: Map<SgNode<TSX>, string[]>
} {
  let tooltipLocalName: string | null = null
  const importNodesToRemove: SgNode<TSX>[] = []
  const importSpecifiersToRemove = new Map<SgNode<TSX>, string[]>()

  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core/Tooltip')) {
    tooltipLocalName = getDefaultImportName(imp)
    importNodesToRemove.push(imp)
  }

  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core')) {
    const localName = getNamedImportLocalName(imp, 'Tooltip')
    if (localName) {
      tooltipLocalName = localName
      const allSpecifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
      if (allSpecifiers.length <= 1) {
        importNodesToRemove.push(imp)
      } else {
        importSpecifiersToRemove.set(imp, ['Tooltip'])
      }
    }
  }

  return { tooltipLocalName, importNodesToRemove, importSpecifiersToRemove }
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

function addBuiImport(
  rootNode: SgNode<TSX>,
  names: string[],
  importNodesToRemove: SgNode<TSX>[],
  edits: Edit[],
): boolean {
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
    } else {
      const sortedNames = [...names].sort()
      edits.push(
        existingImport.replace(`${existingImport.text()}\nimport { ${sortedNames.join(', ')} } from '${BUI_SOURCE}';`),
      )
      migrationMetric.increment({ action: 'import-added' })
    }
    return false
  }

  const removableIds = new Set(importNodesToRemove.map((imp) => imp.id()))
  const allImports = rootNode.findAll({ rule: { kind: 'import_statement' } })
  const anchorImport = [...allImports].reverse().find((imp) => !removableIds.has(imp.id())) ?? null
  const sortedNames = [...names].sort()
  const buiImport = `import { ${sortedNames.join(', ')} } from '${BUI_SOURCE}';`

  if (anchorImport) {
    edits.push(anchorImport.replace(`${anchorImport.text()}\n${buiImport}`))
  } else if (importNodesToRemove.length > 0) {
    const [importNode] = importNodesToRemove
    if (importNode) {
      edits.push(importNode.replace(buiImport))
      migrationMetric.increment({ action: 'import-added' })
      return true
    }
  } else if (allImports.length > 0) {
    const lastImport = allImports.at(-1)
    if (lastImport) {
      edits.push(lastImport.replace(`${lastImport.text()}\n${buiImport}`))
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

function hasProp(opening: SgNode<TSX>, propName: string): boolean {
  return (
    opening.find({
      rule: {
        kind: 'jsx_attribute',
        has: {
          kind: 'property_identifier',
          regex: `^${escapeRegex(propName)}$`,
        },
      },
    }) !== null
  )
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

function isPropDynamic(opening: SgNode<TSX>, propName: string): boolean {
  const attr = getPropAttr(opening, propName)
  if (!attr) {
    return false
  }
  return attr.find({ rule: { kind: 'jsx_expression' } }) !== null
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

function getSimpleHandlerFromProp(opening: SgNode<TSX>, propName: string): string | null {
  const attr = getPropAttr(opening, propName)
  if (!attr) {
    return null
  }
  const expr = attr.find({ rule: { kind: 'jsx_expression' } })
  if (!expr) {
    return null
  }
  const children: SgNode<TSX>[] = []
  for (const child of expr.children()) {
    if (child.kind() !== '{' && child.kind() !== '}') {
      children.push(child)
    }
  }
  const [onlyChild] = children
  if (children.length === 1 && onlyChild?.is('identifier')) {
    return onlyChild.text()
  }
  return null
}

function buildControlledTooltipProps(opening: SgNode<TSX>): string[] {
  const props: string[] = []

  const openValue = getPropRawValue(opening, 'open')
  if (openValue) {
    props.push(`isOpen=${openValue}`)
  }

  const closeHandler = getSimpleHandlerFromProp(opening, 'onClose')
  const openHandler = getSimpleHandlerFromProp(opening, 'onOpen')

  if (closeHandler) {
    props.push(`onOpenChange={open => !open && ${closeHandler}()}`)
    migrationMetric.increment({ action: 'onClose-rewritten' })
  } else if (openHandler) {
    props.push(`onOpenChange={open => open && ${openHandler}()}`)
    migrationMetric.increment({ action: 'onOpen-rewritten' })
  } else if (hasProp(opening, 'onClose') || hasProp(opening, 'onOpen')) {
    return []
  }

  return props
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

function transformTooltipElements(rootNode: SgNode<TSX>, tooltipLocalName: string, edits: Edit[]): boolean {
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
    if (name !== tooltipLocalName) {
      continue
    }

    let needsTodo = false
    for (const prop of TODO_PROPS) {
      if (hasProp(opening, prop)) {
        needsTodo = true
        break
      }
    }

    const controlledProps = buildControlledTooltipProps(opening)
    if (
      (hasProp(opening, 'onClose') || hasProp(opening, 'onOpen')) &&
      controlledProps.length === 0 &&
      !getPropRawValue(opening, 'open')
    ) {
      needsTodo = true
    } else if (
      (hasProp(opening, 'onClose') || hasProp(opening, 'onOpen')) &&
      controlledProps.length === 0 &&
      getPropRawValue(opening, 'open')
    ) {
      needsTodo = true
    }

    if (needsTodo) {
      edits.push(el.replace(`{/* TODO(backstage-codemod): finish tooltip migration manually */}\n${el.text()}`))
      migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-props' })
      continue
    }

    const titleStr = getPropStringValue(opening, 'title')
    const titleDynamic = isPropDynamic(opening, 'title')
    const titleRaw = getPropRawValue(opening, 'title')

    if (!titleStr && !titleDynamic) {
      edits.push(el.replace(`{/* TODO(backstage-codemod): finish tooltip migration manually */}\n${el.text()}`))
      migrationMetric.increment({ action: 'todo-inserted', reason: 'no-title' })
      continue
    }

    if (isSelfClosing) {
      edits.push(el.replace(`{/* TODO(backstage-codemod): finish tooltip migration manually */}\n${el.text()}`))
      migrationMetric.increment({ action: 'todo-inserted', reason: 'no-children' })
      continue
    }

    const children = getJsxChildren(el)
    if (children.length !== 1) {
      edits.push(el.replace(`{/* TODO(backstage-codemod): finish tooltip migration manually */}\n${el.text()}`))
      migrationMetric.increment({ action: 'todo-inserted', reason: 'multiple-children' })
      continue
    }

    const [child] = children
    if (!child) {
      continue
    }
    const childText = child.text()

    let tooltipContent: string
    if (titleStr !== null) {
      tooltipContent = titleStr
    } else if (titleRaw !== null) {
      tooltipContent = titleRaw
    } else {
      tooltipContent = ''
    }

    const placementValue = getPropStringValue(opening, 'placement')
    const placementDynamic = isPropDynamic(opening, 'placement')
    let placementTodo = ''
    if (placementValue || placementDynamic) {
      placementTodo = '{/* TODO(backstage-codemod): verify Tooltip placement mapping manually */}\n'
      migrationMetric.increment({ action: 'placement-dropped', value: placementValue ?? 'dynamic' })
    }

    const tooltipEl = `<Tooltip>${tooltipContent}</Tooltip>`
    const triggerProps = controlledProps.length > 0 ? ` ${controlledProps.join(' ')}` : ''

    edits.push(
      el.replace(`${placementTodo}<TooltipTrigger${triggerProps}>\n  ${childText}\n  ${tooltipEl}\n</TooltipTrigger>`),
    )
    migrationMetric.increment({ action: 'tooltip-migrated' })
    migrated = true
  }

  return migrated
}

const transform: Codemod<TSX> = (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { tooltipLocalName, importNodesToRemove, importSpecifiersToRemove } = collectTooltipImports(rootNode)

  if (!tooltipLocalName) {
    return Promise.resolve(null)
  }

  const migrated = transformTooltipElements(rootNode, tooltipLocalName, edits)

  if (!migrated) {
    return Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  }

  const buiNames = ['Tooltip', 'TooltipTrigger']
  const replacedImport = addBuiImport(rootNode, buiNames, importNodesToRemove, edits)

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

  return Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
}

export default transform
