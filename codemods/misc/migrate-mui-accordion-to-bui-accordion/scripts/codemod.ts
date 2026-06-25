import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-accordion-to-bui-accordion')

const BUI_SOURCE = '@backstage/ui'
const MUI_BARREL_SOURCE = '@material-ui/core'

const MUI_ACCORDION_COMPONENTS = ['Accordion', 'AccordionSummary', 'AccordionDetails', 'AccordionActions']

/** Props on Accordion that trigger a TODO — controlled state or complex behavior. */
const ACCORDION_TODO_PROPS = new Set([
  'expanded',
  'onChange',
  'defaultExpanded',
  'TransitionComponent',
  'TransitionProps',
  'classes',
  'square',
])

/** Props on AccordionSummary that trigger a TODO. */
const SUMMARY_TODO_PROPS = new Set(['classes', 'IconButtonProps'])

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function wrapWithTodo(todoComment: string, elementText: string): string {
  return `<>
${todoComment}
${elementText}
</>`
}

function rebuildImportWithout(importStmt: SgNode<TSX>, specifiersToRemove: Set<string>): string {
  const specifiers = importStmt.findAll({ rule: { kind: 'import_specifier' } })
  const remaining: string[] = []
  for (const spec of specifiers) {
    const identifiers = spec.findAll({
      rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] },
    })
    const importedName = identifiers[0]?.text()
    if (importedName && !specifiersToRemove.has(importedName)) {
      remaining.push(spec.text())
    }
  }

  if (remaining.length === 0) {
    return ''
  }

  const sourceNode = importStmt.find({ rule: { kind: 'string' } })
  const sourceText = sourceNode?.text() ?? `'${MUI_BARREL_SOURCE}'`

  if (remaining.length <= 2) {
    return `import { ${remaining.join(', ')} } from ${sourceText};`
  }
  return `import {\n  ${remaining.join(',\n  ')},\n} from ${sourceText};`
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

interface AccordionImports {
  localNames: Map<string, string>
  importNodesToRemove: SgNode<TSX>[]
  barrelImportsToPrune: { imp: SgNode<TSX>; namesToRemove: Set<string> }[]
}

function collectAccordionImports(rootNode: SgNode<TSX>): AccordionImports {
  const localNames = new Map<string, string>()
  const importNodesToRemove: SgNode<TSX>[] = []
  const barrelImportsToPrune: { imp: SgNode<TSX>; namesToRemove: Set<string> }[] = []

  for (const componentName of MUI_ACCORDION_COMPONENTS) {
    for (const imp of findImportStatementsFrom(rootNode, `@material-ui/core/${componentName}`)) {
      const name = getDefaultImportName(imp)
      if (name) {
        localNames.set(name, componentName)
      }
      importNodesToRemove.push(imp)
    }
  }

  for (const imp of findImportStatementsFrom(rootNode, MUI_BARREL_SOURCE)) {
    const foundNames = new Set<string>()
    for (const componentName of MUI_ACCORDION_COMPONENTS) {
      const localName = getNamedImportLocalName(imp, componentName)
      if (localName) {
        localNames.set(localName, componentName)
        foundNames.add(componentName)
      }
    }
    if (foundNames.size > 0) {
      const allSpecifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
      if (foundNames.size >= allSpecifiers.length) {
        importNodesToRemove.push(imp)
      } else {
        barrelImportsToPrune.push({ imp, namesToRemove: foundNames })
      }
    }
  }

  return { localNames, importNodesToRemove, barrelImportsToPrune }
}

