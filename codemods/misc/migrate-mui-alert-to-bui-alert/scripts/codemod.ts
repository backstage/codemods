import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-alert-to-bui-alert')

const SEVERITY_TO_STATUS: Record<string, string> = {
  error: 'danger',
  warning: 'warning',
  info: 'info',
  success: 'success',
}

const BUI_SOURCE = '@backstage/ui'

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

function collectAlertImports(rootNode: SgNode<TSX>): {
  alertLocalName: string | null
  alertTitleLocalName: string | null
  importNodesToRemove: SgNode<TSX>[]
} {
  let alertLocalName: string | null = null
  let alertTitleLocalName: string | null = null
  const importNodesToRemove: SgNode<TSX>[] = []

  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/lab/Alert')) {
    alertLocalName = getDefaultImportName(imp)
    importNodesToRemove.push(imp)
  }

  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core/Alert')) {
    alertLocalName = getDefaultImportName(imp)
    importNodesToRemove.push(imp)
  }

  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/lab/AlertTitle')) {
    alertTitleLocalName = getDefaultImportName(imp)
    importNodesToRemove.push(imp)
  }

  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core')) {
    const alertName = getNamedImportLocalName(imp, 'Alert')
    if (alertName) {
      alertLocalName = alertName
      const allSpecifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
      if (allSpecifiers.length <= 1) {
        importNodesToRemove.push(imp)
      }
    }
  }

  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/lab')) {
    const alertName = getNamedImportLocalName(imp, 'Alert')
    const alertTitleName = getNamedImportLocalName(imp, 'AlertTitle')

    if (alertName) {
      alertLocalName = alertName
    }
    if (alertTitleName) {
      alertTitleLocalName = alertTitleName
    }

    if (alertName || alertTitleName) {
      const allSpecifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
      const alertSpecCount = (alertName ? 1 : 0) + (alertTitleName ? 1 : 0)
      if (alertSpecCount >= allSpecifiers.length) {
        importNodesToRemove.push(imp)
      }
    }
  }

  return { alertLocalName, alertTitleLocalName, importNodesToRemove }
}

function buildBuiImportEdit(rootNode: SgNode<TSX>, edits: Edit[]): void {
  const existingImports = findImportStatementsFrom(rootNode, BUI_SOURCE)
  const existingImport = existingImports[0] ?? null

  if (existingImport) {
    const specifiers = existingImport.findAll({ rule: { kind: 'import_specifier' } })
    let hasAlert = false
    for (const spec of specifiers) {
      const idents = spec.findAll({
        rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] },
      })
      if (idents[0]?.text() === 'Alert') {
        hasAlert = true
      }
    }
    if (!hasAlert) {
      const namedImports = existingImport.find({ rule: { kind: 'named_imports' } })
      if (namedImports) {
        const text = namedImports.text()
        const inner = text.slice(1, -1).trim()
        const names = inner
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean)
        names.push('Alert')
        names.sort()
        edits.push(namedImports.replace(`{ ${names.join(', ')} }`))
        migrationMetric.increment({ action: 'import-merged' })
      }
    }
  } else {
    const allImports = rootNode.findAll({ rule: { kind: 'import_statement' } })
    if (allImports.length > 0) {
      const lastImport = allImports.at(-1)
      if (lastImport) {
        edits.push(lastImport.replace(`${lastImport.text()}\nimport { Alert } from '${BUI_SOURCE}';`))
      }
    }
    migrationMetric.increment({ action: 'import-added' })
  }
}

function getSeverityValue(opening: SgNode<TSX>): { value: string | null; isDynamic: boolean } {
  const severityAttr = opening.find({
    rule: {
      kind: 'jsx_attribute',
      has: {
        kind: 'property_identifier',
        regex: '^severity$',
      },
    },
  })

  if (!severityAttr) {
    return { value: null, isDynamic: false }
  }

  const stringNode = severityAttr.find({ rule: { kind: 'string' } })
  if (stringNode) {
    const frag = stringNode.find({ rule: { kind: 'string_fragment' } })
    return { value: frag?.text() ?? null, isDynamic: false }
  }

  const exprNode = severityAttr.find({ rule: { kind: 'jsx_expression' } })
  if (exprNode) {
    return { value: exprNode.text(), isDynamic: true }
  }

  return { value: null, isDynamic: false }
}

