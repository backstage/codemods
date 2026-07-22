import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-button-to-bui-button')

const VARIANT_MAP: Record<string, string> = {
  contained: 'primary',
  outlined: 'secondary',
  text: 'tertiary',
}

const BUI_SOURCE = '@backstage/ui'

/** Props that need TODO markers because their semantics don't map mechanically. */
const TODO_PROPS = new Set(['component', 'fullWidth', 'disableElevation', 'disableRipple', 'disableFocusRipple'])

const ICON_PROP_RENAMES: Record<string, string> = {
  startIcon: 'iconStart',
  endIcon: 'iconEnd',
}

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

function collectButtonImports(rootNode: SgNode<TSX>): {
  buttonLocalName: string | null
  importNodesToRemove: SgNode<TSX>[]
  importSpecifiersToRemove: Map<SgNode<TSX>, string[]>
} {
  let buttonLocalName: string | null = null
  const importNodesToRemove: SgNode<TSX>[] = []
  const importSpecifiersToRemove = new Map<SgNode<TSX>, string[]>()

  // Default import: import Button from '@material-ui/core/Button'
  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core/Button')) {
    buttonLocalName = getDefaultImportName(imp)
    importNodesToRemove.push(imp)
  }

  // Named import from barrel: import { Button } from '@material-ui/core'
  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core')) {
    const localName = getNamedImportLocalName(imp, 'Button')
    if (localName) {
      buttonLocalName = localName
      const allSpecifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
      if (allSpecifiers.length <= 1) {
        importNodesToRemove.push(imp)
      } else {
        importSpecifiersToRemove.set(imp, ['Button'])
      }
    }
  }

  return { buttonLocalName, importNodesToRemove, importSpecifiersToRemove }
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
  const sortedNames = [...names].sort()

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
    } else {
      edits.push(
        existingImport.replace(`${existingImport.text()}\nimport { ${sortedNames.join(', ')} } from '${BUI_SOURCE}';`),
      )
      migrationMetric.increment({ action: 'import-added' })
    }
    return false
  }

  const buiImport = `import { ${sortedNames.join(', ')} } from '${BUI_SOURCE}';`
  const removableIds = new Set(importNodesToRemove.map((imp) => imp.id()))
  const allImports = rootNode.findAll({ rule: { kind: 'import_statement' } })
  const anchorImport = [...allImports].reverse().find((imp) => !removableIds.has(imp.id())) ?? null

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

function isPropDynamic(opening: SgNode<TSX>, propName: string): boolean {
  const attr = getPropAttr(opening, propName)
  if (!attr) {
    return false
  }
  return attr.find({ rule: { kind: 'jsx_expression' } }) !== null
}

function isSimpleOnClick(attr: SgNode<TSX>): boolean {
  const expr = attr.find({ rule: { kind: 'jsx_expression' } })
  if (!expr) {
    return false
  }
  const children: SgNode<TSX>[] = []
  for (const child of expr.children()) {
    if (child.kind() !== '{' && child.kind() !== '}') {
      children.push(child)
    }
  }
  if (children.length !== 1) {
    return false
  }
  const [onlyChild] = children
  if (!onlyChild) {
    return false
  }
  // Identifier handler: onClick={handleSave}
  if (onlyChild.is('identifier')) {
    return true
  }
  // Arrow/function that does not reference the event parameter
  if (onlyChild.kind() === 'arrow_function' || onlyChild.kind() === 'function_expression') {
    return !onlyChild.text().includes('event') && !/\(\s*e\s*[,)]/.test(onlyChild.text())
  }
  return false
}

