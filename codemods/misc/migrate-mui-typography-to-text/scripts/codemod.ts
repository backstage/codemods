import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-typography-to-text')

// MUI Typography variant → BUI Text variant
const VARIANT_MAP: Record<string, string> = {
  h1: 'title-large',
  h2: 'title-small',
  h3: 'subtitle',
  h4: 'body-small',
  h5: 'caption',
  h6: 'caption',
  subtitle1: 'subtitle',
  subtitle2: 'subtitle',
  body1: 'body',
  body2: 'body-small',
  caption: 'caption',
  overline: 'caption',
  button: 'body',
}

// MUI color prop → BUI Text color prop
const COLOR_MAP: Record<string, string> = {
  textPrimary: 'primary',
  textSecondary: 'secondary',
  primary: 'primary',
  secondary: 'secondary',
  error: 'danger',
  inherit: 'inherit',
}

const BUI_SOURCE = '@backstage/ui'

// Component names we target
const TARGET_COMPONENTS = new Set(['Typography', 'DialogContentText'])

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

interface ImportCollectionResult {
  localNames: Map<string, string>
  importNodesToRemove: SgNode<TSX>[]
  importSpecifiersToRemove: Map<SgNode<TSX>, string[]>
}

function collectTypographyImports(rootNode: SgNode<TSX>): ImportCollectionResult {
  const localNames = new Map<string, string>()
  const importNodesToRemove: SgNode<TSX>[] = []
  const importSpecifiersToRemove = new Map<SgNode<TSX>, string[]>()

  // Default import: import Typography from '@material-ui/core/Typography'
  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core/Typography')) {
    const name = getDefaultImportName(imp)
    if (name) {
      localNames.set(name, 'Typography')
    }
    importNodesToRemove.push(imp)
  }

  // Default import: import DialogContentText from '@material-ui/core/DialogContentText'
  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core/DialogContentText')) {
    const name = getDefaultImportName(imp)
    if (name) {
      localNames.set(name, 'DialogContentText')
    }
    importNodesToRemove.push(imp)
  }

  // Named imports from barrel: import { Typography, DialogContentText } from '@material-ui/core'
  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core')) {
    let foundCount = 0

    for (const componentName of TARGET_COMPONENTS) {
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
      } else {
        const toRemove: string[] = []
        for (const componentName of TARGET_COMPONENTS) {
          if (getNamedImportLocalName(imp, componentName)) {
            toRemove.push(componentName)
          }
        }
        importSpecifiersToRemove.set(imp, toRemove)
      }
    }
  }

  return { localNames, importNodesToRemove, importSpecifiersToRemove }
}

function pruneBarrelImportSpecifiers(
  imp: SgNode<TSX>,
  namesToRemove: string[],
  edits: Edit[],
  appendTextImport = false,
): void {
  const remainingSpecs = imp.findAll({ rule: { kind: 'import_specifier' } }).filter((spec) => {
    const importedName = getImportedName(spec)
    return importedName !== null && !namesToRemove.includes(importedName)
  })

  if (remainingSpecs.length === 0) {
    edits.push(imp.replace(''))
  } else {
    const specTexts = remainingSpecs.map((spec) => spec.text()).join(', ')
    let replacement = `import { ${specTexts} } from '@material-ui/core';`
    if (appendTextImport) {
      replacement += `\nimport { Text } from '${BUI_SOURCE}';`
      migrationMetric.increment({ action: 'import-added' })
    }
    edits.push(imp.replace(replacement))
  }
  migrationMetric.increment({ action: 'import-removed' })
}