function addBuiImport(
  rootNode: SgNode<TSX>,
  importNodesToRemove: SgNode<TSX>[],
  names: string[],
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
    }
    return false
  }

  const sortedNames = [...names].sort()
  const removableIds = new Set(importNodesToRemove.map((imp) => imp.id()))
  const allImports = rootNode.findAll({ rule: { kind: 'import_statement' } })
  const anchorImport = [...allImports].reverse().find((imp) => !removableIds.has(imp.id())) ?? null

  if (anchorImport) {
    edits.push(
      anchorImport.replace(`${anchorImport.text()}\nimport { ${sortedNames.join(', ')} } from '${BUI_SOURCE}';`),
    )
  } else if (importNodesToRemove.length >= 1) {
    const [importNode] = importNodesToRemove
    if (importNode) {
      edits.push(importNode.replace(`import { ${sortedNames.join(', ')} } from '${BUI_SOURCE}';`))
      migrationMetric.increment({ action: 'import-added' })
      return true
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

function getChildContent(element: SgNode<TSX>): string {
  return element
    .children()
    .filter((child) => child.kind() !== 'jsx_opening_element' && child.kind() !== 'jsx_closing_element')
    .map((child) => child.text())
    .join('')
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

function getJsxChildren(element: SgNode<TSX>): SgNode<TSX>[] {
  const children: SgNode<TSX>[] = []
  for (const child of element.children()) {
    const kind = child.kind()
    if (kind === 'jsx_opening_element' || kind === 'jsx_closing_element') {
      continue
    }
    children.push(child)
  }
  return children
}

/**
 * Extract the plain-text title from an AccordionSummary element.
 * Returns the title string if simple text, or null if complex content.
 */
function extractSummaryTitle(summaryElement: SgNode<TSX>): { title: string | null; isComplex: boolean } {
  const children = getNonWhitespaceChildren(summaryElement)

  if (children.length === 0) {
    return { title: null, isComplex: false }
  }

  // Single text node
  const [firstChild] = children
  if (children.length === 1 && firstChild?.kind() === 'jsx_text') {
    const text = firstChild.text().trim()
    return { title: text.length > 0 ? text : null, isComplex: false }
  }

  // Multiple text-only nodes (whitespace-separated)
  if (children.every((c) => c.kind() === 'jsx_text')) {
    const text = children
      .map((c) => c.text().trim())
      .filter(Boolean)
      .join(' ')
    return { title: text.length > 0 ? text : null, isComplex: false }
  }

  // Single Typography element wrapping text
  if (children.length === 1) {
    const child = firstChild
    if (child?.kind() === 'jsx_element') {
      const innerChildren = getNonWhitespaceChildren(child)
      const [innerChild] = innerChildren
      if (innerChildren.length === 1 && innerChild?.kind() === 'jsx_text') {
        const text = innerChild.text().trim()
        if (text.length > 0) {
          return { title: text, isComplex: false }
        }
      }
    }
  }

  // Anything else is complex
  return { title: null, isComplex: true }
}

function transformAccordionChildren(accordionElement: SgNode<TSX>, localNames: Map<string, string>): string | null {
  const children = getJsxChildren(accordionElement)
  const parts: string[] = []

  const summaryLocalName = [...localNames.entries()].find(([, v]) => v === 'AccordionSummary')?.[0] ?? null
  const detailsLocalName = [...localNames.entries()].find(([, v]) => v === 'AccordionDetails')?.[0] ?? null
  const actionsLocalName = [...localNames.entries()].find(([, v]) => v === 'AccordionActions')?.[0] ?? null

  for (const child of children) {
    const kind = child.kind()

    if (kind === 'jsx_text') {
      parts.push(child.text())
      continue
    }

    if (kind === 'jsx_element') {
      const childOpening = child.child(0)
      if (!childOpening) {
        parts.push(child.text())
        continue
      }

      const childName = getElementName(childOpening)

      // AccordionSummary → AccordionTrigger
      if (childName && childName === summaryLocalName) {
        // Check for TODO-triggering summary props
        let summaryNeedsTodo = false
        for (const prop of SUMMARY_TODO_PROPS) {
          if (hasProp(childOpening, prop)) {
            summaryNeedsTodo = true
            break
          }
        }

        if (summaryNeedsTodo) {
          return null // signal parent to TODO the whole accordion
        }

        const { title, isComplex } = extractSummaryTitle(child)

        if (isComplex || !title) {
          return null // signal parent to TODO the whole accordion
        }

        // Drop expandIcon — BUI handles its own icon
        if (hasProp(childOpening, 'expandIcon')) {
          migrationMetric.increment({ action: 'expandIcon-dropped' })
        }

        parts.push(`<AccordionTrigger title={${JSON.stringify(title)}} />`)
        migrationMetric.increment({ action: 'summary-migrated' })
        continue
      }

      // AccordionDetails → AccordionPanel
      if (childName && childName === detailsLocalName) {
        const innerContent = getChildContent(child)
        parts.push(`<AccordionPanel>${innerContent}</AccordionPanel>`)
        migrationMetric.increment({ action: 'details-migrated' })
        continue
      }

      // AccordionActions → TODO (no BUI equivalent)
      if (childName && childName === actionsLocalName) {
        return null // signal parent to TODO the whole accordion
      }
    }

    // Preserve anything else as-is
    parts.push(child.text())
  }

  return parts.join('')
}

function transformAccordionElements(
  rootNode: SgNode<TSX>,
  localNames: Map<string, string>,
  edits: Edit[],
): { preserveImport: boolean; migrated: boolean } {
  let preserveImport = false
  let migrated = false
  const accordionLocalName = [...localNames.entries()].find(([, v]) => v === 'Accordion')?.[0]
  if (!accordionLocalName) {
    return { preserveImport: false, migrated: false }
  }

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
    if (name !== accordionLocalName) {
      continue
    }

    // Check for TODO-triggering props on Accordion
    let needsTodo = false
    const todoReasons: string[] = []
    for (const prop of ACCORDION_TODO_PROPS) {
      if (hasProp(opening, prop)) {
        needsTodo = true
        todoReasons.push(prop)
      }
    }

    if (needsTodo) {
      preserveImport = true
      edits.push(
        el.replace(
          wrapWithTodo(
            `{/* TODO(backstage-codemod): finish accordion migration manually (${todoReasons.join(', ')}) */}`,
            el.text(),
          ),
        ),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: todoReasons.join(', ') })
      continue
    }

    if (isSelfClosing) {
      edits.push(el.replace('<Accordion />'))
      migrated = true
      migrationMetric.increment({ action: 'accordion-migrated' })
      continue
    }

    // Transform children
    const transformedChildren = transformAccordionChildren(el, localNames)

    if (transformedChildren === null) {
      // Complex content — TODO the whole thing
      preserveImport = true
      edits.push(
        el.replace(
          wrapWithTodo(
            `{/* TODO(backstage-codemod): finish accordion migration manually (complex-summary) */}`,
            el.text(),
          ),
        ),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-summary' })
      continue
    }

    edits.push(el.replace(`<Accordion>${transformedChildren}</Accordion>`))
    migrated = true
    migrationMetric.increment({ action: 'accordion-migrated' })
  }

  return { preserveImport, migrated }
}

const transform: Codemod<TSX> = (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { localNames, importNodesToRemove, barrelImportsToPrune } = collectAccordionImports(rootNode)

  if (localNames.size === 0) {
    return Promise.resolve(null)
  }

  const { preserveImport, migrated } = transformAccordionElements(rootNode, localNames, edits)

  const buiNames = new Set<string>()
  if (migrated) {
    buiNames.add('Accordion')
    for (const [, muiName] of localNames) {
      if (muiName === 'AccordionSummary') {
        buiNames.add('AccordionTrigger')
      }
      if (muiName === 'AccordionDetails') {
        buiNames.add('AccordionPanel')
      }
    }
  }

  let replacedImport = false
  if (buiNames.size > 0) {
    replacedImport = addBuiImport(rootNode, importNodesToRemove, [...buiNames], edits)
  }

  if (!preserveImport) {
    for (const { imp, namesToRemove } of barrelImportsToPrune) {
      edits.push(imp.replace(rebuildImportWithout(imp, namesToRemove)))
      migrationMetric.increment({ action: 'import-pruned' })
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

  return Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
}

export default transform
