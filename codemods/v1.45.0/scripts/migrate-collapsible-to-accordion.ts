import { getAllImports } from '@jssg/utils/javascript/imports'
import { getLineIndent } from '@jssg/utils/javascript/style'
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
    // Self-closing elements with attributes/props (e.g. <Icon {...props} />) are not
    // truly empty — return null to let the complex-render fallback path handle them
    const hasAttrs = jsxBody.findAll({ rule: { kind: 'jsx_attribute' } }).length > 0
    const hasSpreads = jsxBody.findAll({ rule: { kind: 'jsx_expression' } }).length > 0
    if (hasAttrs || hasSpreads) {
      return null
    }
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
    const indent = getLineIndent(fullSource, el)
    let newText = el.text()
    const oldMemberExpr = `${localName}.Trigger`
    newText = newText.split(oldMemberExpr).join(newName)
    const comment = '{/* TODO(backstage-codemod): Review Collapsible.Trigger render migration */}'
    edits.push(el.replace(`${comment}\n${indent}${newText}`))
    migrationMetric.increment({ action: 'trigger-render-migrated', pattern: 'complex-todo' })
  }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const fullSource = rootNode.text()

  const namedImport = getAllImports(rootNode, { type: 'named', name: TARGET_IMPORT, from: UI_SOURCE }).find(
    (imp) => !imp.isNamespace,
  )
  const localName = namedImport?.alias ?? null
  if (!localName) {
    return null
  }

  const edits: Edit[] = []
  transformCollapsibleElements(rootNode, fullSource, localName, edits)

  // Add import edit atomically with JSX edits to avoid stale AST positions.
  // addImport/removeImport cannot express "expand one specifier into three": on the
  // stale tree a sole `Collapsible` specifier makes removeImport delete the whole
  // statement, overlapping addImport's clause-merge edit. Replace the specifier
  // in place instead, locating it through getAllImports.
  const collapsibleSpec = namedImport?.node.parent()
  if (collapsibleSpec?.is('import_specifier')) {
    edits.push(collapsibleSpec.replace('Accordion, AccordionTrigger, AccordionPanel'))
    migrationMetric.increment({ action: 'import-replaced' })
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
