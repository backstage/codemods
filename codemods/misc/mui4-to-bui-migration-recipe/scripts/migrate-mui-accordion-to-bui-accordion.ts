import { addImport, getAllImports, getImport, listImports, removeImport } from '@jssg/utils/javascript/imports'
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

function withTodoComment(comment: string, elementText: string): string {
  return `<>
  ${comment}
  ${elementText}
</>`
}

interface AccordionImports {
  localNames: Map<string, string>
  defaultSources: string[]
  barrelNames: string[]
}

function collectAccordionImports(rootNode: SgNode<TSX, 'program'>): AccordionImports {
  const localNames = new Map<string, string>()
  const defaultSources: string[] = []
  const barrelNames: string[] = []

  for (const componentName of MUI_ACCORDION_COMPONENTS) {
    const defaultImport = getImport(rootNode, { type: 'default', from: `@material-ui/core/${componentName}` })
    if (defaultImport) {
      localNames.set(defaultImport.alias, componentName)
      defaultSources.push(`@material-ui/core/${componentName}`)
    }
    for (const named of getAllImports(rootNode, { type: 'named', name: componentName, from: MUI_BARREL_SOURCE })) {
      localNames.set(named.alias, componentName)
      if (!barrelNames.includes(componentName)) {
        barrelNames.push(componentName)
      }
    }
  }

  return { localNames, defaultSources, barrelNames }
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
  rootNode: SgNode<TSX, 'program'>,
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
          withTodoComment(
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
          withTodoComment(
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

  const { localNames, defaultSources, barrelNames } = collectAccordionImports(rootNode)

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

  if (buiNames.size > 0) {
    const addEdit = addImport(rootNode, {
      type: 'named',
      specifiers: [...buiNames].sort().map((name) => ({ name })),
      from: BUI_SOURCE,
    })
    if (addEdit) {
      edits.push(addEdit)
      const hasBuiNamedImport =
        rootNode.find({
          rule: {
            kind: 'import_statement',
            all: [
              {
                has: {
                  kind: 'string',
                  has: { kind: 'string_fragment', regex: `^${escapeRegex(BUI_SOURCE)}$` },
                },
              },
              { has: { kind: 'import_clause', has: { kind: 'named_imports' } } },
            ],
          },
        }) !== null
      migrationMetric.increment({ action: hasBuiNamedImport ? 'import-merged' : 'import-added' })
    }
  }

  if (!preserveImport) {
    if (barrelNames.length > 0) {
      const barrelRemovedNames = new Set(barrelNames)
      for (const item of listImports(rootNode, { from: MUI_BARREL_SOURCE })) {
        const matching = item.specifiers.filter((spec) => barrelRemovedNames.has(spec.importedName))
        if (matching.length === 0) {
          continue
        }
        if (matching.length >= item.specifiers.length) {
          migrationMetric.increment({ action: 'import-removed' })
        } else {
          migrationMetric.increment({ action: 'import-pruned' })
        }
      }
      const edit = removeImport(rootNode, { type: 'named', specifiers: barrelNames, from: MUI_BARREL_SOURCE })
      if (edit) {
        edits.push(...edit)
      }
    }
    for (const source of defaultSources) {
      const edit = removeImport(rootNode, { type: 'default', from: source })
      if (edit) {
        edits.push(...edit)
        migrationMetric.increment({ action: 'import-removed' })
      }
    }
  }

  return Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
}

export default transform
