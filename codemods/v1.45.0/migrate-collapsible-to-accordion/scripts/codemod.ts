import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-collapsible-to-accordion')

const UI_SOURCE = '@backstage/ui'
const TARGET_IMPORT = 'Collapsible'

const COMPONENT_MAP: Record<string, string> = {
  Root: 'Accordion',
  Trigger: 'AccordionTrigger',
  Panel: 'AccordionPanel',
}

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findImportStatementsFrom(rootNode: SgNode<TSX>, source: string): SgNode<TSX, 'import_statement'>[] {
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
  }) as SgNode<TSX, 'import_statement'>[]
}

function findCollapsibleImport(importStatements: SgNode<TSX, 'import_statement'>[]): string | null {
  for (const imp of importStatements) {
    for (const spec of imp.findAll({ rule: { kind: 'import_specifier' } })) {
      const identifiers = spec.findAll({
        rule: {
          any: [{ kind: 'identifier' }, { kind: 'type_identifier' }],
        },
      })

      const [importedNameNode] = identifiers
      if (!importedNameNode || importedNameNode.text() !== TARGET_IMPORT) {
        continue
      }

      const localNameNode = identifiers[1] ?? importedNameNode
      return localNameNode.text()
    }
  }

  return null
}

function getOpeningElement(el: SgNode<TSX>): SgNode<TSX> | null {
  if (el.is('jsx_self_closing_element')) {
    return el
  }
  if (el.is('jsx_element')) {
    const opening = el.child(0)
    return opening?.is('jsx_opening_element') ? opening : null
  }
  return null
}

function getComponentNameNode(opening: SgNode<TSX>): SgNode<TSX> | null {
  return opening.child(1) ?? null
}

function getMemberSubComponent(nameNode: SgNode<TSX>, localName: string): string | null {
  if (!nameNode.is('member_expression')) {
    return null
  }

  const objNode = nameNode.child(0)
  if (!objNode?.is('identifier') || objNode.text() !== localName) {
    return null
  }

  const propNode = nameNode.find({ rule: { kind: 'property_identifier' } })
  if (!propNode) {
    return null
  }

  const subName = propNode.text()
  if (subName in COMPONENT_MAP) {
    return subName
  }

  return null
}

/**
 * For a JSX element, find the closing tag's member_expression or identifier node.
 */
function getClosingNameNode(el: SgNode<TSX>): SgNode<TSX> | null {
  if (!el.is('jsx_element')) {
    return null
  }
  const children = el.children()
  const last = children.at(-1)
  if (!last?.is('jsx_closing_element')) {
    return null
  }
  return last.child(1) ?? null
}

