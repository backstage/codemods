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

function getImportedName(spec: SgNode<TSX>): string | null {
  const identifiers = spec.findAll({
    rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] },
  })
  return identifiers[0]?.text() ?? null
}

function collectAlertImports(rootNode: SgNode<TSX>): {
  alertLocalName: string | null
  alertTitleLocalName: string | null
  importNodesToRemove: SgNode<TSX>[]
  importSpecifiersToRemove: Map<SgNode<TSX>, { source: string; names: string[] }>
} {
  let alertLocalName: string | null = null
  let alertTitleLocalName: string | null = null
  const importNodesToRemove: SgNode<TSX>[] = []
  const importSpecifiersToRemove = new Map<SgNode<TSX>, { source: string; names: string[] }>()

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
      } else {
        importSpecifiersToRemove.set(imp, { source: '@material-ui/core', names: ['Alert'] })
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

    const namesToRemove: string[] = []
    if (alertName) {
      namesToRemove.push('Alert')
    }
    if (alertTitleName) {
      namesToRemove.push('AlertTitle')
    }

    if (namesToRemove.length > 0) {
      const allSpecifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
      if (namesToRemove.length >= allSpecifiers.length) {
        importNodesToRemove.push(imp)
      } else {
        importSpecifiersToRemove.set(imp, { source: '@material-ui/lab', names: namesToRemove })
      }
    }
  }

  return { alertLocalName, alertTitleLocalName, importNodesToRemove, importSpecifiersToRemove }
}

function pruneBarrelImportSpecifiers(
  imp: SgNode<TSX>,
  source: string,
  namesToRemove: string[],
  edits: Edit[],
  appendAlertImport = false,
): void {
  const remainingSpecs = imp.findAll({ rule: { kind: 'import_specifier' } }).filter((spec) => {
    const importedName = getImportedName(spec)
    return importedName !== null && !namesToRemove.includes(importedName)
  })

  if (remainingSpecs.length === 0) {
    edits.push(imp.replace(''))
  } else {
    const specTexts = remainingSpecs.map((spec) => spec.text()).join(', ')
    let replacement = `import { ${specTexts} } from '${source}';`
    if (appendAlertImport) {
      replacement += `\nimport { Alert } from '${BUI_SOURCE}';`
      migrationMetric.increment({ action: 'import-added' })
    }
    edits.push(imp.replace(replacement))
  }
  migrationMetric.increment({ action: 'import-removed' })
}