function addTextToBuiImport(rootNode: SgNode<TSX>, importNodesToRemove: SgNode<TSX>[], edits: Edit[]): void {
  const existingImports = findImportStatementsFrom(rootNode, BUI_SOURCE)
  const existingImport = existingImports[0] ?? null

  if (existingImport) {
    const specifiers = existingImport.findAll({ rule: { kind: 'import_specifier' } })
    let hasText = false
    for (const spec of specifiers) {
      const idents = spec.findAll({
        rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] },
      })
      if (idents[0]?.text() === 'Text') {
        hasText = true
      }
    }
    if (!hasText) {
      const namedImports = existingImport.find({ rule: { kind: 'named_imports' } })
      if (namedImports) {
        const text = namedImports.text()
        const inner = text.slice(1, -1).trim()
        const names = inner
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean)
        names.push('Text')
        names.sort()
        edits.push(namedImports.replace(`{ ${names.join(', ')} }`))
        migrationMetric.increment({ action: 'import-merged' })
      }
    }
    return
  }

  const removeIds = new Set(importNodesToRemove.map((imp) => imp.id()))
  const allImports = rootNode.findAll({ rule: { kind: 'import_statement' } })
  const anchorImport = [...allImports].reverse().find((imp) => !removeIds.has(imp.id())) ?? null

  if (importNodesToRemove.length === 1 && !anchorImport) {
    edits.push(importNodesToRemove[0]!.replace(`import { Text } from '${BUI_SOURCE}';`))
    migrationMetric.increment({ action: 'import-removed' })
  } else {
    const firstImport = allImports[0]
    if (firstImport) {
      edits.push(firstImport.replace(`import { Text } from '${BUI_SOURCE}';\n${firstImport.text()}`))
    } else if (anchorImport) {
      edits.push(anchorImport.replace(`${anchorImport.text()}\nimport { Text } from '${BUI_SOURCE}';`))
    }
  }

  migrationMetric.increment({ action: 'import-added' })
}

function getAttrStringValue(
  opening: SgNode<TSX>,
  propName: string,
): { value: string | null; isDynamic: boolean; attrNode: SgNode<TSX> | null } {
  const attr = opening.find({
    rule: {
      kind: 'jsx_attribute',
      has: {
        kind: 'property_identifier',
        regex: `^${escapeRegex(propName)}$`,
      },
    },
  })

  if (!attr) {
    return { value: null, isDynamic: false, attrNode: null }
  }

  const stringNode = attr.find({ rule: { kind: 'string' } })
  if (stringNode) {
    const frag = stringNode.find({ rule: { kind: 'string_fragment' } })
    return { value: frag?.text() ?? null, isDynamic: false, attrNode: attr }
  }

  const exprNode = attr.find({ rule: { kind: 'jsx_expression' } })
  if (exprNode) {
    return { value: exprNode.text(), isDynamic: true, attrNode: attr }
  }

  // Boolean attribute (e.g. gutterBottom without value)
  return { value: '', isDynamic: false, attrNode: attr }
}

function getOpeningElement(el: SgNode<TSX>): SgNode<TSX> | null {
  if (el.is('jsx_self_closing_element')) {
    return el
  }
  return el.child(0)
}

function getElementName(opening: SgNode<TSX>): string | null {
  // The tag name is the first named child that is an identifier
  for (const child of opening.children()) {
    if (child.is('identifier') || child.is('member_expression')) {
      return child.text()
    }
  }
  return null
}