function transformButtonElements(
  rootNode: SgNode<TSX>,
  buttonLocalName: string,
  edits: Edit[],
): { preserveImport: boolean; migrated: boolean; buiNames: Set<string> } {
  let preserveImport = false
  let migrated = false
  const buiNames = new Set<string>()
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
    if (name !== buttonLocalName) {
      continue
    }

    // Check for TODO-triggering props
    let needsTodo = false
    const todoReasons: string[] = []

    for (const prop of TODO_PROPS) {
      if (hasProp(opening, prop)) {
        needsTodo = true
        todoReasons.push(prop)
      }
    }

    // Dynamic variant — cannot map deterministically
    if (isPropDynamic(opening, 'variant')) {
      needsTodo = true
      todoReasons.push('dynamic-variant')
    }

    // Non-default color implies semantic intent
    const colorValue = getPropStringValue(opening, 'color')
    if (colorValue && colorValue !== 'primary' && colorValue !== 'default') {
      needsTodo = true
      todoReasons.push(`color-${colorValue}`)
    }
    if (isPropDynamic(opening, 'color')) {
      needsTodo = true
      todoReasons.push('dynamic-color')
    }

    // Complex onClick that cannot be rewritten to onPress
    const onClickAttr = getPropAttr(opening, 'onClick')
    if (onClickAttr && !isSimpleOnClick(onClickAttr)) {
      needsTodo = true
      todoReasons.push('complex-onClick')
    }

    if (needsTodo) {
      preserveImport = true
      edits.push(
        el.replace(
          withTodoComment(
            `{/* TODO(backstage-codemod): verify Button intent manually (${todoReasons.join(', ')}) */}`,
            el.text(),
          ),
        ),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: todoReasons.join(', ') })
      continue
    }

    const hasHref = hasProp(opening, 'href')
    const componentName = hasHref ? 'ButtonLink' : 'Button'

    // Build new props
    const newProps: string[] = []

    // Map variant (outlined → secondary is intentional; tracked via metric + recipe docs).
    // MUI default is text; BUI default is primary — emit tertiary when omitted.
    const variantValue = getPropStringValue(opening, 'variant')
    if (variantValue) {
      const buiVariant = VARIANT_MAP[variantValue]
      if (buiVariant) {
        newProps.push(`variant="${buiVariant}"`)
        if (variantValue === 'outlined') {
          migrationMetric.increment({ action: 'outlined-to-secondary' })
        }
      } else {
        // Unknown static variant — keep as-is with TODO
        preserveImport = true
        edits.push(
          el.replace(
            withTodoComment(
              '{/* TODO(backstage-codemod): verify Button intent manually (unknown-variant) */}',
              el.text(),
            ),
          ),
        )
        migrationMetric.increment({ action: 'todo-inserted', reason: 'unknown-variant' })
        continue
      }
    } else if (!isPropDynamic(opening, 'variant')) {
      newProps.push('variant="tertiary"')
    }

    // Map disabled → isDisabled
    const disabledAttr = getPropAttr(opening, 'disabled')
    if (disabledAttr) {
      const exprNode = disabledAttr.find({ rule: { kind: 'jsx_expression' } })
      if (exprNode) {
        newProps.push(`isDisabled=${exprNode.text()}`)
      } else {
        newProps.push('isDisabled')
      }
    }

    const handledProps = new Set(['variant', 'disabled', 'color', 'onClick', 'startIcon', 'endIcon'])
    if (onClickAttr) {
      const raw = getPropRawValue(opening, 'onClick')
      if (raw) {
        newProps.push(`onPress=${raw}`)
        migrationMetric.increment({ action: 'onClick-to-onPress' })
      }
    }

    for (const [from, to] of Object.entries(ICON_PROP_RENAMES)) {
      const raw = getPropRawValue(opening, from)
      if (raw) {
        newProps.push(`${to}=${raw}`)
        handledProps.add(from)
        migrationMetric.increment({ action: 'prop-renamed', from, to })
      }
    }

    // Preserve remaining safe props (including href for ButtonLink)
    const allAttrs = opening.findAll({ rule: { kind: 'jsx_attribute' } })
    for (const attr of allAttrs) {
      const propIdent = attr.find({ rule: { kind: 'property_identifier' } })
      if (!propIdent) {
        continue
      }
      const propName = propIdent.text()
      if (handledProps.has(propName)) {
        continue
      }
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

    if (isSelfClosing) {
      edits.push(el.replace(`<${componentName}${propsStr} />`))
    } else {
      const children = el
        .children()
        .filter((c) => c.kind() !== 'jsx_opening_element' && c.kind() !== 'jsx_closing_element')
        .map((c) => c.text())
        .join('')
      edits.push(el.replace(`<${componentName}${propsStr}>${children}</${componentName}>`))
    }

    buiNames.add(componentName)
    migrated = true
    migrationMetric.increment({
      action: hasHref ? 'button-link-migrated' : 'button-migrated',
      variant: variantValue ?? 'default',
    })
  }

  return { preserveImport, migrated, buiNames }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { buttonLocalName, importNodesToRemove, importSpecifiersToRemove } = collectButtonImports(rootNode)

  if (!buttonLocalName) {
    return null
  }

  const { preserveImport, migrated, buiNames } = transformButtonElements(rootNode, buttonLocalName, edits)

  let replacedImport = false
  if (migrated) {
    replacedImport = addBuiImport(rootNode, [...buiNames], importNodesToRemove, edits)
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