function addBuiImport(rootNode: SgNode<TSX>, importNodesToRemove: SgNode<TSX>[], edits: Edit[]): boolean {
  const existingImports = findImportStatementsFrom(rootNode, BUI_SOURCE)
  const existingImport = existingImports[0] ?? null

  if (existingImport) {
    const specifiers = existingImport.findAll({ rule: { kind: 'import_specifier' } })
    const hasAlert = specifiers.some((spec) => getImportedName(spec) === 'Alert')
    if (!hasAlert) {
      const namedImports = existingImport.find({ rule: { kind: 'named_imports' } })
      if (namedImports) {
        const names = specifiers.map((spec) => spec.text())
        names.push('Alert')
        names.sort()
        edits.push(namedImports.replace(`{ ${names.join(', ')} }`))
        migrationMetric.increment({ action: 'import-merged' })
      } else {
        edits.push(existingImport.replace(`${existingImport.text()}\nimport { Alert } from '${BUI_SOURCE}';`))
        migrationMetric.increment({ action: 'import-added' })
      }
    }
    return false
  }

  const removableIds = new Set(importNodesToRemove.map((imp) => imp.id()))
  const allImports = rootNode.findAll({ rule: { kind: 'import_statement' } })
  const anchorImport = [...allImports].reverse().find((imp) => !removableIds.has(imp.id())) ?? null

  if (anchorImport) {
    edits.push(anchorImport.replace(`${anchorImport.text()}\nimport { Alert } from '${BUI_SOURCE}';`))
  } else if (importNodesToRemove.length > 0) {
    const [importNode] = importNodesToRemove
    if (importNode) {
      edits.push(importNode.replace(`import { Alert } from '${BUI_SOURCE}';`))
      migrationMetric.increment({ action: 'import-added' })
      return true
    }
  } else if (allImports.length > 0) {
    const lastImport = allImports.at(-1)
    if (lastImport) {
      edits.push(lastImport.replace(`${lastImport.text()}\nimport { Alert } from '${BUI_SOURCE}';`))
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

function getPropRawValue(opening: SgNode<TSX>, propName: string): string | null {
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
    return null
  }
  for (const child of attr.children()) {
    const kind = child.kind()
    if (kind === 'string' || kind === 'jsx_expression') {
      return child.text()
    }
  }
  return ''
}

function shouldAddDefaultIcon(opening: SgNode<TSX>): boolean {
  if (hasProp(opening, 'iconMapping')) {
    return false
  }
  if (!hasProp(opening, 'icon')) {
    return true
  }
  const iconValue = getPropRawValue(opening, 'icon')
  return iconValue === '' || iconValue === '{true}' || iconValue === 'true'
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

    const nameNode = opening.child(1)
    if (!nameNode || nameNode.text() !== alertLocalName) {
      continue
    }

    const insertTodo = (reason: string) => {
      preserveImport = true
      edits.push(
        el.replace(
          withTodoComment(
            '{/* TODO(backstage-codemod): migrate Alert actions or complex children manually */}',
            el.text(),
          ),
        ),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason })
    }

    if (hasProp(opening, 'action') || hasProp(opening, 'onClose')) {
      insertTodo('action-or-onClose')
      continue
    }

    const { value: severityValue, isDynamic } = getSeverityValue(opening)

    if (isDynamic) {
      insertTodo('dynamic-severity')
      continue
    }

    const status = severityValue ? (SEVERITY_TO_STATUS[severityValue] ?? severityValue) : null

    if (isSelfClosing) {
      const props: string[] = []
      if (status) {
        props.push(`status="${status}"`)
      }
      if (shouldAddDefaultIcon(opening)) {
        props.push('icon')
      }
      edits.push(el.replace(`<Alert ${props.join(' ')} />`))
      migrated = true
      migrationMetric.increment({ action: 'alert-migrated', variant: 'self-closing' })
      continue
    }

    const { title, description, hasComplexContent } = extractChildContent(el, alertTitleLocalName)

    if (hasComplexContent) {
      insertTodo('complex-children')
      continue
    }

    const props: string[] = []
    if (status) {
      props.push(`status="${status}"`)
    }
    if (shouldAddDefaultIcon(opening)) {
      props.push('icon')
    }
    if (title) {
      props.push(`title="${title}"`)
    }
    if (description) {
      props.push(`description="${description}"`)
    }
    edits.push(el.replace(`<Alert ${props.join(' ')} />`))
    migrated = true
    migrationMetric.increment({ action: 'alert-migrated', variant: title ? 'with-title' : 'simple' })
  }

  return { preserveImport, migrated }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { alertLocalName, alertTitleLocalName, importNodesToRemove, importSpecifiersToRemove } =
    collectAlertImports(rootNode)

  if (!alertLocalName) {
    return null
  }

  const { preserveImport, migrated } = transformAlertElements(rootNode, alertLocalName, alertTitleLocalName, edits)

  let replacedImport = false
  let addedViaBarrelPrune = false

  if (migrated && !preserveImport && importNodesToRemove.length > 1) {
    for (const imp of importNodesToRemove.slice(1)) {
      edits.push(imp.replace(''))
      migrationMetric.increment({ action: 'import-removed' })
    }
  }

  if (!preserveImport) {
    for (const [imp, { source, names }] of importSpecifiersToRemove) {
      const appendAlertImport = migrated && findImportStatementsFrom(rootNode, BUI_SOURCE).length === 0
      if (appendAlertImport) {
        addedViaBarrelPrune = true
      }
      pruneBarrelImportSpecifiers(imp, source, names, edits, appendAlertImport)
    }
  }

  if (migrated && !addedViaBarrelPrune) {
    replacedImport = addBuiImport(rootNode, importNodesToRemove, edits)
  }

  if (!preserveImport) {
    const [firstImport] = importNodesToRemove
    if (firstImport) {
      if (replacedImport) {
        migrationMetric.increment({ action: 'import-removed' })
      } else {
        edits.push(firstImport.replace(''))
        migrationMetric.increment({ action: 'import-removed' })
      }
    }
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
