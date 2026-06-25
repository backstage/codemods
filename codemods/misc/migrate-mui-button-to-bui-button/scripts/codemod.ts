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
const TODO_PROPS = new Set([
  'startIcon',
  'endIcon',
  'href',
  'component',
  'fullWidth',
  'disableElevation',
  'disableRipple',
  'disableFocusRipple',
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

function addButtonToBuiImport(rootNode: SgNode<TSX>, importNodesToRemove: SgNode<TSX>[], edits: Edit[]): boolean {
  const existingImports = findImportStatementsFrom(rootNode, BUI_SOURCE)
  const existingImport = existingImports[0] ?? null

  if (existingImport) {
    const specifiers = existingImport.findAll({ rule: { kind: 'import_specifier' } })
    let hasButton = false
    for (const spec of specifiers) {
      const idents = spec.findAll({
        rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] },
      })
      if (idents[0]?.text() === 'Button') {
        hasButton = true
      }
    }
    if (!hasButton) {
      const namedImports = existingImport.find({ rule: { kind: 'named_imports' } })
      if (namedImports) {
        const text = namedImports.text()
        const inner = text.slice(1, -1).trim()
        const names = inner
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean)
        names.push('Button')
        names.sort()
        edits.push(namedImports.replace(`{ ${names.join(', ')} }`))
        migrationMetric.increment({ action: 'import-merged' })
      } else {
        edits.push(existingImport.replace(`${existingImport.text()}\nimport { Button } from '${BUI_SOURCE}';`))
        migrationMetric.increment({ action: 'import-added' })
      }
    }
    return false
  }

  const removableIds = new Set(importNodesToRemove.map((imp) => imp.id()))
  const allImports = rootNode.findAll({ rule: { kind: 'import_statement' } })
  const anchorImport = [...allImports].reverse().find((imp) => !removableIds.has(imp.id())) ?? null

  if (anchorImport) {
    edits.push(anchorImport.replace(`${anchorImport.text()}\nimport { Button } from '${BUI_SOURCE}';`))
  } else if (importNodesToRemove.length > 0) {
    const [importNode] = importNodesToRemove
    if (importNode) {
      edits.push(importNode.replace(`import { Button } from '${BUI_SOURCE}';`))
      migrationMetric.increment({ action: 'import-added' })
      return true
    }
  } else if (allImports.length > 0) {
    const lastImport = allImports.at(-1)
    if (lastImport) {
      edits.push(lastImport.replace(`${lastImport.text()}\nimport { Button } from '${BUI_SOURCE}';`))
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

function isPropDynamic(opening: SgNode<TSX>, propName: string): boolean {
  const attr = getPropAttr(opening, propName)
  if (!attr) {
    return false
  }
  return attr.find({ rule: { kind: 'jsx_expression' } }) !== null
}

function transformButtonElements(
  rootNode: SgNode<TSX>,
  buttonLocalName: string,
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

    // Build new props
    const newProps: string[] = []

    // Map variant
    const variantValue = getPropStringValue(opening, 'variant')
    if (variantValue) {
      const buiVariant = VARIANT_MAP[variantValue]
      if (buiVariant) {
        newProps.push(`variant="${buiVariant}"`)
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
    }

    // Map disabled → isDisabled
    const disabledAttr = getPropAttr(opening, 'disabled')
    if (disabledAttr) {
      const exprNode = disabledAttr.find({ rule: { kind: 'jsx_expression' } })
      if (exprNode) {
        // disabled={expr} → isDisabled={expr}
        newProps.push(`isDisabled=${exprNode.text()}`)
      } else {
        // Boolean shorthand: disabled → isDisabled
        newProps.push('isDisabled')
      }
    }

    // Preserve all other safe props as-is (onClick, className, etc.)
    const handledProps = new Set(['variant', 'disabled', 'color'])
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
      edits.push(el.replace(`<Button${propsStr} />`))
    } else {
      // Preserve children via AST traversal
      const children = el
        .children()
        .filter((c) => c.kind() !== 'jsx_opening_element' && c.kind() !== 'jsx_closing_element')
        .map((c) => c.text())
        .join('')
      edits.push(el.replace(`<Button${propsStr}>${children}</Button>`))
    }

    migrated = true
    migrationMetric.increment({ action: 'button-migrated', variant: variantValue ?? 'default' })
  }

  return { preserveImport, migrated }
}

const transform: Codemod<TSX> = (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { buttonLocalName, importNodesToRemove, importSpecifiersToRemove } = collectButtonImports(rootNode)

  if (!buttonLocalName) {
    return Promise.resolve(null)
  }

  const { preserveImport, migrated } = transformButtonElements(rootNode, buttonLocalName, edits)

  let replacedImport = false
  if (migrated) {
    replacedImport = addButtonToBuiImport(rootNode, importNodesToRemove, edits)
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

  return Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
}

export default transform