function hasProp(opening: SgNode<TSX>, propName: string): boolean {
  const attr = opening.find({
    rule: {
      kind: 'jsx_attribute',
      has: {
        kind: 'property_identifier',
        regex: `^${escapeRegex(propName)}$`,
      },
    },
  })
  return attr !== null
}

function extractChildContent(
  element: SgNode<TSX>,
  alertTitleLocalName: string | null,
): { title: string | null; description: string | null; hasComplexContent: boolean } {
  if (!element.is('jsx_element')) {
    return { title: null, description: null, hasComplexContent: false }
  }

  let title: string | null = null
  let hasComplexContent = false
  const descriptionParts: string[] = []

  for (const child of element.children()) {
    const kind = child.kind()

    if (kind === 'jsx_opening_element' || kind === 'jsx_closing_element') {
      continue
    }

    if (kind === 'jsx_text') {
      const trimmed = child.text().trim()
      if (trimmed.length > 0) {
        descriptionParts.push(trimmed)
      }
      continue
    }

    if (kind === 'jsx_element' && alertTitleLocalName) {
      const opening = child.child(0)
      const nameNode = opening?.child(1)
      if (nameNode?.text() === alertTitleLocalName) {
        const titleParts: string[] = []
        for (const titleChild of child.children()) {
          if (titleChild.kind() === 'jsx_opening_element' || titleChild.kind() === 'jsx_closing_element') {
            continue
          }
          if (titleChild.kind() === 'jsx_text') {
            const t = titleChild.text().trim()
            if (t.length > 0) {
              titleParts.push(t)
            }
          } else {
            hasComplexContent = true
          }
        }
        if (titleParts.length > 0) {
          title = titleParts.join(' ')
        }
        continue
      }
    }

    if (kind === 'jsx_element' || kind === 'jsx_self_closing_element' || kind === 'jsx_expression') {
      hasComplexContent = true
      continue
    }
  }

  const description = descriptionParts.length > 0 ? descriptionParts.join(' ') : null
  return { title, description, hasComplexContent }
}

function transformAlertElements(
  rootNode: SgNode<TSX>,
  alertLocalName: string,
  alertTitleLocalName: string | null,
  edits: Edit[],
): void {
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

    const nameNode = opening.child(1)
    if (!nameNode || nameNode.text() !== alertLocalName) {
      continue
    }

    if (hasProp(opening, 'action') || hasProp(opening, 'onClose')) {
      edits.push(
        el.replace(`{/* TODO(backstage-codemod): migrate Alert actions or complex children manually */}\n${el.text()}`),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: 'action-or-onClose' })
      continue
    }

    const { value: severityValue, isDynamic } = getSeverityValue(opening)

    if (isDynamic) {
      edits.push(
        el.replace(`{/* TODO(backstage-codemod): migrate Alert actions or complex children manually */}\n${el.text()}`),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: 'dynamic-severity' })
      continue
    }

    const status = severityValue ? (SEVERITY_TO_STATUS[severityValue] ?? severityValue) : null

    if (isSelfClosing) {
      const props: string[] = []
      if (status) {
        props.push(`status="${status}"`)
      }
      props.push('icon')
      edits.push(el.replace(`<Alert ${props.join(' ')} />`))
      migrationMetric.increment({ action: 'alert-migrated', variant: 'self-closing' })
      continue
    }

    const { title, description, hasComplexContent } = extractChildContent(el, alertTitleLocalName)

    if (hasComplexContent) {
      edits.push(
        el.replace(`{/* TODO(backstage-codemod): migrate Alert actions or complex children manually */}\n${el.text()}`),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-children' })
      continue
    }

    const props: string[] = []
    if (status) {
      props.push(`status="${status}"`)
    }
    props.push('icon')
    if (title) {
      props.push(`title="${title}"`)
    }
    if (description) {
      props.push(`description="${description}"`)
    }
    edits.push(el.replace(`<Alert ${props.join(' ')} />`))
    migrationMetric.increment({ action: 'alert-migrated', variant: title ? 'with-title' : 'simple' })
  }
}

const transform: Codemod<TSX> = (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { alertLocalName, alertTitleLocalName, importNodesToRemove } = collectAlertImports(rootNode)

  if (!alertLocalName) {
    return Promise.resolve(null)
  }

  for (const imp of importNodesToRemove) {
    edits.push(imp.replace(''))
    migrationMetric.increment({ action: 'import-removed' })
  }

  buildBuiImportEdit(rootNode, edits)
  transformAlertElements(rootNode, alertLocalName, alertTitleLocalName, edits)

  return Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
}

export default transform