function findAttr(opening: SgNode<TSX>, propName: string): SgNode<TSX> | null {
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

/**
 * Extract content from a simple render prop:
 * render={(props) => <Button {...props}>Label</Button>}
 * Returns "Label" or null if the pattern is too complex.
 */
function extractSimpleRenderContent(opening: SgNode<TSX>): string | null {
  const renderAttr = findAttr(opening, 'render')
  if (!renderAttr) {
    return null
  }

  const arrowFn = renderAttr.find({ rule: { kind: 'arrow_function' } })
  if (!arrowFn) {
    return null
  }

  // Find the JSX body of the arrow function
  let jsxBody: SgNode<TSX> | null = null
  for (const child of arrowFn.children()) {
    if (child.is('jsx_element') || child.is('jsx_self_closing_element') || child.is('parenthesized_expression')) {
      jsxBody = child
      break
    }
  }

  if (!jsxBody) {
    return null
  }

  if (jsxBody.is('parenthesized_expression')) {
    for (const child of jsxBody.children()) {
      if (child.is('jsx_element') || child.is('jsx_self_closing_element')) {
        jsxBody = child
        break
      }
    }
  }

  if (jsxBody.is('jsx_self_closing_element')) {
    return ''
  }

  if (jsxBody.is('jsx_element')) {
    const children = jsxBody.children()
    if (children.length < 3) {
      return ''
    }

    const [openTag] = children
    const closeTag = children.at(-1)
    if (!openTag?.is('jsx_opening_element') || !closeTag?.is('jsx_closing_element')) {
      return ''
    }

    const innerParts: string[] = []
    for (let i = 1; i < children.length - 1; i++) {
      const child = children[i]
      if (child) {
        innerParts.push(child.text())
      }
    }

    return innerParts.join('').trim()
  }

  return null
}

function transformCollapsibleElements(
  rootNode: SgNode<TSX>,
  fullSource: string,
  localName: string,
  edits: Edit[],
): void {
  const jsxElements = rootNode.findAll({
    rule: {
      any: [{ kind: 'jsx_element' }, { kind: 'jsx_self_closing_element' }],
    },
  })

  for (const el of jsxElements) {
    const opening = getOpeningElement(el)
    if (!opening) {
      continue
    }

    const nameNode = getComponentNameNode(opening)
    if (!nameNode) {
      continue
    }

    const subComponent = getMemberSubComponent(nameNode, localName)
    if (!subComponent) {
      continue
    }

    const newComponentName = COMPONENT_MAP[subComponent]
    if (!newComponentName) {
      continue
    }

    if (subComponent === 'Trigger') {
      handleTriggerMigration(el, opening, nameNode, localName, fullSource, edits)
    } else {
      // Root or Panel: replace name nodes in opening and closing tags
      edits.push(nameNode.replace(newComponentName))
      const closingName = getClosingNameNode(el)
      if (closingName) {
        edits.push(closingName.replace(newComponentName))
      }
      migrationMetric.increment({
        action: 'component-renamed',
        from: `${localName}.${subComponent}`,
        to: newComponentName,
      })
    }
  }
}

function handleTriggerMigration(
  el: SgNode<TSX>,
  opening: SgNode<TSX>,
  nameNode: SgNode<TSX>,
  localName: string,
  fullSource: string,
  edits: Edit[],
): void {
  const newName = 'AccordionTrigger'
  const renderAttr = findAttr(opening, 'render')

  if (!renderAttr) {
    // No render prop — just rename the component name nodes
    edits.push(nameNode.replace(newName))
    const closingName = getClosingNameNode(el)
    if (closingName) {
      edits.push(closingName.replace(newName))
    }
    migrationMetric.increment({ action: 'component-renamed', from: `${localName}.Trigger`, to: newName })
    return
  }

  // Has render prop — try to extract simple content
  const renderContent = extractSimpleRenderContent(opening)

  if (renderContent !== null) {
    // Simple render pattern — replace entire element
    if (renderContent.length > 0) {
      edits.push(el.replace(`<${newName}>${renderContent}</${newName}>`))
    } else {
      edits.push(el.replace(`<${newName} />`))
    }
    migrationMetric.increment({ action: 'trigger-render-migrated', pattern: 'simple' })
  } else {
    // Complex render pattern — rename but add TODO comment
    // Since the render prop is complex, just rename the component and keep the render prop
    // with a TODO comment
    const indent = computeIndent(fullSource, el.range().start.index)
    let newText = el.text()
    const oldMemberExpr = `${localName}.Trigger`
    newText = newText.split(oldMemberExpr).join(newName)
    const comment = '{/* TODO(backstage-codemod): Review Collapsible.Trigger render migration */}'
    edits.push(el.replace(`${comment}\n${indent}${newText}`))
    migrationMetric.increment({ action: 'trigger-render-migrated', pattern: 'complex-todo' })
  }
}

function computeIndent(fullSource: string, startIndex: number): string {
  let lineStart = startIndex
  while (lineStart > 0 && fullSource.charAt(lineStart - 1) !== '\n') {
    lineStart--
  }
  return fullSource.slice(lineStart, startIndex)
}

function replaceImport(
  phase1Source: string,
  localName: string,
  importStatements: SgNode<TSX, 'import_statement'>[],
): string {
  // Use AST-located import positions for a targeted replacement instead of a
  // whole-file regex that could accidentally rewrite comments or identifiers.
  for (const imp of importStatements) {
    for (const spec of imp.findAll({ rule: { kind: 'import_specifier' } })) {
      const identifiers = spec.findAll({
        rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] },
      })
      const [importedNameNode] = identifiers
      if (!importedNameNode || importedNameNode.text() !== TARGET_IMPORT) {
        continue
      }

      // Compute the byte offset of the specifier in the original source, then
      // apply the same delta to phase1Source (AST edits only touched JSX, not
      // the import line, so the import text is at the same position).
      const specStart = spec.range().start.index
      const specEnd = spec.range().end.index

      return `${phase1Source.slice(0, specStart)}Accordion, AccordionTrigger, AccordionPanel${phase1Source.slice(specEnd)}`
    }
  }

  // Fallback (should not happen): return unchanged
  return phase1Source
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const fullSource = rootNode.text()

  const uiImports = findImportStatementsFrom(rootNode, UI_SOURCE)
  if (uiImports.length === 0) {
    return null
  }

  const localName = findCollapsibleImport(uiImports)
  if (!localName) {
    return null
  }

  const edits: Edit[] = []
  transformCollapsibleElements(rootNode, fullSource, localName, edits)

  let phase1Source: string
  if (edits.length > 0) {
    phase1Source = rootNode.commitEdits(edits)
  } else {
    phase1Source = fullSource
  }

  const phase2Source = replaceImport(phase1Source, localName, uiImports)

  if (phase2Source === fullSource) {
    return null
  }

  migrationMetric.increment({ action: 'import-replaced' })

  const result = await Promise.resolve(phase2Source)
  return result
}

export default transform