function transformTypographyElements(
  rootNode: SgNode<TSX>,
  localNames: Map<string, string>,
  edits: Edit[],
  preservedLocalNames: Set<string>,
): boolean {
  let migrated = false
  const jsxElements = rootNode.findAll({
    rule: {
      any: [{ kind: 'jsx_element' }, { kind: 'jsx_self_closing_element' }],
    },
  })

  for (const el of jsxElements) {
    const isSelfClosing = el.is('jsx_self_closing_element')
    const opening = getOpeningElement(el)
    if (!opening) {
      continue
    }

    const componentLocalName = getElementName(opening)
    if (!componentLocalName || !localNames.has(componentLocalName)) {
      continue
    }

    // Collect props
    const { value: variantValue, isDynamic: variantDynamic } = getAttrStringValue(opening, 'variant')
    const { value: colorValue, isDynamic: colorDynamic } = getAttrStringValue(opening, 'color')
    const { value: componentValue, isDynamic: componentDynamic } = getAttrStringValue(opening, 'component')
    const { attrNode: gutterBottomAttr } = getAttrStringValue(opening, 'gutterBottom')

    // Check for unmappable dynamic values
    if (variantDynamic || colorDynamic) {
      preservedLocalNames.add(componentLocalName)
      edits.push(el.replace(`{/* TODO(backstage-codemod): verify Text variant manually */}\n${el.text()}`))
      migrationMetric.increment({ action: 'todo-inserted', reason: 'dynamic-props' })
      continue
    }

    // Map variant
    let buiVariant: string | null = null
    let needsTodo = false
    if (variantValue) {
      buiVariant = VARIANT_MAP[variantValue] ?? null
      if (!buiVariant) {
        needsTodo = true
      }
    }

    // Map color
    let buiColor: string | null = null
    if (colorValue) {
      buiColor = COLOR_MAP[colorValue] ?? null
      if (!buiColor) {
        needsTodo = true
      }
    }

    if (needsTodo) {
      preservedLocalNames.add(componentLocalName)
      edits.push(el.replace(`{/* TODO(backstage-codemod): verify Text variant manually */}\n${el.text()}`))
      migrationMetric.increment({ action: 'todo-inserted', reason: 'unmapped-variant-or-color' })
      continue
    }

    // Build new props
    const newProps: string[] = []
    if (buiVariant) {
      newProps.push(`variant="${buiVariant}"`)
    }
    if (buiColor) {
      newProps.push(`color="${buiColor}"`)
    }
    // Convert component → as
    if (componentValue && !componentDynamic) {
      newProps.push(`as="${componentValue}"`)
    } else if (componentDynamic && componentValue) {
      newProps.push(`as={${componentValue.slice(1, -1)}}`)
    }

    // Collect remaining props we haven't handled
    const handledProps = new Set(['variant', 'color', 'component', 'gutterBottom'])
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
      // Preserve any unhandled prop as-is
      newProps.push(attr.text())
    }

    // Also preserve spread attributes
    const spreadAttrs = opening.findAll({ rule: { kind: 'jsx_expression' } })
    for (const spread of spreadAttrs) {
      if (spread.text().startsWith('{...')) {
        newProps.push(spread.text())
      }
    }

    const propsStr = newProps.length > 0 ? ` ${newProps.join(' ')}` : ''

    if (isSelfClosing) {
      edits.push(el.replace(`<Text${propsStr} />`))
    } else {
      // Preserve children via AST traversal
      const children = el
        .children()
        .filter((c) => c.kind() !== 'jsx_opening_element' && c.kind() !== 'jsx_closing_element')
        .map((c) => c.text())
        .join('')

      edits.push(el.replace(`<Text${propsStr}>${children}</Text>`))
    }

    if (gutterBottomAttr) {
      migrationMetric.increment({ action: 'gutterBottom-dropped' })
    }
    migrated = true
    migrationMetric.increment({
      action: 'typography-migrated',
      component: localNames.get(componentLocalName) ?? componentLocalName,
    })
  }

  return migrated
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { localNames, importNodesToRemove, importSpecifiersToRemove } = collectTypographyImports(rootNode)

  if (localNames.size === 0) {
    return null
  }

  const preservedLocalNames = new Set<string>()
  const migrated = transformTypographyElements(rootNode, localNames, edits, preservedLocalNames)

  for (const imp of importNodesToRemove) {
    const defaultName = getDefaultImportName(imp)
    if (defaultName && preservedLocalNames.has(defaultName)) {
      continue
    }
    if (
      migrated &&
      importNodesToRemove.length === 1 &&
      findImportStatementsFrom(rootNode, BUI_SOURCE).length === 0 &&
      imp.id() === importNodesToRemove[0]?.id()
    ) {
      continue
    }
    edits.push(imp.replace(''))
    migrationMetric.increment({ action: 'import-removed' })
  }

  let addedTextViaBarrelPrune = false

  for (const [imp, namesToRemove] of importSpecifiersToRemove) {
    const removableNames = namesToRemove.filter((componentName) => {
      const localName = getNamedImportLocalName(imp, componentName)
      return localName === null || !preservedLocalNames.has(localName)
    })
    if (removableNames.length === 0) {
      continue
    }
    const appendTextImport = migrated && findImportStatementsFrom(rootNode, BUI_SOURCE).length === 0
    if (appendTextImport) {
      addedTextViaBarrelPrune = true
    }
    pruneBarrelImportSpecifiers(imp, removableNames, edits, appendTextImport)
  }

  if (migrated && !addedTextViaBarrelPrune) {
    addTextToBuiImport(rootNode, importNodesToRemove, edits)
  }

  return edits.length > 0 ? rootNode.commitEdits(edits) : null
}

export default transform
